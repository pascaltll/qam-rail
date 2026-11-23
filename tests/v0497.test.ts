import { describe, expect, it } from "vitest";
import { looks, mergeColor, type ColorState } from "../src/panelExtra";

const base: ColorState = { supported: true, presets: ["native", "cine", "vivo"], active_preset: "native", oled_look: { saturation: 120 }, appid: null, follows_global: true };

describe("mergeColor: la respuesta de Panel no borra el selector de looks", () => {
  it("una respuesta parcial conserva los looks (si no, el selector desaparece con el foco encima)", () => {
    const m = mergeColor(base, { active_preset: "cine" });
    expect(looks(m).map((l) => l.key)).toEqual(["native", "oled", "cine", "vivo"]);
    expect(m?.active_preset).toBe("cine");
  });
  it("una respuesta completa manda", () => {
    const m = mergeColor(base, { supported: true, presets: ["native", "cine"], active_preset: "cine" });
    expect(m?.presets).toEqual(["native", "cine"]);
  });
  it("presets vacios no vacian la lista; sin estado previo se usa la respuesta", () => {
    expect(mergeColor(base, { presets: [], active_preset: "vivo" })?.presets).toEqual(["native", "cine", "vivo"]);
    expect(mergeColor(null, base)).toBe(base);
    expect(mergeColor(base, null)).toBe(base);
  });
});
