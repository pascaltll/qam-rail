import { describe, it, expect, vi } from "vitest";
import { createRepeater } from "../src/keyRepeat";

describe("repetición de teclas", () => {
  it("un toque corto no repite", () => {
    vi.useFakeTimers();
    const fn = vi.fn(); const r = createRepeater(fn, 300, 50);
    r.start(); vi.advanceTimersByTime(200);
    expect(r.stop()).toBe(false); expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000); expect(fn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it("mantenida, repite tras la pausa y avisa al soltar", () => {
    vi.useFakeTimers();
    const fn = vi.fn(); const r = createRepeater(fn, 300, 50);
    r.start(); vi.advanceTimersByTime(300 + 150);
    expect(fn).toHaveBeenCalledTimes(4);
    expect(r.stop()).toBe(true);
    vi.advanceTimersByTime(500); expect(fn).toHaveBeenCalledTimes(4);
    expect(r.stop()).toBe(false);
    vi.useRealTimers();
  });
});
