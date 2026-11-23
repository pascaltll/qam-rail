// Registro de rendimiento del panel, siempre activo y barato: cada evento con su duracion y la potencia del momento.
// Se guarda cada 20 s (y al cerrar el panel) en ~/homebrew/settings/qam-rail/diag/perf-log.jsonl.
// Eventos: open (boton → primer fotograma), switch (cambio de seccion → pintado), column (abrir columna → pintado),
// longtask (tarea > 50 ms en la ventana del panel), close (motivo del cierre), input (foco en un campo de texto).
import { crumb } from "./crumbs";
import { featureOn } from "./calm";
import { noteMenuSample } from "./menuStats";
import { situationKey } from "./situation";
import { callable } from "@decky/api";

import { currentWatts } from "./tdpControl";

export interface PerfEvent { t: number; k: string; ms?: number; w?: number | null; set?: number | null; sec?: string; d?: string; s?: string; own?: number; lay?: number }

const append = callable<[lines: PerfEvent[]], string>("perf_append");
let buf: PerfEvent[] = [];
const recent: PerfEvent[] = [];
const MAX_RECENT = 600;

export function record(k: string, data: Omit<PerfEvent, "t" | "k" | "w" | "set"> = {}): PerfEvent {
  const w = currentWatts();
  let sit: string | undefined;
  try { sit = situationKey(); } catch { sit = undefined; }
  const e: PerfEvent = { t: Date.now(), k, w: w.applied ?? w.set, set: w.set, s: sit, ...data };
  if (k !== "boot" && !featureOn("registro")) return e; // aislado: no se anota
  if ((k === "switch" || k === "open") && typeof (e as { ms?: unknown }).ms === "number") noteMenuSample(k, (e as { ms: number }).ms, e.w as number | null, sit);
  buf.push(e);
  recent.push(e);
  if (recent.length > MAX_RECENT) recent.splice(0, recent.length - MAX_RECENT);
  if (buf.length > 400) buf.splice(0, buf.length - 400);
  return e;
}

export async function flush(): Promise<string | null> {
  if (!buf.length) return null;
  const lines = buf;
  buf = [];
  try { return await append(lines); } catch { buf = lines.concat(buf).slice(-400); return null; }
}

let flushTimer: number | null = null;
export function startPerfLog(): () => void {
  if (flushTimer === null) flushTimer = window.setInterval(() => void flush(), 20000);
  return () => { if (flushTimer !== null) window.clearInterval(flushTimer); flushTimer = null; void flush(); };
}

/** Espera al siguiente fotograma pintado (dos rAF: el primero se ejecuta antes de pintar). */
export function nextPaint(win: Window = window): Promise<void> {
  return new Promise((ok) => {
    let done = false;
    const finish = () => { if (!done) { done = true; ok(); } };
    try { win.requestAnimationFrame(() => win.requestAnimationFrame(finish)); } catch { finish(); }
    window.setTimeout(finish, 1000); // ventana oculta: rAF no corre
  });
}

/** Mide desde `t0` (performance.now) hasta el siguiente pintado y lo registra. */
export async function measurePaint(k: string, t0: number, win: Window, data: Omit<PerfEvent, "t" | "k" | "w" | "set" | "ms"> = {}): Promise<number> {
  await nextPaint(win);
  const ms = Math.round(performance.now() - t0);
  record(k, { ...data, ms });
  return ms;
}

// ---- Apertura y cierre del panel (los marca pilot.tsx) ----
let openAt: number | null = null;
let openNote: string | undefined;
let closeReason: { why: string; at: number } | null = null;
let inputAt = 0;
export const markOpenStart = (note?: string) => { openAt = performance.now(); openNote = note; closeReason = null; crumb(`abrir panel${note ? ` (${note})` : ""}`); };
export function markOpenPainted(win: Window): void {
  const t0 = openAt;
  openAt = null;
  if (t0 !== null) void measurePaint("open", t0, win, openNote ? { d: openNote } : {});
}
/** Motivo del proximo cierre (boton, B, navegar, QAM nativo…). Si el panel se cierra sin motivo, lo cerro Steam. */
export const markCloseReason = (why: string) => { closeReason = { why, at: performance.now() }; crumb(`cerrar panel: ${why}`); };
export const noteInputFocus = () => { inputAt = performance.now(); record("input"); };
export function markClosed(sec?: string): void {
  const now = performance.now();
  const why = closeReason && now - closeReason.at < 1500 ? closeReason.why : "steam (sin motivo propio)";
  const sinceInput = inputAt ? Math.round(now - inputAt) : null;
  record("close", { sec, d: sinceInput !== null && sinceInput < 5000 ? `${why} · ${sinceInput} ms tras tocar un campo de texto` : why });
  closeReason = null;
  void flush();
}

// ---- Tareas largas en la ventana del panel ----
// Con «long-animation-frame» (Chrome 123+, el CEF de Steam es 126) cada fotograma lento dice QUE script lo causo:
// own = ms de codigo de QAM Rail; d = los 2 scripts mas caros (plugin o archivo de Steam); lay = estilo/maquetacion.
// Asi se separa lo nuestro de lo de Steam (teclado, otras vistas) o de otros plugins. Si no existe, «longtask» clasico.
interface LoafScript { duration: number; sourceURL?: string; sourceFunctionName?: string; invoker?: string; forcedStyleAndLayoutDuration?: number }
interface Loaf { duration: number; blockingDuration?: number; startTime: number; renderStart?: number; styleAndLayoutStart?: number; scripts?: LoafScript[] }

