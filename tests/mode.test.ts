import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn() }));

import { modeToast, resolveMode } from "../src/mode";
import { buildView } from "../src/tdpModel";
import type { RawTdpState } from "../src/panelBridge";

const g = (key: string, name = "Juego") => ({ key, liveAppid: Number(key) || 1, name });

describe("resolveMode", () => {
  it("sin juego: normal", () => expect(resolveMode(null, false)).toBe("normal"));
  it("con juego: game", () => expect(resolveMode(g("730"), false)).toBe("game"));
  it("con juego pero se pidio ver Inicio normal", () => expect(resolveMode(g("730"), true)).toBe("normal"));
  it("sin juego, 'ver normal' no tiene efecto", () => expect(resolveMode(null, true)).toBe("normal"));
});

describe("modeToast", () => {
  it("mismo juego: sin aviso", () => expect(modeToast(g("1"), g("1"))).toBeNull());
  it("ninguno -> ninguno: sin aviso", () => expect(modeToast(null, null)).toBeNull());
  it("aparece un juego", () => expect(modeToast(null, g("1", "Hades II"))).toBe("Juego: Hades II"));
  it("se cierra el juego", () => expect(modeToast(g("1"), null)).toBe("Juego cerrado"));
  it("cambia de un juego a otro", () => expect(modeToast(g("1"), g("2", "CS2"))).toBe("Juego: CS2"));
});

const raw = (learned: RawTdpState["learned"], extra: Partial<RawTdpState> = {}): RawTdpState => ({
  supported: true, unit: "W", limits: { min: 4, default: 12, max: 15, max_ac: 25 },
  presets: { quiet: 7, balanced: 12, turbo: 15 }, watts: 12, global_watts: 12, applied_w: 12, on_ac: false,
  appid: "730", follows_global: true, tdp_control_enabled: true, learned, ...extra,
});
const game = g("730", "CS2");

describe("sugerencia de potencia (banda aprendida por Panel)", () => {
  it("con datos suficientes: banda y valor habitual dentro del rango", () => {
    const v = buildView(raw({ enough: true, floor: 9, ceil: 14, seed: 11, minutes: 95, target_minutes: 30 }), null, game);
    expect(v.suggestion).toEqual({ enough: true, floor: 9, ceil: 14, seed: 11, minutes: 95, target: 30, learning: false });
  });
  it("recorta la banda al rango actual (p. ej. sin cargador)", () => {
    const v = buildView(raw({ enough: true, floor: 9, ceil: 22, seed: 20, minutes: 60, target_minutes: 30 }), null, game);
    expect(v.suggestion?.ceil).toBe(15);
    expect(v.suggestion?.seed).toBe(15);
  });
  it("el valor habitual nunca queda fuera de la banda", () => {
    const v = buildView(raw({ enough: true, floor: 9, ceil: 14, seed: 6, minutes: 60, target_minutes: 30 }), null, game);
    expect(v.suggestion?.seed).toBe(9);
  });
  it("sin datos suficientes pero con progreso: 'aprendiendo'", () => {
    const v = buildView(raw({ enough: false, reason: "one_level", minutes: 12, target_minutes: 30 }), null, game);
    expect(v.suggestion).toMatchObject({ enough: false, learning: true, minutes: 12, target: 30, floor: null, seed: null });
  });
  it("sin ningun dato: no se muestra progreso falso", () => {
    const v = buildView(raw({ enough: false, reason: "no_data", minutes: 0, target_minutes: 30 }), null, game);
    expect(v.suggestion?.learning).toBe(false);
  });
  it("aprendizaje desactivado o error: sin progreso", () => {
    expect(buildView(raw({ enough: false, reason: "disabled", minutes: 40, target_minutes: 30 }), null, game).suggestion?.learning).toBe(false);
    expect(buildView(raw({ enough: false, reason: "error", minutes: 40, target_minutes: 30 }), null, game).suggestion?.learning).toBe(false);
  });
  it("sin juego en marcha no hay sugerencia", () => {
    const v = buildView(raw({ enough: true, floor: 9, ceil: 14, seed: 11, minutes: 60, target_minutes: 30 }, { appid: null }), null, null);
    expect(v.suggestion).toBeNull();
  });
  it("datos corruptos (NaN) no producen banda", () => {
    const v = buildView(raw({ enough: true, floor: NaN, ceil: 14, seed: 11, minutes: 60, target_minutes: 30 }), null, game);
    expect(v.suggestion?.enough).toBe(false);
  });
});
