import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn(async () => null) }));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined, getGamepadNavigationTrees: () => [] }));
vi.mock("../src/panelBridge", () => ({ callPanel: vi.fn(), rpc: { state: vi.fn() } }));

import { nearestFps, planFor } from "../src/gameKind";
import { unknownTags } from "../src/social";
import { renderBB } from "../src/bbcode";

const ctx = (o: Partial<Parameters<typeof planFor>[1]> = {}) => ({ onAc: true, saveBattery: false, min: 4, max: 25, ...o });

describe("tipo de juego", () => {
  it("exigente: mínimo 40 FPS; sin cargador usa reescalado", () => {
    expect(planFor("exigente", ctx())).toMatchObject({ fps: 40, fsr: false });
    expect(planFor("exigente", ctx({ onAc: false }))).toMatchObject({ fps: 40, fsr: true });
    expect(planFor("exigente", ctx({ onAc: false, saveBattery: true }))).toMatchObject({ fps: 30, fsr: true });
  });
  it("medio: 60 enchufado y 30 si se quiere que dure la batería", () => {
    expect(planFor("medio", ctx()).fps).toBe(60);
    expect(planFor("medio", ctx({ onAc: false })).fps).toBe(60);
    expect(planFor("medio", ctx({ onAc: false, saveBattery: true })).fps).toBe(30);
  });
  it("simple: 60, y 30 en batería ahorrando; pocos vatios", () => {
    const a = planFor("simple", ctx()), b = planFor("simple", ctx({ onAc: false, saveBattery: true }));
    expect([a.fps, b.fps]).toEqual([60, 30]);
    expect(b.watts).toBeLessThan(a.watts + 1);
  });
  it("los vatios respetan el rango del equipo y lo aprendido manda", () => {
    expect(planFor("exigente", ctx({ max: 15 })).watts).toBe(15);
    expect(planFor("medio", ctx({ learnedSeed: 10 })).watts).toBe(10);
  });
  it("opción de FPS más cercana (sin contar «sin límite»)", () => {
    expect(nearestFps([0, 15, 30, 60], 40)).toBe(30);
    expect(nearestFps([0, 30, 40, 60], 40)).toBe(40);
    expect(nearestFps([0, 30, 60], 45)).toBe(60); // empate → la mayor
    expect(nearestFps([0], 40)).toBeNull();
  });
});

describe("efectos del chat", () => {
  it("detecta etiquetas desconocidas y no las conocidas", () => {
    expect(unknownTags('hola [b]x[/b] [sticker type="a"][/sticker]')).toEqual([]);
    expect(unknownTags("[fireworks][/fireworks]")).toEqual(["fireworks"]);
    expect(unknownTags("[chateffect=confetti]")).toEqual(["chateffect"]);
  });
  it("una etiqueta desconocida vacía se pinta como efecto, no se pierde", () => {
    const nodes = renderBB("[fireworks][/fireworks]");
    expect(JSON.stringify(nodes)).toContain("Efecto");
    expect(JSON.stringify(renderBB("[b]hola[/b]"))).not.toContain("Efecto");
  });
});
