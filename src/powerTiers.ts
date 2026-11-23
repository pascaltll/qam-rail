// Niveles de potencia del menu: UNA sola regla para todo el plugin (antes habia tres umbrales sueltos: modo ligero
// ≤ 8 W, eficiencia de temas ≤ 9 W, impulso a 9 W).
//  - Ahorro (≤ ecoW): el panel se aligera (sin animaciones ni desenfoque, lecturas de fondo espaciadas, reproductor
//    sin repintar cada segundo) y se activa el modo eficiencia de los temas que lo traen.
//  - Fluido (≥ fluidW): todo normal.
// Lo medido (0.29, Luminous Atlas, juego exigente): a 7 W cambiar de seccion 170–240 ms; desde 9 W, 20–35 ms.
// Lo que encarece el escritorio sube el umbral sugerido: tema Cristal (desenfoque) y pantalla externa/4K.
// [H] Los +1 W del Cristal y +2 W de 4K son estimaciones: la prueba de fluidez en esa situacion lo confirma.
// Sin imports a proposito: tdpControl, themeEco y menuEfficiency dependen de este modulo.

export interface TierCtx { glass: boolean; tv: boolean; game?: boolean; learnedFluidW?: number | null; learnedSamples?: number }
export interface Tiers { ecoW: number; fluidW: number; auto: boolean; suggested: { ecoW: number; fluidW: number }; why: string[] }

export const BASE_FLUID_W = 9;
export const MIN_ECO_W = 5, MAX_ECO_W = 14;
const LS = "qam-rail:tiers";

/** Puro (probado): umbrales sugeridos segun lo que pide el escritorio. */
export function suggestTiers(ctx: TierCtx): { ecoW: number; fluidW: number; why: string[] } {
  // Lo aprendido de tu uso en esta situación manda (acotado a ±3 W del valor medido de fábrica).
  if (typeof ctx.learnedFluidW === "number") {
    const f = Math.max(BASE_FLUID_W - 3, Math.min(BASE_FLUID_W + 3, ctx.learnedFluidW));
    return { ecoW: f - 1, fluidW: f, why: ["aprendido", `${ctx.game ? "con juego" : "sin juego"}: fluido desde ${f} W (${ctx.learnedSamples ?? 0} cambios medidos)`] };
  }
  let fluid = BASE_FLUID_W;
  const why = ["medido: desde 9 W el panel cambia en ~30 ms; a 7 W, en 170–240 ms"];
  if (ctx.glass) { fluid += 1; why.push("tema Cristal: el desenfoque pide +1 W"); }
  if (ctx.tv) { fluid += 2; why.push("pantalla externa/4K: +2 W"); }
  return { ecoW: fluid - 1, fluidW: fluid, why };
}

/** Puro (probado): nivel de una potencia. */
export function tierOf(w: number | null | undefined, t: { ecoW: number; fluidW: number }): "ahorro" | "normal" | "fluido" | null {
  if (typeof w !== "number" || !Number.isFinite(w)) return null;
  return w <= t.ecoW ? "ahorro" : w >= t.fluidW ? "fluido" : "normal";
}

let provider: () => TierCtx = () => ({ glass: false, tv: false });
export function setTierContext(f: () => TierCtx): void { provider = f; cache = null; }

const read = (): string | null => { try { return window.localStorage?.getItem(LS) ?? null; } catch { return null; } };
/** «auto» o el limite de ahorro elegido a mano (en W). */
export function tierChoice(): "auto" | number {
  const v = Number(read());
  return Number.isFinite(v) && v >= MIN_ECO_W && v <= MAX_ECO_W ? Math.round(v) : "auto";
}
export function setTierChoice(c: "auto" | number): void {
  try { if (c === "auto") window.localStorage?.removeItem(LS); else window.localStorage?.setItem(LS, String(c)); } catch { /* nada */ }
  cache = null;
  subs.forEach((f) => f());
}

// lowPower() se consulta al pintar: se recalcula como mucho cada 2 s.
let cache: { at: number; t: Tiers } | null = null;
export function tiers(): Tiers {
  if (cache && Date.now() - cache.at < 2000) return cache.t;
  let ctx: TierCtx;
  try { ctx = provider(); } catch { ctx = { glass: false, tv: false }; }
  const s = suggestTiers(ctx);
  const c = tierChoice();
  const t: Tiers = c === "auto"
    ? { ecoW: s.ecoW, fluidW: s.fluidW, auto: true, suggested: { ecoW: s.ecoW, fluidW: s.fluidW }, why: s.why }
    : { ecoW: c, fluidW: c + 1, auto: false, suggested: { ecoW: s.ecoW, fluidW: s.fluidW }, why: s.why };
  cache = { at: Date.now(), t };
  return t;
}

const subs = new Set<() => void>();
export const onTiersChange = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const resetTiersForTest = () => { cache = null; provider = () => ({ glass: false, tv: false }); };
