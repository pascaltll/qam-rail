// Prueba de fluidez del panel por nivel de potencia. Mueve el panel como lo haria el usuario y mide, en cada nivel:
// - cambio de seccion (de la orden al pintado), mediana y p95, recorriendo las 7 secciones dos veces;
// - fotogramas en reposo (2 s) y desplazando el contenido (1,2 s): fps medios, p95 del intervalo y % de fotogramas lentos;
// - abrir y cerrar la columna lateral (plugin o chat);
// - coste de las lecturas que el panel repite (amigos, ajustes de Steam, juego en marcha, plugins) y latencia de Panel;
// - velocidad de JavaScript (bucle fijo) y tareas largas (> 50 ms) durante el nivel.
// Al terminar devuelve la potencia que habia (global o la del juego) y guarda todo en la seccion "fluidez" del informe.
import { runningGame } from "./game";
import { hostablePlugins } from "./decky";
import { saveSection } from "./diagStore";
import { situation } from "./situation";
import { rpc } from "./panelBridge";
import { nextPaint } from "./perfLog";
import { readFriends } from "./social";
import { refreshTdpNow } from "./tdpControl";
import { perfStore, readPerf } from "./steamPerf";


interface UI {
  sections: string[]; go: (id: string) => void; current: () => string; body: () => HTMLElement | null; win: () => Window;
  openColumn: () => string | null; closeColumn: () => void;
}
const ui = () => (window as unknown as { __qamRailUI?: UI }).__qamRailUI ?? null;

// ---------------- Puro (probado en tests/perfBench.test.ts) ----------------
/** Niveles con peso en los bajos: min, min+2, min+4, medio y max (sin repetir, dentro de [min, max]). */
export function fluencyLevels(min: number, max: number, quick = false): number[] {
  const lo = Math.ceil(min), hi = Math.floor(max);
  if (hi <= lo) return [lo];
  const raw = quick ? [lo, Math.round((lo + hi) / 2), hi] : [lo, lo + 2, lo + 4, Math.round((lo + hi) / 2), hi];
  return [...new Set(raw.map((w) => Math.min(hi, Math.max(lo, w))))].sort((a, b) => a - b);
}

export interface FrameStats { frames: number; fps: number | null; p95: number | null; slowPct: number | null; worst: number | null }
/** Intervalos entre fotogramas (ms) → fps medios, p95, % por encima de `slowMs` y el peor. */
export function frameStats(intervals: number[], slowMs = 33.4): FrameStats {
  const xs = intervals.filter((x) => x > 0 && Number.isFinite(x));
  if (!xs.length) return { frames: 0, fps: null, p95: null, slowPct: null, worst: null };
  const s = [...xs].sort((a, b) => a - b);
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    frames: xs.length,
    fps: Math.round((1000 / avg) * 10) / 10,
    p95: Math.round(s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] * 10) / 10,
    slowPct: Math.round((xs.filter((x) => x > slowMs).length / xs.length) * 1000) / 10,
    worst: Math.round(s[s.length - 1]),
  };
}
export function pct(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))]);
}

// ---------------- Estado ----------------
export interface FluencyRow {
  watts: number; appliedW: number | null;
  switchMed: number | null; switchP95: number | null;
  idle: FrameStats; scroll: FrameStats;
  columnOpen: number | null; columnClose: number | null;
  jsMs: number; readFriendsMs: number | null; readPerfMs: number | null; runningGameMs: number | null; pluginsMs: number | null; panelRpcMs: number | null;
  longTasks: number; longTaskMs: number;
  error?: string;
}
export interface FluencyState { phase: "idle" | "running" | "done" | "cancelled" | "error"; step: string; index: number; total: number; rows: FluencyRow[]; saved?: string; game: string | null }

