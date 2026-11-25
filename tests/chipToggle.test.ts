// Chip «interruptor»: encendido = aro de acento y ✓ (sin relleno de acento); la ficha normal activa sigue rellena.
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("@decky/ui", () => ({
  Focusable: ({ children }: Record<string, unknown>) => h("div", null, children as never),
  DialogButton: ({ children, style, ...rest }: Record<string, unknown>) => h("button", { style, "aria-pressed": rest["aria-pressed"], "data-qr": rest["data-qr"] }, children as never),
  Navigation: {}, Router: {}, showModal: vi.fn(), findModuleExport: () => undefined,
}));
import { Chip } from "../src/ui";

let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); root = null; });
const mount = (props: Record<string, unknown>) => {
  host = document.createElement("div");
  root = createRoot(host);
  act(() => root!.render(h(Chip, { onClick: () => undefined, children: "Puntero", ...props } as never)));
  const b = host.querySelector("button")!;
  return { b, vars: (b as HTMLElement).style, svg: host.querySelectorAll("svg").length };
};

describe("Chip interruptor", () => {
  it("encendido: sin relleno de acento, con aro, ✓ y aria-pressed", () => {
    const { b, vars, svg } = mount({ toggle: true, active: true });
    expect(b.getAttribute("aria-pressed")).toBe("true");
    expect(svg).toBe(1);                                  // el ✓
    expect(vars.getPropertyValue("--qr-sh")).toContain("inset 0 0 0 2px");
    expect(vars.getPropertyValue("--qr-bg")).not.toBe(vars.getPropertyValue("--qr-sh"));
  });
  it("apagado: sin ✓ y sin aro", () => {
    const { b, vars, svg } = mount({ toggle: true, active: false });
    expect(b.getAttribute("aria-pressed")).toBe("false");
    expect(svg).toBe(0);
    expect(vars.getPropertyValue("--qr-sh")).toBe("none");
  });
  it("la ficha normal activa sigue con relleno de acento y sin aria-pressed", () => {
    const on = mount({ active: true });
    const off = mount({ active: false });
    expect(on.b.getAttribute("aria-pressed")).toBeNull();
    expect(on.vars.getPropertyValue("--qr-bg")).not.toBe(off.vars.getPropertyValue("--qr-bg"));
    expect(on.svg).toBe(0);
  });
});
