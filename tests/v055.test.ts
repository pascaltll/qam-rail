import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => async () => ({}) }));

import { solid } from "../src/color";
import { missing } from "../src/deskIcons";

describe("0.54.0-dev.55", () => {
  it("missing: solo claves nuevas, sin repetir", () => {
    expect(missing(["a", "b", "a", "c"], new Set(["b"]))).toEqual(["a", "c"]);
    expect(missing([], new Set())).toEqual([]);
  });
  it("solid: quita la transparencia mezclando con negro", () => {
    expect(solid("rgba(24, 26, 34, 0.74)")).toBe("rgb(18, 19, 25)");
    expect(solid("#1b1d23")).toBe("#1b1d23");
    expect(solid("rgb(10, 20, 30)")).toBe("rgb(10, 20, 30)");
  });
});
