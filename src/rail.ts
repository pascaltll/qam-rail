import {
  buildRailCss, CLS_COLLAPSED, CLS_CROOT, CLS_INVERT, CLS_ON, CLS_PANEL, CLS_STRIP, STYLE_ID, VAR_CONTENT_SHIFT,
  VAR_SHIFT, VAR_STRIP_SHIFT,
} from "./railCss";

export type RailOpenOn = "focus" | "select";
export type RailState = "collapsed" | "expanded" | "unsupported";

export interface RailParts {
  tabs: HTMLElement[];
  contents: HTMLElement[];
  strip: HTMLElement;
  panel: HTMLElement;
}

export interface RailMetrics {
  panelWidth: number;
  stripWidth: number;
  /** px que hay que desplazar el panel para que la tira quede pegada al borde derecho de la ventana */
  shift: number;
}

export interface ButtonHandlers {
  right(): boolean;
  cancel(): boolean;
}

export interface RailDeps {
  measure(parts: RailParts): RailMetrics | null;
  registerButtons(handlers: ButtonHandlers): () => void;
  focus(el: HTMLElement): void;
  setTimer(fn: () => void, ms: number): number;
  clearTimer(id: number): void;
  log(msg: string): void;
}

export interface RailOptions {
  openOn: RailOpenOn;
  /** Test: columnas intercambiadas (iconos a la derecha) y sin colapso. */
  invert?: boolean;
  settleMs?: number;
  focusDelayMs?: number;
}

const TAB_SEL = '[id^="quickaccess_tab_"]';
const CONTENT_SEL = '[id^="quickaccess_content_"]';
const FOCUSABLE_SEL = '[tabindex], button, a[href], input, select, textarea';

function isFocused(el: Element): boolean {
  return el.classList.contains("gpfocus") || el.querySelector(".gpfocus") !== null;
}

function commonAncestor(nodes: HTMLElement[]): HTMLElement | null {
  if (!nodes.length) return null;
  let cur: HTMLElement | null = nodes[0].parentElement;
  while (cur) {
    const ok = cur;
    if (nodes.every((n) => ok.contains(n))) return cur;
    cur = cur.parentElement;
  }
  return null;
}

export function findParts(doc: Document): RailParts | null {
  const tabs = Array.from(doc.querySelectorAll<HTMLElement>(TAB_SEL));
  const contents = Array.from(doc.querySelectorAll<HTMLElement>(CONTENT_SEL));
  if (!tabs.length || !contents.length) return null;
  const strip = tabs.length === 1 ? tabs[0].parentElement : commonAncestor(tabs);
  const panel = commonAncestor([...tabs, ...contents]);
  // La tira debe ser distinta del panel y no contener el contenido; si no, no se toca nada.
  if (!strip || !panel || panel === strip || strip.contains(contents[0])) return null;
  return { tabs, contents, strip, panel };
}

export function domMeasure(parts: RailParts): RailMetrics | null {
  const el = parts.panel;
  // Se mide sin el desplazamiento actual (getBoundingClientRect incluye transform).
  const prevT = el.style.transform;
  const prevTr = el.style.transition;
  el.style.transition = "none";
  el.style.transform = "none";
  const p = el.getBoundingClientRect();
  const s = parts.strip.getBoundingClientRect();
  const vw = el.ownerDocument.documentElement.clientWidth;
  el.style.transform = prevT;
  el.style.transition = prevTr;
  if (p.width <= 0 || s.width <= 0 || vw <= 0) return null;
  // La tira se mide desde el borde izquierdo del panel por si hay margen/relleno antes de ella.
  const stripWidth = s.right - p.left;
  if (!(stripWidth > 0 && stripWidth < p.width - 20)) return null;
  // Borde derecho de la tira -> borde derecho de la ventana (no depende del ancho del panel).
  return { panelWidth: p.width, stripWidth, shift: Math.max(0, Math.round(vw - s.right)) };
}

