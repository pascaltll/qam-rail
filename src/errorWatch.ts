import { qamEvent } from "./qamDesktop";

// Vigilante de errores de la interfaz (dev.101): cualquier error de JavaScript o promesa rechazada en la ventana de Steam o del panel
// queda en la línea de tiempo del backend como `ui.js.error` / `ui.js.rechazo` (mensaje corto, archivo y línea; nunca datos del usuario).
// Máximo 12 por minuto para no inundar el registro si algo falla en bucle.
const seen = new WeakSet<object>();
let stamps: number[] = [];

const short = (v: unknown, n = 120): string => String(v ?? "").replace(/\s+/g, " ").slice(0, n);
const base = (f: unknown): string => short(f, 200).split("?")[0].split("/").pop() ?? "";

function allowed(): boolean {
  const now = Date.now();
  stamps = stamps.filter((t) => now - t < 60_000);
  if (stamps.length >= 12) return false;
  stamps.push(now);
  return true;
}

/** Engancha una ventana una sola vez. */
export function watchErrors(win: Window | null | undefined): void {
  if (!win || seen.has(win)) return;
  seen.add(win);
  try {
    win.addEventListener("error", (e: ErrorEvent) => {
      if (!allowed()) return;
      qamEvent("js.error", { msg: short(e.message), archivo: base(e.filename), linea: e.lineno ?? 0 }).catch(() => undefined);
    });
    win.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
      if (!allowed()) return;
      const r = e.reason as { message?: unknown } | string | undefined;
      qamEvent("js.rechazo", { msg: short(typeof r === "object" && r ? r.message ?? r : r) }).catch(() => undefined);
    });
  } catch { /* ventana sin addEventListener: nada que vigilar */ }
}
