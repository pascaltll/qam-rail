// Controlador de potencia: una instancia por tarjeta montada. Reglas (las mismas que sigue Panel de Control en su UI):
// - el slider espera 200 ms de quietud antes de enviar (el hardware se reprograma en cada orden);
// - las ordenes se serializan: una sola en vuelo, gana la ultima;
// - tras escribir se relee el estado real (lo que el equipo aplico puede diferir de lo pedido);
// - una lectura que llega mientras hay un cambio pendiente NO pisa el valor que el usuario esta moviendo;
// - sin sondeo constante: se lee al abrir y tras cada cambio; el consumo en vivo solo si la tarjeta lo pide.
import { prime } from "./panelStore";
import { userChangedPower } from "./menuEfficiency";
import { useVisible } from "./visible";
import { tiers } from "./powerTiers";
import { useCallback, useEffect, useRef, useState } from "react";

import { runningGame, type RunningGame } from "./game";
import { rpc } from "./panelBridge";
import { buildView, clampW, explainFailure, writeTarget, type PresetView, type Scope, type TdpView } from "./tdpModel";

export interface TdpApi {
  state: typeof rpc.state;
  presets: typeof rpc.presets;
  draw: typeof rpc.draw;
  setWatts: typeof rpc.setWatts;
  applyPreset: typeof rpc.applyPreset;
  follow: typeof rpc.follow;
  resetTelemetry?: typeof rpc.resetTelemetry;
}

export interface TdpSnapshot {
  loading: boolean;
  missing: boolean; // no hay forma de hablar con Panel de Control
  view: TdpView | null;
  error: string | null;
  drawW: number | null; // consumo en vivo (solo con sondeo activo)
}

export const DEBOUNCE_MS = 200;

// Ultima vista conocida (de cualquier tarjeta): una tarjeta nueva arranca con ella en vez de «Leyendo…» y se
// refresca en segundo plano. Evita el parpadeo al cambiar de seccion. Solo se reutiliza si es del mismo juego.
let lastSnap: TdpSnapshot | null = null;
/** Pruebas: olvida la vista cacheada. */
export function resetTdpCache(): void { lastSnap = null; }

export class TdpController {
  private snap: TdpSnapshot = { loading: true, missing: false, view: null, error: null, drawW: null };
  private subs = new Set<(s: TdpSnapshot) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: (() => Promise<void>) | null = null;
  private running = false;
  private poll: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private savedPresets: Awaited<ReturnType<TdpApi["presets"]>> | null = null;

  constructor(
    private api: TdpApi = rpc,
    private getGame: () => RunningGame | null = runningGame,
    private log: (m: string) => void = () => {},
    cached = false,
  ) {
    if (cached && lastSnap?.view && (lastSnap.view.game?.key ?? null) === (getGame()?.key ?? null)) this.snap = { ...lastSnap, error: null };
  }

  get snapshot(): TdpSnapshot { return this.snap; }
  subscribe(f: (s: TdpSnapshot) => void): () => void { this.subs.add(f); return () => { this.subs.delete(f); }; }
  private set(p: Partial<TdpSnapshot>): void {
    if (this.disposed) return;
    this.snap = { ...this.snap, ...p };
    if (this.snap.view) { const before = lastSnap?.view?.appliedW ?? lastSnap?.view?.watts; lastSnap = this.snap; const now = this.snap.view.appliedW ?? this.snap.view.watts; if (before !== now) powerSubs.forEach((f) => { try { f(); } catch { /* aviso */ } }); }
    this.subs.forEach((f) => f(this.snap));
  }
  private get busy(): boolean { return this.timer !== null || this.pending !== null || this.running; }

  /** Lee el estado real. Si el usuario esta moviendo algo, no pisa su valor. */
  async refresh(): Promise<void> {
    try {
      const raw = await this.api.state();
      prime("tdp", raw); // lo leído sirve también a las tarjetas que miran el estado de Panel
      if (!this.savedPresets) this.savedPresets = await this.api.presets().catch(() => null);
      if (this.disposed || this.busy) return;
      this.set({ loading: false, missing: false, view: buildView(raw, this.savedPresets, this.getGame()) });
    } catch (e) {
      this.log(`TDP: ${String(e)}`);
      if (!this.disposed && !this.snap.view) this.set({ loading: false, missing: true });
    }
  }

