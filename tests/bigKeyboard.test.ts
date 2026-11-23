import { describe, it, expect, vi, beforeEach } from "vitest";
const nav = vi.hoisted(() => ({ Navigate: vi.fn(), NavigateBack: vi.fn() }));
vi.mock("@decky/ui", () => ({ Navigation: nav }));
const ov = vi.hoisted(() => vi.fn(async (_on?: boolean) => ({ ok: true })));
vi.mock("../src/qamDesktop", () => ({ desktopOverlay: (on: boolean) => ov(on) }));
import { BIG_KEYBOARD_ROUTE, closeBigKeyboard, openBigKeyboard } from "../src/bigKeyboard";

describe("teclado grande sobre la app", () => {
  beforeEach(() => { nav.Navigate.mockReset(); nav.NavigateBack.mockReset(); ov.mockClear(); });
  it("abre: overlay arriba y ruta propia", () => {
    expect(openBigKeyboard()).toBe(true);
    expect(ov).toHaveBeenCalledWith(true);
    expect(nav.Navigate).toHaveBeenCalledWith("/qam-rail/teclado");
    expect(BIG_KEYBOARD_ROUTE).toBe("/qam-rail/teclado");
  });
  it("cierra: vuelve atrás y baja el overlay", () => {
    closeBigKeyboard();
    expect(nav.NavigateBack).toHaveBeenCalled();
    expect(ov).toHaveBeenLastCalledWith(false);
  });
  it("si la navegación falla, lo dice y no revienta", () => {
    nav.Navigate.mockImplementation(() => { throw new Error("x"); });
    expect(openBigKeyboard()).toBe(false);
  });
});
