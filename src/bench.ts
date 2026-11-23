import { callable } from "@decky/api";

import { readTdp, writeTdp } from "./panelBridge";

// Prueba de rendimiento por nivel de potencia. El TDP lo cambia Panel de Control (via panelBridge) y la carga/medidas las hace
// el backend (py_modules/qam_bench.py). Solo CPU: no mide GPU ni FPS de juegos.
interface RawLevel {
  error?: string;
  score?: number;
  power_w?: number | null;
  cpu_mhz?: number | null;
  gpu_mhz?: number | null;
  temp_max_c?: number | null;
}
const benchLevel = callable<[seconds: number], RawLevel>("bench_level");
const benchSave = callable<[data: unknown], string>("bench_save");

export interface BenchRow {
  watts: number;
  score: number | null;
  powerW: number | null;
  cpuMhz: number | null;
  gpuMhz: number | null;
  tempC: number | null;
  error?: string;
}

export type BenchPhase = "idle" | "running" | "done" | "cancelled" | "error";
export interface BenchState {
  phase: BenchPhase;
  index: number;
  total: number;
  rows: BenchRow[];
  message: string;
  saved?: string;
}

/** `count` niveles enteros repartidos entre min y max (ambos incluidos, sin repetir). */
export function pickLevels(min: number, max: number, count = 5): number[] {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi <= lo) return [lo];
  const n = Math.max(2, count);
  const out = new Set<number>();
  for (let i = 0; i < n; i++) out.add(Math.round(lo + ((hi - lo) * i) / (n - 1)));
  return [...out];
}

export interface BenchSummary extends BenchRow {
  /** Rendimiento relativo al mejor nivel (0-100). */
  pct: number | null;
  /** Puntos por vatio: usa el consumo medido si hay, y si no el TDP pedido. */
  perWatt: number | null;
}

export function summarize(rows: readonly BenchRow[]): BenchSummary[] {
  const best = Math.max(0, ...rows.map((r) => r.score ?? 0));
  return rows.map((r) => ({
    ...r,
    pct: r.score !== null && best > 0 ? Math.round((r.score / best) * 100) : null,
    perWatt: r.score !== null ? Math.round(r.score / (r.powerW && r.powerW > 0 ? r.powerW : r.watts)) : null,
  }));
}

let state: BenchState = { phase: "idle", index: 0, total: 0, rows: [], message: "" };
let cancelled = false;
const subs = new Set<() => void>();
const set = (s: Partial<BenchState>) => { state = { ...state, ...s }; subs.forEach((f) => f()); };

export const benchState = (): BenchState => state;
export const benchSubscribe = (f: () => void): (() => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const cancelBench = (): void => { cancelled = true; };

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export async function runBench(levels: number[], seconds: number, log: (m: string) => void): Promise<void> {
  if (state.phase === "running") return;
  cancelled = false;
  set({ phase: "running", index: 0, total: levels.length, rows: [], message: "Leyendo potencia actual…", saved: undefined });
  let original: number | null = null;
  const rows: BenchRow[] = [];
  try {
    original = (await readTdp())?.watts ?? null;
    for (let i = 0; i < levels.length && !cancelled; i++) {
      const w = levels[i];
      set({ index: i + 1, message: `Ajustando ${w} W…` });
      const ok = await writeTdp(w);
      if (!ok) { rows.push({ watts: w, score: null, powerW: null, cpuMhz: null, gpuMhz: null, tempC: null, error: "Panel de Control rechazó el cambio" }); set({ rows: [...rows] }); continue; }
      await sleep(3000); // deja que el limite se asiente
      if (cancelled) break;
      set({ message: `Midiendo a ${w} W (${seconds} s)…` });
      const r = await benchLevel(seconds);
      rows.push({
        watts: w,
        score: r.error ? null : r.score ?? null,
        powerW: r.power_w ?? null,
        cpuMhz: r.cpu_mhz ?? null,
        gpuMhz: r.gpu_mhz ?? null,
        tempC: r.temp_max_c ?? null,
        error: r.error,
      });
      set({ rows: [...rows] });
    }
    set({ phase: cancelled ? "cancelled" : "done", message: cancelled ? "Cancelada" : "Terminada" });
  } catch (e) {
    log(`prueba: ${String(e)}`);
    set({ phase: "error", message: String(e) });
  } finally {
    if (original !== null) { try { await writeTdp(original); } catch (e) { log(`prueba: no se pudo restaurar ${original} W: ${String(e)}`); } }
    if (rows.length) {
      try { set({ saved: await benchSave({ at: new Date().toISOString(), seconds, original, rows }) }); } catch { /* guardar es opcional */ }
    }
  }
}
