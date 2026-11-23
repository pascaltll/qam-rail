// Apps de QAM Rail en el frontend: lista, instalar desde .zip, añadir a Steam (atajo no‑Steam con su arte),
// desinstalar y acciones rapidas. El trabajo de archivos lo hace el backend (py_modules/qam_apps.py).
import { callable } from "@decky/api";

import { readApps } from "./apps";

export interface QamApp {
  id: string; name: string; version: string | null; path: string; launch: string | null; launch_options?: string;
  install?: string | null; art: Record<string, string>; actions?: Array<{ label: string; args: string }>;
  deducido?: boolean; external?: boolean; steam_appid?: number | null;
  // Esquema 1 (0.50)
  schema?: number; group?: string | null; description?: string | null; status?: string | null;
  update?: { provider: string; repo: string; asset?: string; channel?: string } | null;
  has_previous?: boolean; previous_version?: string | null; bad_versions?: string[]; last_error?: string | null; installed_at?: number | null;
  check?: { errors: string[]; warnings: string[] };
  controls?: Partial<Record<"show" | "minimize" | "close" | "kill", string>>;
}
export interface FoundZip { zip: string; mtime: number; size: number; id: string; name: string; version: string | null }

export const appsList = callable<[], { dir: string; apps: QamApp[]; error?: string }>("apps_list");
export const appsFindZips = callable<[], FoundZip[]>("apps_find_zips");
export const appsInstall = callable<[source: string, confirmed?: boolean, sha256?: string, force?: boolean], { ok: boolean; started?: boolean; error?: string }>("apps_install");
export interface AppsJob {
  state: "idle" | "running" | "confirm" | "cancelled" | "done" | "error"; step?: string; app?: QamApp; install_log?: string | null; error?: string; seconds?: number;
  verified?: boolean | null; warnings?: string[]; rolled_back?: boolean; back_to?: string | null; updated?: boolean;
}
export const appsJob = callable<[], AppsJob>("apps_job");
export const appsConfirm = callable<[ok: boolean], { ok: boolean }>("apps_confirm");
export const appsRollback = callable<[id: string], { ok: boolean; app?: QamApp; error?: string }>("apps_rollback");
export const appsIcons = callable<[], Record<string, string>>("apps_icons");

/**
 * Instala (zip o carpeta) y espera al final, avisando de cada paso. Primera instalacion de una app con instalador propio:
 * el backend se detiene en «confirm» y `onConfirm` decide (sin `onConfirm` se cancela: nunca se ejecuta un instalador sin preguntar).
 */
/** Espera a que termine el trabajo en marcha (instalar/actualizar), contestando la confirmación si hace falta. */
async function watchJob(onStep: (s: string) => void, onConfirm?: (app: QamApp) => Promise<boolean>): Promise<AppsJob> {
  let asked = false;
  for (let i = 0; i < 1200; i++) {
    await new Promise((ok) => window.setTimeout(ok, 700));
    const j = await appsJob().catch(() => null);
    if (!j) continue;
    if (j.state === "confirm" && !asked) {
      asked = true;
      const yes = onConfirm && j.app ? await onConfirm(j.app).catch(() => false) : false;
      await appsConfirm(yes).catch(() => null);
      continue;
    }
    if (j.state === "running" || j.state === "confirm") { if (j.step) onStep(j.step); continue; }
    return j;
  }
  return { state: "error", error: "sin respuesta" };
}

export async function installAndWait(source: string, onStep: (s: string) => void, onConfirm?: (app: QamApp) => Promise<boolean>): Promise<AppsJob> {
  const r = await appsInstall(source);
  if (!r?.ok) return { state: "error", error: r?.error ?? "no se pudo empezar" };
  return watchJob(onStep, onConfirm);
}

// ---- Actualizaciones desde GitHub Releases (0.51) ----
export interface GhUpdate { state: "none" | "current" | "update" | "error"; current?: string; latest?: string; channel?: string; prerelease?: boolean; notes?: string; error?: string; }
export const appsCheckUpdates = callable<[force?: boolean], { ok: boolean; results: Record<string, GhUpdate> }>("apps_check_updates");
export const appsUpdate = callable<[id: string, force?: boolean], { ok: boolean; started?: boolean; error?: string }>("apps_update");

export async function updateAndWait(id: string, onStep: (s: string) => void): Promise<AppsJob> {
  const r = await appsUpdate(id);
  if (!r?.ok) return { state: "error", error: r?.error ?? "no se pudo empezar" };
  return watchJob(onStep);
}

/** Texto corto para el botón: «Actualizar a 3.13 (beta)». */
export function updateLabel(u: GhUpdate | undefined): string | null {
  if (!u || u.state !== "update" || !u.latest) return null;
  return `Actualizar a ${u.latest}${u.prerelease ? " (beta)" : ""}`;
}

/** Puro (probado): frase para el aviso final de una instalacion. */
export function installMessage(j: AppsJob): string {
  if (j.state === "cancelled") return "Instalación cancelada";
  if (j.state === "done" && j.app) {
    const v = j.app.version ? ` ${j.app.version}` : "";
    return `${j.app.name}${v} ${j.updated ? "actualizada" : "instalada"}${j.verified ? " · descarga verificada" : ""}: ya está en Apps e Inicio`;
  }
  const back = j.rolled_back ? (j.back_to ? ` Se volvió a la versión ${j.back_to}.` : " Se quitó lo instalado a medias.") : "";
  return `No se pudo instalar: ${j.error ?? "?"}.${back} (queda en el informe, sección «apps»)`;
}

