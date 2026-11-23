import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn() }));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined, getGamepadNavigationTrees: () => [] }));
vi.mock("../src/panelBridge", () => ({ callPanel: vi.fn(), rpc: { state: vi.fn() } }));

import { resetTiersForTest, setTierChoice, setTierContext, suggestTiers, tierOf, tiers } from "../src/powerTiers";
import { LAUNCH_GUARD_MS, inLaunchWindow } from "../src/gameWatch";
import { bzApply, type BzState } from "../src/network";
import { albumsFrom, artCandidates } from "../src/music";

describe("niveles de potencia", () => {
  beforeEach(() => { window.localStorage.clear(); resetTiersForTest(); });
  it("sugiere ahorro ≤ 8 y fluido desde 9 por defecto", () => {
    const s = suggestTiers({ glass: false, tv: false });
    expect([s.ecoW, s.fluidW]).toEqual([8, 9]);
  });
  it("cristal y 4K suben el umbral", () => {
    expect(suggestTiers({ glass: true, tv: false }).fluidW).toBe(10);
    expect(suggestTiers({ glass: true, tv: true }).fluidW).toBe(12);
  });
  it("clasifica la potencia", () => {
    const t = { ecoW: 8, fluidW: 9 };
    expect(tierOf(7, t)).toBe("ahorro");
    expect(tierOf(8, t)).toBe("ahorro");
    expect(tierOf(9, t)).toBe("fluido");
    expect(tierOf(null, t)).toBeNull();
    expect(tierOf(9, { ecoW: 8, fluidW: 10 })).toBe("normal");
  });
  it("respeta la eleccion a mano y vuelve a la sugerida", () => {
    setTierContext(() => ({ glass: true, tv: false }));
    expect(tiers().ecoW).toBe(9);
    setTierChoice(7);
    expect(tiers()).toMatchObject({ ecoW: 7, fluidW: 8, auto: false, suggested: { ecoW: 9 } });
    setTierChoice("auto");
    expect(tiers().ecoW).toBe(9);
  });
});

describe("ventana de arranque de un juego", () => {
  it("solo los primeros segundos", () => {
    expect(inLaunchWindow(1000, 0)).toBe(false);
    expect(inLaunchWindow(1000 + 2000, 1000)).toBe(true);
    expect(inLaunchWindow(1000 + LAUNCH_GUARD_MS, 1000)).toBe(false);
  });
});

describe("bluetooth optimista", () => {
  const s: BzState = { ok: true, powered: true, devices: [{ mac: "AA:BB:CC:DD:EE:FF", name: "Cascos", icon: "audio-headset", connected: false, paired: true, rssi: null }] };
  it("conectar/desconectar cambia la fila al instante", () => {
    expect(bzApply(s, "connect", "AA:BB:CC:DD:EE:FF")!.devices![0].connected).toBe(true);
    expect(bzApply(bzApply(s, "connect", "AA:BB:CC:DD:EE:FF"), "disconnect", "AA:BB:CC:DD:EE:FF")!.devices![0].connected).toBe(false);
  });
  it("encender/apagar", () => {
    expect(bzApply(s, "power-off", "")!.powered).toBe(false);
    expect(bzApply({ ...s, powered: false }, "power-on", "")!.powered).toBe(true);
  });
  it("sin estado no inventa", () => { expect(bzApply(null, "connect", "x")).toBeNull(); });
});

describe("carátulas de álbumes", () => {
  it("vertical primero y cabecera del CDN nuevo antes que la antigua", () => {
    const l = artCandidates(3405480, null, null);
    expect(l[0]).toContain("store_item_assets/steam/apps/3405480/library_600x900.jpg");
    expect(l.indexOf(l.find((x) => x.includes("store_item_assets") && x.endsWith("header.jpg"))!)).toBeLessThan(l.findIndex((x) => x.startsWith("https://cdn.cloudflare") && x.endsWith("header.jpg")));
  });
  it("usa la carátula local y el nombre de cabecera si existen", () => {
    const [a] = albumsFrom([{ appid: 9, app_type: 8192, display_name: "X OST", library_capsule_filename: "c.jpg", header_filename: "header_abc.jpg" }]);
    expect(a.art[0]).toBe("/assets/9/c.jpg");
    expect(a.art).toContain("https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/9/header_abc.jpg");
  });
});
