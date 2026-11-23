// Eficiencia del panel a potencia baja (7–8 W, juegos simples/retro).
// Lo medido (zip 2026-11-06, Bomberman 64 a 7 W): el panel en reposo va a ~114 fps; lo lento es CADA CAMBIO
// (abrir 170–350 ms, primera visita a una seccion 150–400 ms): trabajo de CPU de Steam/React a relojes bajos.
// Congelar el juego NO ayuda: con el juego congelado el panel bajo a 58 fps (la GPU baja de reloj).
// Por eso aqui:
//  1. Aviso a Panel de Control de que el menu esta abierto (set_ui_active): su Auto‑TDP no reacciona a la bajada
//     de FPS del juego ni aprende mientras navegas.
//  2. Impulso opcional: mientras el panel esta abierto, la potencia sube a 9 W (desde 9 W todo va fluido) y al
//     cerrar vuelve a la tuya. Si la cambias tu con el panel abierto, se respeta tu cambio. Si Steam se cayera con
//     el impulso puesto, se devuelve al arrancar.
//  3. Modo ligero (≤ 8 W): sin transiciones ni animaciones y con lecturas de fondo mas espaciadas.
// Las secciones se preparan en los ratos libres (Qam.tsx), asi cambiar con LB/RB no espera.
import { callPanel, rpc } from "./panelBridge";
import { crumb } from "./crumbs";
import { lowPower } from "./tdpControl";
import { tiers } from "./powerTiers";

export const BOOST_W = 9;
export const LOW_W = 8;
const LS_OPT = "qam-rail:menu-boost";
const LS_PENDING = "qam-rail:menu-boost-pending";

interface Pending { scope: "global" | "game"; appid: string | null; from: number; to: number; at: number }

const ls = {
  get: (k: string) => { try { return window.localStorage?.getItem(k) ?? null; } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v === null) window.localStorage?.removeItem(k); else window.localStorage?.setItem(k, v); } catch { /* nada */ } },
};

// Activado por defecto (0.34): al abrir el panel en modo ahorro sube a «fluido» y al cerrarlo vuelve.
export const boostEnabled = () => ls.get(LS_OPT) !== "off";
export const setBoostEnabled = (on: boolean) => ls.set(LS_OPT, on ? "on" : "off");
const pending = (): Pending | null => { try { return JSON.parse(ls.get(LS_PENDING) ?? "null") as Pending | null; } catch { return null; } };
export const boostActive = (): Pending | null => pending();

type Raw = { watts?: number; applied_w?: number; appid?: string | number | null; follows_global?: boolean; global_watts?: number; auto_config?: { enabled?: boolean } };

/** Puro (probado): si toca impulsar y como. */
export function boostPlan(raw: Raw, enabled: boolean, low = LOW_W, to = BOOST_W): Pending | null {
  if (!enabled || raw.auto_config?.enabled) return null;
  const applied = Number(raw.applied_w ?? raw.watts);
  if (!Number.isFinite(applied) || applied > low) return null;
  const appid = raw.appid === null || raw.appid === undefined ? null : String(raw.appid);
  const scope: "global" | "game" = appid && raw.follows_global === false ? "game" : "global";
  const from = Number(scope === "global" ? raw.global_watts ?? raw.watts : raw.watts);
  if (!Number.isFinite(from) || from >= to) return null;
  return { scope, appid, from, to, at: Date.now() };
}

let open = false;

export async function menuOpened(): Promise<void> {
  open = true;
  void callPanel("set_ui_active", ["enabled"], [true]).catch(() => null);
  if (!boostEnabled() || pending()) return;
  try {
    const raw = (await rpc.state()) as unknown as Raw;
    if (!open) return;
    const t = tiers();
    const plan = boostPlan(raw, true, t.ecoW, t.fluidW);
    if (!plan) return;
    ls.set(LS_PENDING, JSON.stringify(plan));
    crumb(`impulso del menú: ${plan.from} → ${plan.to} W`);
    await rpc.setWatts(plan.to, plan.scope, plan.scope === "game" ? plan.appid : null, plan.appid);
  } catch { /* sin impulso */ }
}

/** Devuelve la potencia de antes si sigue puesta la del impulso (si la cambiaste tu, se respeta). */
export async function restoreBoost(): Promise<void> {
  const p = pending();
  if (!p) return;
  ls.set(LS_PENDING, null);
  try {
    const raw = (await rpc.state()) as unknown as Raw;
    const now = Number(p.scope === "global" ? raw.global_watts ?? raw.watts : raw.watts);
    if (Math.round(now) !== p.to) return;
    crumb(`impulso del menú: vuelve a ${p.from} W`);
    await rpc.setWatts(p.from, p.scope, p.scope === "game" ? p.appid : null, p.appid);
  } catch { /* Panel no responde: queda como esta */ }
}

export function menuClosed(): void {
  open = false;
  void callPanel("set_ui_active", ["enabled"], [false]).catch(() => null);
  void restoreBoost();
}

/** El usuario movio la potencia con el panel abierto: su valor manda, no se restaura. */
export function userChangedPower(): void { if (pending()) ls.set(LS_PENDING, null); }

/** Modo ligero: sin transiciones/animaciones dentro del panel (se aplica al abrir segun la potencia). */
export function liteCss(doc: Document | null | undefined): () => void {
  if (!doc || !lowPower()) return () => {};
  const st = doc.createElement("style");
  st.setAttribute("data-qrail-lite", "1");
  st.textContent = "[data-qrail-root] *, [data-qrail-root] *::before, [data-qrail-root] *::after { transition: none !important; animation: none !important; }";
  doc.head?.appendChild(st);
  return () => st.remove();
}
