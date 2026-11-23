import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn() }));

import { setRunningAppReader, runningGame, stableGameKey } from "../src/game";
import { buildView, clampW, explainFailure, isActivePreset, writeTarget } from "../src/tdpModel";
import type { RawTdpState } from "../src/panelBridge";

const base = (o: Partial<RawTdpState> = {}): RawTdpState => ({
  supported: true,
  unit: "W",
  limits: { min: 4, default: 12, max: 15, max_ac: 25 },
  presets: { quiet: 7, balanced: 12, turbo: 15, turbo_ac: 25 },
  watts: 12,
  global_watts: 12,
  applied_w: 12,
  on_ac: false,
  appid: null,
  follows_global: true,
  tdp_control_enabled: true,
  game_power_owner: { supported: false, owner: "pdc", write_allowed: true },
  ...o,
});
const game = { key: "1245620", liveAppid: 1245620, name: "Elden Ring" };

describe("stableGameKey / runningGame", () => {
  it("juego de Steam: appid numerico", () => {
    expect(stableGameKey({ appid: 1245620, display_name: "Elden Ring" })).toBe("1245620");
  });
  it("atajo no-Steam (bit alto): ns:<nombre normalizado>", () => {
    expect(stableGameKey({ appid: 3000000001, display_name: "  Mi  Juego " })).toBe("ns:mi juego");
  });
  it("atajo por app_type aunque el appid sea pequeño", () => {
    expect(stableGameKey({ appid: 12, app_type: 1073741824, display_name: "X" })).toBe("ns:x");
  });
  it("atajo sin nombre conserva el appid", () => {
    expect(stableGameKey({ appid: 3000000001 })).toBe("3000000001");
  });
  it("lee el juego con el lector inyectado y con el de reserva", () => {
    setRunningAppReader(() => ({ appid: 730, display_name: "CS2" }));
    expect(runningGame()).toEqual({ key: "730", liveAppid: 730, name: "CS2" });
    setRunningAppReader(() => { throw new Error("x"); });
    expect(runningGame()).toBeNull();
    setRunningAppReader(() => null);
    expect(runningGame()).toBeNull();
    setRunningAppReader(null);
  });
});

