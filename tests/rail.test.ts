import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RailController, findParts, type ButtonHandlers, type RailDeps, type RailMetrics } from "../src/rail";

function buildQam(keys = ["1", "2", "3"]) {
  document.head.innerHTML = "";
  document.body.innerHTML = `
    <div id="QuickAccess-Menu">
      <div class="strip">${keys.map((k) => `<div id="quickaccess_tab_${k}" tabindex="0"></div>`).join("")}</div>
      <div class="body">${keys.map((k) => `<div id="quickaccess_content_${k}"><button id="b${k}">x</button></div>`).join("")}</div>
    </div>`;
}

function setup(over: Partial<RailDeps> = {}, openOn: "focus" | "select" = "focus") {
  let handlers!: ButtonHandlers;
  const focus = vi.fn();
  const metrics: RailMetrics | null = { panelWidth: 351, stripWidth: 56, shift: 295 };
  const deps: RailDeps = {
    measure: () => metrics,
    registerButtons: (h) => { handlers = h; return () => {}; },
    focus,
    setTimer: (fn, ms) => window.setTimeout(fn, ms) as unknown as number,
    clearTimer: (id) => window.clearTimeout(id),
    log: () => {},
    ...over,
  };
  const ctl = new RailController(document, { openOn }, deps);
  return { ctl, focus, h: () => handlers };
}

const root = () => document.documentElement;
const tab = (k: string) => document.getElementById(`quickaccess_tab_${k}`)!;

beforeEach(() => { vi.useFakeTimers(); buildQam(); root().className = ""; root().removeAttribute("style"); });
afterEach(() => { vi.useRealTimers(); });

describe("RailController", () => {
  it("findParts distingue tira, panel y contenido", () => {
    const p = findParts(document)!;
    expect(p.tabs).toHaveLength(3);
    expect(p.strip.className).toBe("strip");
    expect(p.panel.id).toBe("QuickAccess-Menu");
  });

  it("arranca colapsado con el desplazamiento panel-tira", () => {
    const { ctl } = setup();
    ctl.start();
    expect(ctl.getState()).toBe("collapsed");
    expect(root().classList.contains("qr-collapsed")).toBe(true);
    expect(root().style.getPropertyValue("--qr-shift")).toBe("295px");
    expect(document.getElementById("qr-style")).not.toBeNull();
  });

  it("si las medidas no son validas no toca el QAM (sin riel)", () => {
    const { ctl } = setup({ measure: () => null });
    ctl.start();
    expect(ctl.getState()).toBe("unsupported");
    expect(root().classList.contains("qr-collapsed")).toBe(false);
    expect(root().classList.contains("qr-on")).toBe(false);
  });

  it("si faltan pestanas del QAM se desactiva", () => {
    document.body.innerHTML = "<div></div>";
    const { ctl } = setup();
    ctl.start();
    expect(ctl.getState()).toBe("unsupported");
  });

  it("clic en un icono (A) expande", () => {
    const { ctl } = setup();
    ctl.start();
    tab("2").click();
    expect(ctl.getState()).toBe("expanded");
    expect(root().classList.contains("qr-collapsed")).toBe(false);
  });

  it("openOn=focus: el foco inicial no abre, un cambio posterior si (con retardo)", () => {
    const { ctl } = setup();
    tab("1").classList.add("gpfocus"); // foco inicial de Steam
    ctl.start();
    vi.advanceTimersByTime(400); // asienta la linea base
    expect(ctl.getState()).toBe("collapsed");
    tab("1").classList.remove("gpfocus");
    tab("2").classList.add("gpfocus");
    return Promise.resolve().then(() => {
      vi.advanceTimersByTime(200);
      expect(ctl.getState()).toBe("expanded");
    });
  });

  it("openOn=select: mover el foco no abre", async () => {
    const { ctl } = setup({}, "select");
    ctl.start();
    vi.advanceTimersByTime(400);
    tab("2").classList.add("gpfocus");
    await Promise.resolve();
    vi.advanceTimersByTime(500);
    expect(ctl.getState()).toBe("collapsed");
  });

  it("Derecha en el riel expande y lleva el foco al contenido; B en contenido vuelve al riel", () => {
    const { ctl, focus, h } = setup();
    ctl.start();
    tab("2").classList.add("gpfocus");
    expect(h().right()).toBe(true);
    expect(ctl.getState()).toBe("expanded");
    vi.advanceTimersByTime(100);
    expect(focus).toHaveBeenCalled();

    // B con el foco en el contenido: colapsa y consume el boton
    document.getElementById("quickaccess_content_2")!.classList.add("gpfocus");
    expect(h().cancel()).toBe(true);
    expect(ctl.getState()).toBe("collapsed");
  });

  it("B sobre el riel no se consume (Steam cierra el QAM) y Derecha expandido no se consume", () => {
    const { ctl, h } = setup();
    ctl.start();
    tab("1").click();
    tab("1").classList.add("gpfocus");
    expect(h().cancel()).toBe(false);
    expect(h().right()).toBe(false);
  });

  it("al volver a abrir el QAM vuelve a empezar colapsado", () => {
    const { ctl } = setup();
    ctl.start();
    tab("1").click();
    expect(ctl.getState()).toBe("expanded");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(ctl.getState()).toBe("collapsed");
  });

  it("dispose deja el QAM exactamente como estaba", () => {
    const { ctl } = setup();
    ctl.start();
    ctl.dispose();
    expect(root().className).toBe("");
    expect(root().style.getPropertyValue("--qr-shift")).toBe("");
    expect(document.getElementById("qr-style")).toBeNull();
    expect(document.querySelector(".qr-panel, .qr-strip")).toBeNull();
  });
});

