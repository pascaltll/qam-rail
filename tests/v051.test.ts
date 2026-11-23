import { describe, it, expect, vi } from "vitest";
vi.mock("@decky/api", () => ({ callable: () => async () => ({ ok: true }) }));
import { updateLabel } from "../src/qamApps";

describe("actualizaciones de GitHub", () => {
  it("texto del botón", () => {
    expect(updateLabel({ state: "update", latest: "3.13.0" })).toBe("Actualizar a 3.13.0");
    expect(updateLabel({ state: "update", latest: "3.14.0-beta", prerelease: true })).toBe("Actualizar a 3.14.0-beta (beta)");
  });
  it("sin novedad no hay botón", () => {
    expect(updateLabel(undefined)).toBeNull();
    expect(updateLabel({ state: "current", latest: "3.12" })).toBeNull();
    expect(updateLabel({ state: "error", error: "x" })).toBeNull();
  });
});
