import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn() }));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined, getGamepadNavigationTrees: () => [] }));
vi.mock("../src/panelBridge", () => ({ callPanel: vi.fn(async () => ({})) }));

import { buildPalette, layerCount, setAppearanceSourceForTest, setThemeBgEnabled, surfaceStyle } from "../src/appearance";

const bg = { image: 'url("http://x/stripes.svg"), linear-gradient(rgb(0, 0, 0), rgb(1, 1, 1))', size: "200px 200px", position: "0% 0%", repeat: "repeat", base: "rgb(40, 42, 48)", where: "DIV.x::before" };

describe("fondo del tema", () => {
  it("cuenta capas sin romper paréntesis", () => {
    expect(layerCount(bg.image)).toBe(2);
    expect(layerCount("none")).toBe(1);
  });
  it("sin colores publicados, el panel toma el color base del fondo (más oscuro)", () => {
    const p = buildPalette("panel", { accentPref: null, tokens: {}, doc: null, bg });
    expect(p.panel).not.toBe("#060608");
    expect(p.card).not.toBe("#0c0c10");
  });
  it("continúa la imagen fija a la pantalla con un velo; en ligero o desactivado, solo color", () => {
    setAppearanceSourceForTest({ accentPref: null, tokens: {}, doc: "panel", bg }, "panel");
    const st = surfaceStyle(false);
    expect(String(st.backgroundImage)).toContain("stripes.svg");
    expect(st.backgroundAttachment).toBe("scroll, fixed, fixed");
    expect(String(st.backgroundSize).split(",").length).toBe(3);
    expect(surfaceStyle(true).backgroundImage).toBeUndefined();
    setThemeBgEnabled(false);
    expect(surfaceStyle(false).backgroundImage).toBeUndefined();
    setThemeBgEnabled(true);
    setAppearanceSourceForTest({ accentPref: null, tokens: {}, doc: null, bg: null }, "panel");
  });
});
