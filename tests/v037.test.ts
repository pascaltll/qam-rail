import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn(async () => null) }));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined, getGamepadNavigationTrees: () => [] }));

import { hzFor, kindChosen, kindOf, planFor, saveOf, setKind, setSave } from "../src/gameKind";
import { situationOf } from "../src/situation";
import { activeHomeMode, loadHomeModes, onHomeModesChange } from "../src/homeModes";

describe("una sola elección de tipo de juego", () => {
  beforeEach(() => window.localStorage.clear());
  it("sin elegir: por el nombre (emulador → simple) o medio", () => {
    expect(kindOf("1", "RetroArch")).toBe("simple");
    expect(kindOf("2", "Cyberpunk 2077")).toBe("medio");
    expect(kindChosen("2")).toBe(false);
  });
  it("elegir el tipo cambia el modo de Inicio de ese juego, y avisa", () => {
    const f = vi.fn();
    const off = onHomeModesChange(f);
    setKind("730", "exigente");
    off();
    expect(kindOf("730")).toBe("exigente");
    expect(kindChosen("730")).toBe(true);
    expect(activeHomeMode(loadHomeModes(), { key: "730", name: "x" }, false)).toBe("juego-exigente");
    expect(f).toHaveBeenCalled();
  });
  it("adopta lo elegido en 0.36 una sola vez y conserva «ahorrar batería»", () => {
    window.localStorage.setItem("qam-rail:gamekind", JSON.stringify({ "9": { kind: "simple", save: true } }));
    expect(kindOf("9", "Juego")).toBe("simple");
    expect(loadHomeModes().perGame["9"]).toBe("juego-retro");
    expect(saveOf("9")).toBe(true);
    setSave("9", null);
    expect(saveOf("9")).toBeNull();
  });
});

describe("apps abiertas y 40 FPS (0.38)", () => {
  beforeEach(() => window.localStorage.clear());
  it("un navegador, YouTube o el lanzador no son un juego", () => {
    expect(kindOf("a", "Mozilla Firefox")).toBe("app");
    expect(kindOf("b", "hub")).toBe("app");
    expect(kindOf("c", "MiniTube")).toBe("app");
    expect(kindOf("d", "Metro 2033 Redux")).toBe("medio");
    expect(activeHomeMode(loadHomeModes(), { key: "a", name: "Mozilla Firefox" }, false)).toBe("pelicula");
  });
  it("se puede corregir a mano en los dos sentidos", () => {
    setKind("b", "simple"); expect(kindOf("b", "hub")).toBe("simple");
    setKind("d", "app"); expect(kindOf("d", "Metro 2033 Redux")).toBe("app");
  });
  it("el modo «amigos» guardado de antes cae en escritorio", () => {
    window.localStorage.setItem("qam-rail:home-modes", JSON.stringify({ manual: "amigos", perGame: {}, pins: {} }));
    expect(activeHomeMode(loadHomeModes(), null, false)).toBe("escritorio");
  });
  it("app: 60 FPS con pocos vatios; sus pruebas se guardan aparte", () => {
    expect(planFor("app", { onAc: true, saveBattery: false, min: 7, max: 25 })).toMatchObject({ fps: 60, watts: 8, fsr: false });
    expect(situationOf(true, 1921, true, "app").key).toBe("app-cargador");
    expect(situationOf(true, 1921, false, "medio").key).toBe("juego.medio");
  });
  it("40 FPS piden la pantalla a 80 Hz (Steam solo limita a divisores del refresco)", () => {
    expect(hzFor(40, 40, 120)).toBe(80);
    expect(hzFor(30, 40, 120)).toBe(60);
    expect(hzFor(40, 60, 60)).toBeNull();
  });
});

describe("vatios por tipo (rangos pedidos el 12‑11)", () => {
  const c = { onAc: true, saveBattery: false, min: 7, max: 30 };
  it("Simple 7–10 · Medio 10–15 · Exigente 15–máximo", () => {
    expect(planFor("simple", c)).toMatchObject({ fps: 60, floor: 7, ceil: 10 });
    expect(planFor("medio", c)).toMatchObject({ fps: 60, floor: 10, ceil: 15 });
    expect(planFor("exigente", c)).toMatchObject({ fps: 40, floor: 15, ceil: 30 });
  });
  it("ahorrando batería baja un escalón y el punto de partida queda dentro del rango", () => {
    const p = planFor("exigente", { ...c, onAc: false, saveBattery: true });
    expect([p.floor, p.ceil]).toEqual([12, 18]);
    expect(p.watts).toBeGreaterThanOrEqual(12); expect(p.watts).toBeLessThanOrEqual(18);
    expect(planFor("simple", { ...c, learnedSeed: 20 }).watts).toBe(10);
    expect(planFor("medio", { ...c, learnedSeed: 6 }).watts).toBe(10);
  });
  it("una app no persigue FPS: sin rango", () => {
    expect(planFor("app", c)).toMatchObject({ floor: null, ceil: null });
  });
  it("pantalla: enchufado el doble de los FPS (hasta el máximo); en batería, igual que los FPS", () => {
    expect(planFor("simple", c).hz).toBe(120);
    expect(planFor("exigente", c).hz).toBe(80);
    expect(planFor("simple", { ...c, onAc: false, saveBattery: true }).hz).toBe(60); // 30 FPS: la pantalla no baja de 40 Hz
    expect(planFor("exigente", { ...c, onAc: false }).hz).toBe(40);
    expect(planFor("medio", { ...c, maxHz: 90 }).hz).toBe(90);
  });
  it("el equipo manda: si su máximo es menor, el rango se encoge sin invertirse", () => {
    const p = planFor("exigente", { ...c, max: 12 });
    expect(p.floor).toBe(12); expect(p.ceil).toBe(12);
  });
});
