import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn() }));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined, getGamepadNavigationTrees: () => [] }));
vi.mock("../src/panelBridge", () => ({ callPanel: vi.fn(async () => ({})) }));

import { buildPalette, readAdapter, setAppearanceSourceForTest, surfaceStyle } from "../src/appearance";
import { sortBt } from "../src/network";

describe("adaptador Luminous Atlas", () => {
  const vars: Record<string, string> = {
    "--hla-text": "rgb(232, 222, 196)", "--hla-muted": "rgba(232, 222, 196, 0.6)", "--hla-paper-deep": "rgb(12, 34, 38)",
    "--hla-folio-surface": "rgba(18, 54, 58, 0.92)", "--hla-line": "rgba(184, 155, 73, 0.34)", "--hla-brass": "rgb(184, 155, 73)", "--hla-ink": "rgb(5, 19, 22)",
    "--hla-motif-qam-1": "radial-gradient(circle at 84% 14%, transparent 0 58px, rgba(234, 215, 141, 0.11) 59px 60px)", "--hla-serif": '"Noto Serif", serif',
  };
  const get = (p: string) => vars[p] ?? "";
  it("lee colores, motivo y tipografía del tema", () => {
    const r = readAdapter(get, (v) => v || null)!;
    expect(r.adapter.id).toBe("luminous-atlas");
    expect(r.tokens).toMatchObject({ surface: "rgb(12, 34, 38)", text: "rgb(232, 222, 196)", accent: "#b89b49", onAccent: "rgb(5, 19, 22)" });
    expect(r.bg).toMatchObject({ attach: "scroll", repeat: "no-repeat" });
    expect(r.font).toBe('"Noto Serif", serif');
    expect(readAdapter(() => "", (v) => v)).toBeNull();
  });
  it("el panel se viste con ellos y el motivo va sin velo", () => {
    const r = readAdapter(get, (v) => v || null)!;
    const src = { accentPref: null, tokens: r.tokens, doc: "panel", bg: r.bg, font: r.font, adapter: "Luminous Atlas" };
    expect(buildPalette("panel", src)).toMatchObject({ panel: "rgb(12, 34, 38)", accent: "#b89b49" });
    setAppearanceSourceForTest(src, "panel");
    const st = surfaceStyle(true);
    expect(String(st.backgroundImage)).toContain("radial-gradient");
    expect(String(st.backgroundImage)).not.toContain("linear-gradient(rgba");
    setAppearanceSourceForTest({ accentPref: null, tokens: {}, doc: null, bg: null }, "panel");
  });
});

describe("Bluetooth", () => {
  const d = (nId: number, sName: string, eType: number, bConnected: boolean, bPaired: boolean, nStrengthRaw = -60) => ({ nId, nAdapterId: 0, eType, sMAC: `m${nId}`, sName, bConnected, bPaired, nStrengthRaw });
  it("conectados, emparejados (audio primero) y cerca por señal; sin nombre fuera", () => {
    const g = sortBt([d(1, "Mando", 10, true, true), d(2, "Buds", 5, false, true), d(3, "Teclado", 11, false, true), d(4, "JBL", 6, false, false, -40), d(5, "m5", 1, false, false), d(6, "Tele", 1, false, false, -80)]);
    expect(g.connected.map((x) => x.sName)).toEqual(["Mando"]);
    expect(g.paired.map((x) => x.sName)).toEqual(["Buds", "Teclado"]);
    expect(g.nearby.map((x) => x.sName)).toEqual(["JBL", "Tele"]);
  });
});