const OWN = /\/plugins\/QAM(?:%20| )Rail\/|qam-rail/i;
/** Puro (probado): nombre corto de un script: plugin de Decky o archivo de Steam. */
export function scriptName(sc: LoafScript): string {
  const url = sc.sourceURL ?? "";
  const plug = /\/plugins\/([^/]+)\//.exec(url);
  const where = plug ? decodeURIComponent(plug[1]) : (url.split("?")[0].split("/").pop() || sc.invoker || "?");
  const fn = sc.sourceFunctionName ? `:${sc.sourceFunctionName}` : "";
  return `${where}${fn}`.slice(0, 60);
}
export function summarizeLoaf(f: Loaf): { ms: number; own: number; lay: number; d: string } {
  const scripts = (f.scripts ?? []).slice().sort((a, b) => b.duration - a.duration);
  const own = scripts.filter((x) => OWN.test(x.sourceURL ?? "") && !/Amigos/i.test(x.sourceURL ?? "")).reduce((n, x) => n + x.duration, 0);
  const forced = scripts.reduce((n, x) => n + (x.forcedStyleAndLayoutDuration ?? 0), 0);
  const render = f.renderStart ? Math.max(0, f.startTime + f.duration - f.renderStart) : 0;
  return { ms: Math.round(f.duration), own: Math.round(own), lay: Math.round(forced + render), d: scripts.slice(0, 2).map((x) => `${scriptName(x)} ${Math.round(x.duration)}`).join(" | ") };
}

export function observeLongTasks(win: Window, section: () => string): () => void {
  const offs: Array<() => void> = [];
  try {
    const PO = (win as unknown as { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver;
    if (!PO) return () => {};
    const types = (PO as unknown as { supportedEntryTypes?: string[] }).supportedEntryTypes ?? [];
    if (types.includes("long-animation-frame")) {
      const po = new PO((list) => {
        for (const e of list.getEntries() as unknown as Loaf[]) {
          if ((e.blockingDuration ?? e.duration) < 50 && e.duration < 80) continue;
          record("longtask", { ...summarizeLoaf(e), sec: section() });
        }
      });
      po.observe({ type: "long-animation-frame", buffered: false } as PerformanceObserverInit);
      offs.push(() => po.disconnect());
    } else {
      const po = new PO((list) => { for (const e of list.getEntries()) record("longtask", { ms: Math.round(e.duration), sec: section() }); });
      po.observe({ type: "longtask", buffered: false } as PerformanceObserverInit);
      offs.push(() => po.disconnect());
    }
    // Parpadeos: saltos de maquetacion visibles (contenido que aparece/cambia de tamaño y empuja lo demas).
    if (types.includes("layout-shift")) {
      const ls = new PO((list) => {
        for (const e of list.getEntries() as unknown as Array<{ value: number; sources?: Array<{ node?: Node | null }> }>) {
          if (e.value < 0.005) continue;
          const node = e.sources?.find((x) => x.node)?.node as HTMLElement | undefined;
          const what = node ? `${node.nodeName}${node.textContent ? ` «${node.textContent.trim().slice(0, 40)}»` : ""}` : "?";
          record("shift", { ms: Math.round(e.value * 1000), sec: section(), d: what });
        }
      });
      ls.observe({ type: "layout-shift", buffered: false } as PerformanceObserverInit);
      offs.push(() => ls.disconnect());
    }
  } catch { /* sin observadores */ }
  return () => offs.forEach((f) => f());
}

// ---- Resumen por potencia (para la vista de diagnostico) ----
export interface Bucket { w: string; opens: number[]; switches: number[]; columns: number[]; longtasks: number[]; closes: string[]; keys: number[]; own: number[]; shifts: number }
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
export const med = median;
export function summary(events: PerfEvent[] = recent): Bucket[] {
  const by = new Map<string, Bucket>();
  for (const e of events) {
    const w = `${typeof e.w === "number" ? `${Math.round(e.w)} W` : "? W"}${e.s && e.s !== "escritorio" ? ` · ${e.s}` : ""}`;
    const b = by.get(w) ?? { w, opens: [], switches: [], columns: [], longtasks: [], closes: [], keys: [], own: [], shifts: 0 };
    if (e.k === "open" && e.ms !== undefined) b.opens.push(e.ms);
    if (e.k === "switch" && e.ms !== undefined) b.switches.push(e.ms);
    if (e.k === "column" && e.ms !== undefined) b.columns.push(e.ms);
    if (e.k === "longtask" && e.ms !== undefined) { b.longtasks.push(e.ms); if (typeof e.own === "number") b.own.push(e.own); }
    if (e.k === "shift") b.shifts++;
    if (e.k === "close" && e.d) b.closes.push(e.d);
    if (e.k === "key" && e.ms !== undefined) b.keys.push(e.ms);
    by.set(w, b);
  }
  return [...by.values()].sort((a, b) => parseFloat(a.w) - parseFloat(b.w));
}
export const recentEvents = () => recent;
