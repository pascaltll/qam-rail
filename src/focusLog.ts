// Registro de foco con el mando: qué hace la cruceta en el panel (de qué control a cuál, hacia dónde, cuándo no hay destino), los cambios de
// sección y los toques con el dedo. Una sesión por apertura del panel; se manda al backend al cerrar (y cada minuto si hay algo). Sirve para
// encontrar controles a los que el mando no llega (los que solo se usan con el dedo) y trampas de foco. Es barato: solo anota en memoria dentro
// de los manejadores que ya existen, sin sondeos ni observadores. NUNCA guarda lo que escribes ni nombres de amigos/apps (listas anonimizadas).
// Se apaga creando `foco-off` en la carpeta de ajustes (el backend descarta la sesión).
import { callable } from "@decky/api";

import { VERSION } from "./version";

const sendCall = callable<[ses: unknown], boolean>("focus_log");

/** Botón de la cruceta (códigos de GamepadButton) → dirección. */
export const DIR: Record<number, "U" | "D" | "L" | "R"> = { 9: "U", 10: "D", 11: "L", 12: "R" };
const LISTAS = new Set(["social", "apps"]); // secciones con nombres de amigos o de apps
const MAX_EV = 600;
const MAX_LABEL = 24;

export interface Ref { id: string; label: string }
interface Ev { k: "m" | "s" | "t"; t: number; s?: string; f?: string; fl?: string; d?: string; to?: string; tl?: string }

let buf: Ev[] = [];
let t0: number | null = null;

export const anon = (sec: string, label: string): string => (LISTAS.has(sec) ? "(lista)" : label);

/** Etiqueta corta + ruta en el DOM desde `root`: estable aunque cambie el scroll. */
export function ctrlRef(el: Element, root: Element, sec: string): Ref {
  const raw = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL) || "(sin texto)";
  const label = anon(sec, raw);
  const path: string[] = [];
  for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
    const p: Element | null = n.parentElement;
    if (!p) break;
    path.push(`${n.tagName.toLowerCase()}:${[...p.children].indexOf(n)}`);
  }
  return { id: `${LISTAS.has(sec) ? "(lista)" : raw}|${path.reverse().join(">")}`, label };
}

export function resetFocusLog(): void { buf = []; t0 = null; }
export const pending = (): number => buf.length;

export function focusBegin(now: number = Date.now()): void { buf = []; t0 = now; }

const rel = (now: number): number => Math.round(((now - (t0 ?? now)) / 1000) * 100) / 100;
function push(e: Ev): void { if (t0 !== null && buf.length < MAX_EV) buf.push(e); }

/** Un movimiento de la cruceta; `to` = null si no hubo destino. */
export function focusMove(sec: string, from: Ref, d: "U" | "D" | "L" | "R", to: Ref | null, now: number = Date.now()): void {
  push({ k: "m", t: rel(now), s: sec, f: from.id, fl: from.label, d, to: to?.id ?? "", tl: to?.label ?? "" });
}
export function focusSection(from: string, to: string, now: number = Date.now()): void {
  if (from !== to) push({ k: "s", t: rel(now), s: from, to });
}
export function focusTap(sec: string, c: Ref, now: number = Date.now()): void {
  push({ k: "t", t: rel(now), s: sec, f: c.id, fl: c.label });
}

/** Manda la sesión (si hay eventos) y vacía el buffer. Nunca lanza. */
export async function focusFlush(): Promise<void> {
  if (t0 === null || !buf.length) return;
  const ses = { v: VERSION, t0: Math.round(t0 / 1000), ev: buf };
  buf = [];
  try { await sendCall(ses); } catch { /* sin backend: se pierde esta sesión, nada más */ }
}
