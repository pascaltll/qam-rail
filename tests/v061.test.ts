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
