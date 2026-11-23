// Modo eficiencia de los temas: algunos temas (p. ej. los de Hooandee) traen una opcion de «eficiencia» que quita
// efectos caros. Con potencia baja se activa sola en los temas ACTIVOS que la tengan, y al subir se devuelve el valor
// que tenia. Solo se tocan opciones que cambiamos nosotros (se recuerdan en localStorage).
// [H] El nombre exacto de la opcion en cada tema no esta verificado: se busca por nombre (ver ECO_NAME) y la prueba
// «Tema» guarda las opciones de cada tema para comprobarlo.
import { tickEvery } from "./ticker";
import { cssLoaderThemes, setCssPatch, type CssPatch, type CssTheme } from "./appearance";
import { rpc } from "./panelBridge";
import { currentWatts, onPowerChange } from "./tdpControl";
import { onTiersChange, tiers } from "./powerTiers";
import { afterCalm, featureOn, inCalm } from "./calm";

export const ECO_NAME = /efici|efficien|ahorro|low.?power|bajo consumo|rendimiento|performance|sin animaci|no animation|reduce.?(motion|effects)|lite mode|modo ligero/i;
const ON = /^(yes|s[ií]|on|true|activad[oa]|enabled|1)$/i;
const OFF = /^(no|off|false|desactivad[oa]|disabled|0|none|ninguno)$/i;

export interface EcoPatch { theme: string; patch: string; on: string; off: string; value: string }

/** Puro (probado): la opcion de eficiencia de un tema y sus valores «activado»/«desactivado». */
export function ecoPatchOf(t: CssTheme): EcoPatch | null {
  const p: CssPatch | undefined = t.patches.find((x) => ECO_NAME.test(x.name) && x.options.length >= 2);
  if (!p) return null;
  const on = p.options.find((o) => ON.test(o.trim())) ?? (p.options.length === 2 ? p.options[1] : null);
  const off = p.options.find((o) => OFF.test(o.trim())) ?? (p.options.length === 2 ? p.options[0] : null);
  if (!on || !off || on === off) return null;
  return { theme: t.name, patch: p.name, on, off, value: p.value };
}

export type EcoMode = "auto" | "off";
/** Limite de ahorro actual (el mismo que el modo ligero del panel: powerTiers). */
export const ecoThresholdW = () => tiers().ecoW;
const LS_MODE = "qam-rail:theme-eco";
const LS_PREV = "qam-rail:theme-eco-prev";
const ls = {
  get: (k: string) => { try { return window.localStorage?.getItem(k) ?? null; } catch { return null; } },
  set: (k: string, v: string) => { try { window.localStorage?.setItem(k, v); } catch { /* nada */ } },
};
export const ecoMode = (): EcoMode => (ls.get(LS_MODE) === "off" ? "off" : "auto");
const prevMap = (): Record<string, string> => { try { return JSON.parse(ls.get(LS_PREV) ?? "{}") as Record<string, string>; } catch { return {}; } };

/** Puro (probado): que cambios hacer. want = potencia baja y modo auto. prev = valores que habia antes de cambiarlos. */
export function ecoPlan(patches: EcoPatch[], want: boolean, prev: Record<string, string>): Array<{ p: EcoPatch; value: string; remember?: string; forget?: boolean }> {
  const out: Array<{ p: EcoPatch; value: string; remember?: string; forget?: boolean }> = [];
  for (const p of patches) {
    const key = `${p.theme}::${p.patch}`;
    if (want && p.value !== p.on) out.push({ p, value: p.on, remember: p.value });
    else if (!want && key in prev) out.push({ p, value: prev[key], forget: true });
  }
  return out;
}

let themes: CssTheme[] | null = null;
let themesAt = 0;
let busy = false;
let last: { active: boolean; changed: string[] } = { active: false, changed: [] };
export const ecoStatus = () => last;

export async function ecoPatches(force = false): Promise<EcoPatch[]> {
  if (force || !themes || Date.now() - themesAt > 5 * 60_000) { themes = (await cssLoaderThemes()) ?? []; themesAt = Date.now(); }
  return themes.filter((t) => t.enabled).map(ecoPatchOf).filter((x): x is EcoPatch => !!x);
}

/** Aplica o devuelve segun la potencia. `watts` = aplicada (si no se pasa, la ultima conocida). */
export async function syncThemeEco(watts?: number | null): Promise<void> {
  if (busy) return;
  // Con un juego arrancando o cerrandose no se toca CSS Loader (reinyecta estilos en todas las ventanas): se aplaza.
  if (inCalm()) { afterCalm(() => { void syncThemeEco(); }, "temaEco"); return; }
  busy = true;
  try {
    const w = watts ?? currentWatts().applied ?? currentWatts().set;
    const want = featureOn("temaEco") && ecoMode() === "auto" && typeof w === "number" && w <= ecoThresholdW();
    const prev = prevMap();
    if (!want && !Object.keys(prev).length) { last = { active: false, changed: [] }; return; }
    const patches = await ecoPatches();
    const plan = ecoPlan(patches, want, prev);
    for (const step of plan) {
      const key = `${step.p.theme}::${step.p.patch}`;
      if (!(await setCssPatch(step.p.theme, step.p.patch, step.value))) continue;
      if (step.remember !== undefined && !(key in prev)) prev[key] = step.remember;
      if (step.forget) delete prev[key];
    }
    ls.set(LS_PREV, JSON.stringify(prev));
    if (plan.length) themes = null; // releer valores
    last = { active: want, changed: Object.keys(prev) };
  } finally { busy = false; }
}

export function setEcoMode(m: EcoMode): void { ls.set(LS_MODE, m); void syncThemeEco(); }

/** Vigila la potencia: al instante con el panel abierto y cada 30 s en segundo plano (Auto-TDP la cambia solo). */
export function startThemeEcoWatch(): () => void {
  const off = onPowerChange(() => { void syncThemeEco(); });
  const offT = onTiersChange(() => { void syncThemeEco(); });
  const id = tickEvery(() => {
    if (ecoMode() === "off" && !Object.keys(prevMap()).length) return;
    void rpc.state().then((st) => { const o = st as unknown as { applied_w?: number; watts?: number }; return syncThemeEco(Number(o.applied_w ?? o.watts)); }, () => null);
  }, 30_000);
  return () => { off(); offT(); id(); };
}
