// Decky integrado: tienda (catalogo oficial), instalados con su version y actualizaciones.
// [H] Catalogo: GET https://plugins.deckbrew.xyz/plugins (lo mismo que usa la tienda de Decky).
// [H] Instalar/actualizar: backend de Decky «utilities/install_plugin» (artefacto, nombre, version, hash, tipo); Decky
//     muestra su propia confirmacion. Si falla, se abre la tienda de Decky (el panel se cierra al navegar).

export interface StoreVersion { name: string; hash: string; artifact?: string | null; created?: string }
export interface StorePlugin { id: number | string; name: string; author: string; description: string; tags: string[]; image: string | null; versions: StoreVersion[] }

export const STORE_URL = "https://plugins.deckbrew.xyz/plugins";
export const artifactUrl = (v: StoreVersion) => v.artifact || `https://cdn.tzatzikiweeb.moe/file/steam-deck-homebrew/versions/${v.hash}.zip`;
export enum InstallType { INSTALL = 0, REINSTALL = 1, UPDATE = 2 }

type Any = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Normaliza la respuesta de la tienda (pura, probada). */
export function parseStore(raw: unknown): StorePlugin[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Any[]).filter((p) => p && typeof p.name === "string").map((p) => ({
    id: (p.id as number) ?? str(p.name),
    name: str(p.name),
    author: str(p.author),
    description: str(p.description),
    tags: Array.isArray(p.tags) ? (p.tags as unknown[]).map(String) : [],
    image: str(p.image_url) || null,
    versions: Array.isArray(p.versions) ? (p.versions as Any[]).map((v) => ({ name: str(v.name), hash: str(v.hash), artifact: (v.artifact as string) ?? null, created: str(v.created) })) : [],
  }));
}

let cache: { at: number; list: StorePlugin[] } | null = null;
export async function fetchStore(force = false): Promise<StorePlugin[]> {
  if (!force && cache && Date.now() - cache.at < 10 * 60_000) return cache.list;
  const r = await fetch(STORE_URL, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`tienda ${r.status}`);
  const list = parseStore(await r.json());
  cache = { at: Date.now(), list };
  return list;
}

interface Pub { installedPlugins?: Array<string | { name?: string; version?: string }>; updates?: Map<string, unknown> | Record<string, unknown> | null; hasLoaderUpdate?: boolean; versionInfo?: { current?: string; remote?: { tag_name?: string } | null } | null }
const pub = (): Pub | null => { try { return (window as unknown as { DeckyPluginLoader?: { deckyState?: { publicState?: () => Pub } } }).DeckyPluginLoader?.deckyState?.publicState?.() ?? null; } catch { return null; } };

/** Instalados con version (nombre → version). */
export function installedVersions(): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of pub()?.installedPlugins ?? []) {
    if (typeof p === "string") out.set(p, "");
    else if (p?.name) out.set(p.name, p.version ?? "");
  }
  return out;
}

/** Actualizaciones pendientes: nombre → version nueva (si Decky la conoce). */
export function pendingUpdates(): Map<string, StoreVersion | null> {
  const out = new Map<string, StoreVersion | null>();
  const u = pub()?.updates;
  const add = (k: string, v: unknown) => {
    const o = v as Any | null;
    out.set(k, o && typeof o === "object" && typeof o.hash === "string" ? { name: str(o.name), hash: str(o.hash), artifact: (o.artifact as string) ?? null } : null);
  };
  if (u instanceof Map) u.forEach((v, k) => add(String(k), v));
  else if (u && typeof u === "object") Object.entries(u).forEach(([k, v]) => add(k, v));
  return out;
}

export function deckyVersion(): { current: string | null; loaderUpdate: boolean } {
  const p = pub();
  return { current: p?.versionInfo?.current ?? null, loaderUpdate: p?.hasLoaderUpdate === true };
}

export type PluginState = "installed" | "update" | "available";
export function stateOf(p: StorePlugin, installed: Map<string, string>, updates: Map<string, unknown>): PluginState {
  if (updates.has(p.name)) return "update";
  return installed.has(p.name) ? "installed" : "available";
}

/** Pide a Decky instalar/actualizar. Decky muestra su confirmacion. */
export async function requestInstall(name: string, v: StoreVersion, type: InstallType): Promise<boolean> {
  const be = (window as unknown as { DeckyBackend?: { call?: (m: string, ...a: unknown[]) => Promise<unknown> } }).DeckyBackend;
  if (!be?.call) return false;
  try { await be.call("utilities/install_plugin", artifactUrl(v), name, v.name, v.hash, type); return true; } catch { return false; }
}
