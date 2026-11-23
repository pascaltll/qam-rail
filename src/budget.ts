// Presupuesto de fluidez (plan de mejora, fase 3): lo que debe cumplir el panel, medido con el registro real.
// Con ≥ 9 W: abrir ≤ 120 ms y cambiar de sección ≤ 35 ms (medianas). Con menos: 300 y 120 ms. Saltos de pantalla
// nuestros: 0 (no cuentan los del teclado ni la leyenda de Steam). Puro: se prueba con eventos de ejemplo.
export interface BudgetEvent { t: number; k: string; ms?: number; w?: number | null; sec?: string; d?: string }
export interface BudgetLine { que: string; n: number; mediana: number | null; limite: number; ok: boolean }
export interface BudgetReport { ok: boolean; lineas: BudgetLine[]; saltos: number; saltosDonde: Array<{ donde: string; n: number }> }

export const LIMITS = { open: { fluid: 120, eco: 300 }, switch: { fluid: 35, eco: 120 } } as const;
const med = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
/** Saltos que no son nuestros: teclado en pantalla y leyenda inferior de Steam. */
const FOREIGN = /Backspace|QWERTY|AltGr|Shift|Loading Your Steam|^DIV «Menu|Sección anterior|^DIV «.»$/;

export function budget(events: BudgetEvent[], fluidW = 9): BudgetReport {
  const lineas: BudgetLine[] = [];
  for (const k of ["open", "switch"] as const) {
    for (const tier of ["fluid", "eco"] as const) {
      const xs = events.filter((e) => e.k === k && typeof e.ms === "number" && typeof e.w === "number" && (tier === "fluid" ? e.w >= fluidW : e.w < fluidW)).map((e) => e.ms as number);
      if (!xs.length) continue;
      const m = med(xs), lim = LIMITS[k][tier];
      lineas.push({ que: `${k === "open" ? "abrir" : "cambiar de sección"} · ${tier === "fluid" ? `≥ ${fluidW} W` : `< ${fluidW} W`}`, n: xs.length, mediana: m, limite: lim, ok: m !== null && m <= lim });
    }
  }
  const own = events.filter((e) => e.k === "shift" && !FOREIGN.test(e.d ?? ""));
  const where = new Map<string, number>();
  for (const e of own) { const key = `${e.sec ?? "?"}: ${(e.d ?? "").slice(0, 40)}`; where.set(key, (where.get(key) ?? 0) + 1); }
  const saltosDonde = [...where].map(([donde, n]) => ({ donde, n })).sort((a, b) => b.n - a.n).slice(0, 8);
  return { ok: lineas.every((l) => l.ok) && own.length === 0, lineas, saltos: own.length, saltosDonde };
}
