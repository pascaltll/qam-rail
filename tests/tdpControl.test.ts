import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn() }));

import { DEBOUNCE_MS, TdpController, type TdpApi } from "../src/tdpControl";
import type { RawTdpState } from "../src/panelBridge";

const raw = (o: Partial<RawTdpState> = {}): RawTdpState => ({
  supported: true, unit: "W", limits: { min: 4, default: 12, max: 15, max_ac: 25 },
  presets: { quiet: 7, balanced: 12, turbo: 15, turbo_ac: 25 },
  watts: 12, global_watts: 12, applied_w: 12, on_ac: false, appid: null, follows_global: true,
  tdp_control_enabled: true, ...o,
});

function fake(over: Partial<TdpApi> = {}) {
  let state = raw();
  const api = {
    state: vi.fn(async () => state),
    presets: vi.fn(async () => ({ order: [], hidden: [], custom: {} })),
    draw: vi.fn(async () => ({ watts: 9.5, on_ac: state.on_ac })),
    setWatts: vi.fn(async (w: number) => { state = { ...state, global_watts: w, watts: w, applied_w: w }; return { ok: true, applied_w: w, requested_w: w, detail: "" }; }),
    applyPreset: vi.fn(async () => ({ ok: true })),
    follow: vi.fn(async () => state),
    ...over,
  } as unknown as TdpApi;
  return { api, set: (s: RawTdpState) => { state = s; } };
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("TdpController", () => {
  it("lee el estado al abrir", async () => {
    const f = fake();
    const c = new TdpController(f.api, () => null);
    await c.refresh();
    expect(c.snapshot.loading).toBe(false);
    expect(c.snapshot.view?.watts).toBe(12);
  });

  it("sin Panel de Control: 'missing' y no revienta", async () => {
    const f = fake({ state: vi.fn(async () => { throw new Error("sin via"); }) });
    const c = new TdpController(f.api, () => null);
    await c.refresh();
    expect(c.snapshot.missing).toBe(true);
  });

  it("varios movimientos del slider -> una sola orden con el ultimo valor tras 200 ms", async () => {
    const f = fake();
    const c = new TdpController(f.api, () => null);
    await c.refresh();
    c.setWatts(8); c.setWatts(9); c.setWatts(10);
    expect(c.snapshot.view?.watts).toBe(10); // valor optimista inmediato
    expect(f.api.setWatts).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    expect(f.api.setWatts).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    await flush();
    expect(f.api.setWatts).toHaveBeenCalledTimes(1);
    expect(f.api.setWatts).toHaveBeenCalledWith(10, "global", null, null);
  });

  it("recorta al rango y no escribe si el estado no es 'ok'", async () => {
    const f = fake();
    const c = new TdpController(f.api, () => null);
    await c.refresh();
    c.setWatts(99);
    expect(c.snapshot.view?.watts).toBe(15);
    const off = fake({ state: vi.fn(async () => raw({ tdp_control_enabled: false })) });
    const c2 = new TdpController(off.api, () => null);
    await c2.refresh();
    c2.setWatts(8);
    await vi.advanceTimersByTimeAsync(500);
    expect(off.api.setWatts).not.toHaveBeenCalled();
  });

  it("con juego y perfil propio escribe en ambito juego con el contexto del backend", async () => {
    const g = { key: "730", liveAppid: 730, name: "CS2" };
    const f = fake({ state: vi.fn(async () => raw({ appid: "730", follows_global: false, watts: 9 })) });
    const c = new TdpController(f.api, () => g);
    await c.refresh();
    c.setWatts(11);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1); await flush();
    expect(f.api.setWatts).toHaveBeenCalledWith(11, "game", "730", "730");
  });

  it("una lectura que llega mientras mueves el slider no pisa tu valor", async () => {
    const f = fake();
    const c = new TdpController(f.api, () => null);
    await c.refresh();
    c.setWatts(6);
    await c.refresh(); // llega una lectura vieja (12 W) con el cambio pendiente
    expect(c.snapshot.view?.watts).toBe(6);
  });

  it("tras escribir relee el estado real", async () => {
    const f = fake();
    const c = new TdpController(f.api, () => null);
    await c.refresh();
    const calls = (f.api.state as ReturnType<typeof vi.fn>).mock.calls.length;
    c.setWatts(9);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1); await flush(); await flush();
    expect((f.api.state as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(calls);
    expect(c.snapshot.view?.watts).toBe(9);
  });

  it("si Panel rechaza la orden, muestra el motivo en español", async () => {
    const f = fake({ setWatts: vi.fn(async () => ({ ok: false, detail: "game-power-owner" })) });
    const c = new TdpController(f.api, () => null);
    await c.refresh();
    c.setWatts(9);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1); await flush();
    expect(c.snapshot.error).toMatch(/Steam controla/);
  });

  it("si Panel no responde, no revienta y avisa", async () => {
    const f = fake({ setWatts: vi.fn(async () => { throw new Error("timeout"); }) });
    const c = new TdpController(f.api, () => null);
    await c.refresh();
    c.setWatts(9);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1); await flush();
    expect(c.snapshot.error).toMatch(/no respondió/);
  });

  it("ordenes en cola: nunca dos en vuelo a la vez; gana la ultima", async () => {
    let release: () => void = () => {};
    let inflight = 0, maxInflight = 0;
    const f = fake({
      setWatts: vi.fn(async (w: number) => {
        inflight++; maxInflight = Math.max(maxInflight, inflight);
        await new Promise<void>((r) => { release = r; });
        inflight--;
        return { ok: true, applied_w: w };
      }),
    });
    const c = new TdpController(f.api, () => null);
    await c.refresh();
    c.setWatts(8);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1); await flush(); // 1.ª en vuelo
    c.setWatts(13);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1); await flush(); // 2.ª espera
    expect(f.api.setWatts).toHaveBeenCalledTimes(1);
    release(); await flush(); await vi.advanceTimersByTimeAsync(1); await flush();
    expect(f.api.setWatts).toHaveBeenCalledTimes(2);
    expect((f.api.setWatts as ReturnType<typeof vi.fn>).mock.calls[1][0]).toBe(13);
    release(); await flush();
    expect(maxInflight).toBe(1);
  });

  it("preset: se aplica de golpe (potencia + modo de pico) sin espera", async () => {
    const f = fake();
    const c = new TdpController(f.api, () => null);
    await c.refresh();
    const eco = c.snapshot.view!.presets[0];
    c.applyPreset(eco);
    await vi.advanceTimersByTimeAsync(1); await flush();
    expect(f.api.applyPreset).toHaveBeenCalledWith(7, "global", null, null, null);
  });

  it("cambiar entre Global y Este juego usa set_tdp_follow_global", async () => {
    const g = { key: "730", liveAppid: 730, name: "CS2" };
    let st = raw({ appid: "730", follows_global: true });
    const f = fake({
      state: vi.fn(async () => st),
      follow: vi.fn(async (follow: boolean) => { st = { ...st, follows_global: follow }; return st; }),
    });
    const c = new TdpController(f.api, () => g);
    await c.refresh();
    c.setScope("game");
    await vi.advanceTimersByTimeAsync(1); await flush();
    expect(f.api.follow).toHaveBeenCalledWith(false, "730", "730");
    expect(c.snapshot.view?.followsGlobal).toBe(false);
    c.setScope("global");
    await vi.advanceTimersByTimeAsync(1); await flush();
    expect(f.api.follow).toHaveBeenLastCalledWith(true, "730", "730");
    expect(c.snapshot.view?.followsGlobal).toBe(true);
  });

  it("cargador: si cambia on_ac durante el sondeo se relee (cambia el techo)", async () => {
    const f = fake();
    const c = new TdpController(f.api, () => null);
    await c.refresh();
    expect(c.snapshot.view?.max).toBe(15);
    f.set(raw({ on_ac: true }));
    c.watch(3000);
    await vi.advanceTimersByTimeAsync(10); await flush(); await flush();
    expect(c.snapshot.drawW).toBe(9.5);
    expect(c.snapshot.view?.max).toBe(25);
    c.dispose();
  });

  it("al cerrar el panel no se pierde un cambio pendiente", async () => {
    const f = fake();
    const c = new TdpController(f.api, () => null);
    await c.refresh();
    c.setWatts(8);
    c.dispose();
    await flush();
    expect(f.api.setWatts).toHaveBeenCalledWith(8, "global", null, null);
  });
});
