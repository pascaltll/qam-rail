import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => async () => ({}) }));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined, getGamepadNavigationTrees: () => [], Focusable: () => null }));

describe("0.54.0-dev.69 grabadora de navegación", () => {
  it("traceElapsed y las marcas", async () => {
    const { traceElapsed, TRACE_MARKS } = await import("../src/QamNavTrace");
    expect(traceElapsed(0)).toBe("0:00");
    expect(traceElapsed(75)).toBe("1:15");
    expect(TRACE_MARKS.map((m) => m[0])).toEqual(["lento", "no respondió", "no abrió", "scroll mal"]);
  });
});
