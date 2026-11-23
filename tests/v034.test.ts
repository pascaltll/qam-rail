import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn(async () => null) }));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined }));

import { shortName, sortOutputs, type AudioNode } from "../src/audio";
import { readExtras, type PerfStore } from "../src/steamPerf";
import { withPrefs, RAIL } from "../src/appearance";
import { wifiLevel } from "../src/network";
import { pressFx, setFxStyle } from "../src/fx";

const node = (id: number, nombre: string, tipo: AudioNode["tipo"], activa = false): AudioNode => ({ id, nombre, tipo, activa, volumen: 1, silenciado: false });

describe("sonido", () => {
  it("nombres cortos para las fichas", () => {
    expect(shortName(node(1, "Family 17h HD Audio Controller Speaker", "altavoz"))).toBe("Altavoces");
    expect(shortName(node(2, "Rembrandt Radeon HDMI / DisplayPort 1 Output", "hdmi"))).toBe("HDMI / TV");
    expect(shortName(node(3, "WH-1000XM4", "auriculares"))).toBe("WH-1000XM4");
  });
  it("la activa primero, luego auriculares, HDMI y altavoces", () => {
    const l = sortOutputs([node(1, "a", "altavoz"), node(2, "h", "hdmi"), node(3, "w", "auriculares"), node(4, "b", "altavoz", true)]);
    expect(l.map((x) => x.id)).toEqual([4, 3, 2, 1]);
  });
});

describe("rendimiento avanzado", () => {
  it("solo aparece lo que tiene valor y setter", () => {
    class Store { msgLimits = {}; msgSettingsPerApp = { is_tearing_enabled: false, is_variable_resolution_enabled: true }; msgSettingsGlobal = { perf_overlay_level: 2 };
      SetTearingEnabled(_v: boolean) {} SetPerfOverlayLevel(_v: number) {} }
    const ex = readExtras(new Store() as unknown as PerfStore);
    expect(ex.toggles.map((t) => t.id)).toEqual(["tearing"]); // media resolución sin setter: no sale
    expect(ex.overlay).toEqual({ value: 2, setter: "SetPerfOverlayLevel" });
    expect(readExtras(null)).toEqual({ toggles: [], overlay: null });
  });
});

describe("personalizar", () => {
  it("acento y esquinas encima del tema; sin cambios devuelve la misma paleta", () => {
    expect(withPrefs(RAIL, { radius: "tema", density: "normal", accent: null })).toBe(RAIL);
    const p = withPrefs(RAIL, { radius: "rectas", density: "normal", accent: "#facc15" });
    expect(p.accent).toBe("#facc15");
    expect(p.onAccent).toBe("#111318"); // texto oscuro sobre amarillo
    expect(p.cardRadius).toBe(10);
  });
});

describe("iconos y animación", () => {
  it("nivel de señal del Wi‑Fi", () => {
    expect([10, 30, 60, 90].map(wifiLevel)).toEqual([1, 2, 3, 4]);
  });
  it("la animación al pulsar añade su clase y nunca rompe", () => {
    const b = document.createElement("button");
    document.body.appendChild(b);
    setFxStyle("rebote");
    pressFx({ currentTarget: b });
    expect(b.className).toContain("qr-press-rebote");
    setFxStyle("no");
    const c = document.createElement("button");
    pressFx({ currentTarget: c });
    expect(c.className).toBe("");
    expect(() => pressFx(undefined)).not.toThrow();
  });
});
