import { describe, expect, it } from "vitest";
import { MODES, planFor, savingFor } from "../src/gameKind";

const ctx = { onAc: true, saveBattery: false, min: 7, max: 25 };
describe("modos del preset (0.46)", () => {
  it("auto enchufado = como siempre (60 FPS en simple/medio, 40 en exigente)", () => {
    expect(planFor("medio", { ...ctx, mode: "auto" }).fps).toBe(60);
    expect(planFor("exigente", { ...ctx, mode: "auto" }).fps).toBe(40);
  });
  it("ahorro y 30 FPS valen con cargador", () => {
    const a = planFor("medio", { ...ctx, mode: "ahorro" });
    expect(a.fps).toBe(40); expect(a.ceil).toBe(12);
    const m = planFor("medio", { ...ctx, mode: "minimo" });
    expect(m.fps).toBe(30); expect(m.ceil).toBe(10); expect(m.hz).toBe(60);
    expect(planFor("exigente", { ...ctx, mode: "minimo" }).fsr).toBe(true);
  });
  it("30 FPS gasta menos que ahorro y este menos que auto", () => {
    for (const k of ["simple", "medio", "exigente"] as const) {
      const w = (mode: "auto" | "ahorro" | "minimo") => planFor(k, { ...ctx, mode }).ceil as number;
      expect(w("minimo")).toBeLessThanOrEqual(w("ahorro"));
      expect(w("ahorro")).toBeLessThanOrEqual(w("auto"));
    }
  });
  it("una app no cambia con el modo", () => {
    expect(planFor("app", { ...ctx, mode: "minimo" }).fps).toBe(60);
  });
  it("savingFor: pleno nunca ahorra; auto solo sin cargador", () => {
    expect(savingFor("pleno", false)).toBe(false);
    expect(savingFor("auto", true)).toBe(false);
    expect(savingFor("auto", false)).toBe(true);
    expect(savingFor("ahorro", true)).toBe(true);
    expect(MODES.map((m) => m.id)).toEqual(["auto", "ahorro", "minimo", "pleno"]);
  });
});