describe("modo invertido", () => {
  it("intercambia tira y contenido sin colapsar", () => {
    const rect = (l: number, r: number) => ({ left: l, right: r, width: r - l, top: 0, bottom: 10, height: 10, x: l, y: 0, toJSON: () => ({}) });
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("strip")) return rect(0, 56) as DOMRect;
      if (this.classList.contains("body")) return rect(56, 351) as DOMRect;
      return rect(0, 351) as DOMRect;
    });
    const ctl = new RailController(document, { openOn: "focus", invert: true }, {
      measure: () => null, registerButtons: () => () => {}, focus: () => {},
      setTimer: (fn, ms) => window.setTimeout(fn, ms) as unknown as number, clearTimer: (id) => window.clearTimeout(id), log: () => {},
    });
    ctl.start();
    expect(root().classList.contains("qr-invert")).toBe(true);
    expect(root().classList.contains("qr-collapsed")).toBe(false);
    expect(root().style.getPropertyValue("--qr-strip-shift")).toBe("295px");
    expect(root().style.getPropertyValue("--qr-content-shift")).toBe("-56px");
    ctl.dispose();
    expect(root().className).toBe("");
    spy.mockRestore();
  });
});

describe("modo invertido con contenedor mas ancho que la ventana", () => {
  it("limita la tira al ancho de la ventana", () => {
    const rect = (l: number, r: number) => ({ left: l, right: r, width: r - l, top: 0, bottom: 10, height: 10, x: l, y: 0, toJSON: () => ({}) });
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("strip")) return rect(0, 56) as DOMRect;
      if (this.classList.contains("body")) return rect(56, 600) as DOMRect;
      return rect(0, 600) as DOMRect;
    });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 351 });
    const ctl = new RailController(document, { openOn: "focus", invert: true }, {
      measure: () => null, registerButtons: () => () => {}, focus: () => {},
      setTimer: (fn, ms) => window.setTimeout(fn, ms) as unknown as number, clearTimer: (id) => window.clearTimeout(id), log: () => {},
    });
    ctl.start();
    // la tira acaba en x=295..351 (borde de la ventana), no en 544..600
    expect(root().style.getPropertyValue("--qr-strip-shift")).toBe("295px");
    ctl.dispose();
    spy.mockRestore();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  });
});

describe("modo invertido con los numeros medidos en el dispositivo", () => {
  it("ventana 855, tira 0-51, contenido 51-854 => +803 / -51 aunque clientWidth valga 1", () => {
    const rect = (l: number, r: number) => ({ left: l, right: r, width: r - l, top: 0, bottom: 10, height: 10, x: l, y: 0, toJSON: () => ({}) });
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("strip")) return rect(0, 50.93) as DOMRect;
      if (this.classList.contains("body")) return rect(50.93, 854) as DOMRect;
      if (this.id.startsWith("quickaccess_content_")) return rect(50.93, 854) as DOMRect;
      return rect(0, 854) as DOMRect;
    });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 855 });
    Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 1 });
    const ctl = new RailController(document, { openOn: "focus", invert: true }, {
      measure: () => null, registerButtons: () => () => {}, focus: () => {},
      setTimer: (fn, ms) => window.setTimeout(fn, ms) as unknown as number, clearTimer: (id) => window.clearTimeout(id), log: () => {},
    });
    ctl.start();
    expect(root().style.getPropertyValue("--qr-strip-shift")).toBe("803px");
    expect(root().style.getPropertyValue("--qr-content-shift")).toBe("-51px");
    ctl.dispose();
    spy.mockRestore();
    Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 0 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  });
});
