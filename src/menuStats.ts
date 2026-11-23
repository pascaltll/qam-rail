// Lo que aprende el panel de tu uso: cuánto tarda en cambiar de sección y en abrirse, por potencia aplicada y por
// situación (sin juego / con juego). Con eso sugiere desde cuántos vatios va fluido EN TU CONSOLA, en vez del número
// fijo medido una vez. Se guarda resumido (contadores por vatio) y se acumula entre sesiones.
const LS = "qam-rail:menu-stats";
export type Group = "escritorio" | "juego";
export interface Bucket { n: number; sum: number; slow: number }
type Stats = Record<string, Bucket>; // "grupo|kind|W"

export const SLOW_MS = 80;     // un cambio de sección más lento que esto ya se nota
export const FLUID_MS = 60;    // media por debajo de esto = fluido
export const MIN_SAMPLES = 5;

const read = (): Stats => { try { return JSON.parse(window.localStorage?.getItem(LS) ?? "{}") ?? {}; } catch { return {}; } };
let mem: Stats | null = null;
let dirty = 0;
const stats = () => (mem ??= read());
function save(): void {
  if (++dirty < 5) return; // no escribir en cada cambio de sección
  dirty = 0;
  try { window.localStorage?.setItem(LS, JSON.stringify(stats())); } catch { /* nada */ }
}
export const groupOf = (sit: string | null | undefined): Group => (sit && sit.startsWith("juego") ? "juego" : "escritorio");

/** Anota una medida (la llama el registro de rendimiento con cada cambio de sección y apertura). */
export function noteMenuSample(kind: "switch" | "open", ms: number, w: number | null | undefined, sit: string | null | undefined): void {
  if (typeof w !== "number" || !Number.isFinite(w) || !Number.isFinite(ms) || ms <= 0 || ms > 5000) return;
  const k = `${groupOf(sit)}|${kind}|${Math.round(w)}`;
  const b = stats()[k] ?? { n: 0, sum: 0, slow: 0 };
  // Media móvil: a partir de 200 muestras pesa más lo reciente (Steam y el plugin cambian).
  if (b.n >= 200) { b.sum = (b.sum / b.n) * 150; b.slow = Math.round((b.slow / b.n) * 150); b.n = 150; }
  b.n++; b.sum += ms; if (ms > SLOW_MS) b.slow++;
  stats()[k] = b;
  save();
}

export interface Learned { fluidW: number; samples: number; table: Array<{ w: number; n: number; avg: number; slowPct: number }> }

/** Puro (probado): desde qué vatio el cambio de sección es fluido (y lo sigue siendo por encima). */
export function learnFrom(s: Stats, g: Group): Learned | null {
  const table = Object.entries(s)
    .filter(([k]) => k.startsWith(`${g}|switch|`))
    .map(([k, b]) => ({ w: Number(k.split("|")[2]), n: b.n, avg: Math.round(b.sum / b.n), slowPct: Math.round((b.slow / b.n) * 100) }))
    .filter((r) => r.n >= MIN_SAMPLES)
    .sort((a, b) => a.w - b.w);
  if (table.length < 2) return null;
  // El menor vatio a partir del cual TODOS los medidos van fluidos.
  let fluidW: number | null = null;
  for (let i = table.length - 1; i >= 0; i--) { if (table[i].avg <= FLUID_MS) fluidW = table[i].w; else break; }
  if (fluidW === null) return null;
  // Si no hay medidas lentas por debajo, no se sabe dónde empieza a ir lento: no se aprende aún.
  if (!table.some((r) => r.w < fluidW! && r.avg > FLUID_MS)) return null;
  return { fluidW, samples: table.reduce((a, r) => a + r.n, 0), table };
}
export const learned = (g: Group) => learnFrom(stats(), g);
export const resetMenuStats = () => { mem = {}; try { window.localStorage?.removeItem(LS); } catch { /* nada */ } };
export const menuStatsRaw = () => ({ ...stats() });
