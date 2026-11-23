import { describe, expect, it, vi } from "vitest";

const appended: unknown[][] = [];
vi.mock("@decky/api", () => ({ callable: (name: string) => vi.fn(async (x: unknown[]) => { if (name === "perf_append") appended.push(x); return "/ruta"; }) }));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined }));

import { fluencyLevels, frameStats, pct } from "../src/perfBench";
import { flush, markClosed, markCloseReason, noteInputFocus, record, recentEvents, summary } from "../src/perfLog";

describe("prueba de fluidez (puro)", () => {
  it("niveles con peso en los bajos, sin repetir y dentro del rango", () => {
    expect(fluencyLevels(3, 15)).toEqual([3, 5, 7, 9, 15]);
    expect(fluencyLevels(3, 15, true)).toEqual([3, 9, 15]);
    expect(fluencyLevels(4, 6)).toEqual([4, 5, 6]);
    expect(fluencyLevels(8, 8)).toEqual([8]);
  });
  it("estadisticas de fotogramas", () => {
    const st = frameStats([16.7, 16.7, 16.7, 50, 16.7]);
    expect(st.frames).toBe(5);
    expect(st.slowPct).toBe(20);
    expect(st.worst).toBe(50);
    expect(st.fps).toBeCloseTo(42.4, 0);
    expect(frameStats([]).fps).toBeNull();
    expect(pct([5, 1, 3], 0.5)).toBe(3);
  });
});

describe("registro de rendimiento", () => {
  it("motivo de cierre: el propio o «steam» si no hay; anota si fue justo tras tocar un campo de texto", () => {
    markCloseReason("B en el riel");
    markClosed("home");
    noteInputFocus();
    markClosed("social");
    const closes = recentEvents().filter((e) => e.k === "close");
    expect(closes[0].d).toBe("B en el riel");
    expect(closes[1].d).toMatch(/^steam \(sin motivo propio\) · \d+ ms tras tocar un campo de texto$/);
  });
  it("resumen por potencia y guardado por lotes", async () => {
    record("open", { ms: 120 });
    record("switch", { ms: 40 });
    record("longtask", { ms: 90 });
    const b = summary();
    expect(b[0].opens).toContain(120);
    expect(b[0].longtasks).toContain(90);
    await flush();
    expect(appended.flat().length).toBeGreaterThan(3);
  });
});
