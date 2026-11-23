// Perfil de pantalla por juego (FPS, refresco, VRR, escalado, filtro, nitidez). Steam guarda estos ajustes en su
// almacen de rendimiento pero no expone de forma fiable su «perfil por juego», asi que lo lleva el lanzador:
// - «steam» = los valores fuera de juego (modo normal). Un juego sin perfil propio usa estos.
// - <clave del juego> = los del juego (misma clave que Panel de Control: appid o ns:<nombre>).
// Un vigilante (con o sin el panel abierto) aplica el perfil al entrar/salir de un juego.
import type { PerfView } from "./steamPerf";

export interface PerfValues { fps?: number; refresh?: number; vrr?: boolean; scaler?: number; filter?: number; sharp?: number }
export interface Profiles { steam?: PerfValues; games: Record<string, PerfValues> }
export const STEAM = "steam";
// v2 (0.46): el almacén anterior se «contagiaba» entre juegos (el límite de FPS de uno acababa como valor de Steam y de todos los demás); se empieza limpio.
const KEY = "qam-rail:display-profiles2";

export function load(): Profiles {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Profiles | null;
    if (v && typeof v === "object" && v.games && typeof v.games === "object") return v;
  } catch { /* sin almacenamiento */ }
  return { games: {} };
}
export function save(p: Profiles): void { try { window.localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* solo memoria */ } }

/** Valores actuales de Steam (solo los que existen en este equipo). */
export function capture(v: PerfView | null): PerfValues {
  if (!v) return {};
  const out: PerfValues = {};
  if (v.fps) out.fps = v.fps.value;
  if (v.refresh) out.refresh = v.refresh.value;
  if (v.vrr) out.vrr = v.vrr.on;
  if (v.scaler) out.scaler = v.scaler.value;
  if (v.filter) out.filter = v.filter.value;
  if (v.sharp) out.sharp = v.sharp.value;
  return out;
}

/** Que hay que escribir para pasar de `now` a `target` (solo lo distinto y que este equipo permita). */
export function diff(now: PerfView | null, target: PerfValues): Array<[keyof PerfValues, number | boolean]> {
  if (!now) return [];
  const cur = capture(now);
  const out: Array<[keyof PerfValues, number | boolean]> = [];
  // Filtro antes que nitidez (la nitidez depende del filtro elegido).
  for (const k of ["fps", "refresh", "vrr", "scaler", "filter", "sharp"] as const) {
    const t = target[k];
    if (t === undefined || cur[k] === undefined || cur[k] === t) continue;
    out.push([k, t]);
  }
  return out;
}

/** Perfil que toca para una clave: el del juego si lo tiene, si no el de Steam. */
export function targetFor(p: Profiles, key: string): PerfValues | null {
  if (key !== STEAM && p.games[key]) return p.games[key];
  return p.steam ?? null;
}

/** Guarda los valores actuales en la clave (juego o «steam»). */
export function remember(p: Profiles, key: string, values: PerfValues): Profiles {
  if (key === STEAM) return { ...p, steam: values };
  return { ...p, games: { ...p.games, [key]: values } };
}

export function forget(p: Profiles, key: string): Profiles {
  const games = { ...p.games };
  delete games[key];
  return { ...p, games };
}

export const hasOwn = (p: Profiles, key: string | null): boolean => !!key && key !== STEAM && !!p.games[key];
