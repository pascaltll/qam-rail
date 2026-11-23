// Modelo de potencia (TDP): traduce el estado crudo de Panel de Control a lo que el lanzador debe mostrar y a la orden
// exacta que hay que enviar. Sin dependencias de Steam: todo es puro y esta cubierto por tests (tests/tdpModel.test.ts).
import type { ApplyResult, RawPresets, RawTdpState } from "./panelBridge";
import type { RunningGame } from "./game";

export type Scope = "global" | "game";

/** ok = se puede mover; el resto explica por que no (la tarjeta muestra el motivo y no un slider muerto). */
export type TdpStatus = "ok" | "unsupported" | "level" | "disabled" | "steam";

export interface PresetView {
  id: string;
  label: string;
  watts: number;
  boost: unknown;
}

/** Sugerencia aprendida por Panel (banda de potencia que el juego realmente necesita). */
export interface Suggestion {
  enough: boolean;
  floor: number | null;
  ceil: number | null;
  seed: number | null; // valor habitual dentro de la banda
  minutes: number;
  target: number;
  learning: boolean; // hay datos parciales: "Aprendiendo X de Y min"
}

export interface TdpView {
  status: TdpStatus;
  note: string | null; // por que no se puede mover (si status != ok)
  watts: number; // valor mostrado para el ambito activo
  appliedW: number | null; // lo que el hardware reporta ahora
  min: number;
  max: number; // depende de si hay cargador
  onAc: boolean;
  scope: Scope; // ambito sobre el que escribe el slider
  game: RunningGame | null;
  context: string | null; // juego que Panel de Control cree activo (lo que hay que enviar como contexto)
  followsGlobal: boolean; // con juego: usa el perfil global (true) o el propio (false)
  presets: PresetView[];
  hint: string | null; // estado del propietario (limitado, aplicando, rechazado, conflicto...)
  suggestion: Suggestion | null; // solo con juego en marcha
  floor: number | null; // minimo real del equipo si es mayor que el minimo pedible
}

const BUILTIN_LABEL: Record<string, string> = { quiet: "Eco", balanced: "Equilibrado", turbo: "Máx" };

export function clampW(w: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(w)));
}

function buildPresets(raw: RawTdpState, saved: RawPresets | null, min: number, max: number): PresetView[] {
  const p = raw.presets ?? {};
  const top = raw.on_ac ? (p.turbo_ac ?? p.turbo) : p.turbo;
  const builtin: Record<string, number | undefined> = { quiet: p.quiet, balanced: p.balanced, turbo: top };
  const order = saved?.order?.length ? saved.order : ["quiet", "balanced", "turbo"];
  const hidden = new Set(saved?.hidden ?? []);
  const out: PresetView[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (seen.has(id) || hidden.has(id)) return;
    seen.add(id);
    if (id in BUILTIN_LABEL) {
      const w = builtin[id];
      if (typeof w === "number") out.push({ id, label: BUILTIN_LABEL[id], watts: clampW(w, min, max), boost: null });
      return;
    }
    const c = saved?.custom?.[id];
    if (c && typeof c.watts === "number") {
      out.push({ id, label: c.name?.trim() || `${c.watts} W`, watts: clampW(c.watts, min, max), boost: c.boost ?? null });
    }
  };
  order.forEach(push);
  ["quiet", "balanced", "turbo"].forEach(push); // los integrados siempre aparecen salvo que el usuario los oculte
  return out;
}

/**
 * Aviso de propiedad, con las mismas reglas que Panel de Control (src/tdp/ownership.ts de Hooandee): solo lo que el
 * usuario necesita saber (el equipo rechaza, limita o ignora el valor, u otro programa lo cambia). Lo que funciona,
 * se esta aplicando o se corrige solo no se muestra.
 */
function ownershipHint(raw: RawTdpState, shown: number): string | null {
  const o = raw.ownership;
  if (!o?.status) return null;
  if (o.reason === "control_disabled" || o.reason === "firmware_mode") return null;
  const applied = o.applied?.pl1 ?? null;
  const target = o.target?.pl1 ?? null;
  if (o.status === "rejected") {
    if (target === null) return "El equipo rechazó ese valor.";
    return applied !== null ? `El equipo no permite ${Math.round(target)} W ahora mismo. Sigue en ${Math.round(applied)} W.` : `El equipo no permite ${Math.round(target)} W ahora mismo.`;
  }
  if (o.overshoot?.state === "unresolved") return `El equipo supera el límite de ${Math.round(o.overshoot.target_w ?? shown)} W.`;
  if (o.conflict_persistent) return "Algo en el equipo está cambiando el límite de potencia.";
  if (o.status === "constrained" && applied !== null) {
    if (o.reason === "safe_min" || o.reason === "live_min") return `El equipo no baja de ${Math.round(applied)} W.`;
    if (o.reason === "power_source_limit" && raw.on_ac) return `El cargador limita la potencia a ${Math.round(applied)} W.`;
    return `El equipo limita la potencia a ${Math.round(applied)} W por ahora.`;
  }
  return null;
}

/** Suelo real del equipo (cuando pide menos de lo que el hardware acepta): la barra lo marca como zona inalcanzable. */
function deviceFloor(raw: RawTdpState): number | null {
  const o = raw.ownership;
  if (o?.status !== "constrained" || !(o.reason === "safe_min" || o.reason === "live_min")) return null;
  const a = o.applied?.pl1 ?? o.target?.pl1 ?? null;
  return typeof a === "number" ? a : null;
}