let state: FluencyState = { phase: "idle", step: "", index: 0, total: 0, rows: [], game: null };
let cancelled = false;
const subs = new Set<() => void>();
const set = (p: Partial<FluencyState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
export const fluencyState = () => state;
export const fluencySubscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const cancelFluency = () => { cancelled = true; };

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
class Cancelled extends Error {}
const check = () => { if (cancelled) throw new Cancelled(); };

function timeIt(fn: () => unknown, n = 5): number | null {
  try { const t = performance.now(); for (let i = 0; i < n; i++) fn(); return Math.round(((performance.now() - t) / n) * 100) / 100; } catch { return null; }
}
function jsLoop(): number {
  const t = performance.now();
  let x = 0;
  for (let i = 0; i < 3_000_000; i++) x = (x + Math.sqrt(i) * 1.0001) % 1e9;
  if (x < 0) console.log(x);
  return Math.round(performance.now() - t);
}

async function frames(win: Window, ms: number, onFrame?: (i: number) => void): Promise<number[]> {
  return new Promise((ok) => {
    const out: number[] = [];
    let last = 0, i = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      if (last) out.push(t - last);
      last = t;
      onFrame?.(i++);
      if (performance.now() - t0 < ms && !cancelled) win.requestAnimationFrame(step);
      else ok(out);
    };
    try { win.requestAnimationFrame(step); } catch { ok(out); }
    window.setTimeout(() => ok(out), ms + 1500);
  });
}

async function setWatts(w: number, game: string | null): Promise<void> {
  if (game) await rpc.setWatts(w, "game", game, game);
  else {
    const st = await rpc.state();
    await rpc.setWatts(w, "global", null, st.appid ?? null);
  }
}

