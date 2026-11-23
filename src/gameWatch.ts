// Salir de un juego: Carlos nota Big Picture muy lento los primeros instantes. Aqui se mide que pasa en esos
// segundos para saber por que: fluidez de la ventana de Big Picture, fotogramas lentos y quien los causa, potencia
// aplicada (Panel vuelve a la de Steam) y que procesos ocupan la CPU (top desde el backend). Se guarda en el
// informe como «salida@<situación>» (las 5 ultimas). No cambia nada: solo mira.
import { tickEvery } from "./ticker";
import { callable } from "@decky/api";

import { CALM_EXIT_MS, CALM_LAUNCH_MS, featureOn, startCalm } from "./calm";
import { crumb } from "./crumbs";
import { saveSection } from "./diagStore";
import { runningGame, runningGameSticky } from "./game";
import { rpc } from "./panelBridge";
import { summarizeLoaf } from "./perfLog";
import { situation } from "./situation";

const postGameSample = callable<[seconds: number], { carga_inicio: string[]; carga_fin: string[]; cpu: string; procesos: Array<{ cpu: string; proceso: string }> }>("post_game_sample");

type Any = Record<string, unknown>;

/** Ventana de Big Picture (donde se dibuja el menu), para medir sus fotogramas aunque el panel este cerrado. */
function bigPictureWindow(): Window | null {
  const w = window as unknown as Any;
  const modal = (w.__qamRailModalEl as HTMLElement | null | undefined)?.ownerDocument?.defaultView;
  if (modal) return modal;
  try {
    const ui = w.SteamUIStore as Any | undefined;
    const inst = (ui?.GetFocusedWindowInstance as (() => Any) | undefined)?.call(ui);
    const bw = inst?.BrowserWindow as Window | undefined;
    return bw ?? null;
  } catch { return null; }
}

/** Puro (probado): resumen de intervalos entre fotogramas. */
export function frameSummary(iv: number[]): { fps: number | null; lentos: number; peorMs: number } {
  if (!iv.length) return { fps: null, lentos: 0, peorMs: 0 };
  const total = iv.reduce((a, b) => a + b, 0);
  return { fps: Math.round((iv.length * 1000) / total), lentos: iv.filter((x) => x > 50).length, peorMs: Math.round(Math.max(...iv)) };
}

async function measureAfterExit(name: string): Promise<void> {
  const t0 = Date.now();
  const win = bigPictureWindow();
  const iv: number[] = [];
  const frames: Array<ReturnType<typeof summarizeLoaf>> = [];
  let stop = false;
  let po: PerformanceObserver | null = null;
  if (win) {
    let last = win.performance.now();
    const step = () => { if (stop) return; const n = win.performance.now(); iv.push(n - last); last = n; win.requestAnimationFrame(step); };
    win.requestAnimationFrame(step);
    try {
      const PO = (win as unknown as { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver;
      if (PO && (PO as unknown as { supportedEntryTypes?: string[] }).supportedEntryTypes?.includes("long-animation-frame")) {
        po = new PO((l) => { for (const e of l.getEntries()) if (e.duration >= 50) frames.push(summarizeLoaf(e as never)); });
        po.observe({ type: "long-animation-frame", buffered: false } as PerformanceObserverInit);
      }
    } catch { po = null; }
  }
  const pw0 = await rpc.state().catch(() => null) as Any | null;
  const cpu = await postGameSample(10).catch((e) => ({ error: String(e) }));
  const pw1 = await rpc.state().catch(() => null) as Any | null;
  stop = true;
  po?.disconnect();
  const fs = frameSummary(iv.slice(1));
  const watts = (x: Any | null) => (x ? { aplicada: x.applied_w ?? x.watts, sigueSteam: x.follows_global, global: x.global_watts, juego: x.appid ?? null } : null);
  const data = {
    juego: name, segundos: Math.round((Date.now() - t0) / 1000), ventanaBigPicture: !!win,
    fotogramas: fs, fotogramasLentos: frames.sort((a, b) => b.ms - a.ms).slice(0, 12),
    potenciaAlSalir: watts(pw0), potenciaDespues: watts(pw1), cpu,
  };
  crumb(`salida de ${name}: ${fs.fps ?? "?"} fps, ${fs.lentos} lentos, ${(pw0 as Any | null)?.applied_w ?? "?"} W`);
  await saveSection(`salida@${situation(null, 0).key}`, data, { fps: fs.fps, lentos: fs.lentos, peorMs: fs.peorMs, w: (pw0 as Any | null)?.applied_w ?? null });
}

// ---- Arranque y salida de un juego ----
// Zip 2026-11-07: dos caidas de TODA la sesion (gamescope/Xwayland, y Steam con ella) con Metro 2033 Redux: una al
// arrancarlo (19:31) y otra 3 s despues de cerrarlo (20:32, «Fatal IO error ... on X server :0»). En esos momentos el
// plugin entra en «calma» (calm.ts): el boton QAM abre el de Steam y se aplaza lo de fondo.
export const LAUNCH_GUARD_MS = CALM_LAUNCH_MS;
let seenKey: string | null = null;

/** Puro (probado): si estamos en la ventana de arranque de un juego. */
export function inLaunchWindow(now: number, startedAt: number, guardMs = LAUNCH_GUARD_MS): boolean {
  return startedAt > 0 && now - startedAt >= 0 && now - startedAt < guardMs;
}

/** Anota el juego en marcha; si es nuevo (y no es la primera lectura), empieza la calma de arranque. */
export function noteRunningGame(initial = false): void {
  const k = runningGame()?.key ?? null;
  if (k && k !== seenKey && !initial) startCalm("arranque de juego", CALM_LAUNCH_MS);
  seenKey = k;
}

/** Steam avisa al pulsar «Jugar» (antes de que el juego exista): la calma empieza ahi. */
function listenLaunches(): () => void {
  try {
    const apps = (window as unknown as { SteamClient?: { Apps?: { RegisterForGameActionStart?: (cb: (id: number, appid: string, action: string) => void) => { unregister?: () => void } } } }).SteamClient?.Apps;
    const h = apps?.RegisterForGameActionStart?.((_id, appid, action) => {
      if (!/launch/i.test(String(action))) return;
      crumb(`lanzando juego ${appid}`);
      startCalm("arranque de juego", CALM_LAUNCH_MS);
    });
    return () => h?.unregister?.();
  } catch { return () => {}; }
}

/** Vigila entrada/salida de juegos (cada 2 s, solo lee). */
export function startGameWatch(): () => void {
  let last: { key: string; name: string } | null = null;
  let busy = false;
  const offLaunch = listenLaunches();
  noteRunningGame(true); // si al cargar el plugin ya habia un juego, no es un arranque
  const id = tickEvery(() => {
    noteRunningGame();
    const g = runningGame();
    void runningGameSticky(); // deja anotado el juego visto (para abrir el panel en el modo correcto)
    const now = g ? { key: g.key, name: g.name } : null;
    if (last && !now && !busy) {
      const name = last.name;
      crumb(`salir del juego: ${name}`);
      startCalm("salida de juego", CALM_EXIT_MS);
      if (featureOn("salida")) {
        busy = true;
        void measureAfterExit(name).finally(() => { busy = false; });
      }
    } else if (!last && now) crumb(`entrar al juego: ${now.name}`);
    last = now;
  }, 2000);
  return () => { id(); offLaunch(); };
}
