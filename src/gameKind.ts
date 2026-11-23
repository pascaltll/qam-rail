// Tipo de juego → meta de FPS y vatios de partida. El jugador elige Simple / Medio / Exigente y el panel propone
// lo razonable para ese tipo, distinguiendo enchufado, batería y «ahorrar batería».
//  - Simple (2D, indies): 60 FPS; en batería ahorrando, 30.
//  - Medio: 60 (50 vale) enchufado; ahorrando batería, 30.
//  - Exigente (3D pesado): 40 FPS como mínimo; casi siempre enchufado. Sin cargador, poca duración: se apoya en el
//    reescalado (FSR) para no subir vatios, y solo ahorrando batería baja a 30.
// [H] Los vatios son punto de partida estimado para un equipo tipo Ally (6–30 W): en cuanto Panel aprende el juego,
// manda lo aprendido (zona sugerida). Los FPS sí son los que pediste.
import { KIND_MODE, activeHomeMode, kindOfMode, loadHomeModes, saveHomeModes } from "./homeModes";

export type GameKind = "simple" | "medio" | "exigente" | "app";
export const KINDS: Array<{ id: GameKind; label: string; hint: string; icon: string }> = [
  { id: "simple", label: "Simple", hint: "2D, indies, retro", icon: "M5 19c0-8 5-13 14-14 0 9-5 14-14 14zM5 19l7-7" },
  { id: "medio", label: "Medio", hint: "3D moderado", icon: "M13 3L5 14h6l-1 7 8-11h-6z" },
  { id: "exigente", label: "Exigente", hint: "3D pesado, mundo abierto", icon: "M12 3c4 4 6 7 6 10a6 6 0 0 1-12 0c0-3 2-6 6-10z" },
  // No es un juego: navegador, YouTube/MiniTube, música, lanzador de juegos. Inicio se queda como el escritorio.
  { id: "app", label: "App", hint: "navegador, YouTube, música, lanzador", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
];

/** Modo del preset (Carlos, 13‑11, desde la TV): Auto = ahorra solo en batería · Ahorro = poco consumo aunque haya cargador ·
 *  30 FPS = el mínimo de FPS y de vatios · Pleno = todo lo que pide el tipo, aunque gaste batería. */
export type PresetMode = "auto" | "ahorro" | "minimo" | "pleno";
export const MODES: Array<{ id: PresetMode; label: string; note: string }> = [
  { id: "auto", label: "Auto", note: "Ahorra solo si no hay cargador" },
  { id: "ahorro", label: "Ahorro", note: "Menos vatios, aunque haya cargador" },
  { id: "minimo", label: "Mínimo", note: "Los vatios más bajos que aguante" },
  { id: "pleno", label: "Pleno", note: "Todos los vatios que pide el tipo de juego" },
];
export interface KindCtx { mode?: PresetMode; onAc: boolean; saveBattery: boolean; min: number; max: number; learnedSeed?: number | null; maxHz?: number }
/** `floor`–`ceil`: rango en el que el Auto‑TDP de Panel busca los vatios para esos FPS (null = este tipo no lo usa). */
export interface KindPlan { fps: number; watts: number; fsr: boolean; why: string; floor: number | null; ceil: number | null; hz: number }

const clamp = (w: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(w)));

/** Puro (probado). */
export function planFor(kind: GameKind, c: KindCtx): KindPlan {
  const bat = !c.onAc;
  let fps: number, w: number, fsr = false, why: string;
  if (kind === "app") {
    fps = 60; w = bat ? (c.saveBattery ? 6 : 7) : 8; why = "app: 60 FPS y pocos vatios";
  } else if (kind === "simple") {
    if (bat && c.saveBattery) { fps = 30; w = 6; why = "batería: 30 FPS para que dure"; } else { fps = 60; w = bat ? 7 : 8; why = "60 FPS"; }
  } else if (kind === "medio") {
    if (bat && c.saveBattery) { fps = 30; w = 8; why = "batería: 30 FPS para que dure"; } else { fps = 60; w = bat ? 11 : 12; why = bat ? "60 FPS (50 si hace falta)" : "60 FPS"; }
  } else if (bat) {
    fps = c.saveBattery ? 30 : 40; w = c.saveBattery ? 11 : 14; fsr = true; why = c.saveBattery ? "sin cargador: 30 FPS y reescalado" : "sin cargador: 40 FPS y reescalado (FSR) para no subir vatios";
  } else { fps = 40; w = 18; why = "mínimo 40 FPS"; }
  // Rango de vatios por tipo (pedido por Carlos el 12‑11): Simple 7–10 · Medio 10–15 · Exigente 15–máximo.
  // Ahorrando batería baja un escalón: Simple 7–8 · Medio 8–12 · Exigente 12–18. Es el margen en el que el Auto‑TDP
  // de Panel busca los vatios justos para la meta de FPS. Una app no persigue FPS: vatios fijos.
  let floor: number | null = null, ceil: number | null = null;
  if (kind !== "app") {
    const save = bat && c.saveBattery;
    const [lo, hi] = kind === "simple" ? (save ? [7, 8] : [7, 10]) : kind === "medio" ? (save ? [8, 12] : [10, 15]) : (save ? [12, 18] : [15, c.max]);
    floor = clamp(lo, c.min, c.max);
    ceil = Math.max(floor, clamp(hi, c.min, c.max));
  }
  // Modos «Ahorro» y «30 FPS»: valen con o sin cargador (en la TV el equipo está enchufado y aun así se quiere gastar poco).
  if (kind !== "app" && floor !== null && ceil !== null && (c.mode === "ahorro" || c.mode === "minimo")) {
    if (c.mode === "ahorro") {
      fps = kind === "exigente" ? 30 : 40; fsr = kind === "exigente"; why = kind === "exigente" ? "ahorro: 30 FPS y reescalado" : "ahorro: 40 FPS, pocos vatios";
      const [lo, hi] = kind === "simple" ? [7, 8] : kind === "medio" ? [8, 12] : [12, 18];
      floor = clamp(lo, c.min, c.max); ceil = Math.max(floor, clamp(hi, c.min, c.max)); w = floor + 1;
    } else {
      fps = 30; fsr = kind === "exigente"; why = "30 FPS: el menor consumo";
      const [lo, hi] = kind === "simple" ? [7, 7] : kind === "medio" ? [7, 10] : [10, 14];
      floor = clamp(lo, c.min, c.max); ceil = Math.max(floor, clamp(hi, c.min, c.max)); w = floor;
    }
  }
  if (typeof c.learnedSeed === "number") w = c.learnedSeed; // lo aprendido de este juego manda (dentro del rango)
  const watts = floor !== null && ceil !== null ? Math.min(ceil, Math.max(floor, Math.round(w))) : clamp(w, c.min, c.max);
  // Refresco de pantalla que conviene: enchufado, el doble de los FPS (más suave al mover); en batería, igual que
  // los FPS (la pantalla gasta menos). Solo se puede fijar donde Steam deja elegir el refresco; si no, lo pone él.
  // La pantalla del Ally no baja de 40 Hz: 30 FPS en batería van a 60 Hz (el doble exacto).
  const hz = bat ? (fps >= 40 ? fps : fps * 2) : Math.min(c.maxHz ?? 120, fps * 2);
  return { fps, watts, fsr, why, floor, ceil, hz };
}

