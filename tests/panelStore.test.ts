import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearPanelStore, entry, fetchShared, prime, subscribe } from "../src/panelStore";

describe("almacén compartido de Panel", () => {
  beforeEach(() => clearPanelStore());
  it("varias tarjetas a la vez = una sola llamada, y todas se enteran", async () => {
    const get = vi.fn(async () => ({ watts: 9 }));
    const a = vi.fn(), b = vi.fn();
    const offA = subscribe("k1", a), offB = subscribe("k1", b);
    await Promise.all([fetchShared("k1", get), fetchShared("k1", get), fetchShared("k1", get)]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(entry("k1").data).toEqual({ watts: 9 });
    expect(a).toHaveBeenCalledTimes(1); expect(b).toHaveBeenCalledTimes(1);
    offA(); offB();
  });
  it("una lectura reciente vale; forzada (tras escribir) vuelve a leer", async () => {
    const get = vi.fn(async () => 1);
    await fetchShared("k2", get);
    await fetchShared("k2", get);
    expect(get).toHaveBeenCalledTimes(1);
    await fetchShared("k2", get, true);
    expect(get).toHaveBeenCalledTimes(2);
  });
  it("lo que lee el controlador sirve a las tarjetas sin otra llamada", async () => {
    const get = vi.fn(async () => "x");
    prime("k3", { appid: "730" });
    await fetchShared("k3", get);
    expect(get).not.toHaveBeenCalled();
    expect(entry("k3").data).toEqual({ appid: "730" });
  });
  it("si Panel no responde se marca ausente y no rompe", async () => {
    await fetchShared("k4", async () => { throw new Error("no"); });
    expect(entry("k4").missing).toBe(true);
    await fetchShared("k4", async () => 5);
    expect(entry("k4")).toMatchObject({ missing: false, data: 5 });
  });
});
