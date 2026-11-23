// Organización de «Apps del equipo» (puro, sin interfaz): Abiertas · Favoritas · Recientes · grupos plegables. Cada app sale una sola vez.
import type { DesktopApp } from "./qamDesktop";

export interface DeskSections {
  open: DesktopApp[];
  favs: DesktopApp[];
  recent: DesktopApp[];
  groups: Array<{ group: string; apps: DesktopApp[]; collapsed: boolean }>;
}

export const RECENT_MAX = 5;
/** Un grupo con más apps que esto arranca plegado (hasta que se despliega a mano). */
export const FOLD_OVER = 5;

/** Lista de claves abiertas hace poco: la última delante, sin repetir, con tope. */
export function pushRecent(list: string[], key: string, max = RECENT_MAX + 3): string[] {
  return [key, ...list.filter((k) => k !== key)].slice(0, max);
}

const nm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const byName = (a: DesktopApp, b: DesktopApp) => nm(a.name).localeCompare(nm(b.name));
const GROUP_ORDER = ["Navegadores", "Multimedia", "Juegos y emuladores", "Herramientas", "Oficina", "Desarrollo"];
const rank = (g: string): number => (g === "Otras" ? 999 : GROUP_ORDER.includes(g) ? GROUP_ORDER.indexOf(g) : 100);

/** `folds`: lo que el usuario plegó (true) o desplegó (false) a mano; lo no tocado se decide por tamaño. */
export function buildSections(apps: DesktopApp[], running: string[], favKeys: string[], recentKeys: string[], folds: Record<string, boolean>): DeskSections {
  const used = new Set<string>();
  const take = (pred: (a: DesktopApp) => boolean, sort?: (a: DesktopApp, b: DesktopApp) => number): DesktopApp[] => {
    const out = apps.filter((a) => !used.has(a.key) && pred(a));
    if (sort) out.sort(sort);
    out.forEach((a) => used.add(a.key));
    return out;
  };
  const open = take((a) => running.includes(a.key), byName);
  const favs = take((a) => favKeys.includes(a.key), byName);
  const recent = recentKeys.length ? take((a) => recentKeys.includes(a.key), (a, b) => recentKeys.indexOf(a.key) - recentKeys.indexOf(b.key)).slice(0, RECENT_MAX) : [];
  // las recientes que sobran por el tope vuelven a su grupo
  const back = new Set(recent.map((a) => a.key));
  const rest = apps.filter((a) => !open.includes(a) && !favs.includes(a) && !back.has(a.key));
  const m = new Map<string, DesktopApp[]>();
  for (const a of rest) { const g = a.group || "Otras"; m.set(g, [...(m.get(g) ?? []), a]); }
  const groups = [...m.entries()].map(([group, list]) => ({
    group, apps: list.sort(byName), collapsed: group in folds ? folds[group] : list.length > FOLD_OVER,
  })).sort((a, b) => rank(a.group) - rank(b.group) || a.group.localeCompare(b.group));
  return { open, favs, recent, groups };
}
