// Calma y aislamiento: para separar los fallos de Steam/gamescope de los del plugin.
//
// CALMA: al arrancar y al cerrar un juego (los momentos en que se cayo la sesion: 19:31 y 20:32 del 2026-11-07) el
// plugin deja de hacer cosas de fondo: el boton QAM abre el QAM de Steam, no se cambian opciones de temas, no se
// aplican perfiles de pantalla y no se mide nada. Cuando el juego ya esta estable (o Big Picture tras salir), se
// recupera lo pendiente.
//
// AISLAMIENTO: cada funcion de fondo se puede apagar por separado (Diagnóstico › Aislar fallos). Si Steam se sigue
// cayendo con TODO apagado, no es el plugin. Las migas de cada sesion dicen que estaba apagado.
import { crumb } from "./crumbs";

export type BgFeature = "qamGame" | "pantalla" | "temaEco" | "musica" | "salida" | "registro";
export const FEATURES: Array<{ id: BgFeature; label: string; note: string; def: boolean }> = [
  { id: "qamGame", label: "Panel con juego abierto", note: "si se apaga, con un juego abierto el botón abre el QAM de Steam", def: true },
  { id: "pantalla", label: "Perfiles de pantalla", note: "aplica la pantalla de cada juego al entrar y salir", def: true },
  { id: "temaEco", label: "Eficiencia del tema", note: "cambia opciones del tema según la potencia", def: true },
  { id: "musica", label: "Reproductor", note: "escucha la música de Steam", def: true },
  { id: "salida", label: "Medir la salida de juegos", note: "mide 10 s de Big Picture al cerrar un juego (diagnóstico)", def: false },
  { id: "registro", label: "Registro de rendimiento", note: "anota aperturas y tirones del panel", def: true },
];

const LS = "qam-rail:isolate";
const read = (): Partial<Record<BgFeature, boolean>> => { try { return JSON.parse(window.localStorage?.getItem(LS) ?? "{}") ?? {}; } catch { return {}; } };
export function featureOn(f: BgFeature): boolean {
  const v = read()[f];
  return typeof v === "boolean" ? v : FEATURES.find((x) => x.id === f)?.def ?? true;
}
const subs = new Set<() => void>();
export const onFeaturesChange = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function setFeature(f: BgFeature, on: boolean): void {
  const m = read(); m[f] = on;
  try { window.localStorage?.setItem(LS, JSON.stringify(m)); } catch { /* nada */ }
  crumb(`aislar: ${f} ${on ? "encendido" : "apagado"}`);
  subs.forEach((x) => x());
}
export function setAllFeatures(on: boolean): void {
  const m: Partial<Record<BgFeature, boolean>> = {};
  for (const x of FEATURES) m[x.id] = on ? x.def : false;
  try { window.localStorage?.setItem(LS, JSON.stringify(m)); } catch { /* nada */ }
  crumb(on ? "aislar: todo como siempre" : "aislar: todo apagado");
  subs.forEach((x) => x());
}
export const featuresOff = (): BgFeature[] => FEATURES.filter((x) => !featureOn(x.id)).map((x) => x.id);

// Durante la calma, ¿el boton abre el QAM de Steam? Por defecto NO: no te gustaba ver el QAM antiguo al arrancar un
// juego y el zip de las 21:19 mostro que las caidas al cerrar un juego llegan sin el panel abierto (se cierra
// OpenGamepadUI, que sostiene la sesion). Queda como opcion para probar.
const LS_CQ = "qam-rail:calm-steam-qam";
export const calmUsesSteamQam = (): boolean => { try { return window.localStorage?.getItem(LS_CQ) === "on"; } catch { return false; } };
export function setCalmUsesSteamQam(on: boolean): void {
  try { window.localStorage?.setItem(LS_CQ, on ? "on" : "off"); } catch { /* nada */ }
  crumb(`calma: QAM de Steam ${on ? "sí" : "no"}`);
  subs.forEach((x) => x());
}

// ---- Calma ----
export const CALM_LAUNCH_MS = 25_000;
export const CALM_EXIT_MS = 15_000;
let until = 0;
let why = "";
const pending: Array<() => void> = [];
let timer: number | null = null;

/** Puro (probado): nuevo final de la calma (nunca la acorta). */
export const extendCalm = (current: number, now: number, ms: number) => Math.max(current, now + ms);

export function startCalm(reason: string, ms: number, now = Date.now()): void {
  const prev = until;
  until = extendCalm(until, now, ms);
  why = reason;
  if (until !== prev) crumb(`calma ${Math.round((until - now) / 1000)} s: ${reason}`);
  schedule();
}
export const inCalm = (now = Date.now()) => now < until;
export const calmLeft = (now = Date.now()) => Math.max(0, Math.ceil((until - now) / 1000));
export const calmReason = () => why;

/** Ejecuta `fn` cuando no haya calma (al momento si no la hay). Lo repetido con la misma clave se junta. */
const keyed = new Map<string, () => void>();
export function afterCalm(fn: () => void, key?: string): void {
  if (!inCalm()) { fn(); return; }
  if (key) keyed.set(key, fn); else pending.push(fn);
  schedule();
}
function schedule(): void {
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    if (inCalm()) { schedule(); return; }
    const run = [...pending.splice(0), ...keyed.values()];
    keyed.clear();
    if (run.length) crumb(`fin de la calma: se recuperan ${run.length} tareas`);
    run.forEach((f) => { try { f(); } catch { /* cada una a lo suyo */ } });
  }, Math.max(50, until - Date.now() + 50));
}
export const resetCalmForTest = () => { until = 0; why = ""; pending.length = 0; keyed.clear(); if (timer !== null) { window.clearTimeout(timer); timer = null; } };
