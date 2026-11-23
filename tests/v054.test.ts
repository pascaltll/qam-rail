import { describe, expect, it, vi } from "vitest";
vi.mock("@decky/api", () => ({ callable: () => async () => ({ ok: true }) }));

import { HELP } from "../src/help";
import { filterApps, groupApps, noteFor, sourceLabel, steamState, type DesktopApp } from "../src/qamDesktop";

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
  it("estado en Steam: no / si / perdida", () => {
    const reg = { "flatpak:Brave": { appid: 7, name: "Brave", source: "flatpak", added: 1 } };
    expect(steamState("flatpak:X", reg, [{ appid: 7 }])).toBe("no");
    expect(steamState("flatpak:Brave", reg, [{ appid: 7 }])).toBe("si");
    expect(steamState("flatpak:Brave", reg, [{ appid: 9 }])).toBe("perdida");
  });
  it("notas de fila", () => {
    expect(sourceLabel("appimage")).toBe("AppImage");
    expect(noteFor({ source: "flatpak" }, "si")).toBe("Flatpak · en Steam");
    expect(noteFor({ source: "system" }, "perdida")).toContain("ya no está en Steam");
    expect(noteFor({ source: "system" }, "no", true)).toBe("Sistema · pantalla completa");
  });
  it("hay ayuda «steam»", () => {
    expect(HELP.steam.text.join(" ")).toContain("Quitar de Steam");
  });
});
