// Pequeña animación al pulsar (como en Panel de Control): la ficha se hunde un poco y rebota, el icono «salta» y un
// halo del color de acento se abre y desaparece. Solo CSS (transform y box-shadow: los dibuja la GPU, sin relayout).
// No se anima en modo ahorro (liteCss lo anula) ni si la animación está apagada en Apariencia.
import { currentPalette } from "./appearance";

export type FxStyle = "rebote" | "suave" | "no";
const LS = "qam-rail:fx";
export const fxStyle = (): FxStyle => { try { const v = window.localStorage?.getItem(LS); return v === "suave" || v === "no" ? v : "rebote"; } catch { return "rebote"; } };
export const setFxStyle = (v: FxStyle) => { try { window.localStorage?.setItem(LS, v); } catch { /* nada */ } };

const CSS = `
/* Botones del panel: el color lo decide el panel aunque Steam tenga sus estilos de foco/pulsado (antes un botón
   activado podía quedar negro). */
.qr-chip { background: var(--qr-bg) !important; color: var(--qr-fg) !important; box-shadow: var(--qr-sh, none); }
.qr-chip.gpfocus, .qr-chip:focus, .qr-chip:hover, .qr-chip:active { background: var(--qr-bg) !important; color: var(--qr-fg) !important; }

/* Toque: respuesta inmediata al apoyar el dedo (antes solo se animaba al soltar), sin retardo de doble toque ni resaltado del sistema. */
[data-qr="item"], .qr-chip { -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none; -webkit-user-select: none; transition: transform 90ms ease-out, filter 90ms ease-out; }
[data-qr="item"]:active, .qr-chip:active { transform: scale(0.97); filter: brightness(1.14); }

@keyframes qrPressBounce { 0% { transform: scale(1); } 30% { transform: scale(0.9); } 65% { transform: scale(1.04); } 100% { transform: scale(1); } }
@keyframes qrPressSoft { 0% { transform: scale(1); } 40% { transform: scale(0.96); } 100% { transform: scale(1); } }
@keyframes qrIconPop { 0% { transform: scale(1) rotate(0); } 40% { transform: scale(1.22) rotate(-8deg); } 100% { transform: scale(1) rotate(0); } }
@keyframes qrHalo { 0% { box-shadow: 0 0 0 0 var(--qr-fx, rgba(26,159,255,0.45)); } 100% { box-shadow: 0 0 0 12px rgba(0,0,0,0); } }
.qr-press-rebote { animation: qrPressBounce 320ms cubic-bezier(.34,1.56,.64,1), qrHalo 420ms ease-out; }
.qr-press-suave { animation: qrPressSoft 220ms ease-out, qrHalo 360ms ease-out; }
.qr-press-rebote svg { animation: qrIconPop 340ms cubic-bezier(.34,1.56,.64,1); transform-origin: center; }
`;
const injected = new WeakSet<Document>();
export function ensureCss(doc: Document): void {
  if (injected.has(doc)) return;
  const st = doc.createElement("style");
  st.setAttribute("data-qrail-fx", "1");
  st.textContent = CSS;
  doc.head?.appendChild(st);
  injected.add(doc);
}

const isEl = (x: unknown): x is HTMLElement => !!x && typeof x === "object" && (x as Node).nodeType === 1;

/** Anima lo pulsado. `ev` es el evento de A o del toque (si no trae elemento, se usa el enfocado). */
export function pressFx(ev?: unknown): void {
  const style = fxStyle();
  if (style === "no") return;
  try {
    const e = ev as { currentTarget?: unknown; target?: unknown } | undefined;
    let el: HTMLElement | null = isEl(e?.currentTarget) ? e!.currentTarget as HTMLElement : isEl(e?.target) ? e!.target as HTMLElement : null;
    if (!el) {
      const doc = ((window as unknown as { __qamRailModalEl?: HTMLElement }).__qamRailModalEl?.ownerDocument) ?? document;
      el = isEl(doc.activeElement) ? doc.activeElement as HTMLElement : null;
    }
    el = (el?.closest?.('[data-qr="item"],button,[data-qr-press]') as HTMLElement | null) ?? el;
    if (!el || !el.ownerDocument) return;
    ensureCss(el.ownerDocument);
    const cls = `qr-press-${style}`;
    el.style.setProperty("--qr-fx", hexA(currentPalette().accent, 0.45));
    el.classList.remove("qr-press-rebote", "qr-press-suave");
    void el.offsetWidth; // reinicia la animación si se pulsa seguido
    el.classList.add(cls);
    window.setTimeout(() => el!.classList.remove(cls), 450);
  } catch { /* la animación nunca debe romper la pulsación */ }
}

function hexA(c: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return `rgba(26,159,255,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
