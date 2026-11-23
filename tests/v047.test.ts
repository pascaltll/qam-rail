import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("@decky/api", () => ({ callable: () => vi.fn(async () => ({})) }));
let dir: ((e: { detail: { button: number } }) => void) | null = null;
let okBtn: (() => void) | null = null;
vi.mock("@decky/ui", () => {
  const box = (tag: string) => (p: Record<string, unknown>) => {
    if (p.onGamepadDirection) { dir = p.onGamepadDirection as typeof dir; okBtn = p.onActivate as typeof okBtn; }
    return h(tag, { style: p.style, onClick: p.onClick as () => void, "data-qr": p["data-qr"], "data-qr-h": p["data-qr-h"] }, p.children as never);
  };
  return { Focusable: box("div"), DialogButton: box("button"), ModalRoot: box("div"), findModuleExport: () => undefined, Navigation: {}, Router: {}, showModal: vi.fn() };
});

import { tvTarget } from "../src/audioTv";
import type { AudioNode } from "../src/audio";
import { Segments } from "../src/ui";

const opts = [30, 40, 60, 0].map((v) => ({ value: v, label: v ? String(v) : "∞" }));
const mount = async (el: React.ReactElement) => {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(el); });
  return { host, done: () => act(() => root.unmount()) };
};

describe("barra de posiciones (0.47)", () => {
  it("es UNA parada del mando con todas las opciones dentro", async () => {
    const { host, done } = await mount(h(Segments, { opts, value: 40, onPick: () => undefined }));
    expect(host.querySelectorAll("[data-qr=item]")).toHaveLength(1);
    expect(host.querySelector("[data-qr=item]")?.getAttribute("data-qr-h")).toBe("1");
    expect(host.querySelectorAll("[role=button]")).toHaveLength(4);
    expect(host.querySelector("[aria-pressed=true]")?.textContent).toBe("40");
    await done();
  });
  it("izquierda/derecha mueven la marca al instante y aplican una sola vez al parar", async () => {
    vi.useFakeTimers();
    const pick = vi.fn();
    const { host, done } = await mount(h(Segments, { opts, value: 40, onPick: pick }));
    await act(async () => { dir?.({ detail: { button: 12 } }); });
    await act(async () => { dir?.({ detail: { button: 12 } }); });
    expect(host.querySelector("[aria-pressed=true]")?.textContent).toBe("∞");
    expect(pick).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(pick).toHaveBeenCalledTimes(1);
    expect(pick).toHaveBeenCalledWith(0);
    await act(async () => { dir?.({ detail: { button: 12 } }); vi.advanceTimersByTime(400); }); // en el borde no hace nada
    expect(pick).toHaveBeenCalledTimes(1);
    await done(); vi.useRealTimers();
  });
  it("A confirma lo marcado y NO salta a la siguiente (fallo de 0.47: «∞» + A volvía a 30)", async () => {
    vi.useFakeTimers();
    const pick = vi.fn();
    const { host, done } = await mount(h(Segments, { opts, value: 60, onPick: pick }));
    await act(async () => { dir?.({ detail: { button: 12 } }); });
    await act(async () => { okBtn?.(); });
    expect(pick).toHaveBeenCalledTimes(1);
    expect(pick).toHaveBeenCalledWith(0);
    expect(host.querySelector("[aria-pressed=true]")?.textContent).toBe("∞");
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(pick).toHaveBeenCalledTimes(1);
    await done(); vi.useRealTimers();
  });
  it("si sales antes de que se aplique, se aplica al salir", async () => {
    vi.useFakeTimers();
    const pick = vi.fn();
    const { done } = await mount(h(Segments, { opts, value: 60, onPick: pick }));
    await act(async () => { dir?.({ detail: { button: 11 } }); });
    await done();
    expect(pick).toHaveBeenCalledWith(40);
    vi.useRealTimers();
  });
  it("con el dedo aplica al tocar", async () => {
    const pick = vi.fn();
    const { host, done } = await mount(h(Segments, { opts, value: 40, onPick: pick }));
    await act(async () => { (host.querySelectorAll("[role=button]")[0] as HTMLElement).click(); });
    expect(pick).toHaveBeenCalledWith(30);
    await done();
  });
});

describe("sonido a la TV", () => {
  const n = (id: number, tipo: AudioNode["tipo"], activa = false) => ({ id, nombre: tipo, tipo, activa, volumen: 1, silenciado: false, filtro: false }) as AudioNode;
  it("pasa a la TV solo cuando acaba de aparecer", () => {
    const outs = [n(151, "altavoz", true), n(169, "hdmi")];
    expect(tvTarget(outs, false, true)?.id).toBe(169);
    expect(tvTarget(outs, true, true)).toBeNull();   // ya estaba: si volviste a los altavoces, se respeta
    expect(tvTarget(outs, false, false)).toBeNull(); // apagado por el usuario
    expect(tvTarget([n(151, "altavoz", true)], false, true)).toBeNull();
    expect(tvTarget([n(151, "altavoz"), n(169, "hdmi", true)], false, true)).toBeNull();
  });
});
