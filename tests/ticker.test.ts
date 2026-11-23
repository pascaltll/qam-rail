import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PER_TICK, pulse, resetTickerForTest, setTickerSlow, tickEvery, tickerStats } from "../src/ticker";

describe("planificador de sondeos", () => {
  beforeEach(() => { resetTickerForTest(); vi.useRealTimers(); });
  it("un solo temporizador para todas las tareas, y ninguno sin tareas", () => {
    const a = tickEvery(() => undefined, 1000), b = tickEvery(() => undefined, 3000);
    expect(tickerStats()).toMatchObject({ tareas: 2, activo: true });
    a(); b();
    expect(tickerStats()).toMatchObject({ tareas: 0, activo: false });
  });
  it("reparte: como mucho 3 tareas por pulso; el resto, al siguiente", () => {
    const f = vi.fn();
    const offs = [1, 2, 3, 4, 5].map(() => tickEvery(f, 1000));
    const t = Date.now() + 1500;
    pulse(t);
    expect(f).toHaveBeenCalledTimes(MAX_PER_TICK);
    pulse(t + 250);
    expect(f).toHaveBeenCalledTimes(5);
    expect(tickerStats().aplazadas).toBe(2);
    offs.forEach((o) => o());
  });
  it("en ahorro va a mitad de ritmo, salvo las exactas", () => {
    setTickerSlow(() => true);
    const normal = vi.fn(), exact = vi.fn();
    const o1 = tickEvery(normal, 1000), o2 = tickEvery(exact, 1000, { exact: true });
    const t = Date.now() + 1100;
    pulse(t); pulse(t + 1100);
    expect(normal).toHaveBeenCalledTimes(1);
    expect(exact).toHaveBeenCalledTimes(2);
    o1(); o2();
  });
  it("una tarea que falla no para a las demás", () => {
    const ok = vi.fn();
    const o1 = tickEvery(() => { throw new Error("x"); }, 500), o2 = tickEvery(ok, 500);
    pulse(Date.now() + 600);
    expect(ok).toHaveBeenCalled();
    o1(); o2();
  });
});
