// Situacion de uso, para que cada prueba y cada linea del registro digan DONDE se midieron:
// escritorio o juego, pantalla del equipo o externa/4K, con o sin cargador.
// La clave es corta y estable (p. ej. "juego-tv-cargador") y sirve de sufijo de seccion: fluidez@juego-tv.
import { runningGameSticky } from "./game";
import { kindOf } from "./gameKind";
import { currentOnAc } from "./tdpControl";

export interface Situation {
  key: string; label: string; cls?: GameClass;
  game: { appid: number; name: string } | null;
  tv: boolean; onAc: boolean | null;
  screen: { cssW: number; cssH: number; dpr: number; w: number; h: number };
}

/** Puro (probado): clave y etiqueta a partir de los datos. Pantalla > 1920 px fisicos de ancho = externa/4K. */
// Tipo de juego (el que eliges en Inicio para cada juego): cada uno guarda sus pruebas aparte.
export type GameClass = "simple" | "medio" | "exigente" | "app";
const CLASS_LABEL: Record<GameClass, string> = { simple: "juego simple", medio: "juego medio", exigente: "juego exigente", app: "app abierta" };

export function situationOf(game: boolean, physW: number, onAc: boolean | null, cls: GameClass = "medio"): { key: string; label: string; tv: boolean } {
  const tv = physW > 1920 + 8;
  const key = [game ? (cls === "app" ? "app" : `juego.${cls}`) : "escritorio", tv ? "tv" : null, onAc ? "cargador" : null].filter(Boolean).join("-");
  const label = [game ? CLASS_LABEL[cls].replace(/^./, (c) => c.toUpperCase()) : "Sin juego", tv ? "pantalla externa/4K" : null, onAc ? "con cargador" : null].filter(Boolean).join(" · ");
  return { key, label, tv };
}

let cache: { at: number; s: Situation } | null = null;

export function situation(win?: Window | null, maxAgeMs = 5000): Situation {
  const now = Date.now();
  if (cache && now - cache.at < maxAgeMs && !win) return cache.s;
  const w = win ?? (window as unknown as { __qamRailModalEl?: HTMLElement | null }).__qamRailModalEl?.ownerDocument?.defaultView ?? window;
  const dpr = Number(w.devicePixelRatio) || 1;
  const cssW = w.innerWidth || 0, cssH = w.innerHeight || 0;
  const g = runningGameSticky();
  const onAc = currentOnAc();
  const cls: GameClass = g ? kindOf(g.key, g.name) : "medio";
  const base = situationOf(!!g, Math.round(cssW * dpr), onAc, cls);
  const s: Situation = { ...base, game: g ? { appid: g.liveAppid, name: g.name } : null, onAc, screen: { cssW, cssH, dpr, w: Math.round(cssW * dpr), h: Math.round(cssH * dpr) } };
  cache = { at: now, s };
  return s;
}

export const situationKey = () => situation().key;
