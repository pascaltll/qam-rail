import { DENSITY, currentPalette, uiPrefs } from "./appearance";
import { useTap } from "./tap";
import { ensureCss, pressFx } from "./fx";
import { DialogButton, Focusable } from "@decky/ui";
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type FC, type PointerEvent as RPointerEvent, type ReactNode } from "react";

// Piezas visuales del QAM propio (modelo C): tarjetas redondeadas, acento, controles con mando.
// Colores vivos: siguen la apariencia elegida (por defecto, el tema de Panel de Control). Se leen al pintar.
export const COLORS = {
  get panel() { return currentPalette().panel; },
  get card() { return currentPalette().card; },
  get track() { return currentPalette().track; },
  get text() { return currentPalette().text; },
  get muted() { return currentPalette().muted; },
  get accent() { return currentPalette().accent; },
  get onAccent() { return currentPalette().onAccent; },
  get focus() { return currentPalette().focus; },
  // Estados: iguales en todos los temas (verde = bien, ámbar = aviso, rojo = error; «Soft» = el mismo color sobre fondo oscuro, para texto).
  danger: "#e5484d", ok: "#3fbf6f", warn: "#e8b04b", dangerSoft: "#ff9a9a", okSoft: "#7be0a0", info: "#57cbde", blue: "#3b82f6",
};

/** Escala de radios: pequeño (chips, campos), mediano (fichas, filas) y grande (tarjetas, paneles). */
export const RADIUS = { sm: 8, md: 12, lg: 16 } as const;

// Con fuentes de emoji al final: los emojis de los mensajes se ven en color en vez de cuadros.
export const FONT = '"Motiva Sans", "Noto Sans", Arial, Helvetica, sans-serif, "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", "Twemoji Mozilla"';
const DIR_LEFT = 11;
const DIR_RIGHT = 12;

type DirEvt = { detail?: { button?: number }; stopPropagation?: () => void; preventDefault?: () => void };
let bodyDir: ((e: DirEvt) => void) | null = null;
/** El panel registra aquí su manejador de la cruceta (modelo de filas). */
export const setBodyDir = (f: ((e: DirEvt) => void) | null): void => { bodyDir = f; };
/** Steam solo mete en su árbol de navegación (y da tabindex) a un Focusable con manejador de activación. Los controles de valor
 *  (deslizadores, barra de TDP) no lo tenían: el mando no podía enfocarlos y la navegación de Steam los saltaba. Activar (A) no hace nada. */
export const noActivate = (): void => { /* A no cambia el valor: Izquierda/Derecha sí */ };

/** Controles que usan Izquierda/Derecha para su valor (data-qr-h): Arriba/Abajo siguen yendo al modelo de filas del panel.
 *  Sin confirmar con el mando real: con teclas por CDP estos controles no dejaban salir con Arriba/Abajo. Devuelve true si lo reenvió. */
export const passVertical = (e: DirEvt): boolean => {
  const b = e.detail?.button;
  if ((b !== 9 && b !== 10) || !bodyDir) return false;
  bodyDir(e);
  e.stopPropagation?.(); // si además burbujeara, el panel no lo procesa dos veces
  return true;
};

