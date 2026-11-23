import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => async () => ({}) }));

import { boostNote, boostPct } from "../src/audio";

describe("0.54.0-dev.61 refuerzo de volumen", () => {
  it("boostPct: entre 100 y 200 en saltos de 10", () => {
    expect(boostPct(0.4)).toBe(100);
    expect(boostPct(null)).toBe(100);
    expect(boostPct(1.23)).toBe(120);
    expect(boostPct(1.5)).toBe(150);
    expect(boostPct(2.6)).toBe(200);
  });
  it("boostNote: avisa por encima de 160", () => {
    expect(boostNote(100)).toBe("Normal");
    expect(boostNote(120)).toBe("Más fuerte");
    expect(boostNote(150)).toMatch(/graves/);
    expect(boostNote(200)).toMatch(/distorsionar/);
  });
});
