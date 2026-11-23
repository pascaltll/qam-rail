import { describe, expect, it, vi } from "vitest";

const prefs: Record<string, string> = {};
vi.mock("@decky/api", () => ({ callable: () => vi.fn() }));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined, getGamepadNavigationTrees: () => [] }));
vi.mock("../src/panelBridge", () => ({ callPanel: vi.fn(async () => prefs) }));

import {
  RAIL, alpha, buildPalette, cssLoaderThemes, currentPalette, mix, onColor, panelAccent, parseColor, parseCssThemes,
  readTokens, refreshAppearance, setAppearanceMode, setAppearanceSourceForTest, subscribeAppearance, tripletToHex,
} from "../src/appearance";
import { COLORS, cardStyle } from "../src/ui";

describe("apariencia (puro)", () => {
  it("colores y tripletes como los publica un tema", () => {
    expect(parseColor(" #0c0c10 ")).toBe("#0c0c10");
    expect(parseColor("rgba(255,255,255,0.06)")).toBe("rgba(255,255,255,0.06)");
    expect(parseColor("var(--x)")).toBeNull();
    expect(parseColor("red")).toBeNull();
    expect(tripletToHex("78, 161, 255")).toBe("#4ea1ff");
    expect(tripletToHex("78 161 255")).toBe("#4ea1ff");
    expect(tripletToHex("300,0,0")).toBeNull();
    expect(tripletToHex("1,2")).toBeNull();
  });

  it("mezcla, texto legible y transparencia", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#0c0c10", "rgba(255,255,255,0.92)", 0)).toBe("#0c0c10");
    expect(mix("nada", "#fff", 0.5)).toBe("nada");
    expect(onColor("#f5c542")).toBe("#111318");
    expect(onColor("#1b1d23")).toBe("#ffffff");
    expect(alpha("#ff8a3d", 0.28)).toBe("rgba(255,138,61,0.28)");
  });

  it("el acento: el elegido en Panel manda; con 'default' el del tema; sin nada el azul de Panel", () => {
    expect(panelAccent("green", { accent: "#ff0000" })).toBe("#3fbf6f");
    expect(panelAccent("green", {})).toBe("#3fbf6f");
    expect(panelAccent("default", { accent: "#ff0000" })).toBe("#ff0000");
    expect(panelAccent(null, {})).toBe("#4ea1ff");
  });

  it("tres modos: Panel completo, solo acento y el propio", () => {
    const src = { accentPref: "purple", tokens: { surface: "#101820", surfaceRaised: "#18222c", text: "#eeeeee", outline: "#334455", radiusMd: 14 }, doc: "qam" };
    const p = buildPalette("panel", src);
    expect(p).toMatchObject({ panel: "#101820", card: "#18222c", text: "#eeeeee", accent: "#9b7bf0", outline: "#334455", cardRadius: 20 });
    expect(p.track).not.toBe(p.card);
    const a = buildPalette("accent", src);
    expect(a).toMatchObject({ panel: RAIL.panel, card: RAIL.card, accent: "#9b7bf0", outline: null });
    expect(buildPalette("rail", src)).toBe(RAIL);
    // Sin tema: el aspecto base de Panel (casi negro, borde fino).
    const base = buildPalette("panel", { accentPref: null, tokens: {}, doc: null });
    expect(base).toMatchObject({ panel: "#060608", card: "#0c0c10", accent: "#4ea1ff", outline: "rgba(255,255,255,0.06)" });
  });

  it("lee --qrail-* antes que --pdc-theme-*, e ignora valores rotos", () => {
    const css: Record<string, string> = {
      "--pdc-theme-accent": "34, 199, 192", "--pdc-theme-surface": "#111111", "--qrail-surface": "#222222",
      "--pdc-theme-text": "no-es-color", "--pdc-theme-radius-md": "12px",
    };
    const t = readTokens((p) => css[p] ?? "");
    expect(t).toEqual({ accent: "#22c7c0", surface: "#222222", radiusMd: 12 });
  });

  it("temas de CSS Loader: nombre visible y activo", () => {
    expect(parseCssThemes([{ name: "a", display_name: "Tema A", version: "1.0", author: "x", enabled: true }, { nope: 1 }, { name: "b" }]))
      .toEqual([
        { name: "a", displayName: "Tema A", version: "1.0", author: "x", enabled: true, patches: [] },
        { name: "b", displayName: "b", version: "", author: "", enabled: false, patches: [] },
      ]);
    expect(parseCssThemes(null)).toEqual([]);
  });
});

describe("apariencia (viva)", () => {
  it("COLORS y cardStyle siguen la paleta y avisan del cambio una sola vez", () => {
    const seen = vi.fn();
    const off = subscribeAppearance(seen);
    setAppearanceSourceForTest({ accentPref: "red", tokens: { surfaceRaised: "#202020" }, doc: "panel" }, "panel");
    expect(COLORS.accent).toBe("#e5484d");
    expect({ ...cardStyle }.background).toBe("#202020");
    expect({ ...cardStyle }.boxShadow).toContain("inset 0 0 0 1px");
    setAppearanceSourceForTest({ accentPref: "red", tokens: { surfaceRaised: "#202020" }, doc: "panel" }, "panel");
    expect(seen).toHaveBeenCalledTimes(1);
    setAppearanceMode("rail");
    expect(COLORS.accent).toBe(RAIL.accent);
    expect({ ...cardStyle }.boxShadow).toBeUndefined();
    expect(currentPalette()).toBe(RAIL);
    off();
    setAppearanceMode("panel");
  });

  it("lee el tema del documento y la preferencia de Panel (localStorage o su backend)", async () => {
    document.documentElement.style.setProperty("--pdc-theme-accent", "236, 92, 157");
    document.documentElement.style.setProperty("--pdc-theme-surface", "#0a0b0c");
    prefs["pdc:accent"] = "default";
    await refreshAppearance(true);
    expect(currentPalette().accent).toBe("#ec5c9d");
    expect(currentPalette().panel).toBe("#0a0b0c");
    window.localStorage.setItem("pdc:accent", "teal");
    await refreshAppearance(true);
    expect(currentPalette().accent).toBe("#22c7c0");
    window.localStorage.removeItem("pdc:accent");
  });

  it("CSS Loader: usa la ruta legacy de Decky y tolera que falte", async () => {
    expect(await cssLoaderThemes()).toBeNull();
    const call = vi.fn(async () => ({ success: true, result: [{ name: "Dark", enabled: true }] }));
    (window as unknown as { DeckyBackend: unknown }).DeckyBackend = { call };
    expect(await cssLoaderThemes()).toEqual([{ name: "Dark", displayName: "Dark", version: "", author: "", enabled: true, patches: [] }]);
    expect(call).toHaveBeenCalledWith("loader/call_legacy_plugin_method", "CSS Loader", "get_themes", {});
    delete (window as unknown as { DeckyBackend?: unknown }).DeckyBackend;
  });
});