export const Icon: FC<{ d: string; size?: number; color?: string }> = ({ d, size = 20, color = COLORS.text }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export const ICONS = {
  bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2",
  volume: "M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6",
  bluetooth: "M7 7l10 10-5 4V3l5 4L7 17",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  close: "M6 6l12 12M18 6L6 18",
};

export const cardStyle: CSSProperties = {
  get background() { return currentPalette().card; },
  get borderRadius() { return currentPalette().cardRadius; },
  // Con el aspecto de Panel las tarjetas llevan su borde fino.
  get boxShadow() { const pl = currentPalette(), o = pl.outline; return o ? `inset 0 0 0 ${pl.stroke !== undefined ? Math.max(1, Math.round(pl.stroke)) : 1}px ${o}` : undefined; },
  get padding() { return DENSITY[uiPrefs().density].pad; },
  display: "flex",
  flexDirection: "column",
  get gap() { return DENSITY[uiPrefs().density].gap; },
  boxSizing: "border-box",
};
/** Profundidad de tarjetas anidadas (0 = en la sección). Una tarjeta dentro de otra lleva esquinas CONCÉNTRICAS (radio de fuera menos el
 *  margen), no el mismo radio: con «Redondas» (28) una barra dentro de una tarjeta se veía como un segundo marco igual de redondo. */
export const CardDepth = createContext(0);
export const nestedRadius = (outer: number, sm?: number): number => sm !== undefined ? Math.max(8, Math.min(sm, outer - 6)) : Math.max(10, outer - 12);
export const labelCase = (): "none" | "uppercase" | "capitalize" | "lowercase" => currentPalette().labelTransform ?? "uppercase";
export function useCardStyle(): CSSProperties {
  const depth = useContext(CardDepth);
  return depth > 0 ? { ...cardStyle, borderRadius: nestedRadius(currentPalette().cardRadius, currentPalette().radiusSm) } : { ...cardStyle };
}
/** Separación entre tarjetas de una sección (según la densidad elegida en Apariencia). */
export const paneGap = () => DENSITY[uiPrefs().density].pane;

export const focusRing = (on: boolean): CSSProperties => ({
  outline: on ? `2px solid ${COLORS.focus}` : "2px solid transparent",
  outlineOffset: 2,
});

/**
 * Arrastre tactil sobre una pista: el valor sigue al dedo (captura del puntero, sin saltos si el dedo sale de la pista).
 * Solo avisa cuando el valor redondeado cambia, para no inundar Steam/Panel de llamadas.
 */
export function useDrag(min: number, max: number, step: number, onChange: (v: number) => void) {
  const st = useRef<{ on: boolean; last: number | null }>({ on: false, last: null });
  const cb = useRef(onChange);
  cb.current = onChange;
  const apply = (el: HTMLElement, x: number) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (x - r.left) / r.width));
    const v = Math.min(max, Math.max(min, Math.round((min + ratio * (max - min)) / step) * step));
    if (v !== st.current.last) { st.current.last = v; cb.current(v); }
  };
  return {
    onPointerDown: (e: RPointerEvent<HTMLElement>) => {
      st.current = { on: true, last: null };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sin captura: sigue con move */ }
      e.stopPropagation();
      apply(e.currentTarget, e.clientX);
    },
    onPointerMove: (e: RPointerEvent<HTMLElement>) => { if (st.current.on) apply(e.currentTarget, e.clientX); },
    onPointerUp: (e: RPointerEvent<HTMLElement>) => { st.current.on = false; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* nada */ } },
    onPointerCancel: () => { st.current.on = false; },
    style: { touchAction: "none" } as CSSProperties,
  };
}

