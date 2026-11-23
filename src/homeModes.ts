// Modos de Inicio: que plugins tienes a mano segun lo que estas haciendo. Con juego, el tipo de juego (cada juego
// recuerda el suyo); sin juego, lo que elijas (escritorio, pelicula, amigos) o TV si hay pantalla externa/4K.
// Cada modo tiene SUS plugins fijados por ti; si no fijaste ninguno, se usan los mas abiertos en ese modo.
import type { UsageMode } from "./pluginUsage";

export type HomeModeId = "escritorio" | "pelicula" | "tv" | "juego-exigente" | "juego-intermedio" | "juego-retro";

export interface HomeModeDef { id: HomeModeId; label: string; icon: string; hint: string; game: boolean; usage: UsageMode; suggest: RegExp[] }

export const HOME_MODES: HomeModeDef[] = [
  { id: "escritorio", label: "Escritorio", icon: "🏠", hint: "Sin juego: lo de siempre", game: false, usage: "normal", suggest: [/clash|tomoon/i, /animation/i, /colores/i] },
  // «pelicula» conserva su id (plugins fijados guardados); se llama Multimedia y también vale para una APP abierta
  // (navegador, YouTube/MiniTube, música, lanzador de juegos), que Steam trata como si fuera un juego.
  { id: "pelicula", label: "Multimedia", icon: "🎬", hint: "Apps, vídeo, YouTube y música: sonido, color, no molestar", game: false, usage: "normal", suggest: [/colores/i, /volume|mixer/i, /picture|pip/i] },
  { id: "tv", label: "TV / 4K", icon: "📺", hint: "Pantalla externa: escalado y salida", game: false, usage: "normal", suggest: [/sunshine/i, /colores/i, /volume|mixer/i] },
  { id: "juego-exigente", label: "Exigente", icon: "🔥", hint: "Juegos pesados: escalado, FPS, frame‑gen", game: true, usage: "game", suggest: [/framegen|lsfg/i, /reshade/i, /colores/i] },
  { id: "juego-intermedio", label: "Medio", icon: "⚖️", hint: "12–15 W: equilibrio", game: true, usage: "game", suggest: [/colores/i, /framegen|lsfg/i, /clash|tomoon/i] },
  { id: "juego-retro", label: "Simple", icon: "🕹️", hint: "Emuladores y juegos ligeros: batería", game: true, usage: "game", suggest: [/emudeck|emudecky/i, /colores/i, /animation/i] },
];
export const modeDef = (id: HomeModeId) => HOME_MODES.find((m) => m.id === id) ?? HOME_MODES[0];

export interface HomeModeState { manual: HomeModeId | null; perGame: Record<string, HomeModeId>; pins: Partial<Record<HomeModeId, string[]>> }

const KEY = "qam-rail:home-modes";
export function loadHomeModes(): HomeModeState {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as HomeModeState | null;
    if (v && typeof v === "object") return { manual: v.manual ?? null, perGame: v.perGame ?? {}, pins: v.pins ?? {} };
  } catch { /* sin almacenamiento */ }
  return { manual: null, perGame: {}, pins: {} };
}
export function saveHomeModes(s: HomeModeState): HomeModeState {
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* solo en memoria */ }
  subs.forEach((f) => { try { f(); } catch { /* nada */ } });
  return s;
}
// Quien muestre el modo (Inicio, Energía, pruebas) se entera cuando cambia desde otro sitio.
const subs = new Set<() => void>();
export const onHomeModesChange = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** Tipo de juego ↔ modo de Inicio: es LA MISMA elección (antes había dos, una en Inicio y otra en «Tipo de juego»). */
export const KIND_MODE = { simple: "juego-retro", medio: "juego-intermedio", exigente: "juego-exigente", app: "pelicula" } as const;
export const kindOfMode = (m: HomeModeId): "simple" | "medio" | "exigente" | "app" => (m === "juego-retro" ? "simple" : m === "juego-exigente" ? "exigente" : m === "pelicula" ? "app" : "medio");

/** Puro (probado): el modo activo. Juego → el de ese juego (por defecto intermedio); TV → tv; si no, el elegido. */
const RETRO = /retro|emu|rpcs3|pcsx|dolphin|ppsspp|duckstation|retroarch|cemu|ryujinx|yuzu|citra|melonds|mgba|snes|\.sh$/i;
/** Apps que Steam lanza como «juego» pero no lo son: se tratan como Multimedia (parecido al escritorio). */
export const APP_NAME = /firefox|chrome|chromium|brave|edge|navegador|browser|youtube|minitube|ytmini|spotify|vlc|kodi|plex|jellyfin|netflix|twitch|discord|\bhub\b|launcher|lanzador|heroic|lutris|bottles|emudeck|es-de|emulationstation/i;
const known = (id: unknown): id is HomeModeId => HOME_MODES.some((m) => m.id === id);
export function activeHomeMode(s: HomeModeState, game: { key: string; name: string } | null, tv: boolean): HomeModeId {
  if (game) {
    const own = s.perGame[game.key];
    if (known(own) && (modeDef(own).game || own === "pelicula")) return own;
    return APP_NAME.test(game.name) ? "pelicula" : RETRO.test(game.name) ? "juego-retro" : "juego-intermedio";
  }
  if (known(s.manual) && !modeDef(s.manual).game) return s.manual; // «amigos» (quitado en 0.38) cae en escritorio
  return tv ? "tv" : "escritorio";
}

/** Puro (probado): plugins de Inicio para un modo. Fijados (en su orden, solo los que existen) o los sugeridos/mas usados. */
export function homePlugins(names: string[], s: HomeModeState, mode: HomeModeId, byUsage: (limit: number) => string[], limit = 3): { list: string[]; pinned: boolean } {
  const pins = (s.pins[mode] ?? []).filter((n) => names.includes(n));
  if (pins.length) return { list: pins.slice(0, 8), pinned: true };
  const used = byUsage(limit);
  const sug = modeDef(mode).suggest.map((re) => names.find((n) => re.test(n))).filter((n): n is string => !!n);
  const out: string[] = [];
  for (const n of [...used, ...sug]) if (!out.includes(n)) out.push(n);
  return { list: out.slice(0, limit), pinned: false };
}

export function togglePin(s: HomeModeState, mode: HomeModeId, name: string, current: string[]): HomeModeState {
  const base = s.pins[mode] ?? current; // al empezar a editar se parte de lo que se ve
  const next = base.includes(name) ? base.filter((n) => n !== name) : [...base, name];
  return { ...s, pins: { ...s.pins, [mode]: next } };
}
