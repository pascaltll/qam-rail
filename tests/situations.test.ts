import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn() }));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined, getGamepadNavigationTrees: () => [] }));

import { sectionLabel } from "../src/diagStore";
import { BTN, gridTarget } from "../src/nav";
import { scriptName, summarizeLoaf } from "../src/perfLog";
import { situationOf } from "../src/situation";
import { ecoPatchOf, ecoPlan } from "../src/themeEco";

describe("situaciones", () => {
  it("clave y etiqueta", () => {
    expect(situationOf(false, 1920, false)).toMatchObject({ key: "escritorio", tv: false });
    expect(situationOf(true, 3840, true, "exigente")).toMatchObject({ key: "juego.exigente-tv-cargador", tv: true, label: "Juego exigente · pantalla externa/4K · con cargador" });
    expect(situationOf(true, 1280, null).key).toBe("juego.medio");
  });
  it("nombre legible de las secciones por situación", () => {
    expect(sectionLabel("fluidez@juego-tv")).toBe("Fluidez · jugando · 4K/TV");
    expect(sectionLabel("juego@juego.simple-cargador")).toBe("Con juego · juego simple · cargador");
    expect(sectionLabel("contrato-panel")).toBe("Contrato con Panel");
  });
});

describe("atribución de fotogramas lentos", () => {
  it("separa lo nuestro de Steam y de otros plugins", () => {
    const r = summarizeLoaf({
      duration: 140, startTime: 0, renderStart: 120,
      scripts: [
        { duration: 30, sourceURL: "http://127.0.0.1:1337/plugins/QAM%20Rail/dist/index.js?x=1", sourceFunctionName: "tick" },
        { duration: 70, sourceURL: "https://steamloopback.host/chunk~2dcc5aaf7.js", forcedStyleAndLayoutDuration: 5 },
        { duration: 10, sourceURL: "http://127.0.0.1:1337/plugins/QAM%20Rail%20Amigos/dist/index.js" },
      ],
    });
    expect(r).toEqual({ ms: 140, own: 30, lay: 25, d: "chunk~2dcc5aaf7.js 70 | QAM Rail:tick 30" });
    expect(scriptName({ duration: 1, sourceURL: "http://127.0.0.1:1337/plugins/LetMeReShade/dist/index.js" })).toBe("LetMeReShade");
  });
});

describe("navegación por filas (modelo TV)", () => {
  // Fila 0: barra de modos (3); fila 1: potencia (1, ancha); fila 2: 2 deslizadores; fila 3: 4 iconos; extra: reproductor (2)
  const r = (l: number, t: number, w: number, h: number) => ({ left: l, right: l + w, top: t, bottom: t + h });
  const rects = [r(0, 0, 80, 26), r(90, 0, 80, 26), r(180, 0, 80, 26), r(0, 40, 380, 120), r(0, 170, 180, 60), r(200, 172, 180, 58),
    r(0, 240, 84, 90), r(86, 243, 84, 90), r(172, 240, 84, 90), r(258, 243, 84, 90), r(0, 300, 180, 40), r(200, 300, 180, 40)];
  it("filas por solape vertical, aunque los tops difieran un poco", async () => {
    const { visualRows } = await import("../src/nav");
    expect(visualRows(rects.slice(0, 10))).toEqual([[0, 1, 2], [3], [4, 5], [6, 7, 8, 9]]);
  });
  it("arriba/abajo cambia de fila (con memoria), lados dentro de la fila, bordes se quedan, reproductor al final", async () => {
    const { listTarget } = await import("../src/nav");
    const extra = [10, 11];
    expect(listTarget(rects, 3, BTN.DOWN, { extra })).toBe(4);
    expect(listTarget(rects, 5, BTN.DOWN, { extra })).toBe(9);
    expect(listTarget(rects, 9, BTN.DOWN, { extra })).toBe(11);
    expect(listTarget(rects, 10, BTN.UP, { extra })).toBe(7);
    expect(listTarget(rects, 11, BTN.DOWN, { extra })).toBe(-1);
    expect(listTarget(rects, 0, BTN.UP, { extra })).toBe(-1);
    expect(listTarget(rects, 9, BTN.RIGHT, { extra })).toBe(-1);
    expect(listTarget(rects, 6, BTN.RIGHT, { extra })).toBe(7);
    expect(listTarget(rects, 3, BTN.UP, { extra, remembered: () => 2 })).toBe(2);
  });
});

describe("rejilla de iconos", () => {
  // 4 por fila; la 2.ª fila con 2 iconos.
  const R = (col: number, row: number) => ({ left: col * 86, right: col * 86 + 84, top: row * 100 + (col % 2 ? 3 : 0), bottom: row * 100 + 90 });
  const rects = [R(0, 0), R(1, 0), R(2, 0), R(3, 0), R(0, 1), R(1, 1)];
  it("abajo va al de debajo (no al extremo)", () => {
    expect(gridTarget(rects, 1, BTN.DOWN)).toBe(5);
    expect(gridTarget(rects, 3, BTN.DOWN)).toBe(5); // el mas cercano de la fila corta
    expect(gridTarget(rects, 4, BTN.UP)).toBe(0);
  });
  it("izquierda/derecha en la misma fila; bordes se quedan; fuera por arriba/abajo", () => {
    expect(gridTarget(rects, 1, BTN.RIGHT)).toBe(2);
    expect(gridTarget(rects, 3, BTN.RIGHT)).toBe(-1);
    expect(gridTarget(rects, 4, BTN.LEFT)).toBe(-1);
    expect(gridTarget(rects, 0, BTN.UP)).toBeNull();
    expect(gridTarget(rects, 5, BTN.DOWN)).toBeNull();
  });
});

describe("modo eficiencia de los temas", () => {
  const theme = (patches: Array<{ name: string; value: string; options: string[] }>) => ({ name: "Luminous", displayName: "Luminous", version: "1", author: "Hooandee", enabled: true, patches: patches.map((p) => ({ ...p, type: "checkbox" })) });
  it("encuentra la opción y sus valores", () => {
    expect(ecoPatchOf(theme([{ name: "Fondo", value: "Sí", options: ["No", "Sí"] }, { name: "Modo eficiencia", value: "No", options: ["No", "Yes"] }])))
      .toEqual({ theme: "Luminous", patch: "Modo eficiencia", on: "Yes", off: "No", value: "No" });
    expect(ecoPatchOf(theme([{ name: "Efficiency", value: "Off", options: ["Off", "Low", "On"] }]))?.on).toBe("On");
    expect(ecoPatchOf(theme([{ name: "Color", value: "Azul", options: ["Azul", "Rojo"] }]))).toBeNull();
  });
  it("activa con potencia baja y devuelve solo lo que cambió", () => {
    const p = { theme: "L", patch: "Eco", on: "Yes", off: "No", value: "No" };
    expect(ecoPlan([p], true, {})).toEqual([{ p, value: "Yes", remember: "No" }]);
    expect(ecoPlan([{ ...p, value: "Yes" }], true, {})).toEqual([]);
    expect(ecoPlan([{ ...p, value: "Yes" }], false, { "L::Eco": "No" })).toEqual([{ p: { ...p, value: "Yes" }, value: "No", forget: true }]);
    expect(ecoPlan([{ ...p, value: "Yes" }], false, {})).toEqual([]); // lo puso el usuario: no se toca
  });
});
