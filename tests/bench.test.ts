import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn() }));
vi.mock("../src/panelBridge", () => ({ readTdp: vi.fn(), writeTdp: vi.fn() }));

import { pickLevels, summarize } from "../src/bench";

describe("pickLevels", () => {
  it("reparte niveles enteros incluyendo los extremos", () => {
    expect(pickLevels(3, 25, 5)).toEqual([3, 9, 14, 20, 25]);
  });
  it("sin rango devuelve un solo nivel", () => {
    expect(pickLevels(15, 15)).toEqual([15]);
  });
  it("no repite niveles en rangos estrechos", () => {
    expect(pickLevels(5, 7, 5)).toEqual([5, 6, 7]);
  });
});

describe("summarize", () => {
  const row = (watts: number, score: number | null, powerW: number | null = null) => ({ watts, score, powerW, cpuMhz: null, gpuMhz: null, tempC: null });
  it("normaliza al mejor y calcula puntos por vatio", () => {
    const s = summarize([row(10, 500, 8), row(20, 1000, 25), row(15, null)]);
    expect(s[0].pct).toBe(50);
    expect(s[1].pct).toBe(100);
    expect(s[2].pct).toBeNull();
    expect(s[0].perWatt).toBe(63);   // 500 / 8 W medidos
    expect(s[1].perWatt).toBe(40);   // 1000 / 25 W medidos
  });
  it("sin consumo medido usa el TDP pedido", () => {
    expect(summarize([row(10, 1000)])[0].perWatt).toBe(100);
  });
});
