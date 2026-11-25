// Controles de valor (data-qr-h): Izquierda/Derecha cambian el valor; Arriba/Abajo se reenvían al modelo de filas del panel.
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@decky/api", () => ({ callable: () => vi.fn(async () => ({})) }));
vi.mock("../src/panelBridge", () => ({ rpc: {}, readTdp: vi.fn(), writeTdp: vi.fn(), bridgeDiag: () => ({}), callPanel: vi.fn(async () => ({})) }));

const handlers: Array<(e: unknown) => void> = [];
const activates: Array<unknown> = [];
vi.mock("@decky/ui", () => ({
  Focusable: ({ children, onGamepadDirection, onActivate }: Record<string, unknown>) => { handlers.push(onGamepadDirection as (e: unknown) => void); activates.push(onActivate); return h("div", null, children as never); },
  DialogButton: ({ children }: Record<string, unknown>) => h("button", null, children as never),
  Navigation: {}, Router: {}, showModal: vi.fn(), findModuleExport: () => undefined,
}));

import { XSlider, passVertical, setBodyDir } from "../src/ui";
import { PowerBar } from "../src/QamTdp";

const ev = (button: number) => ({ detail: { button }, stopPropagation: vi.fn(), preventDefault: vi.fn() });
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; handlers.length = 0; activates.length = 0; setBodyDir(null); });

const mount = (onChange: (v: number) => void) => {
  const el = document.createElement("div");
  root = createRoot(el);
  act(() => root!.render(h(XSlider, { label: "Brillo", icon: "", value: 40, min: 0, max: 100, step: 5, suffix: "%", onChange })));
  return handlers[handlers.length - 1];
};

describe("controles de valor y cruceta", () => {
  it("Izquierda/Derecha cambian el valor y no llaman al panel", () => {
    const onChange = vi.fn(); const body = vi.fn(); setBodyDir(body);
    const dir = mount(onChange);
    dir(ev(11)); dir(ev(12));
    expect(onChange.mock.calls).toEqual([[35], [45]]);
    expect(body).not.toHaveBeenCalled();
  });
  it("Arriba/Abajo se reenvían al panel, sin cambiar el valor, y detienen la propagación", () => {
    const onChange = vi.fn(); const body = vi.fn(); setBodyDir(body);
    const dir = mount(onChange);
    for (const b of [9, 10]) { const e = ev(b); dir(e); expect(body).toHaveBeenLastCalledWith(e); expect(e.stopPropagation).toHaveBeenCalled(); }
    expect(onChange).not.toHaveBeenCalled();
    expect(body).toHaveBeenCalledTimes(2);
  });
  it("sin panel registrado no hace nada (y devuelve false)", () => {
    expect(passVertical(ev(10))).toBe(false);
  });
  it("el deslizador y la barra de TDP son enfocables: tienen onActivate y A no cambia el valor", () => {
    const onChange = vi.fn();
    mount(onChange);
    expect(typeof activates[activates.length - 1]).toBe("function");
    (activates[activates.length - 1] as () => void)();
    expect(onChange).not.toHaveBeenCalled();
    activates.length = 0; handlers.length = 0;
    const el = document.createElement("div");
    root = createRoot(el);
    act(() => root!.render(h(PowerBar, { value: 12, min: 4, max: 25, onChange })));
    expect(activates.some((a) => typeof a === "function")).toBe(true);
    (activates.find((a) => typeof a === "function") as () => void)();
    expect(onChange).not.toHaveBeenCalled();
  });
});
