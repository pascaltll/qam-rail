import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => async () => ({}) }));

import { boostNote } from "../src/audio";

describe("0.54.0-dev.61 refuerzo de volumen", () => {
  it("boostNote: avisa por encima de 160", () => {
    expect(boostNote(100)).toBe("Normal");
    expect(boostNote(120)).toBe("Más fuerte");
    expect(boostNote(150)).toMatch(/graves/);
    expect(boostNote(200)).toMatch(/distorsionar/);
  });
});

vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined, getGamepadNavigationTrees: () => [] }));

describe("0.54.0-dev.65 esquinas concéntricas", () => {
  it("nestedRadius: radio de fuera menos el margen, nunca bajo 10", async () => {
    const { nestedRadius } = await import("../src/ui");
    expect(nestedRadius(28)).toBe(16);
    expect(nestedRadius(22)).toBe(10);
    expect(nestedRadius(10)).toBe(10);
  });
});

import { readTokens, parseStroke, parseTransform, buildPalette } from "../src/appearance";
describe("v066 tokens de Panel", () => {
  it("lee radius-sm, stroke y label-transform", () => {
    const m: Record<string, string> = { "--pdc-theme-radius-sm": "6px", "--pdc-theme-stroke": "2", "--pdc-theme-label-transform": "none" };
    const t = readTokens((p) => m[p] ?? "");
    expect(t.radiusSm).toBe(6); expect(t.stroke).toBe(2); expect(t.labelTransform).toBe("none");
    expect(parseStroke("abc")).toBeNull(); expect(parseTransform("weird")).toBeNull();
    const p = buildPalette("panel", { accentPref: null, tokens: t, doc: null });
    expect(p.radiusSm).toBe(10); expect(p.stroke).toBe(2); expect(p.labelTransform).toBe("none");
  });
  it("nestedRadius usa radius-sm si existe", async () => {
    const { nestedRadius } = await import("../src/ui");
    expect(nestedRadius(22, 10)).toBe(10); expect(nestedRadius(22)).toBe(10); expect(nestedRadius(28, 20)).toBe(20);
  });
});
