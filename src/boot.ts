// Arranque de Steam: mientras Steam carga (inicio de la consola, paso de Escritorio a modo juego, reinicio de
// Steam) el plugin no debe competir con el. Hasta que Steam esta «listo» y han pasado unos segundos de calma:
//  - el boton QAM abre el QAM de Steam (no el nuestro),
//  - no arrancan los vigilantes de fondo (perfiles de pantalla, musica, eficiencia de temas).
// Listo = usuario conectado (friendStore con SteamID), ajustes de cliente y ventana principal de Big Picture.
type Any = Record<string, unknown>;

export interface BootInfo { loadedAt: number; readyAt: number | null; settledAt: number | null; checks: number; waitedFor: string[] }

// Margen tras «listo»: 6 s (con 12 s el QAM de Steam salia hasta ~35 s tras encender).
const SETTLE_MS = 6_000;
const info: BootInfo = { loadedAt: Date.now(), readyAt: null, settledAt: null, checks: 0, waitedFor: [] };
const waiters: Array<() => void> = [];
let timer: number | null = null;

/** Puro (probado): que falta para dar Steam por listo. */
export function missingForReady(w: Any): string[] {
  const miss: string[] = [];
  const fs = w.friendStore as Any | undefined;
  const sid = fs?.currentUserSteamID as { GetAccountID?: () => number } | undefined;
  let id = 0;
  try { id = sid?.GetAccountID?.() ?? 0; } catch { id = 0; }
  if (!id) miss.push("usuario");
  if (typeof (w.settingsStore as Any | undefined)?.GetClientSetting !== "function") miss.push("ajustes");
  const ui = w.SteamUIStore as Any | undefined;
  let win: unknown = null;
  try { win = (ui?.GetFocusedWindowInstance as (() => unknown) | undefined)?.call(ui) ?? null; } catch { win = null; }
  if (!win) miss.push("ventana");
  const doc = (w.document as Document | undefined);
  if (doc && doc.readyState !== "complete") miss.push("documento");
  return miss;
}

export const bootInfo = (): BootInfo => ({ ...info, waitedFor: [...info.waitedFor] });
/** Steam listo (usuario conectado, ventana): el boton QAM ya abre el panel, sin esperar el margen. */
export const bootReady = (): boolean => info.readyAt !== null;
/** Listo y asentado: ya se puede trabajar en segundo plano. */
export const bootSettled = (): boolean => info.settledAt !== null;

/** Ejecuta `fn` cuando Steam este listo y asentado (inmediato si ya lo esta). Devuelve como cancelarlo. */
export function whenSettled(fn: () => void): () => void {
  if (bootSettled()) { fn(); return () => {}; }
  let on = true;
  waiters.push(() => { if (on) fn(); });
  start();
  return () => { on = false; };
}

function start(): void {
  if (timer !== null || bootSettled()) return;
  const tick = () => {
    info.checks++;
    const miss = missingForReady(window as unknown as Any);
    for (const m of miss) if (!info.waitedFor.includes(m)) info.waitedFor.push(m);
    if (!miss.length && info.readyAt === null) info.readyAt = Date.now();
    if (info.readyAt !== null && Date.now() - info.readyAt >= SETTLE_MS) {
      info.settledAt = Date.now();
      timer = null;
      waiters.splice(0).forEach((f) => { try { f(); } catch { /* cada vigilante a lo suyo */ } });
      return;
    }
    // Comprobacion barata y espaciada: 1,5 s mientras carga.
    timer = window.setTimeout(tick, 1500);
  };
  timer = window.setTimeout(tick, 500);
}

/** Pruebas. */
export function resetBootForTest(settled: boolean): void {
  info.readyAt = settled ? Date.now() : null;
  info.settledAt = settled ? Date.now() : null;
  if (timer !== null) { window.clearTimeout(timer); timer = null; }
}

start();
