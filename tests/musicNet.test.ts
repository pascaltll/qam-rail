import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn() }));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined, getGamepadNavigationTrees: () => [] }));
vi.mock("../src/panelBridge", () => ({ callPanel: vi.fn(), rpc: { state: vi.fn() } }));

import { frameSummary } from "../src/gameWatch";
import { albumsFrom } from "../src/music";
import { bzKind, sortBz } from "../src/network";

describe("bandas sonoras", () => {
  it("solo álbumes de música, sin «Soundtrack» en el nombre, instalados primero", () => {
    const a = albumsFrom([
      { appid: 1, app_type: 1, display_name: "Juego" },
      { appid: 2, app_type: 8192, display_name: "Hades II - Soundtrack", library_capsule_filename: "abc/library_600x900.jpg", installed: false },
      { appid: 3, app_type: 8192, display_name: "Celeste OST", per_client_data: [{ installed: true }] },
      { appid: 3, app_type: 8192, display_name: "Celeste OST" },
    ]);
    expect(a.map((x) => [x.appid, x.name, x.installed])).toEqual([[3, "Celeste", true], [2, "Hades II", false]]);
    expect(a[1].capsule).toBe("/assets/2/abc/library_600x900.jpg");
    expect(albumsFrom(null)).toEqual([]);
  });
});

describe("Bluetooth por BlueZ", () => {
  it("tipo por icono y orden", () => {
    expect(bzKind("audio-headset").audio).toBe(true);
    expect(bzKind("input-gaming").label).toBe("Mando");
    const d = (mac: string, name: string, icon: string, connected: boolean, paired: boolean) => ({ mac, name, icon, connected, paired, rssi: null });
    const g = sortBz([d("1", "Mando", "input-gaming", true, true), d("2", "Teclado", "input-keyboard", false, true), d("3", "Buds", "audio-headphones", false, true), d("4", "JBL", "", false, false)]);
    expect(g.paired.map((x) => x.name)).toEqual(["Buds", "Teclado"]);
    expect(g.nearby.map((x) => x.name)).toEqual(["JBL"]);
  });
});

describe("salida de un juego", () => {
  it("resume fotogramas", () => {
    expect(frameSummary([16, 16, 120, 16])).toEqual({ fps: 24, lentos: 1, peorMs: 120 });
    expect(frameSummary([])).toEqual({ fps: null, lentos: 0, peorMs: 0 });
  });
});
