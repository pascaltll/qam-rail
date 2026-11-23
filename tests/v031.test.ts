import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn(async () => null) }));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined, getGamepadNavigationTrees: () => [] }));
vi.mock("../src/panelBridge", () => ({ callPanel: vi.fn(), rpc: { state: vi.fn() } }));

import { afterCalm, extendCalm, featureOn, featuresOff, inCalm, resetCalmForTest, setAllFeatures, setFeature, startCalm } from "../src/calm";
import { racing, raceAction, shouldAutoPause } from "../src/music";
import { audioGone, type BzState } from "../src/network";

describe("calma", () => {
  beforeEach(() => { resetCalmForTest(); window.localStorage.clear(); vi.useRealTimers(); });
  it("nunca se acorta", () => {
    expect(extendCalm(0, 1000, 500)).toBe(1500);
    expect(extendCalm(5000, 1000, 500)).toBe(5000);
  });
  it("aplaza lo de fondo y lo recupera una sola vez por clave", () => {
    vi.useFakeTimers();
    const f = vi.fn();
    startCalm("arranque de juego", 1000);
    expect(inCalm()).toBe(true);
    afterCalm(f, "temaEco"); afterCalm(f, "temaEco");
    expect(f).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1200);
    expect(inCalm()).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it("sin calma se ejecuta al momento", () => { const f = vi.fn(); afterCalm(f); expect(f).toHaveBeenCalled(); });
});

describe("aislar funciones", () => {
  beforeEach(() => window.localStorage.clear());
  it("por defecto todo como siempre salvo medir la salida", () => {
    expect(featureOn("pantalla")).toBe(true);
    expect(featureOn("salida")).toBe(false);
    expect(featuresOff()).toEqual(["salida"]);
  });
  it("apagar una, apagar todo y volver", () => {
    setFeature("temaEco", false);
    expect(featureOn("temaEco")).toBe(false);
    setAllFeatures(false);
    expect(featuresOff().length).toBe(6);
    setAllFeatures(true);
    expect(featuresOff()).toEqual(["salida"]);
  });
});

describe("música sin salida de audio", () => {
  it("detecta el contador corriendo solo", () => {
    expect(racing(6, 6)).toBe(false);
    expect(racing(40, 6)).toBe(true);
    expect(racing(3, 1)).toBe(false); // un tirón (avisos de golpe) no cuenta: ventana corta
    expect(shouldAutoPause(1)).toBe(false); // un salto manual de la barra es una sola ventana
    expect(shouldAutoPause(2)).toBe(true);
    expect(raceAction(1, 0)).toBe("nada");
    expect(raceAction(2, 0)).toBe("reabrir"); // primero se intenta reabrir el audio
    expect(raceAction(2, 1)).toBe("pausar");  // si vuelve a fallar, se pausa
    expect(racing(16, 6)).toBe(false); // ráfaga tras un tirón de 2 s dentro de la ventana
  });
  it("auriculares que dejan de estar conectados", () => {
    const dev = (connected: boolean) => ({ mac: "A", name: "WH-1000XM5", icon: "audio-headset", connected, paired: true, rssi: null });
    const a: BzState = { ok: true, powered: true, devices: [dev(true)] };
    expect(audioGone(a, { ok: true, powered: true, devices: [dev(false)] }).map((d) => d.name)).toEqual(["WH-1000XM5"]);
    expect(audioGone(a, { ok: true, powered: false, devices: [dev(true)] }).length).toBe(1);
    expect(audioGone(a, a).length).toBe(0);
    const pad: BzState = { ok: true, powered: true, devices: [{ ...dev(true), icon: "input-gaming" }] };
    expect(audioGone(pad, { ok: true, powered: true, devices: [] }).length).toBe(0);
  });
});

import { dockReach } from "../src/diagTests";
describe("cruceta en el reproductor anclado", () => {
  const box = (x: number, y: number) => ({ left: x, right: x + 30, top: y, bottom: y + 30 });
  it("una fila de 6 botones: se llega a todos y arriba sale a las portadas", () => {
    const rects = [box(0, 0), box(60, 0), box(120, 0), ...[0, 1, 2, 3, 4, 5].map((i) => box(i * 50, 100))];
    expect(dockReach(rects, [3, 4, 5, 6, 7, 8])).toEqual({ fila: 6, alcanzados: 6, salir: true });
  });
});

import { toSeconds } from "../src/music";
describe("posición de la música", () => {
  it("Steam la da en milisegundos", () => {
    expect(toSeconds(83_500)).toBe(83.5);
    expect(toSeconds(0)).toBe(0);
    expect(toSeconds(Number.NaN)).toBe(0);
  });
});

import { learnFrom } from "../src/menuStats";
import { suggestTiers } from "../src/powerTiers";
describe("potencia del menú aprendida", () => {
  const b = (n: number, avg: number) => ({ n, sum: n * avg, slow: avg > 80 ? n : 0 });
  it("aprende desde qué vatio va fluido en cada situación", () => {
    const s = { "juego|switch|7": b(10, 200), "juego|switch|8": b(8, 90), "juego|switch|9": b(12, 40), "juego|switch|12": b(30, 30), "escritorio|switch|9": b(3, 30) };
    expect(learnFrom(s, "juego")?.fluidW).toBe(9);
    expect(learnFrom(s, "escritorio")).toBeNull(); // pocas medidas
  });
  it("sin medidas lentas por debajo no se atreve a bajar el umbral", () => {
    expect(learnFrom({ "juego|switch|10": b(10, 30), "juego|switch|12": b(10, 30) }, "juego")).toBeNull();
  });
  it("lo aprendido manda, acotado", () => {
    expect(suggestTiers({ glass: false, tv: false, learnedFluidW: 8, learnedSamples: 40, game: true })).toMatchObject({ ecoW: 7, fluidW: 8 });
    expect(suggestTiers({ glass: false, tv: false, learnedFluidW: 20 }).fluidW).toBe(12);
  });
});
