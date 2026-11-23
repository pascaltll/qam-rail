import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({ Navigation: { Navigate: vi.fn(), NavigateBack: vi.fn() } }));
vi.mock("../src/qamDesktop", () => ({ desktopOverlay: vi.fn(() => Promise.resolve()) }));

import { Navigation } from "@decky/ui";
import { closeBigKeyboard, isBigKeyboardOpen, toggleBigKeyboard } from "../src/bigKeyboard";

describe("Steam + Y: teclado grande", () => {
  it("abre, cierra y no repite", () => {
    expect(isBigKeyboardOpen()).toBe(false);
    expect(toggleBigKeyboard(10_000)).toBe(true);
    expect(isBigKeyboardOpen()).toBe(true);
    expect(Navigation.Navigate).toHaveBeenCalledTimes(1);
    expect(toggleBigKeyboard(10_100)).toBe(false);          // rebote: se ignora
    expect(isBigKeyboardOpen()).toBe(true);
    expect(toggleBigKeyboard(11_000)).toBe(true);           // segunda pulsación: cierra
    expect(isBigKeyboardOpen()).toBe(false);
    expect(Navigation.NavigateBack).toHaveBeenCalledTimes(1);
  });
  it("cerrar dos veces (botón B y desmontaje de la página) solo vuelve atrás una vez", () => {
    toggleBigKeyboard(20_000);
    closeBigKeyboard(); closeBigKeyboard();
    expect(Navigation.NavigateBack).toHaveBeenCalledTimes(1);
  });
});
