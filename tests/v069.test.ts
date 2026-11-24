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
  it("selfSummary resume la autoprueba", async () => {
    const { selfSummary } = await import("../src/QamNavTrace");
    expect(selfSummary(null)).toBe("Aún sin probar");
    expect(selfSummary({ ok: false, error: "no hay app", steps: [] })).toBe("no hay app");
    const ok = { name: "a", ok: true, detail: "", ms: 1 };
    expect(selfSummary({ ok: true, steps: [ok, ok] })).toBe("2 de 2 bien");
    expect(selfSummary({ ok: false, steps: [ok, { name: "scroll", ok: false, detail: "x", ms: null }] })).toBe("1 fallo de 2: scroll");
  });
});
