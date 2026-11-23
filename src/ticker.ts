// Planificador único de sondeos (plan de mejora, fase 3).
// Antes había ~28 `setInterval` repartidos en 15 archivos: cada tarjeta despertaba al navegador por su cuenta y, al
// coincidir varias, salían fotogramas largos. Ahora hay UN temporizador:
//  - reparte: como mucho MAX_PER_TICK tareas por pulso; las demás, al siguiente (250 ms después);
//  - en ahorro (≤ vatios de ahorro) las tareas van a mitad de ritmo, salvo las `exact` (animaciones, chat abierto);
//  - sin tareas, no hay temporizador.
// Sin imports a propósito: quien sabe si hay ahorro lo inyecta con setTickerSlow.
export interface TickOpt { exact?: boolean; name?: string }
interface Job { fn: () => void; ms: number; next: number; exact: boolean; name: string; runs: number }

export const TICK_MS = 250;
export const MAX_PER_TICK = 3;
const jobs = new Set<Job>();
let timer: ReturnType<typeof setInterval> | null = null;
let slow: () => boolean = () => false;
let pulses = 0, deferred = 0;

export function setTickerSlow(f: () => boolean): void { slow = f; }

/** Un pulso (exportado para probarlo con reloj propio). */
export function pulse(now = Date.now()): number {
  pulses++;
  let isSlow = false;
  try { isSlow = slow(); } catch { /* sin dato: ritmo normal */ }
  const due = [...jobs].filter((j) => now >= j.next).sort((a, b) => a.next - b.next);
  let ran = 0;
  for (const j of due) {
    if (!j.exact && ran >= MAX_PER_TICK) { deferred++; continue; }
    j.next = now + j.ms * (isSlow && !j.exact ? 2 : 1);
    j.runs++;
    if (!j.exact) ran++;
    try { j.fn(); } catch { /* cada tarea a lo suyo */ }
  }
  return due.length;
}

/** Como setInterval(fn, ms), pero dentro del planificador. Devuelve la función que lo cancela. */
export function tickEvery(fn: () => void, ms: number, opt: TickOpt = {}): () => void {
  const j: Job = { fn, ms: Math.max(TICK_MS, ms), next: Date.now() + Math.max(TICK_MS, ms), exact: !!opt.exact, name: opt.name ?? "", runs: 0 };
  jobs.add(j);
  if (timer === null) timer = setInterval(() => pulse(), TICK_MS);
  return () => {
    jobs.delete(j);
    if (!jobs.size && timer !== null) { clearInterval(timer); timer = null; }
  };
}

/** Para el diagnóstico: cuántas tareas hay y cuánto se ha repartido. */
export function tickerStats(): { tareas: number; pulsos: number; aplazadas: number; activo: boolean; lista: Array<{ name: string; ms: number; runs: number }> } {
  return { tareas: jobs.size, pulsos: pulses, aplazadas: deferred, activo: timer !== null, lista: [...jobs].map((j) => ({ name: j.name, ms: j.ms, runs: j.runs })) };
}
export function resetTickerForTest(): void { jobs.clear(); if (timer !== null) clearInterval(timer); timer = null; pulses = 0; deferred = 0; slow = () => false; }