/** Deslizador propio: izquierda/derecha del mando cambian el valor en `step`; con el dedo se arrastra sobre la pista. */
export const XSlider: FC<{
  label: string;
  icon: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  accent?: boolean;
  big?: boolean;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}> = ({ label, icon, value, min, max, step, suffix, accent, big, format, onChange }) => {
  const [focused, setFocused] = useState(false);
  const pct = Math.min(100, Math.max(0, ((value - min) / Math.max(1e-9, max - min)) * 100));
  const nudge = (dir: number) => onChange(Math.min(max, Math.max(min, Math.round((value + dir * step) / step) * step)));
  const drag = useDrag(min, max, step, onChange);
  const base = useCardStyle();
  return (
    <Focusable
      data-qr="item"
      data-qr-h="1"
      style={{ ...base, ...focusRing(focused) }}
      noFocusRing
      onActivate={noActivate}
      onGamepadFocus={() => setFocused(true)}
      onGamepadBlur={() => setFocused(false)}
      onGamepadDirection={(e: DirEvt) => {
        const b = e.detail?.button;
        if (b === DIR_LEFT) nudge(-1);
        else if (b === DIR_RIGHT) nudge(1);
        else passVertical(e);
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon d={icon} size={18} color={COLORS.muted} />
        <span style={{ flexGrow: 1, fontSize: 13, color: COLORS.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        <span style={{ fontSize: big ? 22 : 13, fontWeight: 700 }}>{format ? format(value) : `${Math.round(value)}${suffix}`}</span>
      </div>
      {/* Zona de toque alta (28 px) con la pista fina centrada: facil de agarrar con el dedo. */}
      <div {...drag} style={{ ...drag.style, position: "relative", height: 28, margin: "-9px 0 -9px" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 10, height: big ? 10 : 8, borderRadius: 5, background: COLORS.track }} />
        <div style={{ position: "absolute", left: 0, top: 10, height: big ? 10 : 8, width: `${pct}%`, borderRadius: 5, background: accent ? COLORS.accent : COLORS.text }} />
        <div style={{ position: "absolute", left: `${pct}%`, top: 5, width: 18, height: 18, marginLeft: -9, borderRadius: "50%", background: "#fff", pointerEvents: "none" }} />
      </div>
    </Focusable>
  );
};

/** Texto de un control de altura fija. Regla única: una línea con «…» (y `title` con el texto entero) o, si se pide, hasta 2 líneas centradas. */
export const Label: FC<{ children: ReactNode; lines?: 1 | 2 }> = ({ children, lines = 1 }) => (
  <span title={typeof children === "string" ? children : undefined}
    style={lines === 2
      ? { textAlign: "center", lineHeight: 1.15, maxWidth: "100%", minWidth: 0, overflow: "hidden" }
      : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", minWidth: 0 }}>{children}</span>
);

/** Ficha redonda: perfil de potencia, Bluetooth, etc. */
export const Chip: FC<{ children: ReactNode; active?: boolean; onClick: () => void; icon?: string; grow?: boolean; compact?: boolean; stack?: boolean; badge?: number; autoFocus?: boolean }> = ({
  children, active, onClick, icon, grow = true, compact, stack, badge, autoFocus,
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <DialogButton
      data-qr="item"
      className="qr-chip"
      {...(autoFocus ? ({ autoFocus: true } as object) : {})}
      ref={(el: HTMLElement | null) => { if (el?.ownerDocument) ensureCss(el.ownerDocument); }}
      onClick={(e: unknown) => { pressFx(e); onClick(); }}
      onGamepadFocus={() => setFocused(true)}
      onGamepadBlur={() => setFocused(false)}
      style={{
        flex: grow ? 1 : undefined,
        minWidth: 0,
        height: stack ? 52 : 40, // compact = 40 px como la normal (zona táctil; antes 32). Solo cambia el relleno.
        padding: stack ? "4px 2px" : compact ? "0 4px" : "0 8px",
        borderRadius: stack ? 16 : compact ? 16 : 20,
        fontSize: stack ? 11 : 12,
        fontFamily: FONT,
        display: "flex",
        flexDirection: stack ? "column" : "row",
        position: "relative",
        alignItems: "center",
        justifyContent: "center",
        gap: stack ? 2 : 6,
        // Inactiva: color de pista. Activa: color de acento, texto en negrita y un marco claro, para que se note
        // aunque el acento del tema sea oscuro. Va por variables + clase con !important (ver fx.ts).
        ["--qr-bg" as string]: active ? COLORS.accent : COLORS.track,
        ["--qr-fg" as string]: active ? COLORS.onAccent : COLORS.text,
        ["--qr-sh" as string]: active ? `inset 0 0 0 1.5px ${COLORS.onAccent}55, 0 0 0 1.5px ${COLORS.accent}` : "none",
        background: active ? COLORS.accent : COLORS.track,
        color: active ? COLORS.onAccent : COLORS.text,
        fontWeight: active ? 800 : 600,
        ...focusRing(focused),
      }}
    >
      {icon && <Icon d={icon} size={stack ? 20 : 16} color={active ? COLORS.onAccent : COLORS.text} />}
      <Label>{children}</Label>
      {!!badge && <span style={{ position: "absolute", top: 3, right: 6, minWidth: 16, height: 16, padding: "0 4px", boxSizing: "border-box", borderRadius: 8, background: "#e5484d", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{badge > 99 ? "99+" : badge}</span>}
    </DialogButton>
  );
};

export const Row: FC<{ children: ReactNode; gap?: number }> = ({ children, gap = 8 }) => (
  <Focusable style={{ display: "flex", gap }} flow-children="row">{children}</Focusable>
);

/** Icono de app: su imagen si la hay; si no, la inicial sobre un color propio del nombre. */
export const AppGlyph: FC<{ name: string; src?: string | null; size?: number }> = ({ name, src, size = 32 }) => (
  <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
    background: src ? "rgba(255,255,255,0.08)" : colorFor(name), backgroundImage: src ? undefined : "linear-gradient(160deg, rgba(255,255,255,0.16), rgba(0,0,0,0.12))",
    color: "#fff", fontSize: Math.round(size * 0.44), fontWeight: 800, boxShadow: "0 1px 4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.16)" }}>
    {src ? <img src={src} alt="" decoding="async" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : name.slice(0, 1).toUpperCase()}
  </div>
);

const PALETTE = ["#e5484d", "#12a594", "#3b82f6", "#d9902f", "#8b5cf6", "#4a5160"];
export const colorFor = (name: string): string => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

export const useThrottled = (fn: (v: number) => void, ms: number) => {
  const last = useRef(0);
  const pending = useRef<number | null>(null);
  return (v: number) => {
    const now = Date.now();
    if (pending.current !== null) window.clearTimeout(pending.current);
    if (now - last.current >= ms) {
      last.current = now;
      fn(v);
    } else {
      pending.current = window.setTimeout(() => { last.current = Date.now(); fn(v); }, ms);
    }
  };
};

/**
 * Quita el "marco" de la ventana modal de Steam (fondo, borde, sombra, transformaciones) en todos los
 * ancestros del panel, para que solo se vea nuestra tarjeta. Es un ajuste en vivo, sin tocar el codigo de Steam:
 * al cerrar el modal desaparece el DOM entero.
 */
export function stripModalChrome(el: HTMLElement | null): void {
  let n: HTMLElement | null = el?.parentElement ?? null;
  const doc = el?.ownerDocument;
  for (let i = 0; n && doc && n !== doc.body && i < 14; i++, n = n.parentElement) {
    const st = n.style;
    st.setProperty("background", "transparent", "important");
    st.setProperty("background-color", "transparent", "important");
    st.setProperty("border", "none", "important");
    st.setProperty("box-shadow", "none", "important");
    st.setProperty("backdrop-filter", "none", "important");
    st.setProperty("filter", "none", "important");
    st.setProperty("transform", "none", "important");
    st.setProperty("contain", "none", "important");
    st.setProperty("overflow", "visible", "important");
  }
}

/**
 * Pega el elemento al borde derecho/superior medido en la pagina. Se corrige con una segunda medida por si la pagina
 * escala las coordenadas (zoom de Steam): lo que importa es lo que realmente se mueve, no lo que pedimos.
 */
export function dockRight(el: HTMLElement | null, top = 44, right = 10): void {
  if (!el) return;
  const run = () => {
    stripModalChrome(el);
    const doc = el.ownerDocument;
    const view = doc.defaultView ?? window;
    const body = doc.body.getBoundingClientRect();
    const html = doc.documentElement.getBoundingClientRect();
    const edge = Math.max(view.innerWidth, body.right, html.right);
    el.style.transform = "none";
    const r0 = el.getBoundingClientRect();
    const dx1 = edge - right - r0.right;
    const dy1 = top - r0.top;
    el.style.transform = `translate(${Math.round(dx1)}px, ${Math.round(dy1)}px)`;
    const r1 = el.getBoundingClientRect();
    const kx = Math.abs(dx1) > 4 ? (r1.right - r0.right) / dx1 : 1;
    const ky = Math.abs(dy1) > 4 ? (r1.top - r0.top) / dy1 : 1;
    const dx2 = dx1 + (edge - right - r1.right) / (kx > 0.2 ? kx : 1);
    const dy2 = dy1 + (top - r1.top) / (ky > 0.2 ? ky : 1);
    el.style.transform = `translate(${Math.round(dx2)}px, ${Math.round(dy2)}px)`;
    const r2 = el.getBoundingClientRect();
    (window as unknown as Record<string, unknown>).__qamRailDock = {
      iw: view.innerWidth, ih: view.innerHeight, body: [body.left, body.top, body.width, body.height].map(Math.round), edge: Math.round(edge),
      r0: [r0.left, r0.top, r0.right].map(Math.round), r1: [r1.left, r1.top, r1.right].map(Math.round), r2: [r2.left, r2.top, r2.right].map(Math.round),
      dx: [Math.round(dx1), Math.round(dx2)], k: [kx, ky],
    };
  };
  run();
  try {
    const RO = (window as unknown as { ResizeObserver?: new (cb: () => void) => { observe(e: Element): void } }).ResizeObserver;
    if (RO) { const ro = new RO(run); ro.observe(el); if (el.parentElement) ro.observe(el.parentElement); }
  } catch { /* sin ResizeObserver: quedan los temporizadores */ }
  [60, 200, 600, 1500].forEach((ms) => window.setTimeout(run, ms));
}

export const ICONS2 = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  wifi: "M2 9a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M12 20h.01",
  chart: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  play: "M8 5l11 7-11 7z",
  refresh: "M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4",
  terminal: "M4 6l6 6-6 6M12 19h8",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  sliders: "M4 8h10M18 8h2M4 16h2M10 16h10M14 6v4M6 14v4",
  music: "M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 11a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
  moon: "M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z",
  plane: "M2 12l20-8-8 20-3-8z",
  users: "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3 3-5 6-5s6 2 6 5M14 15c3 0 8 1 8 5",
  // Reproductor
  prev: "M6 5v14M19 5l-10 7 10 7z",
  next: "M18 5v14M5 5l10 7-10 7z",
  pause: "M8 5v14M16 5v14",
  shuffle: "M16 4h4v4M4 20L20 4M20 16v4h-4M14 14l6 6M4 4l5 5",
  repeat: "M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4",
  repeatOne: "M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4M11 10l1.5-1v6",
  library: "M4 4v16M9 4v16M14 4l5 15",
  stop: "M7 7h10v10H7z",
  speaker: "M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  headphones: "M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2zM20 15a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z",
  hdmi: "M3 5h18v11H3zM8 20h8M12 16v4",
  mic: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  plug: "M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  micOff: "M3 3l18 18M9 9v3a3 3 0 0 0 4.9 2.3M15 9.3V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.2 5.6M19 11a7 7 0 0 1-.6 2.8M12 18v3",
};

// Altos recordados (entre aperturas del panel) de bloques que tardan en leer sus datos.
const keptHeights = new Map<string, number>();
/**
 * Mientras `loading`, reserva el alto que tuvo la ultima vez: asi lo de debajo no salta cuando llegan los datos
 * (los «saltos de pantalla» medidos en Energia e Inicio). Sin datos previos no reserva nada.
 */
export const Keep: FC<{ id: string; loading: boolean; children: ReactNode }> = ({ id, loading, children }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || loading) return undefined;
    const save = () => { const h = el.getBoundingClientRect().height; if (h > 0) keptHeights.set(id, h); };
    save();
    const RO = (el.ownerDocument.defaultView as unknown as { ResizeObserver?: typeof ResizeObserver } | null)?.ResizeObserver;
    if (!RO) return undefined;
    const ro = new RO(save);
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, loading]);
  const h = loading ? keptHeights.get(id) : undefined;
  return <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: 10, ...(h ? { minHeight: h } : {}) }}>{children}</div>;
};