// Cajon de apps: las de QAM con su icono (se cargan una vez por apertura del panel).
let cache: { at: number; apps: QamApp[]; icons: Record<string, string> } | null = null;
export async function loadDrawerApps(force = false): Promise<{ apps: QamApp[]; icons: Record<string, string> }> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache;
  const [l, icons] = await Promise.all([appsList().catch(() => null), appsIcons().catch(() => ({} as Record<string, string>))]);
  const next = { at: Date.now(), apps: Array.isArray(l?.apps) ? l!.apps.filter((a) => a.launch) : [], icons: (icons && typeof icons === "object" ? icons : {}) as Record<string, string> };
  cache = next;
  return next;
}
export const drawerCached = () => cache;
export const appsAddFolder = callable<[path: string], { ok: boolean; app?: QamApp; error?: string }>("apps_add_folder");
export const appsUninstall = callable<[id: string, purgeData?: boolean], { ok: boolean; removed: boolean; appid: number | null; purged?: string[] }>("apps_uninstall");
export const appsRunning = callable<[], { ids: string[] }>("apps_running");
export const appsControl = callable<[id: string, action: string], { ok: boolean; error?: string }>("apps_control");
export const appsRun = callable<[id: string, args: string], { ok: boolean }>("apps_run");
const appsSetAppid = callable<[id: string, appid: number], boolean>("apps_set_appid");
const appsArt = callable<[id: string], Record<string, { b64: string; type: "png" | "jpg"; path: string }>>("apps_art");

// Steam: tipo de imagen de la biblioteca (ELibraryAssetType de @decky/ui).
const ASSET: Record<string, number> = { capsule: 0, hero: 1, logo: 2, header: 3 };

interface SteamApps {
  AddShortcut?: (name: string, exe: string, dir: string, opts: string) => Promise<number>;
  SetShortcutName?: (appid: number, name: string) => void;
  SetShortcutIcon?: (appid: number, path: string) => void;
  SetCustomArtworkForApp?: (appid: number, b64: string, type: string, asset: number) => Promise<void>;
  RemoveShortcut?: (appid: number) => void;
}
const steamApps = () => (window as unknown as { SteamClient?: { Apps?: SteamApps } }).SteamClient?.Apps;

/** Puro (probado): el atajo de Steam que ya corresponde a esta app (por appid guardado o por nombre). */
export function steamShortcutFor(app: Pick<QamApp, "name" | "steam_appid">, shortcuts: Array<{ appid: number; name: string; isShortcut: boolean }>): number | null {
  if (app.steam_appid && shortcuts.some((s) => s.appid === app.steam_appid)) return app.steam_appid;
  const n = app.name.trim().toLowerCase();
  return shortcuts.find((s) => s.isShortcut && s.name.trim().toLowerCase() === n)?.appid ?? null;
}

export function shortcutOf(app: QamApp): number | null {
  try { return steamShortcutFor(app, readApps(window as never)); } catch { return null; }
}

/**
 * Crea el atajo no‑Steam (lanzador de la app, carpeta de inicio = la de la app) y le pone nombre, icono y arte.
 * [H] AddShortcut/SetCustomArtworkForApp segun los tipos de @decky/ui; sin probar en el equipo de Carlos.
 */
export async function addToSteam(app: QamApp): Promise<{ appid: number | null; art: number; error?: string }> {
  const s = steamApps();
  if (!s?.AddShortcut || !app.launch) return { appid: null, art: 0, error: "Steam no permite crear atajos desde aquí" };
  const exe = `${app.path}/${app.launch}`;
  let appid: number;
  try { appid = await s.AddShortcut(app.name, exe, app.path, app.launch_options ?? ""); } catch (e) { return { appid: null, art: 0, error: String(e) }; }
  try { s.SetShortcutName?.(appid, app.name); } catch { /* nombre por defecto */ }
  let art = 0;
  try {
    const imgs = await appsArt(app.id);
    for (const [kind, img] of Object.entries(imgs)) {
      if (kind === "icon") { try { s.SetShortcutIcon?.(appid, img.path); art++; } catch { /* sin icono */ } continue; }
      if (ASSET[kind] === undefined || !s.SetCustomArtworkForApp) continue;
      try { await s.SetCustomArtworkForApp(appid, img.b64, img.type, ASSET[kind]); art++; } catch { /* esa imagen no */ }
    }
  } catch { /* sin arte */ }
  await appsSetAppid(app.id, appid).catch(() => false);
  return { appid, art };
}

export function removeFromSteam(appid: number | null): void {
  if (!appid) return;
  try { steamApps()?.RemoveShortcut?.(appid); } catch { /* ya no estaba */ }
}

// ---- Apps de escritorio (0.51.1; la pestaña «Steam» llega en 0.52) ----
export interface DesktopApp { key: string; name: string; source: "flatpak" | "appimage" | "system"; exec: string[]; icon: string | null; group: string; desktop: string | null; }
export const desktopScan = callable<[force?: boolean], { ok: boolean; apps: DesktopApp[]; omitidas?: number; motivos?: Record<string, number>; ms?: number; error?: string }>("desktop_scan");
