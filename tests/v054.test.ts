import { describe, expect, it, vi } from "vitest";
vi.mock("@decky/api", () => ({ callable: () => async () => ({ ok: true }) }));

import { HELP } from "../src/help";
import { checkMessage } from "../src/qamApps";
import { showOpenStrip, menuOptions, isRunning, filterApps, groupApps, splitRunning, isPinned, noteFor, sourceLabel, type DesktopApp } from "../src/qamDesktop";

const app = (name: string, source: DesktopApp["source"] = "flatpak", group = "Internet"): DesktopApp => ({ key: `${source}:${name}`, name, source, exec: [name], icon: null, group, desktop: null });

describe("0.54 · apps de escritorio", () => {
  it("filtra sin acentos ni mayúsculas y ordena", () => {
    const l = [app("Zeal"), app("Émulo"), app("Brave")];
    expect(filterApps(l, "").map((a) => a.name)).toEqual(["Brave", "Émulo", "Zeal"]);
    expect(filterApps(l, "emulo").map((a) => a.name)).toEqual(["Émulo"]);
    expect(filterApps(l, "internet")).toHaveLength(3);
  });
  it("agrupa y deja «Otras» al final", () => {
    const g = groupApps([app("a", "flatpak", "Otras"), app("b", "flatpak", "Juegos"), app("c", "flatpak", "Internet"), app("d", "flatpak", "")]);
    expect(g.map((x) => x.group)).toEqual(["Internet", "Juegos", "Otras"]);
    expect(g[2].apps).toHaveLength(2);
  });
  it("ordena los grupos: navegadores primero y separa las abiertas", () => {
    const g = groupApps([app("a", "flatpak", "Otras"), app("b", "flatpak", "Herramientas"), app("c", "flatpak", "Navegadores"), app("d", "flatpak", "Multimedia")]);
    expect(g.map((x) => x.group)).toEqual(["Navegadores", "Multimedia", "Herramientas", "Otras"]);
    const r = splitRunning([app("a", "flatpak", ""), app("b", "flatpak", "")], ["flatpak:b"]);
    expect(r.open.map((x) => x.key)).toEqual(["flatpak:b"]);
    expect(r.rest.map((x) => x.key)).toEqual(["flatpak:a"]);
  });
  it("la franja de apps abiertas solo aparece con apps abiertas", () => {
    expect(showOpenStrip([])).toBe(false);
    expect(showOpenStrip([{ key: "flatpak:a" }])).toBe(true);
  });
  it("avisos de «Buscar actualización»", () => {
    expect(checkMessage(null, "Forge")).toMatch(/No se pudo consultar/);
    expect(checkMessage({ state: "update", latest: "3.18" }, "Forge")).toBe("Forge: hay una versión nueva (3.18)");
    expect(checkMessage({ state: "current", current: "3.18" }, "Forge")).toBe("Forge está al día (v3.18)");
    expect(checkMessage({ state: "error", error: "GitHub respondió 403" }, "Forge")).toBe("No se pudo comprobar: GitHub respondió 403");
    expect(checkMessage({ state: "none" }, "Forge")).toMatch(/no publica/);
  });
  it("agregada a QAM o no", () => {
    const pins = [{ key: "flatpak:Brave", name: "Brave", source: "flatpak", icon: null }];
    expect(isPinned("flatpak:Brave", pins)).toBe(true);
    expect(isPinned("flatpak:X", pins)).toBe(false);
  });
  it("notas de fila", () => {
    expect(sourceLabel("appimage")).toBe("AppImage");
    expect(noteFor({ source: "flatpak" }, true)).toBe("Flatpak · en QAM");
    expect(noteFor({ source: "system" }, false)).toBe("Sistema");
  });
  it("hay ayuda «steam»", () => {
    expect(HELP.steam.text.join(" ")).toContain("Agregar a QAM");
  });
  it("abierta o no", () => {
    expect(isRunning("a", ["a", "b"])).toBe(true);
    expect(isRunning("c", ["a"])).toBe(false);
  });
  it("menú de opciones según esté abierta", () => {
    expect(menuOptions(false).map((o) => o.id)).toEqual(["open"]);
    expect(menuOptions(true).map((o) => o.id)).toEqual(["show", "minimize", "close", "kill"]);
  });
});
