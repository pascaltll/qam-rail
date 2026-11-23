// Apps › «Steam» (0.54): apps de escritorio del equipo (Flatpak, AppImage, sistema) que se abren desde el panel y se
// pueden agregar al cajón de apps de QAM. No se crea nada en Steam. Lo puro va aparte y se prueba.
import { callable } from "@decky/api";

import { crumb } from "./crumbs";
import { desktopScan, type DesktopApp } from "./qamApps";

export { desktopScan };
export type { DesktopApp };

export interface DesktopPlan {
  ok: boolean; error?: string; name?: string; source?: string; icon_path?: string | null;
  argv?: string[]; exe?: string; args?: string; dir?: string; fullscreen?: boolean; browser?: "chromium" | "firefox" | null | string;
}
export interface Pin { key: string; name: string; source: string; icon: string | null }

export const desktopPlan = callable<[key: string], DesktopPlan>("desktop_plan");
export const desktopRun = callable<[key: string], { ok: boolean; error?: string }>("desktop_run");
export const desktopRunning = callable<[], { keys: string[] }>("desktop_running");
export const desktopStop = callable<[key: string], { ok: boolean; error?: string | null }>("desktop_stop");
export const desktopMinimize = callable<[key: string], { ok: boolean; error?: string | null }>("desktop_minimize");
export const desktopKill = callable<[key: string], { ok: boolean; error?: string | null }>("desktop_kill");
export const desktopPins = callable<[], { pins: Pin[] }>("desktop_pins");
export const desktopPinSet = callable<[key: string, on: boolean], { ok: boolean; error?: string }>("desktop_pin_set");

const SOURCE_NAME: Record<string, string> = { flatpak: "Flatpak", appimage: "AppImage", system: "Sistema" };
export const sourceLabel = (s: string): string => SOURCE_NAME[s] ?? s;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Puro: filtra por nombre o grupo, sin acentos ni mayúsculas, y ordena por nombre. */
export function filterApps(apps: DesktopApp[], q: string): DesktopApp[] {
  const n = norm(q);
  const out = n ? apps.filter((a) => norm(a.name).includes(n) || norm(a.group || "").includes(n)) : apps.slice();
  return out.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
}

/** Puro: agrupa por categoría del escritorio, grupos por nombre y «Otras» al final. */
export function groupApps(apps: DesktopApp[]): Array<{ group: string; apps: DesktopApp[] }> {
  const m = new Map<string, DesktopApp[]>();
  for (const a of apps) { const g = a.group || "Otras"; m.set(g, [...(m.get(g) ?? []), a]); }
  return [...m.entries()].map(([group, list]) => ({ group, apps: list })).sort((a, b) => (a.group === "Otras" ? 1 : b.group === "Otras" ? -1 : a.group.localeCompare(b.group)));
}

/** Puro: ¿está agregada al cajón de QAM? */
export const isPinned = (key: string, pins: Pin[]): boolean => pins.some((p) => p.key === key);

/** Puro: resumen de la fila («Flatpak · en QAM»). */
export function noteFor(a: Pick<DesktopApp, "source">, pinned: boolean): string {
  return pinned ? `${sourceLabel(a.source)} · en QAM` : sourceLabel(a.source);
}

// Cajón de QAM: las apps agregadas se cargan una vez por apertura (60 s) y se invalidan al cambiar.
let cache: { at: number; pins: Pin[] } | null = null;
export const pinsCached = (): Pin[] => cache?.pins ?? [];
export async function loadPins(force = false): Promise<Pin[]> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.pins;
  const r = await desktopPins().catch(() => null);
  cache = { at: Date.now(), pins: Array.isArray(r?.pins) ? r!.pins : [] };
  return cache.pins;
}

/** Agrega o quita una app del cajón de QAM. */
export async function setPinned(a: Pick<DesktopApp, "key" | "name">, on: boolean): Promise<{ ok: boolean; error?: string }> {
  crumb(`${on ? "agregar a" : "quitar de"} QAM app de escritorio: ${a.name}`);
  const r = await desktopPinSet(a.key, on).catch((e) => ({ ok: false, error: String(e).slice(0, 80) }));
  await loadPins(true);
  return r;
}

/** Abre la app directamente (como el usuario, sin Steam). El backend avisa si se cierra enseguida con error. */
export async function openDesktopApp(key: string, name: string): Promise<{ ok: boolean; error?: string }> {
  crumb(`abrir app de escritorio: ${name}`);
  try { return await desktopRun(key); } catch (err) { return { ok: false, error: String(err).slice(0, 80) }; }
}

/** Cierra una app que abrió QAM Rail. */
export async function closeDesktopApp(key: string, name: string): Promise<{ ok: boolean; error?: string | null }> {
  crumb(`cerrar app de escritorio: ${name}`);
  try { return await desktopStop(key); } catch (err) { return { ok: false, error: String(err).slice(0, 80) }; }
}

/** Puro: ¿está abierta? */
export const isRunning = (key: string, running: string[]): boolean => running.includes(key);

/** Minimizar: Steam vuelve a verse; la app sigue abierta. */
export async function minimizeDesktopApp(key: string, name: string): Promise<{ ok: boolean; error?: string | null }> {
  crumb(`minimizar app de escritorio: ${name}`);
  try { return await desktopMinimize(key); } catch (err) { return { ok: false, error: String(err).slice(0, 80) }; }
}
/** Forzar el cierre (SIGKILL). */
export async function killDesktopApp(key: string, name: string): Promise<{ ok: boolean; error?: string | null }> {
  crumb(`forzar cierre de app de escritorio: ${name}`);
  try { return await desktopKill(key); } catch (err) { return { ok: false, error: String(err).slice(0, 80) }; }
}

// Apps abiertas por QAM Rail (compartido por el cajón y la pestaña Steam).
let runCache: { at: number; keys: string[] } | null = null;
export const runningCached = (): string[] => runCache?.keys ?? [];
export async function loadRunning(force = false): Promise<string[]> {
  if (!force && runCache && Date.now() - runCache.at < 4000) return runCache.keys;
  const r = await desktopRunning().catch(() => null);
  runCache = { at: Date.now(), keys: Array.isArray(r?.keys) ? r!.keys : [] };
  return runCache.keys;
}

/** Puro: opciones del menú de una app de escritorio (abierta o no), en el orden en que se muestran. */
export function menuOptions(running: boolean): Array<{ id: "open" | "show" | "minimize" | "close" | "kill"; label: string }> {
  return running
    ? [{ id: "show", label: "Mostrar" }, { id: "minimize", label: "Minimizar" }, { id: "close", label: "Cerrar" }, { id: "kill", label: "Forzar cierre" }]
    : [{ id: "open", label: "Abrir" }];
}
