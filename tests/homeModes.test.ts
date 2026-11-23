import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn() }));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined, getGamepadNavigationTrees: () => [] }));

import { OWN_THEMES, RAIL, buildPalette } from "../src/appearance";
import { activeHomeMode, homePlugins, togglePin, type HomeModeState } from "../src/homeModes";
import { steamShortcutFor } from "../src/qamApps";

const empty: HomeModeState = { manual: null, perGame: {}, pins: {} };
const names = ["Decky Clash", "Colores", "Decky-Framegen", "Animation Changer", "LetMeReShade", "EmuDecky", "Volume Mixer"];

describe("modos de Inicio", () => {
  it("modo activo: juego (recordado por juego, retro por nombre), TV, elegido o escritorio", () => {
    expect(activeHomeMode(empty, { key: "1", name: "Elden Ring" }, false)).toBe("juego-intermedio");
    expect(activeHomeMode(empty, { key: "2", name: "ctr-nitrofueled.sh" }, false)).toBe("juego-retro");
    expect(activeHomeMode({ ...empty, perGame: { 1: "juego-exigente" } }, { key: "1", name: "Elden Ring" }, false)).toBe("juego-exigente");
    expect(activeHomeMode(empty, null, true)).toBe("tv");
    expect(activeHomeMode({ ...empty, manual: "pelicula" }, null, true)).toBe("pelicula");
    expect(activeHomeMode(empty, null, false)).toBe("escritorio");
  });
  it("plugins: fijados en su orden; si no, los más usados y luego los sugeridos del modo", () => {
    const byUsage = () => ["Decky Clash"];
    expect(homePlugins(names, empty, "juego-exigente", byUsage)).toEqual({ list: ["Decky Clash", "Decky-Framegen", "LetMeReShade"], pinned: false });
    const s = { ...empty, pins: { pelicula: ["Volume Mixer", "Fantasma", "Colores"] } };
    expect(homePlugins(names, s, "pelicula", byUsage)).toEqual({ list: ["Volume Mixer", "Colores"], pinned: true });
  });
  it("fijar parte de lo que se ve y quita/añade", () => {
    let s = togglePin(empty, "escritorio", "Colores", ["Decky Clash", "Animation Changer"]);
    expect(s.pins.escritorio).toEqual(["Decky Clash", "Animation Changer", "Colores"]);
    s = togglePin(s, "escritorio", "Decky Clash", []);
    expect(s.pins.escritorio).toEqual(["Animation Changer", "Colores"]);
  });
});

describe("apps de QAM", () => {
  it("encuentra su atajo de Steam por appid guardado o por nombre", () => {
    const sc = [{ appid: 11, name: "MiniTube", isShortcut: true }, { appid: 12, name: "Otro", isShortcut: true }];
    expect(steamShortcutFor({ name: "minitube ", steam_appid: null }, sc)).toBe(11);
    expect(steamShortcutFor({ name: "X", steam_appid: 12 }, sc)).toBe(12);
    expect(steamShortcutFor({ name: "X", steam_appid: 99 }, sc)).toBeNull();
  });
});

describe("temas propios", () => {
  it("cada tema da su paleta; uno desconocido vuelve al propio", () => {
    const src = { accentPref: null, tokens: {}, doc: null };
    expect(buildPalette("own:oled", src)).toBe(OWN_THEMES.find((t) => t.id === "oled")!.p);
    expect(buildPalette("own:nada", src)).toBe(RAIL);
    for (const t of OWN_THEMES) expect(Object.keys(t.p).filter((k) => k !== "glass").sort()).toEqual(Object.keys(RAIL).sort());
  });
});
