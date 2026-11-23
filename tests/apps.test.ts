import { describe, expect, it } from "vitest";
import { arrange, readApps, toEntry, toggleFavorite } from "../src/apps";

const game = (appid: number, name: string, last = 0, extra = {}) => ({
  appid, display_name: name, rt_last_time_played: last, app_type: 1, ...extra,
});

describe("apps", () => {
  it("descarta tipos que no son juego/atajo y nombres vacios", () => {
    expect(toEntry({ appid: 5, display_name: "Tool", app_type: 4 })).toBeNull();
    expect(toEntry({ appid: 5, display_name: "  ", app_type: 1 })).toBeNull();
    expect(toEntry({ appid: -1, display_name: "X", app_type: 1 })).toBeNull();
    expect(toEntry(game(7, "Hades"))?.isShortcut).toBe(false);
    expect(toEntry({ appid: 9, display_name: "Recomp", app_type: 1073741824 })?.isShortcut).toBe(true);
  });

  it("solo acepta rutas de capsula locales con formato conocido", () => {
    expect(toEntry(game(1, "A", 0, { library_capsule_filename: "abc/cap.jpg", local_cache_version: 3 }))?.capsule)
      .toBe("/assets/1/abc/cap.jpg?c=3");
    expect(toEntry(game(1, "A", 0, { library_capsule_filename: "../../etc/passwd" }))?.capsule).toBeNull();
    expect(toEntry(game(1, "A", 0, { library_capsule_filename: "http://x/y.png" }))?.capsule).toBeNull();
  });

  it("lee de collectionStore y cae a appStore, sin duplicados", () => {
    const a = readApps({ collectionStore: { localGamesCollection: { allApps: [game(1, "A"), game(1, "A")] } } });
    expect(a).toHaveLength(1);
    const b = readApps({ appStore: { allApps: [game(2, "B")] } });
    expect(b[0].appid).toBe(2);
    expect(readApps({})).toEqual([]);
  });

  it("ordena recientes por ultimo uso, excluye favoritos y nunca jugados", () => {
    const apps = [game(1, "A", 100), game(2, "B", 300), game(3, "C", 200), game(4, "D", 0)]
      .map((g) => toEntry(g)!);
    const { favorites, recent } = arrange(apps, [3, 99]);
    expect(favorites.map((x) => x.appid)).toEqual([3]); // 99 ya no existe
    expect(recent.map((x) => x.appid)).toEqual([2, 1]);
  });

  it("alterna favoritos y respeta el maximo", () => {
    expect(toggleFavorite([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggleFavorite([1, 2, 3], 2)).toEqual([1, 3]);
    expect(toggleFavorite([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
  });
});

import { curate, type AppEntry } from "../src/apps";
describe("curate", () => {
  const mk = (appid: number, name: string, isShortcut = true): AppEntry => ({ appid, name, lastPlayed: 0, isShortcut, gameid: String(appid), capsule: null });
  const all = [mk(1, "MiniTube"), mk(2, "Recomp Hub"), mk(3, "Terminal"), mk(4, "Elden Ring", false)];
  it("ancla MiniTube y Recomp por defecto y no mete juegos", () => {
    const c = curate(all, []);
    expect(c.pinned.map((a) => a.appid)).toEqual([1, 2]);
    expect(c.more.map((a) => a.appid)).toEqual([3]);
  });
  it("respeta los anclados elegidos", () => {
    const c = curate(all, [3, 1]);
    expect(c.pinned.map((a) => a.appid)).toEqual([3, 1]);
    expect(c.more.map((a) => a.appid)).toEqual([2]);
  });
});
