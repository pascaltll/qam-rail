// Logica pura del lanzador: leer juegos/atajos de Steam, ordenar y repartir en favoritos/recientes.

export interface AppEntry {
  appid: number;
  name: string;
  lastPlayed: number;
  isShortcut: boolean;
  gameid: string;
  capsule: string | null;
}

// [H] app_type de Steam: 1 = juego, 1073741824 = atajo no-Steam. Sin verificar en la maquina de Carlos.
const APP_TYPE_GAME = 1;
const APP_TYPE_SHORTCUT = 1073741824;

interface RawOverview {
  appid?: unknown;
  display_name?: unknown;
  rt_last_time_played?: unknown;
  app_type?: unknown;
  gameid?: unknown;
  m_gameid?: unknown;
  library_capsule_filename?: unknown;
  local_cache_version?: unknown;
}

const CAPSULE_FILE = /^(?:[0-9a-f]+\/)?[\w.-]+\.(?:jpe?g|png|webp)$/i;

export function toEntry(raw: RawOverview): AppEntry | null {
  const appid = raw.appid;
  const type = raw.app_type;
  if (type !== APP_TYPE_GAME && type !== APP_TYPE_SHORTCUT) return null;
  // [H] Los atajos no-Steam pueden venir con appid negativo (entero con signo) en la interfaz de Steam.
  if (typeof appid !== "number" || !Number.isSafeInteger(appid) || appid === 0 || (appid < 0 && type !== APP_TYPE_SHORTCUT)) return null;
  const name = typeof raw.display_name === "string" ? raw.display_name.trim() : "";
  if (!name) return null;
  const gid = typeof raw.gameid === "string" ? raw.gameid : typeof raw.m_gameid === "string" ? raw.m_gameid : String(appid);
  const file = raw.library_capsule_filename;
  let capsule: string | null = null;
  if (typeof file === "string" && CAPSULE_FILE.test(file)) {
    const v = raw.local_cache_version;
    const cache = v === null || v === undefined || v === "" ? "" : `?c=${encodeURIComponent(String(v))}`;
    capsule = `/assets/${appid}/${file}${cache}`;
  }
  return {
    appid,
    name,
    lastPlayed: typeof raw.rt_last_time_played === "number" ? raw.rt_last_time_played : 0,
    isShortcut: type === APP_TYPE_SHORTCUT,
    gameid: gid,
    capsule,
  };
}

interface StoreHost {
  collectionStore?: { localGamesCollection?: { allApps?: unknown } };
  appStore?: { allApps?: unknown };
}

// [H] Las dos rutas existen en versiones recientes del cliente; se prueba la primera que devuelva una lista.
export function readApps(host: StoreHost): AppEntry[] {
  const candidates = [host.collectionStore?.localGamesCollection?.allApps, host.appStore?.allApps];
  for (const list of candidates) {
    if (!Array.isArray(list)) continue;
    const seen = new Set<number>();
    const out: AppEntry[] = [];
    for (const raw of list) {
      const entry = raw && typeof raw === "object" ? toEntry(raw as RawOverview) : null;
      if (entry && !seen.has(entry.appid)) {
        seen.add(entry.appid);
        out.push(entry);
      }
    }
    if (out.length) return out;
  }
  return [];
}

export interface Arranged {
  favorites: AppEntry[];
  recent: AppEntry[];
}

export function arrange(apps: readonly AppEntry[], favoriteIds: readonly number[], recentLimit = 12): Arranged {
  const byId = new Map(apps.map((a) => [a.appid, a]));
  const favSet = new Set(favoriteIds);
  // Favoritos en el orden elegido por el usuario; los que ya no existen se omiten.
  const favorites = favoriteIds.map((id) => byId.get(id)).filter((a): a is AppEntry => !!a);
  const recent = apps
    .filter((a) => !favSet.has(a.appid) && a.lastPlayed > 0)
    .sort((a, b) => b.lastPlayed - a.lastPlayed || a.name.localeCompare(b.name))
    .slice(0, recentLimit);
  return { favorites, recent };
}

export function toggleFavorite(favorites: readonly number[], appid: number, max = 24): number[] {
  if (favorites.includes(appid)) return favorites.filter((id) => id !== appid);
  return [...favorites, appid].slice(-max);
}

// Apps del lanzador: solo herramientas propias (atajos no-Steam), nada de juegos recientes.
const DEFAULT_PINNED = [/minitube/i, /recomp/i];

export interface Curated {
  pinned: AppEntry[];
  more: AppEntry[];
}

/** `pinnedIds` manda; si esta vacio se anclan por nombre MiniTube y Recomp Hub. `more` = otros atajos no-Steam. */
export function curate(apps: readonly AppEntry[], pinnedIds: readonly number[]): Curated {
  const shortcuts = apps.filter((a) => a.isShortcut);
  const byId = new Map(apps.map((a) => [a.appid, a]));
  let pinned: AppEntry[];
  if (pinnedIds.length) {
    pinned = pinnedIds.map((id) => byId.get(id)).filter((a): a is AppEntry => !!a);
  } else {
    pinned = DEFAULT_PINNED.map((re) => shortcuts.find((a) => re.test(a.name))).filter((a): a is AppEntry => !!a);
  }
  const ids = new Set(pinned.map((a) => a.appid));
  const more = shortcuts.filter((a) => !ids.has(a.appid)).sort((a, b) => a.name.localeCompare(b.name));
  return { pinned, more };
}
