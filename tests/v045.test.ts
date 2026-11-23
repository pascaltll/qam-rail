import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("@decky/api", () => ({ callable: () => vi.fn(async () => ({})) }));
vi.mock("@decky/ui", () => {
  const box = (tag: string) => ({ children, style, onClick }: Record<string, unknown>) => h(tag, { style, onClick: onClick as () => void }, children as never);
  return { Focusable: box("div"), DialogButton: box("button"), ModalRoot: box("div"), findModuleExport: () => undefined, Navigation: {}, Router: {}, showModal: vi.fn() };
});

import { Options } from "../src/QamSections";
import { Chip } from "../src/ui";

const mount = async (el: React.ReactElement) => {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(el); });
  return { host, done: () => act(() => root.unmount()) };
};

describe("0.45: lo que se cortaba", () => {
  it("el límite de FPS muestra TODAS las opciones, «Sin límite» incluida", async () => {
    const opts = [30, 40, 45, 50, 60, 90, 120, 0].map((v) => ({ value: v, label: v ? String(v) : "Sin límite" }));
    const { host, done } = await mount(h(Options, { opts, value: 40, onPick: () => undefined, perRow: 4, compact: true }));
    const labels = [...host.querySelectorAll("[role=button]")].map((b) => b.textContent);
    expect(labels).toHaveLength(8);
    expect(labels).toContain("Sin límite");
    await done();
  });
  it("sin perRow se mantiene el recorte de siempre", async () => {
    const opts = Array.from({ length: 8 }, (_, i) => ({ value: i, label: `o${i}` }));
    const { host, done } = await mount(h(Options, { opts, value: 0, onPick: () => undefined }));
    expect(host.querySelectorAll("[role=button]")).toHaveLength(5);
    await done();
  });
  it("la ficha de pestaña lleva icono, nombre y globo", async () => {
    const { host, done } = await mount(h(Chip, { stack: true, icon: "M0 0", badge: 3, onClick: () => undefined, children: "Avisos" }));
    expect(host.textContent).toContain("Avisos");
    expect(host.textContent).toContain("3");
    expect(host.querySelector("svg")).toBeTruthy();
    await done();
  });
});