/** Puro (probado): la opción de FPS disponible más cercana a la meta (sin contar «sin límite» = 0). */
export function nearestFps(options: number[], target: number): number | null {
  const o = options.filter((x) => x > 0);
  if (!o.length) return null;
  return o.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) || (Math.abs(b - target) === Math.abs(a - target) && b > a) ? b : a));
}

// El TIPO se guarda en los modos de Inicio (una sola elección por juego: decide el kit de plugins, el preset y la
// clave de las pruebas). Aquí solo queda «Ahorrar batería». Lo elegido en 0.36 (clave antigua) se adopta una vez.
/**
 * Puro (probado): refresco de pantalla que permite una meta de FPS que Steam no ofrece. Steam solo deja limitar a
 * divisores del refresco (a 120 Hz: 30, 60, 120 — medido en el Ally): para 40 FPS hay que poner la pantalla a 80 Hz.
 */
export function hzFor(target: number, hzMin: number, hzMax: number): number | null {
  for (const m of [2, 3, 1, 4]) { const hz = target * m; if (hz >= hzMin && hz <= hzMax) return hz; }
  return null;
}

// «Vatios automáticos»: el preset enciende el Auto‑TDP de Panel con la meta de FPS (por defecto sí).
const LS_AUTO = "qam-rail:kind-auto";
export const kindAuto = (): boolean => { try { return window.localStorage?.getItem(LS_AUTO) !== "off"; } catch { return true; } };
export const setKindAuto = (on: boolean): void => { try { window.localStorage?.setItem(LS_AUTO, on ? "on" : "off"); } catch { /* nada */ } };

const LS = "qam-rail:gamekind";
type Store = Record<string, { kind?: GameKind; save?: boolean; mode?: PresetMode }>;
const read = (): Store => { try { return JSON.parse(window.localStorage?.getItem(LS) ?? "{}") ?? {}; } catch { return {}; } };
const write = (s: Store) => { try { window.localStorage?.setItem(LS, JSON.stringify(s)); } catch { /* nada */ } };

/** El tipo de este juego: el elegido; si no, por el nombre (emuladores → simple) o medio. */
export function kindOf(key: string, name = ""): GameKind {
  const hm = loadHomeModes();
  const old = read();
  if (!hm.perGame[key] && old[key]?.kind) { // migración de 0.36
    const k = old[key].kind as GameKind;
    saveHomeModes({ ...hm, perGame: { ...hm.perGame, [key]: KIND_MODE[k] } });
    delete old[key].kind; write(old);
    return k;
  }
  return kindOfMode(activeHomeMode(hm, { key, name }, false));
}
/** ¿Lo eligió el usuario (o es el valor por defecto)? */
export const kindChosen = (key: string): boolean => !!loadHomeModes().perGame[key];
export function setKind(key: string, kind: GameKind): void {
  const hm = loadHomeModes();
  saveHomeModes({ ...hm, perGame: { ...hm.perGame, [key]: KIND_MODE[kind] } });
}
/** «Ahorrar batería»: null = automático (activo cuando no hay cargador). */
export const saveOf = (key: string): boolean | null => (typeof read()[key]?.save === "boolean" ? (read()[key].save as boolean) : null);
export function setSave(key: string, save: boolean | null): void {
  const s = read(); const cur = { ...s[key] };
  if (save === null) delete cur.save; else cur.save = save;
  s[key] = cur; write(s);
}

/** Modo del preset de este juego (por defecto «auto»; lo guardado de «Ahorrar batería» = no pasa a «pleno» salvo que lo apagaras). */
export function modeOf(key: string): PresetMode {
  const e = read()[key];
  if (e?.mode) return e.mode;
  return e?.save === false ? "pleno" : "auto";
}
export function setMode(key: string, mode: PresetMode): void {
  const s = read(); s[key] = { ...s[key], mode }; write(s);
}
/** Puro (probado): ¿el plan lleva el ajuste de batería? Auto = sí cuando no hay cargador; Pleno = nunca. */
export const savingFor = (mode: PresetMode, onAc: boolean): boolean => (mode === "pleno" ? false : mode === "auto" ? !onAc : true);
