import { callable } from "@decky/api";

// Herramienta de diagnostico de geometria: explica POR QUE el panel no llega al borde derecho.
// Mide la ventana, el zoom, la cadena de ancestros del panel y que elemento hay realmente en el borde,
// y lo guarda en ~/homebrew/settings/qam-rail/diag/dock-latest.json (no hace falta pegar nada en la consola).

const diagSave = callable<[data: unknown], string>("diag_save");

const r4 = (n: number) => Math.round(n * 10) / 10;
const rect = (e: Element) => {
  const r = e.getBoundingClientRect();
  return [r4(r.left), r4(r.top), r4(r.right), r4(r.bottom), r4(r.width), r4(r.height)];
};

function describe(e: Element, view: Window) {
  const cs = view.getComputedStyle(e);
  const z = (cs as unknown as { zoom?: string }).zoom;
  return {
    tag: e.tagName.toLowerCase(),
    id: e.id || undefined,
    cls: String(e.className || "").slice(0, 70) || undefined,
    rect: rect(e), // [left, top, right, bottom, w, h]
    pos: cs.position,
    disp: cs.display,
    zoom: z && z !== "1" ? z : undefined,
    transform: cs.transform !== "none" ? cs.transform : undefined,
    margin: cs.margin,
    padding: cs.padding,
    width: cs.width,
    overflowX: cs.overflowX,
    right: cs.right,
    contain: cs.contain !== "none" ? cs.contain : undefined,
  };
}

export function geomReport(el: HTMLElement | null): Record<string, unknown> {
  const doc = el?.ownerDocument ?? document;
  const view = doc.defaultView ?? window;
  const vv = (view as unknown as { visualViewport?: { width: number; height: number; scale: number; offsetLeft: number } }).visualViewport;
  const de = doc.documentElement;

  const chain: unknown[] = [];
  for (let n: Element | null = el; n; n = n.parentElement) chain.push(describe(n, view));

  // Que hay realmente en la franja derecha: nos dice si hay un contenedor mas estrecho que la ventana.
  const probes: Record<string, unknown> = {};
  const midY = Math.round(view.innerHeight / 2);
  for (const dx of [1, 8, 20, 40, 80, 160]) {
    const x = view.innerWidth - dx;
    const hit = doc.elementFromPoint(x, midY);
    probes[`x=iw-${dx}`] = hit ? { tag: hit.tagName.toLowerCase(), cls: String(hit.className || "").slice(0, 50), rect: rect(hit) } : null;
  }

  // Elementos de pagina que llegan cerca del borde derecho (los que "mandan" en el ancho real).
  const wide: unknown[] = [];
  const all = doc.body ? doc.body.querySelectorAll("*") : [];
  for (let i = 0; i < all.length && wide.length < 12; i++) {
    const e = all[i];
    const r = e.getBoundingClientRect();
    if (r.width > view.innerWidth * 0.6 && r.height > view.innerHeight * 0.6) wide.push(describe(e, view));
  }

  return {
    when: new Date().toISOString(),
    href: String(view.location?.href ?? "").slice(0, 120),
    title: doc.title,
    inner: [view.innerWidth, view.innerHeight],
    outer: [view.outerWidth, view.outerHeight],
    screen: [view.screen?.width, view.screen?.height, view.screen?.availWidth, view.screen?.availHeight],
    dpr: view.devicePixelRatio,
    visualViewport: vv ? [r4(vv.width), r4(vv.height), vv.scale, vv.offsetLeft] : null,
    html: { client: [de.clientWidth, de.clientHeight], scroll: [de.scrollWidth, de.scrollHeight], rect: rect(de) },
    body: doc.body ? { client: [doc.body.clientWidth, doc.body.clientHeight], rect: rect(doc.body) } : null,
    panel: el ? rect(el) : null,
    panelGapRight: el ? r4(view.innerWidth - el.getBoundingClientRect().right) : null,
    dock: (window as unknown as { __qamRailDock?: unknown }).__qamRailDock ?? null,
    chain,
    probes,
    wideElements: wide,
  };
}

/** Lineas de referencia en pantalla: rojo = borde real de la ventana (innerWidth), azul = borde del panel. */
export function showRulers(doc: Document, panel: HTMLElement | null): void {
  hideRulers(doc);
  const view = doc.defaultView ?? window;
  const mk = (id: string, css: string) => {
    const d = doc.createElement("div");
    d.id = id;
    d.style.cssText = `position:fixed;top:0;bottom:0;width:2px;pointer-events:none;z-index:2147483647;${css}`;
    doc.body.appendChild(d);
  };
  mk("qr-ruler-win", "right:0;background:#ff2d2d;");
  if (panel) {
    const r = panel.getBoundingClientRect();
    mk("qr-ruler-panel", `left:${Math.round(Math.min(r.right, view.innerWidth - 3))}px;background:#2d8bff;`);
  }
}
export function hideRulers(doc: Document): void {
  doc.getElementById("qr-ruler-win")?.remove();
  doc.getElementById("qr-ruler-panel")?.remove();
}

export async function saveGeom(el: HTMLElement | null): Promise<string> {
  const rep = geomReport(el);
  try {
    return await diagSave(rep);
  } catch (e) {
    return `error: ${String(e)}`;
  }
}
