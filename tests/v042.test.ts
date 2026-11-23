import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn(async () => null) }));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined, getGamepadNavigationTrees: () => [] }));

import { budget } from "../src/budget";
import { perfWrite, readPerf, setClientSettingsReader, setPerfStoreReader, type PerfStore } from "../src/steamPerf";
import { STICKY_MS, stickyPick } from "../src/game";

describe("presupuesto de fluidez", () => {
  const ev = (k: string, ms: number, w: number, d?: string) => ({ t: 1, k, ms, w, sec: "home", d });
  it("dentro del tope", () => {
    const r = budget([ev("open", 90, 12), ev("open", 110, 12), ev("switch", 20, 12), ev("switch", 30, 12), ev("switch", 90, 7)]);
    expect(r.ok).toBe(true);
    expect(r.lineas.map((l) => l.que)).toEqual(["abrir · ≥ 9 W", "cambiar de sección · ≥ 9 W", "cambiar de sección · < 9 W"]);
  });
  it("abrir lento con 12 W se señala (lo medido el 12‑11: 311 y 403 ms)", () => {
    const r = budget([ev("open", 311, 12), ev("open", 403, 12)]);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toMatchObject({ ok: false, limite: 120 });
  });
  it("los saltos del teclado y la leyenda de Steam no cuentan; los nuestros sí", () => {
    const steam = [ev("shift", 5, 12, "DIV «ABC BackspaceEnterEnglish QWERTY»"), ev("shift", 5, 12, "DIV «Menu»"), ev("shift", 5, 12, "DIV «n»")];
    expect(budget(steam).saltos).toBe(0);
    const r = budget([...steam, ev("shift", 44, 11, "DIV «LIMBO13,4 W en usoPotencia de este juego»")]);
    expect(r.saltos).toBe(1);
    expect(r.ok).toBe(false);
  });
});

describe("límite de FPS de Steam", () => {
  const store = (fps: number, opts: number[]): PerfStore => ({
    msgLimits: { fps_limit_options: opts, disable_refresh_rate_management: false } as never,
    msgSettingsPerApp: { fps_limit: fps } as never,
    SetFPSLimit: () => undefined,
  } as unknown as PerfStore);
  it("el control sigue ahí aunque el valor actual no esté entre las opciones", () => {
    const v = readPerf(store(60, [20, 40, 80, 0]));
    expect(v?.fps?.value).toBe(60);
    expect(v?.fps?.options.map((o) => o.value)).toEqual([20, 40, 80, 0]);
  });
});

describe("límite de FPS por la vía moderna (Ally, 12‑11)", () => {
  const mk = () => {
    const v: Record<string, number | boolean> = { gamescope_disable_framelimit: true, gamescope_app_target_framerate: 60 };
    const cs = { GetClientSetting: (n: string) => [v[n], (x: number | boolean) => { v[n] = x; }] as [unknown, (x: number | boolean) => unknown] };
    const store = { msgLimits: { disable_refresh_rate_management: true, fps_limit_options: [30, 60, 120, 0], display_refresh_manual_hz_max: 120 }, msgSettingsPerApp: { fps_limit: 60 }, SetFPSLimit: () => { throw new Error("no debe usarse"); } } as unknown as PerfStore;
    setClientSettingsReader(() => cs);
    setPerfStoreReader(() => store);
    return { v, store };
  };
  it("ofrece 40 FPS y marca «sin límite» si el límite está apagado", () => {
    const { store } = mk();
    const f = readPerf(store)?.fps;
    expect(f?.value).toBe(0);
    expect(f?.options.map((o) => o.value)).toEqual([30, 40, 45, 50, 60, 90, 120, 0]);
    expect(readPerf(store)?.refresh).toBeNull();
    setClientSettingsReader(null); setPerfStoreReader(null);
  });
  it("poner 40 enciende el límite y fija la meta; 0 lo apaga", () => {
    const { v, store } = mk();
    expect(perfWrite.fps(40)).toBe(true);
    expect(v).toEqual({ gamescope_disable_framelimit: false, gamescope_app_target_framerate: 40 });
    expect(readPerf(store)?.fps?.value).toBe(40);
    perfWrite.fps(0);
    expect(v.gamescope_disable_framelimit).toBe(true);
    setClientSettingsReader(null); setPerfStoreReader(null);
  });
});

describe("juego visto hace poco", () => {
  const g = { key: "286690", liveAppid: 286690, name: "Metro 2033 Redux" };
  it("un instante sin juego al abrir no cambia de modo; pasado el margen, sí", () => {
    expect(stickyPick(null, { g, at: 1000 }, 1000 + 2000)).toEqual(g);
    expect(stickyPick(null, { g, at: 1000 }, 1000 + STICKY_MS + 1)).toBeNull();
    expect(stickyPick(null, null, 5)).toBeNull();
    expect(stickyPick(g, null, 5)).toEqual(g);
  });
});