describe("buildView", () => {
  it("sin juego: ambito global, techo de bateria, presets integrados", () => {
    const v = buildView(base(), null, null);
    expect(v.status).toBe("ok");
    expect(v.scope).toBe("global");
    expect([v.min, v.max]).toEqual([4, 15]);
    expect(v.presets.map((p) => [p.label, p.watts])).toEqual([["Eco", 7], ["Equilibrado", 12], ["Máx", 15]]);
    expect(v.context).toBeNull();
  });

  it("con cargador sube el techo y el preset Maximo", () => {
    const v = buildView(base({ on_ac: true }), null, null);
    expect(v.max).toBe(25);
    expect(v.presets[v.presets.length - 1].watts).toBe(25);
    expect(v.onAc).toBe(true);
  });

  it("con juego que sigue a Steam: muestra la potencia de Steam pero escribe en el perfil del juego", () => {
    const v = buildView(base({ appid: "1245620", follows_global: true, watts: 12, global_watts: 12 }), null, game);
    expect(v.scope).toBe("game");
    expect(v.followsGlobal).toBe(true);
    expect(v.watts).toBe(12);
    expect(v.game?.key).toBe("1245620");
    expect(writeTarget(v)).toEqual({ scope: "game", appid: "1245620", context: "1245620" });
  });

  it("con perfil propio: escribe en ambito juego y muestra el valor del juego", () => {
    const v = buildView(base({ appid: "1245620", follows_global: false, watts: 9, global_watts: 15 }), null, game);
    expect(v.scope).toBe("game");
    expect(v.watts).toBe(9);
    expect(writeTarget(v)).toEqual({ scope: "game", appid: "1245620", context: "1245620" });
  });

  it("si Panel aun no conoce el juego (carrera al lanzarlo) no se manda contexto de juego", () => {
    const v = buildView(base({ appid: null }), null, game);
    expect(v.game).toBeNull();
    expect(writeTarget(v)).toEqual({ scope: "global", appid: null, context: null });
  });

  it("estados que bloquean el slider, con motivo", () => {
    expect(buildView(base({ supported: false }), null, null).status).toBe("unsupported");
    expect(buildView(base({ unit: "level" }), null, null).status).toBe("level");
    const off = buildView(base({ tdp_control_enabled: false }), null, null);
    expect(off.status).toBe("disabled");
    expect(off.note).toMatch(/solo lectura/);
    const steam = buildView(base({ appid: "1245620", applied_w: 14, game_power_owner: { supported: true, owner: "steam", write_allowed: false } }), null, game);
    expect(steam.status).toBe("steam");
    expect(steam.watts).toBe(14); // valor real leido, no el guardado
  });

  it("Steam como propietario solo cuenta si hay juego en marcha", () => {
    const v = buildView(base({ game_power_owner: { supported: true, owner: "steam", write_allowed: false } }), null, null);
    expect(v.status).toBe("ok");
  });

  it("presets guardados: orden, ocultos y personalizados", () => {
    const saved = {
      order: ["c1", "turbo", "quiet", "balanced"],
      hidden: ["balanced"],
      custom: { c1: { watts: 10, name: "Silencio", boost: { mode: "estable", off2: 0, off3: 0 } } },
    };
    const v = buildView(base(), saved, null);
    expect(v.presets.map((p) => p.label)).toEqual(["Silencio", "Máx", "Eco"]);
    expect(v.presets[0].boost).toEqual({ mode: "estable", off2: 0, off3: 0 });
  });

  it("un preset por encima del techo se recorta al techo actual", () => {
    const saved = { order: ["c1"], custom: { c1: { watts: 30, name: "" } } };
    const v = buildView(base(), saved, null);
    const c = v.presets.find((p) => p.id === "c1");
    expect(c?.watts).toBe(15);
    expect(c?.label).toBe("30 W");
  });

  it("avisos de propiedad como Panel: solo lo que importa", () => {
    const hint = (o: Record<string, unknown>, extra: Record<string, unknown> = {}) => buildView(base({ ownership: o, ...extra }), null, null).hint;
    expect(hint({ status: "constrained", reason: "other", applied: { pl1: 10 } })).toBe("El equipo limita la potencia a 10 W por ahora.");
    expect(hint({ status: "constrained", reason: "power_source_limit", applied: { pl1: 18 } }, { on_ac: true })).toBe("El cargador limita la potencia a 18 W.");
    expect(hint({ status: "rejected", target: { pl1: 3 }, applied: { pl1: 5 } })).toBe("El equipo no permite 3 W ahora mismo. Sigue en 5 W.");
    expect(hint({ status: "settling" })).toBeNull();
    expect(hint({ status: "in_sync", conflict_persistent: true })).toBe("Algo en el equipo está cambiando el límite de potencia.");
    expect(hint({ status: "constrained", reason: "firmware_mode", applied: { pl1: 10 } })).toBeNull();
  });

  it("minimo del slider = minimo fisico (ROG Ally: request_min 3, limits.min 7)", () => {
    expect(buildView(base({ request_min: 3, limits: { min: 7, max: 25, max_ac: 30 } }), null, null).min).toBe(7);
  });

  it("suelo en vivo por encima del minimo: se raya y se avisa", () => {
    const v = buildView(base({ request_min: 3, limits: { min: 3, max: 15, max_ac: 25 }, ownership: { status: "constrained", reason: "live_min", requested: { pl1: 3 }, target: { pl1: 5 }, applied: { pl1: 5 } } }), null, null);
    expect(v.min).toBe(3);
    expect(v.floor).toBe(5);
    expect(v.hint).toBe("El equipo no baja de 5 W.");
  });

  it("el valor mostrado siempre queda dentro del rango", () => {
    expect(buildView(base({ global_watts: 40 }), null, null).watts).toBe(15);
    expect(buildView(base({ global_watts: 1 }), null, null).watts).toBe(4);
  });
});

describe("utilidades", () => {
  it("clampW redondea y recorta", () => {
    expect(clampW(11.6, 4, 15)).toBe(12);
    expect(clampW(99, 4, 15)).toBe(15);
    expect(clampW(-2, 4, 15)).toBe(4);
  });
  it("explica los fallos conocidos de Panel", () => {
    expect(explainFailure({ ok: false, detail: "stale-context" })).toMatch(/juego cambió/);
    expect(explainFailure({ ok: false, detail: "game-power-owner" })).toMatch(/Steam/);
    expect(explainFailure({ ok: false, detail: "tdp-control-disabled" })).toMatch(/desactivado/);
    expect(explainFailure({ ok: false, detail: "raro" })).toBe("No se aplicó (raro).");
    expect(explainFailure(null)).toMatch(/no respondió/);
  });
  it("preset activo con tolerancia de 0,5 W", () => {
    expect(isActivePreset({ id: "a", label: "", watts: 12, boost: null }, 12.4)).toBe(true);
    expect(isActivePreset({ id: "a", label: "", watts: 12, boost: null }, 13)).toBe(false);
  });
});
