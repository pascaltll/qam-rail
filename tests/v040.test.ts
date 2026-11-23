import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn(async () => null) }));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined, getGamepadNavigationTrees: () => [] }));

import { applyFpsTarget, fallbackFps, type FpsIo } from "../src/fpsTarget";
import { buildLabel, upscalerFacts } from "../src/panelExtra";

/** Steam de mentira: las opciones de FPS son divisores del refresco (como en el Ally). */
function fakeSteam(o: { hz?: number; fps?: number; follows?: boolean; accept?: boolean } = {}) {
  const st = { hz: o.hz ?? 120, fps: o.fps ?? 60 };
  const opts = () => (o.follows === false ? [30, 60, 120, 0] : [st.hz / 4, st.hz / 2, st.hz, 0].filter((x) => Number.isInteger(x)));
  const io: FpsIo = {
    read: () => ({ fps: { value: st.fps, options: opts() }, hz: { value: st.hz, min: 40, max: 120 } }),
    setRefresh: (hz) => { st.hz = hz; },
    setFps: (v) => { if (o.accept !== false && opts().includes(v)) st.fps = v; },
    wait: async () => undefined,
  };
  return { io, st };
}

describe("meta de FPS comprobada", () => {
  it("40 FPS: pone la pantalla a 80 Hz, espera a que Steam ofrezca 40 y lo deja", async () => {
    const { io, st } = fakeSteam();
    const r = await applyFpsTarget(40, io);
    expect(r).toMatchObject({ ok: true, fps: 40, hz: 80 });
    expect(st).toEqual({ hz: 80, fps: 40 });
  });
  it("60 FPS ya está entre las opciones: no toca el refresco", async () => {
    const { io, st } = fakeSteam({ fps: 30 });
    expect(await applyFpsTarget(60, io)).toMatchObject({ ok: true, fps: 60, hz: null });
    expect(st.hz).toBe(120);
  });
  it("si Steam no llega a ofrecer 40: refresco como estaba y la opción más baja que cumple (60, no 30)", async () => {
    const { io, st } = fakeSteam({ follows: false, fps: 30 });
    const r = await applyFpsTarget(40, io);
    expect(r.ok).toBe(false);
    expect(st).toEqual({ hz: 120, fps: 60 });
    expect(r.nota).toContain("queda en 60");
  });
  it("si Steam no acepta el cambio, lo dice", async () => {
    const { io } = fakeSteam({ accept: false });
    const r = await applyFpsTarget(40, io);
    expect(r.ok).toBe(false);
    expect(r.nota).toContain("no aceptó");
  });
  it("opción de reserva", () => {
    expect(fallbackFps([30, 60, 120, 0], 40)).toBe(60);
    expect(fallbackFps([30, 0], 40)).toBe(30);
    expect(fallbackFps([0], 40)).toBeNull();
  });
});

describe("reescaladores de Panel", () => {
  it("nombre legible de la compilación", () => {
    expect(buildLabel("fsr-4.0.2")).toBe("FSR 4.0.2");
    expect(buildLabel("xess_2.1")).toBe("XeSS 2.1");
    expect(buildLabel(undefined)).toBe("Reescalador");
  });
  it("muestra la configuración del juego, sin controles", () => {
    const g = { install: { build: "fsr-4.0.2", options: { quality: "balanced", sharpness: "off", fg: "on" as const } } };
    expect(upscalerFacts(g, { fg: false, fps: 41.6 })).toEqual([
      ["Calidad", "Equilibrado", true], ["Nitidez", "no", false], ["Generar fotogramas", "no", false], ["FPS ahora", "42", true],
    ]);
    expect(upscalerFacts({ install: { build: "x", options: {} }, solution: { quality: { owner: "game" } } }, null)).toEqual([["Calidad", "la del juego", true]]);
  });
});