// Ajuste manual de px (puede ser negativo): localStorage.qamRailStripShift = "250".
function manualPx(doc: Document, key: string): number | null {
  try {
    const raw = doc.defaultView?.localStorage?.getItem(key);
    const n = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// Ajuste manual sin recompilar: en la consola del QAM, localStorage.qamRailShift = "1000" (px).
function manualShift(doc: Document): number | null {
  try {
    const raw = doc.defaultView?.localStorage?.getItem("qamRailShift");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export class RailController {
  private state: RailState = "unsupported";
  private parts: RailParts | null = null;
  private metrics: RailMetrics | null = null;
  private cleanups: Array<() => void> = [];
  private focusTimer: number | null = null;
  private settleTimer: number | null = null;
  private baselineTab: string | null = null;
  private armed = false;
  private started = false;
  private opens = 0;
  private croot: HTMLElement | null = null;
  private vw: number | null = null;

  constructor(private readonly doc: Document, private readonly opts: RailOptions, private readonly deps: RailDeps) {}

  getState(): RailState {
    return this.state;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const doc = this.doc;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = buildRailCss();
    doc.head.appendChild(style);
    this.cleanups.push(() => style.remove());

    const onVis = () => this.onVisibility();
    doc.addEventListener("visibilitychange", onVis);
    this.cleanups.push(() => doc.removeEventListener("visibilitychange", onVis));

    const onClick = (e: Event) => {
      const tab = (e.target as Element | null)?.closest?.(TAB_SEL);
      if (tab && this.state === "collapsed") this.expand();
    };
    doc.addEventListener("click", onClick, true);
    this.cleanups.push(() => doc.removeEventListener("click", onClick, true));

    const unbind = this.deps.registerButtons({
      right: () => this.onRight(),
      cancel: () => this.onCancel(),
    });
    this.cleanups.push(unbind);

    if (doc.visibilityState === "visible") this.collapse();
  }

  // Intercambia visualmente tira y contenido. Se mide sin transformaciones propias.
  private applyInvert(): boolean {
    const parts = findParts(this.doc);
    const croot = parts && (parts.contents.length > 1 ? commonAncestor(parts.contents) : parts.contents[0]);
    if (!parts || !croot || croot.contains(parts.strip) || parts.strip.contains(croot)) {
      this.release("estructura no apta para invertir");
      return false;
    }
    this.parts = parts;
    this.croot = croot;
    parts.strip.classList.add(CLS_STRIP);
    croot.classList.add(CLS_CROOT);
    const root = this.doc.documentElement;
    root.classList.remove(CLS_INVERT); // medir sin el desplazamiento actual
    const sR = parts.strip.getBoundingClientRect();
    const cR = croot.getBoundingClientRect();
    root.classList.add(CLS_ON, CLS_INVERT);
    if (!(sR.width > 0 && cR.width > 0 && sR.right <= cR.left + 4)) {
      this.release("la tira no esta a la izquierda del contenido");
      return false;
    }
    // El contenedor del contenido puede ser mas ancho que la ventana visible: el borde derecho del
    // conjunto se limita al ancho real de la ventana para que la tira nunca quede fuera de pantalla.
    // innerWidth, no clientWidth: en el QAM de Steam documentElement.clientWidth vale 1 (medido en el dispositivo).
    const iw = this.doc.defaultView?.innerWidth ?? 0;
    const vw = iw > 0 ? iw : Infinity;
    const unionRight = Math.min(cR.right, vw);
    const stripLeftNew = unionRight - sR.width;
    const stripShift = manualPx(this.doc, "qamRailStripShift") ?? Math.round(unionRight - sR.right);
    const contentShift = manualPx(this.doc, "qamRailContentShift") ?? Math.round(stripLeftNew - cR.width - cR.left);
    root.style.setProperty(VAR_STRIP_SHIFT, `${stripShift}px`);
    root.style.setProperty(VAR_CONTENT_SHIFT, `${contentShift}px`);
    this.vw = Number.isFinite(vw) ? vw : null;
    this.state = "expanded";
    return true;
  }

  dispose(): void {
    this.clearTimers();
    this.cleanups.splice(0).reverse().forEach((fn) => fn());
    const root = this.doc.documentElement;
    root.classList.remove(CLS_ON, CLS_COLLAPSED);
    root.style.removeProperty(VAR_SHIFT);
    root.classList.remove(CLS_INVERT);
    root.style.removeProperty(VAR_STRIP_SHIFT);
    root.style.removeProperty(VAR_CONTENT_SHIFT);
    this.croot?.classList.remove(CLS_CROOT);
    this.croot = null;
    this.parts?.panel.classList.remove(CLS_PANEL);
    this.parts?.strip.classList.remove(CLS_STRIP);
    this.parts = null;
    this.state = "unsupported";
    this.started = false;
  }

  // ---- estado -------------------------------------------------------------------------------

  private refresh(): boolean {
    const parts = findParts(this.doc);
    if (!parts) {
      this.release("sin pestanas/contenido del QAM");
      return false;
    }
    if (this.parts && (this.parts.panel !== parts.panel || this.parts.strip !== parts.strip)) {
      this.parts.panel.classList.remove(CLS_PANEL);
      this.parts.strip.classList.remove(CLS_STRIP);
    }
    this.parts = parts;
    parts.panel.classList.add(CLS_PANEL);
    parts.strip.classList.add(CLS_STRIP);
    // Se mide con el QAM expandido (el panel conserva su ancho aunque se desplace).
    const m = this.deps.measure(parts);
    if (!m) {
      this.release("medidas no validas");
      return false;
    }
    this.metrics = m;
    const shift = manualShift(this.doc) ?? m.shift;
    this.doc.documentElement.style.setProperty(VAR_SHIFT, `${Math.round(shift)}px`);
    return true;
  }

  // Ante cualquier duda el QAM vuelve a ser el de Steam: nunca se deja a medias.
  private release(reason: string): void {
    if (this.state !== "unsupported") this.deps.log(`riel desactivado: ${reason}`);
    const root = this.doc.documentElement;
    root.classList.remove(CLS_ON, CLS_COLLAPSED);
    this.state = "unsupported";
  }

  collapse(): void {
    this.clearTimers();
    if (this.opts.invert) {
      if (this.doc.visibilityState === "visible") this.applyInvert();
      return;
    }
    // El riel solo se mide/activa si el QAM es visible; si no, queda como estaba.
    if (this.doc.visibilityState !== "visible") {
      this.doc.documentElement.classList.remove(CLS_COLLAPSED);
      return;
    }
    if (!this.refresh()) return;
    const root = this.doc.documentElement;
    root.classList.add(CLS_ON, CLS_COLLAPSED);
    this.state = "collapsed";
    this.armed = false;
    this.baselineTab = null;
    // Pasado un instante se toma como "linea base" el icono que Steam enfoca al abrir el QAM:
    // solo un cambio posterior cuenta como gesto del usuario.
    this.settleTimer = this.deps.setTimer(() => {
      this.settleTimer = null;
      this.baselineTab = this.focusedTab()?.id ?? null;
      this.armed = true;
      this.watchFocus();
    }, this.opts.settleMs ?? 350);
  }

  expand(tab?: HTMLElement | null): void {
    if (this.state === "unsupported") return;
    this.clearTimers();
    this.unwatchFocus();
    if (tab) tab.click();
    this.doc.documentElement.classList.remove(CLS_COLLAPSED);
    this.state = "expanded";
    this.opens += 1;
    // Cuando termina la animacion se vuelve a medir (el contenido pudo cambiar el ancho).
    this.settleTimer = this.deps.setTimer(() => {
      this.settleTimer = null;
      if (this.state === "expanded") this.refresh();
    }, 260);
  }

  // ---- eventos ------------------------------------------------------------------------------

  private onVisibility(): void {
    if (this.doc.visibilityState === "visible") this.collapse();
    else if (!this.opts.invert) {
      // Al cerrar se deja listo: la proxima apertura empieza ya como riel, sin parpadeo.
      this.clearTimers();
      this.unwatchFocus();
      if (this.state !== "unsupported") this.state = "collapsed";
      this.doc.documentElement.classList.add(CLS_COLLAPSED);
    }
  }

  private focusedTab(): HTMLElement | null {
    const tabs = this.parts?.tabs ?? [];
    return tabs.find(isFocused) ?? null;
  }

  private activeKey(): string | null {
    const c = (this.parts?.contents ?? []).find((el) => {
      const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
      return el.getClientRects().length > 0 && cs?.display !== "none";
    });
    return c ? c.id.slice("quickaccess_content_".length) : null;
  }

  private activeTab(): HTMLElement | null {
    const key = this.activeKey();
    const tabs = this.parts?.tabs ?? [];
    return (key && tabs.find((t) => t.id === `quickaccess_tab_${key}`)) || tabs[0] || null;
  }

  private watchFocus(): void {
    if (this.opts.openOn !== "focus" || !this.parts) return;
    const View = this.doc.defaultView;
    const Obs = View?.MutationObserver;
    if (!Obs) return;
    const obs = new Obs(() => this.onFocusMoved());
    obs.observe(this.parts.strip, { attributes: true, attributeFilter: ["class"], subtree: true });
    this.unwatch = () => obs.disconnect();
  }

  private unwatch: (() => void) | null = null;
  private unwatchFocus(): void {
    this.unwatch?.();
    this.unwatch = null;
  }

  private onFocusMoved(): void {
    if (this.state !== "collapsed" || !this.armed) return;
    const tab = this.focusedTab();
    if (!tab || tab.id === this.baselineTab) return;
    if (this.focusTimer !== null) this.deps.clearTimer(this.focusTimer);
    // Pequeno retardo: al recorrer varios iconos seguidos solo se abre el seccion donde se detiene.
    this.focusTimer = this.deps.setTimer(() => {
      this.focusTimer = null;
      if (this.state !== "collapsed") return;
      const now = this.focusedTab();
      if (now && now.id !== this.baselineTab) this.expand(now);
    }, this.opts.focusDelayMs ?? 140);
  }

  private onRight(): boolean {
    if (this.state !== "collapsed") return false;
    const tab = this.focusedTab() ?? this.activeTab();
    this.expand(tab);
    // Tras la animacion el foco entra en el primer control de la seccion abierta.
    this.deps.setTimer(() => {
      const active = this.activeKey();
      const content = this.parts?.contents.find((c) => c.id === `quickaccess_content_${active}`);
      const first = content?.querySelector<HTMLElement>(FOCUSABLE_SEL);
      if (first) this.deps.focus(first);
    }, 60);
    return true;
  }

  private onCancel(): boolean {
    if (this.opts.invert || this.state !== "expanded" || !this.parts) return false;
    const inContent = this.parts.contents.some(isFocused);
    if (!inContent) return false; // B sobre el riel: lo gestiona Steam (cierra el QAM)
    const back = this.activeTab();
    this.collapse();
    if (back) this.deps.setTimer(() => this.deps.focus(back), 30);
    return true;
  }

  private clearTimers(): void {
    if (this.focusTimer !== null) this.deps.clearTimer(this.focusTimer);
    if (this.settleTimer !== null) this.deps.clearTimer(this.settleTimer);
    this.focusTimer = null;
    this.settleTimer = null;
  }

  diag(): string {
    const p = this.parts;
    return JSON.stringify({
      state: this.state,
      opens: this.opens,
      tabs: p?.tabs.map((t) => t.id) ?? [],
      contents: p?.contents.map((c) => c.id) ?? [],
      metrics: this.metrics,
      shiftApplied: this.doc.documentElement.style.getPropertyValue(VAR_SHIFT),
      manualShift: manualShift(this.doc),
      inner: [this.doc.defaultView?.innerWidth, this.doc.defaultView?.innerHeight],
      screen: [this.doc.defaultView?.screen?.width, this.doc.defaultView?.screen?.height],
      stripRect: p ? p.strip.getBoundingClientRect().toJSON?.() : null,
      panelRect: p ? p.panel.getBoundingClientRect().toJSON?.() : null,
      stripClass: p?.strip.className ?? null,
      panelClass: p?.panel.className ?? null,
      focused: this.focusedTab()?.id ?? null,
      active: this.activeKey(),
      armed: this.armed,
      invert: !!this.opts.invert,
      vw: this.vw,
      contentRects: this.parts ? this.parts.contents.map((c) => { const r = c.getBoundingClientRect(); return [c.id.slice(21), Math.round(r.left), Math.round(r.right)]; }) : null,
      stripRectNow: this.parts ? this.parts.strip.getBoundingClientRect().toJSON?.() : null,
      stripShift: this.doc.documentElement.style.getPropertyValue(VAR_STRIP_SHIFT),
      contentShift: this.doc.documentElement.style.getPropertyValue(VAR_CONTENT_SHIFT),
      crootRect: this.croot ? this.croot.getBoundingClientRect().toJSON?.() : null,
    });
  }
}