async function measureLevel(w: number, game: string | null): Promise<FluencyRow> {
  const u = ui();
  if (!u) throw new Error("El panel debe estar abierto");
  const win = u.win();
  set({ step: `${w} W: aplicando potencia…` });
  await setWatts(w, game);
  await sleep(4500); check();
  const applied = await rpc.draw().then((d) => (typeof d.applied === "number" ? d.applied : null)).catch(() => null);

  let longTasks = 0, longTaskMs = 0;
  let po: PerformanceObserver | null = null;
  try {
    const PO = (win as unknown as { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver;
    if (PO) { po = new PO((l) => { for (const e of l.getEntries()) { longTasks++; longTaskMs += e.duration; } }); po.observe({ type: "longtask" } as PerformanceObserverInit); }
  } catch { po = null; }

  set({ step: `${w} W: velocidad de JavaScript y lecturas…` });
  const js = [jsLoop(), jsLoop(), jsLoop()].sort((a, b) => a - b)[1];
  const readFriendsMs = timeIt(() => readFriends(), 3);
  const readPerfMs = timeIt(() => readPerf(perfStore()), 10);
  const runningGameMs = timeIt(() => runningGame(), 20);
  const pluginsMs = timeIt(() => hostablePlugins(), 10);
  const rpcTimes: number[] = [];
  for (let i = 0; i < 3; i++) { const t = performance.now(); await rpc.draw().catch(() => null); rpcTimes.push(performance.now() - t); }
  check();

  set({ step: `${w} W: cambiando de sección…` });
  const switches: number[] = [];
  for (let round = 0; round < 2; round++) {
    for (const id of u.sections) {
      check();
      const t = performance.now();
      u.go(id);
      await nextPaint(win);
      switches.push(performance.now() - t);
      await sleep(120);
    }
  }

  set({ step: `${w} W: fotogramas en reposo…` });
  u.go("home");
  await sleep(400);
  const idle = frameStats(await frames(win, 2000));
  check();

  set({ step: `${w} W: desplazando contenido…` });
  u.go("display");
  await sleep(500);
  const body = u.body();
  const scroll = frameStats(await frames(win, 1200, (i) => {
    if (!body) return;
    const max = body.scrollHeight - body.clientHeight;
    if (max > 0) body.scrollTop = (i * 14) % (max + 1);
  }));
  if (body) body.scrollTop = 0;
  check();

  set({ step: `${w} W: columna lateral…` });
  let columnOpen: number | null = null, columnClose: number | null = null;
  const t1 = performance.now();
  if (u.openColumn()) {
    await nextPaint(win);
    columnOpen = Math.round(performance.now() - t1);
    await sleep(700);
    const t2 = performance.now();
    u.closeColumn();
    await nextPaint(win);
    columnClose = Math.round(performance.now() - t2);
  }
  await sleep(300);
  po?.disconnect();

  return {
    watts: w, appliedW: applied,
    switchMed: pct(switches, 0.5), switchP95: pct(switches, 0.95),
    idle, scroll, columnOpen, columnClose,
    jsMs: js, readFriendsMs, readPerfMs, runningGameMs, pluginsMs,
    panelRpcMs: Math.round(rpcTimes.reduce((a, b) => a + b, 0) / rpcTimes.length),
    longTasks, longTaskMs: Math.round(longTaskMs),
  };
}

export async function runFluency(quick: boolean, log: (m: string) => void = () => {}): Promise<void> {
  if (state.phase === "running") return;
  cancelled = false;
  const u = ui();
  if (!u) { set({ phase: "error", step: "El panel debe estar abierto" }); return; }
  const startSection = u.current();
  let st;
  try { st = await rpc.state(); } catch (e) { set({ phase: "error", step: `Panel de Control no responde (${String(e)})` }); return; }
  const lim = st.limits ?? {};
  const max = Number((st.on_ac ? lim.max_ac : lim.max) ?? lim.max ?? 15);
  const levels = fluencyLevels(Number(lim.min ?? 3), max, quick);
  const game = st.appid ?? null;
  const original = { watts: Number(st.watts ?? 0), global: Number(st.global_watts ?? st.watts ?? 0), follows: st.follows_global !== false };
  set({ phase: "running", index: 0, total: levels.length, rows: [], step: "Preparando…", saved: undefined, game: runningGame()?.name ?? null });
  const rows: FluencyRow[] = [];
  try {
    for (let i = 0; i < levels.length; i++) {
      set({ index: i + 1 });
      try { rows.push(await measureLevel(levels[i], game)); }
      catch (e) { if (e instanceof Cancelled) throw e; rows.push({ watts: levels[i], error: String(e) } as FluencyRow); }
      set({ rows: [...rows] });
    }
    set({ phase: "done", step: "Terminado" });
  } catch (e) {
    set({ phase: e instanceof Cancelled ? "cancelled" : "error", step: e instanceof Cancelled ? "Cancelada" : String(e) });
  } finally {
    // Devolver la potencia de antes (del juego o la de Steam) y la seccion donde estabas.
    try {
      if (game) {
        if (original.follows) await rpc.follow(true, game, game);
        else await rpc.setWatts(original.watts, "game", game, game);
      } else await rpc.setWatts(original.global, "global", null, null);
    } catch (e) { log(`fluidez: no se pudo restaurar la potencia (${String(e)})`); }
    // La prueba cambia la potencia sin pasar por el controlador: sin esto el panel (y el registro) seguian viendo 25 W.
    refreshTdpNow();
    try { ui()?.go(startSection); } catch { /* panel cerrado */ }
    if (rows.length) {
      const data = { fecha: new Date().toISOString(), juego: state.game, rapida: quick, niveles: levels, original, filas: rows, userAgent: navigator.userAgent };
      // Seccion "fluidez" = la ultima prueba; el historial guarda una linea por nivel para comparar entre versiones.
      const resumen = rows.map((r) => ({ w: r.watts, seccion: r.switchMed, reposo: r.idle?.fps ?? null, columna: r.columnOpen, js: r.jsMs, error: r.error ?? null }));
      try { set({ saved: await saveSection(`fluidez@${situation(null, 0).key}`, { ...data, situacion: situation(null, 0) }, resumen) }); } catch (e) { log(`fluidez: no se pudo guardar (${String(e)})`); }
    }
  }
}