  // ---- escritura ----
  private enqueue(job: () => Promise<void>, delay: number): void {
    this.pending = job;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.pump(); }, delay);
  }
  private async pump(): Promise<void> {
    if (this.running) return; // la que termina vuelve a llamar a pump si quedo algo pendiente
    const job = this.pending;
    if (!job) return;
    this.pending = null;
    this.running = true;
    try { await job(); } finally {
      this.running = false;
      if (this.pending && this.timer === null) void this.pump();
      else if (!this.busy) void this.refresh();
    }
  }
  private fail(text: string): void { this.set({ error: text }); this.log(`TDP: ${text}`); }

  setWatts(w: number): void {
    const v = this.snap.view;
    if (!v || v.status !== "ok") return;
    userChangedPower();
    const watts = clampW(w, v.min, v.max);
    this.set({ view: { ...v, watts }, error: null });
    const target = writeTarget(v);
    this.enqueue(async () => {
      try {
        const res = await this.api.setWatts(watts, target.scope, target.appid, target.context);
        if (!res?.ok) this.fail(explainFailure(res));
      } catch (e) { this.fail(`Panel de Control no respondió (${String(e)})`); }
    }, DEBOUNCE_MS);
  }

  /** Los presets se aplican de golpe (potencia + modo de pico) y sin espera. */
  applyPreset(p: PresetView): void {
    const v = this.snap.view;
    if (!v || v.status !== "ok") return;
    userChangedPower();
    this.set({ view: { ...v, watts: p.watts }, error: null });
    const target = writeTarget(v);
    this.enqueue(async () => {
      try {
        const res = await this.api.applyPreset(p.watts, target.scope, target.appid, p.boost, target.context);
        if (!res?.ok) this.fail(explainFailure(res));
      } catch (e) { this.fail(`Panel de Control no respondió (${String(e)})`); }
    }, 0);
  }

  /** Con juego en marcha: usar el perfil global o uno propio del juego (no borra nada, solo cambia cual se aplica). */
  setScope(scope: Scope): void {
    const v = this.snap.view;
    // scope "global" = «Como en Steam» (el juego vuelve a seguir la potencia de Steam); "game" = perfil propio.
    if (!v || !v.game || v.status !== "ok" || v.followsGlobal === (scope === "global")) return;
    const game = v.game;
    this.set({ view: { ...v, followsGlobal: scope === "global" }, error: null });
    this.enqueue(async () => {
      try {
        const st = await this.api.follow(scope === "global", game.key, v.context);
        // Panel devuelve el estado completo ya con el cambio: se usa tal cual (sin esperar otra lectura).
        if (st && st.limits && !this.disposed) this.set({ view: buildView(st, this.savedPresets, this.getGame()) });
      } catch (e) { this.fail(`No se pudo cambiar el perfil (${String(e)})`); }
    }, 0);
  }

  /** Borra lo aprendido (telemetria). No toca perfiles manuales. */
  async forgetLearned(): Promise<void> {
    try { await this.api.resetTelemetry?.(); } catch (e) { this.fail(`No se pudo borrar lo aprendido (${String(e)})`); return; }
    await this.refresh();
  }

  // ---- consumo en vivo (opcional) ----
  watch(ms: number): void {
    if (this.poll !== null) return;
    const tick = async () => {
      try {
        const d = await this.api.draw();
        const v = this.snap.view;
        this.set({ drawW: typeof d.watts === "number" ? d.watts : null });
        // Cargador conectado/desconectado: cambia el techo del slider.
        if (v && typeof d.on_ac === "boolean" && d.on_ac !== v.onAc && !this.busy) void this.refresh();
      } catch { /* sin lectura: se deja el ultimo valor */ }
    };
    void tick();
    this.poll = setInterval(() => { void tick(); }, ms);
  }

  /** Para el sondeo de consumo (seccion oculta). */
  unwatch(): void { if (this.poll !== null) clearInterval(this.poll); this.poll = null; }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    if (this.poll !== null) clearInterval(this.poll);
    this.subs.clear();
    // Un cambio pendiente del slider no se pierde al cerrar el panel.
    const job = this.pending;
    this.pending = null;
    if (job) void job();
  }
}

