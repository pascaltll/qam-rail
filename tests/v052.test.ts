import { describe, it, expect, vi } from "vitest";
vi.mock("@decky/api", () => ({ callable: () => async () => ({ ok: true }) }));
import { selfMessage, selfStatus } from "../src/qamSelf";

const info = { version: "0.51.2", channel: "stable" as const, last_check: null, backup_version: null, repo: "x/y" };
describe("auto-actualización", () => {
  it("estado", () => {
    expect(selfStatus(null, null, false)).toBe("Leyendo…");
    expect(selfStatus(info, null, true)).toContain("buscando");
    expect(selfStatus(info, { state: "update", latest: "0.52.0" }, false)).toBe("Versión 0.51.2 · disponible 0.52.0");
    expect(selfStatus(info, { state: "update", latest: "0.53.0-beta", prerelease: true }, false)).toContain("(beta)");
    expect(selfStatus(info, { state: "current" }, false)).toContain("al día");
    expect(selfStatus(info, { state: "error" }, false)).toContain("no se pudo");
  });
  it("mensajes", () => {
    expect(selfMessage({ ok: true, restarting: true, from: "0.51.2", to: "0.52.0" })).toContain("reiniciando Decky");
    expect(selfMessage({ ok: false, error: "SHA" })).toBe("No se pudo: SHA");
  });
});
