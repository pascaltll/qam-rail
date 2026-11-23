// Identidad del juego en ejecucion. Panel de Control guarda sus perfiles por una CLAVE ESTABLE: el appid numerico para
// juegos de Steam y "ns:<nombre normalizado>" para atajos no-Steam (su appid cambia al reimportarlos). Para que el
// backend de Panel acepte nuestras ordenes hay que usar exactamente la misma clave (si no, responde "stale-context").
// Aqui NO se copia su codigo: es la misma regla publica, reescrita.

export interface RunningGame {
  /** Clave estable usada por Panel de Control como id de perfil. */
  key: string;
  /** Appid numerico real de Steam (para lanzar/identificar). */
  liveAppid: number;
  name: string;
}

interface Overview { appid?: unknown; display_name?: unknown; app_type?: unknown }

const NS_PREFIX = "ns:";
const APP_TYPE_SHORTCUT = 1073741824; // EAppType.Shortcut
const NONSTEAM_APPID_MIN = 2147483648; // los atajos no-Steam tienen el bit alto activo

export function stableGameKey(o: Overview): string {
  const raw = String(o.appid);
  const n = Number(o.appid);
  const shortcut = o.app_type === APP_TYPE_SHORTCUT || (Number.isFinite(n) && n >= NONSTEAM_APPID_MIN);
  if (shortcut && typeof o.display_name === "string") {
    const name = o.display_name.trim().toLowerCase().replace(/\s+/g, " ");
    if (name) return NS_PREFIX + name;
  }
  return raw;
}

type Reader = () => unknown;
const defaultReader: Reader = () => (window as unknown as { SteamUIStore?: { MainRunningApp?: unknown } }).SteamUIStore?.MainRunningApp;
let reader: Reader = defaultReader;

/** El nucleo registra aqui una lectura mas fiable (Router.MainRunningApp); los tests inyectan la suya. */
export function setRunningAppReader(r: Reader | null): void { reader = r ?? defaultReader; }

export function runningGame(): RunningGame | null {
  const read = (r: Reader): RunningGame | null => {
    try {
      const a = r() as Overview | null | undefined;
      if (!a || !a.appid) return null;
      const live = Number(a.appid);
      if (!Number.isFinite(live) || live === 0) return null;
      const name = typeof a.display_name === "string" && a.display_name ? a.display_name : String(a.appid);
      return { key: stableGameKey(a), liveAppid: live, name };
    } catch { return null; }
  };
  return read(reader) ?? (reader !== defaultReader ? read(defaultReader) : null);
}

// ---- Juego «visto hace poco» ----
// Al abrir el panel, Steam a veces dice durante un instante que no hay juego (medido el 12‑11 a las 01:18: el panel
// abrió en «escritorio» con la potencia de Metro aún puesta): Inicio salía en modo escritorio y al reabrir, bien.
// El vigilante de fondo lee el juego cada 2 s; si la lectura falla pero se vio un juego hace menos de STICKY_MS, vale.
export const STICKY_MS = 6000;
let seen: { g: RunningGame; at: number } | null = null;
/** Puro (probado): qué juego dar con la lectura de ahora y el último visto. */
export function stickyPick(now: RunningGame | null, last: { g: RunningGame; at: number } | null, t: number): RunningGame | null {
  return now ?? (last && t - last.at < STICKY_MS ? last.g : null);
}
export function runningGameSticky(t = Date.now()): RunningGame | null {
  const g = runningGame();
  if (g) seen = { g, at: t };
  return stickyPick(g, seen, t);
}
export const resetStickyForTest = () => { seen = null; };
