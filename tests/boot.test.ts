import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn(async () => null) }));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined, getGamepadNavigationTrees: () => [] }));
vi.mock("../src/panelBridge", () => ({ callPanel: vi.fn(async () => true), rpc: { state: vi.fn(), setWatts: vi.fn(async () => ({ ok: true })) } }));

import { missingForReady } from "../src/boot";
import { boostPlan } from "../src/menuEfficiency";

describe("arranque de Steam", () => {
  it("espera a usuario, ajustes y ventana", () => {
    expect(missingForReady({})).toEqual(["usuario", "ajustes", "ventana"]);
    const w = {
      friendStore: { currentUserSteamID: { GetAccountID: () => 42 } },
      settingsStore: { GetClientSetting: () => null },
      SteamUIStore: { GetFocusedWindowInstance: () => ({}) },
    };
    expect(missingForReady(w)).toEqual([]);
    expect(missingForReady({ ...w, friendStore: { currentUserSteamID: { GetAccountID: () => 0 } } })).toEqual(["usuario"]);
  });
});

describe("impulso del menú", () => {
  it("solo a ≤ 8 W, sin Auto-TDP, y en el ámbito que se está usando", () => {
    expect(boostPlan({ applied_w: 7, watts: 7, appid: "123", follows_global: false }, true)).toMatchObject({ scope: "game", appid: "123", from: 7, to: 9 });
    expect(boostPlan({ applied_w: 7, watts: 7, global_watts: 7, appid: "123", follows_global: true }, true)).toMatchObject({ scope: "global", from: 7 });
    expect(boostPlan({ applied_w: 7, watts: 7, appid: null, global_watts: 8 }, true)).toMatchObject({ scope: "global", from: 8 });
    expect(boostPlan({ applied_w: 10, watts: 10 }, true)).toBeNull();
    expect(boostPlan({ applied_w: 7, watts: 7 }, false)).toBeNull();
    expect(boostPlan({ applied_w: 7, watts: 7, auto_config: { enabled: true } }, true)).toBeNull();
  });
});