function buildSuggestion(raw: RawTdpState, min: number, max: number, inGame: boolean): Suggestion | null {
  const l = raw.learned;
  if (!inGame || !l) return null;
  const minutes = Math.max(0, Math.round(l.minutes ?? 0));
  const target = Math.max(1, Math.round(l.target_minutes ?? 30));
  const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (l.enough && num(l.floor) && num(l.ceil) && num(l.seed)) {
    const floor = clampW(Math.min(l.floor, l.ceil), min, max);
    const ceil = clampW(Math.max(l.floor, l.ceil), min, max);
    return { enough: true, floor, ceil, seed: clampW(Math.min(ceil, Math.max(floor, l.seed)), min, max), minutes, target, learning: false };
  }
  // Sin datos suficientes: solo se muestra progreso si el aprendizaje esta activo y ya hay algo.
  const active = ["too_few", "one_level", "no_data"].includes(l.reason ?? "");
  return { enough: false, floor: null, ceil: null, seed: null, minutes, target, learning: active && minutes > 0 };
}

export function buildView(raw: RawTdpState, saved: RawPresets | null, game: RunningGame | null): TdpView {
  const lim = raw.limits ?? {};
  // Minimo del slider = minimo fisico del equipo (limits.min, p. ej. 7 W en el ROG Ally). Panel acepta pedir desde
  // request_min (3 W) pero el equipo aplica su minimo (live_min) y sube los picos: ofrecer 3-6 W no sirve de nada.
  // Si aun asi el equipo limita mas arriba en vivo, la zona se raya (floor).
  const min = Number(lim.min ?? raw.request_min ?? 3);
  const onAc = raw.on_ac === true;
  const max = Number((onAc ? lim.max_ac : lim.max) ?? lim.max ?? 15);
  const inGame = !!game && raw.appid === game.key;
  const own = raw.game_power_owner;
  const steamOwns = inGame && own?.supported === true && own.owner === "steam";
  const follows = !inGame || raw.follows_global !== false;
  // Con juego, la potencia es SIEMPRE la del juego: mover la barra crea/ajusta su perfil propio en Panel.
  // «Global» es la potencia de Steam (modo normal, sin juego). Si el juego aun sigue a la de Steam se muestra ese valor.
  const scope: Scope = inGame ? "game" : "global";

  let status: TdpStatus = "ok";
  let note: string | null = null;
  if (raw.supported === false) { status = "unsupported"; note = "Este equipo no permite cambiar la potencia."; }
  else if ((raw.unit ?? "W").toLowerCase() === "level") { status = "level"; note = "Este equipo usa niveles de rendimiento, no vatios. Ajústalo en Panel de Control."; }
  else if (raw.tdp_control_enabled === false) { status = "disabled"; note = "Panel de Control está en modo solo lectura. Activa el control de potencia allí."; }
  else if (steamOwns) { status = "steam"; note = "Steam controla la potencia de este juego. Cámbiala desde el menú de Steam o devuelve el control a Panel de Control."; }

  const live = typeof raw.applied_w === "number" ? raw.applied_w : null;
  const saved1 = scope === "game" ? (follows ? raw.global_watts ?? raw.watts : raw.watts) : raw.global_watts ?? raw.watts;
  const shown = clampW(status === "steam" && live !== null ? live : Number(saved1 ?? live ?? min), min, max);

  return {
    status,
    note,
    watts: shown,
    appliedW: live,
    min,
    max,
    onAc,
    scope,
    game: inGame ? game : null,
    context: raw.appid ?? null,
    followsGlobal: follows,
    presets: buildPresets(raw, saved, min, max),
    hint: status === "ok" ? ownershipHint(raw, shown) : null,
    suggestion: inGame ? buildSuggestion(raw, min, max, inGame) : null,
    floor: (() => { const f = deviceFloor(raw); return f !== null && f > min ? Math.min(max, f) : null; })(),
  };
}

/** Orden exacta que debe enviarse al mover el slider. El contexto es el juego que Panel cree activo (o null):
 *  asi la orden nunca se rechaza por una carrera entre Steam y el backend al lanzar o cerrar un juego. */
export interface WriteTarget { scope: Scope; appid: string | null; context: string | null }
export function writeTarget(view: Pick<TdpView, "scope" | "context" | "game">): WriteTarget {
  if (view.scope === "game" && view.game) return { scope: "game", appid: view.game.key, context: view.context };
  return { scope: "global", appid: null, context: view.context };
}

const DETAIL_ES: Record<string, string> = {
  "stale-context": "El juego cambió mientras ajustabas; vuelve a intentarlo.",
  "tdp-control-disabled": "El control de potencia está desactivado en Panel de Control.",
  "game-power-owner": "Steam controla la potencia de este juego.",
  "gpu-level-unsupported": "Este equipo no permite ese ajuste.",
};
export function explainFailure(res: ApplyResult | null | undefined): string {
  if (!res) return "Panel de Control no respondió.";
  const d = res.detail ?? "";
  if (DETAIL_ES[d]) return DETAIL_ES[d];
  if (d.startsWith("unknown scope")) return "Ámbito de potencia desconocido.";
  return d ? `No se aplicó (${d}).` : "No se aplicó el cambio.";
}

/** Un preset esta activo si coincide con el valor mostrado (tolerancia de 0,5 W por redondeos). */
export const isActivePreset = (p: PresetView, watts: number): boolean => Math.abs(p.watts - watts) < 0.5;
