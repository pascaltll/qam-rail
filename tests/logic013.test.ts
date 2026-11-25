import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined }));
vi.mock("@decky/api", () => ({ callable: () => vi.fn() }));

import { neighbor, rowOf } from "../src/nav";
import { once } from "../src/tap";
import { bump, rank, type Usage } from "../src/pluginUsage";
import { readPerf, step, type PerfStore } from "../src/steamPerf";
import { batteryLine, colorTarget, looks } from "../src/panelExtra";

describe("nav", () => {
  const rows = [{ top: 0, bottom: 40 }, { top: 0, bottom: 40 }, { top: 50, bottom: 90 }, { top: 100, bottom: 140 }];
  it("detecta primera, ultima, unica y media fila", () => {
    expect(rowOf(rows[0], rows)).toBe("first");
    expect(rowOf(rows[3], rows)).toBe("last");
    expect(rowOf(rows[2], rows)).toBe("middle");
    expect(rowOf(rows[0], [rows[0], rows[1]])).toBe("only");
  });
  it("vecino sin dar la vuelta", () => {
    expect(neighbor(0, 6, -1)).toBeNull();
    expect(neighbor(5, 6, 1)).toBeNull();
    expect(neighbor(2, 6, 1)).toBe(3);
  });
});

describe("toque unico", () => {
  it("ignora la segunda llamada dentro de 350 ms", () => {
    let t = 0;
    const fn = vi.fn();
    const h = once(fn, 350, () => t);
    h(); t = 100; h(); t = 400; h();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("plugins frecuentes", () => {
  const names = ["Colores", "Decky Framegen", "ToMoon", "Animation Changer", "CSS Loader"];
  const empty: Usage = { normal: {}, game: {} };
  it("sin usos: lista por defecto de cada modo", () => {
    expect(rank(names, empty, "normal")).toEqual(["ToMoon", "Animation Changer", "Colores"]);
    expect(rank(names, empty, "game")).toEqual(["Colores", "Decky Framegen", "ToMoon"]);
  });
  it("los usos mandan y son por modo", () => {
    let u = empty;
    u = bump(u, "game", "CSS Loader"); u = bump(u, "game", "CSS Loader");
    expect(rank(names, u, "game")[0]).toBe("CSS Loader");
    expect(rank(names, u, "normal")).not.toContain("CSS Loader");
  });
});

describe("ajustes de Steam", () => {
  const base = (): PerfStore => ({
    msgLimits: {
      is_vrr_supported: true, disable_refresh_rate_management: false, is_manual_display_refresh_rate_available: true,
      display_refresh_manual_hz_min: 40, display_refresh_manual_hz_max: 90, fps_limit_options: [0, 30, 45, 90],
      split_scaling_scalers_available: [1, 3, 5], split_scaling_filters_available: [1, 3], fsr_sharpness_min: 0, fsr_sharpness_max: 20,
    },
    msgSettingsPerApp: { is_vrr_enabled: true, display_refresh_manual_hz: 90, fps_limit: 45, split_scaling_scaler: 3, split_scaling_filter: 3, fsr_sharpness: 2 },
    SetVRREnabled: () => {}, SetDisplayRefreshRateManualHz: () => {}, SetFPSLimit: () => {}, SetSplitScalingScaler: () => {}, SetSplitScalingFilter: () => {}, SetFSRSharpness: () => {},
  });
  it("lee todo lo que Steam ofrece", () => {
    const v = readPerf(base())!;
    expect(v.vrr).toEqual({ on: true });
    expect(v.refresh?.options.length).toBe(51);
    expect(v.fps?.options.map((o) => o.label)).toEqual(["Sin límite", "30", "45", "90"]);
    expect(v.scaler?.options.map((o) => o.label)).toEqual(["Auto", "Ajustar", "Estirar"]);
    expect(v.sharp).toEqual({ kind: "fsr", value: 2, min: 0, max: 20 });
  });
  it("no inventa: sin soporte de VRR, sin gestion de refresco o sin setter, el control desaparece", () => {
    const s = base();
    s.msgLimits!.is_vrr_supported = false;
    s.msgLimits!.disable_refresh_rate_management = true;
    delete s.SetSplitScalingScaler;
    const v = readPerf(s)!;
    expect(v.vrr).toBeNull();
    expect(v.refresh).toBeNull();
    expect(v.fps).toBeNull();
    expect(v.scaler).toBeNull();
    expect(readPerf(null)).toBeNull();
  });
  it("step es ciclico", () => {
    expect(step([0, 30, 60], 60, 1)).toBe(0);
    expect(step([0, 30, 60], 99, 1)).toBe(30);
  });
});

describe("Panel: color, ambito y bateria", () => {
  it("looks: nativo primero, OLED solo si el panel lo ofrece", () => {
    const l = looks({ supported: true, presets: ["native", "cine"], active_preset: "cine", oled_look: {} });
    expect(l.map((x) => x.label)).toEqual(["Nativo", "OLED", "Cine"]);
    expect(l.find((x) => x.active)?.key).toBe("cine");
    expect(looks({ supported: true, presets: ["native"], oled_look: null }).map((x) => x.key)).toEqual(["native"]);
    expect(looks({ supported: false })).toEqual([]);
  });
  it("ambito: con juego siempre el juego; sin juego, global", () => {
    expect(colorTarget({ appid: "730" })).toEqual({ scope: "game", appid: "730", ctx: "730" });
    expect(colorTarget({ appid: null })).toEqual({ scope: "global", appid: null, ctx: null });
    expect(colorTarget(null)).toEqual({ scope: "global", appid: null, ctx: null });
  });
  it("linea de bateria solo con datos reales", () => {
    expect(batteryLine({ battery: { present: true, percent: 50.4, eta_seconds: 4500, health_percent: 90 } })).toBe("50 % · 1 h 15 min restantes · salud 90 %");
    expect(batteryLine({ battery: { present: false } })).toBeNull();
  });
});
