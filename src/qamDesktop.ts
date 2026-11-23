// Apps › «Steam» (0.54): apps de escritorio del equipo (Flatpak, AppImage, sistema) que se pueden abrir desde el panel
// o añadir a Steam como atajo. Lo puro (filtrar, agrupar, estado) va aparte y se prueba; el resto habla con el backend.
import { callable } from "@decky/api";

import { readApps, type AppEntry } from "./apps";
import { crumb } from "./crumbs";
import { desktopScan, type DesktopApp } from "./qamApps";

export { desktopScan };
export type { DesktopApp };

export interface DesktopPlan {
  ok: boolean; error?: string; name?: string; source?: string; icon_path?: string | null;
  argv?: string[]; exe?: string; args?: string; dir?: string; fullscreen?: boolean; browser?: "chromium" | "firefox" | null | string;
}
export interface RegEntry { appid: number; name: string; source: string; added: number }
export type Registry = Record<string, RegEntry>;

export const desktopPlan = callable<[key: string], DesktopPlan>("desktop_plan");
export const desktopRun = callable<[key: string], { ok: boolean; error?: string }>("desktop_run");
export const desktopRegGet = callable<[], Registry>("desktop_reg_get");
export const desktopRegSet = callable<[key: string, entry: { appid: number; name: string; source: string } | null], Registry>("desktop_reg_set");

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

export type SteamState = "no" | "si" | "perdida";
/** Puro: «si» = tiene atajo nuestro que sigue en Steam; «perdida» = lo creamos pero ya no está (alguien lo quitó); «no» = nunca. */
export function steamState(key: string, reg: Registry, shortcuts: Array<{ appid: number }>): SteamState {
  const e = reg[key];
  if (!e) return "no";
  return shortcuts.some((s) => s.appid === e.appid) ? "si" : "perdida";
}

/** Puro: resumen de la fila («Flatpak · en Steam», «AppImage · pantalla completa»…). */
export function noteFor(a: Pick<DesktopApp, "source">, st: SteamState, fullscreen?: boolean): string {
  const p = [sourceLabel(a.source)];
  if (st === "si") p.push("en Steam");
  else if (st === "perdida") p.push("ya no está en Steam");
  if (fullscreen) p.push("pantalla completa");
  return p.join(" · ");
}

const shortcutsNow = (): AppEntry[] => { try { return readApps(window as never); } catch { return []; } };
const steamApps = () => (window as unknown as { SteamClient?: { Apps?: {
  AddShortcut?: (name: string, exe: string, dir: string, opts: string) => Promise<number>;
  SetShortcutName?: (appid: number, name: string) => void;
  SetShortcutIcon?: (appid: number, path: string) => void;
  RemoveShortcut?: (appid: number) => void;
  RunGame?: (g: string, o: string, l: number, s: number) => void;
} } }).SteamClient?.Apps;

export const currentShortcuts = (): Array<{ appid: number }> => shortcutsNow();

/** Abre la app: por Steam si ya es atajo nuestro (así lleva su mando y pantalla), si no directamente. */
export async function openDesktopApp(a: DesktopApp, reg: Registry): Promise<{ ok: boolean; error?: string }> {
  const e = reg[a.key];
  const sc = e ? shortcutsNow().find((s) => s.appid === e.appid) : undefined;
  crumb(`abrir app de escritorio: ${a.name}${sc ? " (por Steam)" : ""}`);
  if (sc && steamApps()?.RunGame) {
    try { steamApps()!.RunGame!(sc.gameid, "", -1, 100); return { ok: true }; } catch { /* sigue: se abre directo */ }
  }
  try { return await desktopRun(a.key); } catch (err) { return { ok: false, error: String(err).slice(0, 80) }; }
}

/** Crea el atajo de Steam de la app y lo anota en nuestro registro. */
export async function addDesktopToSteam(a: DesktopApp): Promise<{ ok: boolean; error?: string; fullscreen?: boolean }> {
  const s = steamApps();
  if (!s?.AddShortcut) return { ok: false, error: "Steam no permite crear atajos desde aquí" };
  let plan: DesktopPlan;
  try { plan = await desktopPlan(a.key); } catch (e) { return { ok: false, error: String(e).slice(0, 80) }; }
  if (!plan.ok || !plan.exe) return { ok: false, error: plan.error ?? "no se pudo preparar el lanzador" };
  let appid: number;
  try { appid = await s.AddShortcut(a.name, plan.exe, plan.dir ?? "", plan.args ?? ""); } catch (e) { return { ok: false, error: String(e).slice(0, 80) }; }
  try { s.SetShortcutName?.(appid, a.name); } catch { /* nombre por defecto */ }
  if (plan.icon_path) { try { s.SetShortcutIcon?.(appid, plan.icon_path); } catch { /* sin icono */ } }
  await desktopRegSet(a.key, { appid, name: a.name, source: a.source }).catch(() => null);
  crumb(`app de escritorio añadida a Steam: ${a.name}`);
  return { ok: true, fullscreen: !!plan.fullscreen };
}

/** Quita SOLO el atajo que creamos nosotros (el que está en el registro). */
export async function removeDesktopFromSteam(key: string, reg: Registry): Promise<boolean> {
  const e = reg[key];
  if (!e) return false;
  try { steamApps()?.RemoveShortcut?.(e.appid); } catch { /* ya no estaba */ }
  await desktopRegSet(key, null).catch(() => null);
  return true;
}
