import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined }));
vi.mock("@decky/api", () => ({ callable: () => vi.fn(async () => null) }));

import { capture, diff, forget, hasOwn, load, remember, save, targetFor, STEAM } from "../src/displayProfiles";
import { startDisplayWatcher } from "../src/displayWatch";
import { perfStore, readPerf, setPerfStoreReader, type PerfStore } from "../src/steamPerf";
import { navNodeOf, takeFocus } from "../src/nav";

const store = (): PerfStore => {
  const st: PerfStore = {
    msgLimits: { split_scaling_scalers_available: [1, 3, 5], split_scaling_filters_available: [1, 3], fps_limit_options: [0, 30, 60], disable_refresh_rate_management: false, is_vrr_supported: true },
    msgSettingsPerApp: { split_scaling_scaler: 1, split_scaling_filter: 1, fps_limit: 0, is_vrr_enabled: false },
  };
  st.SetSplitScalingScaler = vi.fn((v: number) => { st.msgSettingsPerApp!.split_scaling_scaler = v; });
  st.SetSplitScalingFilter = vi.fn((v: number) => { st.msgSettingsPerApp!.split_scaling_filter = v; });
  st.SetFPSLimit = vi.fn((_e: boolean, v: number) => { st.msgSettingsPerApp!.fps_limit = v; });
  st.SetVRREnabled = vi.fn((v: boolean) => { st.msgSettingsPerApp!.is_vrr_enabled = v; });
  return st;
};

beforeEach(() => { vi.useFakeTimers(); window.localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); setPerfStoreReader(null); });

describe("perfiles de pantalla", () => {
  it("un juego sin perfil usa el de Steam; con perfil, el suyo; olvidar lo devuelve a Steam", () => {
    let p = remember(load(), STEAM, { fps: 0, scaler: 1 });
    expect(targetFor(p, "730")).toEqual({ fps: 0, scaler: 1 });
    p = remember(p, "730", { fps: 30, scaler: 5 });
    expect(targetFor(p, "730")).toEqual({ fps: 30, scaler: 5 });
    expect(hasOwn(p, "730")).toBe(true);
    p = forget(p, "730");
    expect(hasOwn(p, "730")).toBe(false);
  });
  it("diff solo escribe lo distinto y lo que existe", () => {
    const st = store();
    setPerfStoreReader(() => st);
    const now = readPerf(perfStore());
    expect(capture(now)).toEqual({ fps: 0, vrr: false, scaler: 1, filter: 1 });
    expect(diff(now, { fps: 0, scaler: 5, refresh: 60 })).toEqual([["scaler", 5]]);
  });
});

describe("vigilante", () => {
  it("al entrar en un juego aplica su perfil y al salir vuelve al de Steam (capturado mientras estabas fuera)", () => {
    const st = store();
    setPerfStoreReader(() => st);
    save(remember(load(), "730", { scaler: 5, fps: 30 }));
    let game: { key: string; liveAppid: number; name: string } | null = null;
    const stop = startDisplayWatcher(() => game, 1000);
    vi.advanceTimersByTime(1000); // en Steam: guarda el perfil de Steam
    expect(load().steam).toEqual({ fps: 0, vrr: false, scaler: 1, filter: 1 });
    game = { key: "730", liveAppid: 730, name: "CS2" };
    vi.advanceTimersByTime(1000);
    expect(st.SetSplitScalingScaler).toHaveBeenCalledWith(5);
    expect(st.SetFPSLimit).toHaveBeenCalledWith(false, 30);
    game = null;
    vi.advanceTimersByTime(1000);
    expect(st.msgSettingsPerApp!.split_scaling_scaler).toBe(1);
    expect(st.msgSettingsPerApp!.fps_limit).toBe(0);
    stop();
  });
  it("lo que cambia dentro de un juego se guarda SOLO en ese juego y no ensucia el perfil de Steam", () => {
    const st = store();
    setPerfStoreReader(() => st);
    save(remember(load(), "steam", { fps: 0, vrr: false, scaler: 1, filter: 1 }));
    let game: { key: string; liveAppid: number; name: string } | null = null;
    const stop = startDisplayWatcher(() => game, 1000);
    vi.advanceTimersByTime(1000);
    game = { key: "999", liveAppid: 999, name: "X" };
    vi.advanceTimersByTime(1000);
    st.msgSettingsPerApp!.split_scaling_scaler = 3;
    vi.advanceTimersByTime(2000);
    expect(load().games["999"]?.scaler).toBe(3);
    expect(load().steam?.scaler).toBe(1);
    game = null;
    vi.advanceTimersByTime(5000); // tras salir no se vuelve a anotar como «Steam» lo que había en el juego
    expect(load().steam?.scaler).toBe(1);
    stop();
  });
});

describe("foco de Steam", () => {
  it("encuentra TakeFocus en el estado de React y lo usa; si no, usa focus()", () => {
    const node = { TakeFocus: vi.fn() };
    const el = document.createElement("div");
    (el as unknown as Record<string, unknown>)["__reactFiber$abc"] = { memoizedState: null, return: { memoizedState: { memoizedState: { current: node }, next: null } } };
    expect(navNodeOf(el)).toBe(node);
    expect(takeFocus(el)).toBe(true);
    expect(node.TakeFocus).toHaveBeenCalled();
    const plain = document.createElement("button");
    document.body.appendChild(plain);
    expect(takeFocus(plain)).toBe(false);
    expect(document.activeElement).toBe(plain);
    plain.remove();
  });
});