/**
 * Abrir en dos tiempos: lo de dentro se monta DESPUÉS del primer fotograma del panel (así abrir pinta solo lo de
 * arriba), y mientras tanto y mientras llegan sus datos se reserva el alto de la vez anterior para que nada salte.
 */
export const Deferred: FC<{ id: string; children: ReactNode; settleMs?: number }> = ({ id, children, settleMs = 700 }) => {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    let t2 = 0;
    const t1 = window.setTimeout(() => { setStage(1); t2 = window.setTimeout(() => setStage(2), settleMs); }, 30);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [settleMs]);
  return <Keep id={id} loading={stage < 2}>{stage > 0 ? children : null}</Keep>;
};

/** Fila de interruptor: texto a la izquierda, interruptor a la derecha; la fila entera es un solo elemento (A o toque). */
export const ToggleRow: FC<{ label: string; note?: string; icon?: string; on: boolean; onToggle: () => void }> = ({ label, note, icon, on, onToggle }) => {
  const [f, setF] = useState(false);
  const tap = useTap(onToggle);
  return (
    <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      onOKActionDescription={on ? "Apagar" : "Encender"}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 12, background: f ? COLORS.track : "transparent", ...focusRing(f) }}>
      {icon && <Icon d={icon} size={18} color={on ? COLORS.accent : COLORS.muted} />}
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{label}</div>
        {note && <div style={{ fontSize: 11, color: COLORS.muted, lineHeight: 1.35 }}>{note}</div>}
      </div>
      <div role="switch" aria-checked={on} style={{ flexShrink: 0, width: 42, height: 24, borderRadius: 12, position: "relative", background: on ? COLORS.accent : COLORS.track, boxShadow: on ? "none" : `inset 0 0 0 1px ${COLORS.muted}` }}>
        <div style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: on ? COLORS.onAccent : COLORS.text }} />
      </div>
    </Focusable>
  );
};


