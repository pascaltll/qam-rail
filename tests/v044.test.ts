import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn(async () => null) }));
vi.mock("@decky/ui", () => ({ findModuleExport: () => undefined, getGamepadNavigationTrees: () => [] }));

import { HELP } from "../src/help";
import { knownNets, wfApply, type WifiState } from "../src/network";

const net = (ssid: string, o: Partial<{ active: boolean; saved: boolean; signal: number }> = {}) => ({ ssid, active: false, saved: false, signal: 50, security: "WPA2", channel: "1", ...o });

describe("Wi‑Fi mínimo y al instante", () => {
  const st: WifiState = { ok: true, radio: true, networks: [net("Casa", { active: true, saved: true }), net("Vecino"), net("Móvil", { saved: true }), net("Cafetería")] };
  it("solo la red en uso y las guardadas", () => {
    expect(knownNets(st).map((n) => n.ssid)).toEqual(["Casa", "Móvil"]);
  });
  it("apagar, encender y conectar se ven al tocar", () => {
    expect(wfApply(st, "off")).toMatchObject({ radio: false });
    expect(wfApply(st, "off")!.networks!.some((n) => n.active)).toBe(false);
    expect(wfApply({ ...st, radio: false }, "on")!.radio).toBe(true);
    expect(wfApply(st, "connect", "Móvil")!.networks!.filter((n) => n.active).map((n) => n.ssid)).toEqual(["Móvil"]);
    expect(wfApply(null, "on")).toBeNull();
  });
});

describe("ayuda con Y", () => {
  it("toda tarjeta que pide ayuda tiene su texto", () => {
    const used = new Set<string>();
    // El texto de cada .tsx (vite lo da en crudo): se buscan los help="…" que usan las tarjetas.
    const files = (import.meta as unknown as { glob: (p: string, o: object) => Record<string, string> }).glob("../src/*.tsx", { query: "?raw", import: "default", eager: true });
    for (const src of Object.values(files)) for (const m of String(src).matchAll(/help="([a-z]+)"/g)) used.add(m[1]);
    expect(used.size).toBeGreaterThan(8);
    for (const id of used) expect(HELP[id], `falta la ayuda «${id}»`).toBeTruthy();
    for (const h of Object.values(HELP)) { expect(h.title.length).toBeGreaterThan(2); expect(h.text.length).toBeGreaterThan(1); }
  });
});