export interface UseTdp extends TdpSnapshot {
  setWatts(w: number): void;
  applyPreset(p: PresetView): void;
  setScope(s: Scope): void;
  forgetLearned(): void;
  refresh(): void;
}

// Un solo controlador para todas las tarjetas de potencia (Inicio, Energia, Inicio de juego): lo que mueves en una se ve
// al instante en las demas. Antes cada tarjeta tenia el suyo y Energia (montada en segundo plano) mostraba un valor viejo.
let shared: TdpController | null = null;
let refs = 0;
const live = new Map<symbol, number>();
function acquire(log: (m: string) => void): TdpController {
  if (!shared) shared = new TdpController(rpc, runningGame, log, true);
  refs++;
  return shared;
}
function release(): void {
  refs = Math.max(0, refs - 1);
  if (refs === 0 && shared) { shared.dispose(); shared = null; live.clear(); }
}
function updateWatch(): void {
  if (!shared) return;
  shared.unwatch();
  if (live.size) shared.watch(Math.min(...live.values()));
}

export function useTdp(log: (m: string) => void, opts: { liveMs?: number } = {}): UseTdp {
  const ref = useRef<TdpController | null>(null);
  if (!ref.current) ref.current = acquire(log);
  const ctl = ref.current;
  const [snap, setSnap] = useState<TdpSnapshot>(ctl.snapshot);
  useEffect(() => {
    const off = ctl.subscribe(setSnap);
    setSnap(ctl.snapshot);
    void ctl.refresh();
    return () => { off(); ref.current = null; release(); };
  }, [ctl]);
  // Consumo en vivo solo mientras alguna tarjeta que lo pide se ve; al volver a una seccion se relee el estado.
  const visible = useVisible();
  const first = useRef(true);
  useEffect(() => {
    if (!visible) return undefined;
    if (!first.current) void ctl.refresh();
    first.current = false;
    if (!opts.liveMs) return undefined;
    const id = Symbol("tdp");
    live.set(id, opts.liveMs);
    updateWatch();
    return () => { live.delete(id); updateWatch(); };
  }, [ctl, opts.liveMs, visible]);
  return {
    ...snap,
    setWatts: useCallback((w: number) => ctl.setWatts(w), [ctl]),
    applyPreset: useCallback((p: PresetView) => ctl.applyPreset(p), [ctl]),
    setScope: useCallback((s: Scope) => ctl.setScope(s), [ctl]),
    forgetLearned: useCallback(() => { void ctl.forgetLearned(); }, [ctl]),
    refresh: useCallback(() => { void ctl.refresh(); }, [ctl]),
  };
}

/** Relee la potencia ya (tras pruebas que la cambian por fuera del controlador, p. ej. la de fluidez). */
// Sin panel abierto no se borra la ultima lectura (borrarla hacia parpadear «Leyendo…» al abrir); se relee al montar.
export function refreshTdpNow(): void { if (shared) void shared.refresh(); }

/** Potencia del momento para el registro de rendimiento (ultima lectura conocida, sin llamar a Panel). */
export function currentWatts(): { set: number | null; applied: number | null } {
  const v = lastSnap?.view;
  return { set: v ? v.watts : null, applied: v?.appliedW ?? null };
}

/** Con cargador segun la ultima lectura de Panel (null si aun no se sabe). */
export function currentOnAc(): boolean | null { const v = lastSnap?.view; return v ? v.onAc : null; }

// Avisos de cambio de potencia (para el modo eficiencia de los temas).
const powerSubs = new Set<() => void>();
export const onPowerChange = (f: () => void) => { powerSubs.add(f); return () => { powerSubs.delete(f); }; };

/** Modo ahorro: con poca potencia (≤ limite de ahorro, ver powerTiers) el panel quita animaciones, sombras y desenfoque. */
export function lowPower(): boolean {
  const w = currentWatts();
  const x = w.applied ?? w.set;
  return typeof x === "number" && x <= tiers().ecoW;
}