/**
 * Barra de posiciones: elegir 1 de N en UNA sola parada del mando (0.47). Izquierda/derecha cambian (se aplica al
 * dejar de moverse, 350 ms); A pasa a la siguiente; con el dedo se toca la posición. Sustituye a las filas de fichas,
 * que eran una parada por opción (Rendimiento tenía ~35).
 */
export interface SegOpt { value: number | string; label: string; icon?: string }
export const Segments: FC<{ opts: SegOpt[]; value: number | string | null; onPick: (v: never) => void; perRow?: number; tall?: boolean; delay?: number }> = ({ opts, value, onPick, perRow, tall, delay = 350 }) => {
  const [focused, setFocused] = useState(false);
  const [pend, setPend] = useState<number | string | null>(null);
  const timer = useRef(0);
  const pick = onPick as (v: number | string) => void;
  // Lo elegido con el mando no se pierde: si sales (otra fila, otra sección) antes de los 350 ms, se aplica en ese momento.
  const live = useRef({ pend: null as number | string | null, value });
  live.current.value = value;
  const flush = () => {
    window.clearTimeout(timer.current);
    const p = live.current.pend;
    live.current.pend = null;
    if (p !== null && p !== live.current.value) pick(p);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => flush(), []);
  useEffect(() => { setPend(null); live.current.pend = null; }, [value]);
  const shown = pend ?? value;
  const move = (d: number) => {
    if (!opts.length) return;
    const i = opts.findIndex((o) => o.value === shown);
    const n = i < 0 ? (d > 0 ? 0 : opts.length - 1) : Math.min(opts.length - 1, Math.max(0, i + d));
    if (n === i) return;
    const v = opts[n].value;
    setPend(v); live.current.pend = v;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, delay);
  };
  // A CONFIRMA lo marcado (0.47 pasaba a la siguiente: al confirmar «∞» saltaba a 30, y el color elegido cambiaba).
  const next = useTap(() => flush());
  const cols = perRow ?? opts.length;
  const h = tall ? 52 : 46; // opción de 40 px (normal) o 46 px (tall); antes 34
  return (
    <Focusable data-qr="item" data-qr-h="1" data-qr-seg="1" noFocusRing onActivate={next}
      onGamepadFocus={() => setFocused(true)} onGamepadBlur={() => { setFocused(false); flush(); }}
      onOKActionDescription="Elegir"
      onGamepadDirection={(e: DirEvt) => {
        const b = e.detail?.button;
        if (b === DIR_LEFT) move(-1); else if (b === DIR_RIGHT) move(1); else passVertical(e);
      }}
      style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0, 1fr))`, gap: 2, padding: 3, borderRadius: tall ? 18 : 20, background: COLORS.track, ...focusRing(focused) }}>
      {opts.map((o) => {
        const on = o.value === shown;
        const tap = (ev: { stopPropagation?: () => void }) => { ev.stopPropagation?.(); window.clearTimeout(timer.current); live.current.pend = null; setPend(o.value); if (o.value !== value) pick(o.value); };
        return (
          <div key={String(o.value)} role="button" aria-pressed={on} title={o.label} onClick={tap}
            style={{ height: h - 6, minWidth: 0, borderRadius: tall ? 15 : 17, display: "flex", flexDirection: tall ? "column" : "row", alignItems: "center", justifyContent: "center", gap: tall ? 2 : 5,
              padding: "0 4px", fontFamily: FONT, fontSize: tall ? 11 : 12, fontWeight: on ? 800 : 600, cursor: "pointer",
              background: on ? COLORS.accent : "transparent", color: on ? COLORS.onAccent : COLORS.text,
              boxShadow: on ? "0 1px 4px rgba(0,0,0,0.35)" : "none", transition: "background 140ms ease, color 140ms ease" }}>
            {o.icon && <Icon d={o.icon} size={tall ? 20 : 15} color={on ? COLORS.onAccent : COLORS.text} />}
            <Label lines={o.icon ? 1 : 2}>{o.label}</Label>
          </div>
        );
      })}
    </Focusable>
  );
};
