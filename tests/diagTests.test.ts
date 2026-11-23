import { describe, expect, it, vi } from "vitest";

const sections: Array<[string, unknown, unknown]> = [];
vi.mock("@decky/api", () => ({
  callable: (name: string) => vi.fn(async (...a: unknown[]) => {
    if (name === "diag_section") { sections.push(a as [string, unknown, unknown]); return "/home/deck/homebrew/settings/qam-rail/diag/informe.json"; }
    if (name === "diag_bundle") return { path: "/home/deck/qam-rail-diagnostico-x.zip", files: ["resumen.json"] };
    return "/ruta";
  }),
}));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined, getGamepadNavigationTrees: () => [] }));
vi.mock("../src/panelBridge", () => ({
  callPanel: vi.fn(async (m: string) => {
    if (m === "get_tdp_state") return { limits: { min: 7, max: 25 }, watts: 15, global_watts: 15, follows_global: true, ownership: { status: "in_sync" }, request_min: 3, auto_config: {} };
    if (m === "get_power_draw") return { watts: 7 };
    if (m === "get_eco_state") throw new Error("no existe");
    return {};
  }),
  rpc: {},
}));

import { plain } from "../src/diagStore";
import { at, checkSpecs, missingPaths, shapeOf, testPanelContract, testSteamContract } from "../src/diagTests";

describe("diagnostico (puro)", () => {
  it("rutas y campos que faltan", () => {
    const o = { a: { b: { c: 1 } }, n: null };
    expect(at(o, "a.b.c")).toBe(1);
    expect(at(o, "a.x.c")).toBeUndefined();
    expect(missingPaths(o, ["a.b.c", "n", "z"])).toEqual(["n", "z"]);
  });

  it("forma sin datos", () => {
    expect(shapeOf({ a: 1, b: [1, 2], c: null, d: "x" })).toEqual({ a: "number", b: "array(2)", c: "null", d: "string" });
    expect(shapeOf([1])).toBe("array(1)");
  });

  it("comprobaciones de funciones y objetos", () => {
    const root = { S: { f: () => 1, o: {}, n: 0 } };
    const r = checkSpecs(root, [["x", "S.f", "fn"], ["x", "S.o", "fn"], ["x", "S.o", "obj"], ["x", "S.n", "any"], ["x", "S.z", "any"]]);
    expect(r.map((c) => c.ok)).toEqual([true, false, true, true, false]);
    expect(r[4].got).toBe("falta");
  });

  it("copia JSON-segura: ciclos, funciones, mapas y profundidad", () => {
    const a: Record<string, unknown> = { f: () => 1, m: new Map([["k", 1]]), u: undefined, big: 10n };
    a.self = a;
    expect(plain(a)).toEqual({ f: "ƒ", m: { k: 1 }, u: null, big: "10", self: "<ciclo>" });
    expect(plain({ a: { b: { c: 1 } } }, 2)).toEqual({ a: { b: "{…}" } });
  });
});

describe("contratos (con Panel y Steam falsos)", () => {
  it("Panel: cuenta correctos, anota errores y guarda su seccion", async () => {
    sections.length = 0;
    const r = await testPanelContract();
    expect(r.total).toBeGreaterThan(5);
    expect(r.ok).toBe(r.total - 2); // get_power_draw sin "applied" y get_eco_state con error
    const [key, data, resumen] = sections[0] as [string, { metodos: Array<{ method: string; ok: boolean; faltan?: string[]; error?: string }> }, unknown];
    expect(key).toBe("contrato-panel");
    expect(resumen).toEqual({ ok: r.ok, total: r.total });
    expect(data.metodos.find((m) => m.method === "get_power_draw")?.faltan).toEqual(["applied"]);
    expect(data.metodos.find((m) => m.method === "get_eco_state")?.error).toContain("no existe");
  });

  it("Steam: sin Steam todo falta, pero no rompe", async () => {
    sections.length = 0;
    const r = await testSteamContract();
    expect(r.ok).toBe(0);
    expect(sections[0][0]).toBe("contrato-steam");
  });
});
