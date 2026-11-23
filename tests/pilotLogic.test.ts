import { describe, expect, it } from "vitest";
import { BYPASS_MS, decide, REOPEN_WINDOW_MS, type PilotState } from "../src/pilotLogic";

const base: PilotState = { now: 10_000, visible: true, modalOpen: false, openedAt: 0, bypassUntil: 0, broken: false };

describe("decide (piloto de QAM propio)", () => {
  it("intercepta la primera apertura", () => {
    expect(decide(base)).toBe("intercept");
  });
  it("ignora cuando el QAM se oculta", () => {
    expect(decide({ ...base, visible: false })).toBe("ignore");
  });
  it("pulsar el boton con el panel abierto => cerrar el panel (no QAM de Steam)", () => {
    expect(decide({ ...base, modalOpen: true, openedAt: 9_000 })).toBe("close");
  });
  it("pulsacion muy seguida aunque el panel ya no figure abierto => cerrar", () => {
    expect(decide({ ...base, openedAt: base.now - (REOPEN_WINDOW_MS - 1) })).toBe("close");
  });
  it("pasada la ventana vuelve a interceptar", () => {
    expect(decide({ ...base, openedAt: base.now - REOPEN_WINDOW_MS - 1 })).toBe("intercept");
  });
  it("tras pedir el QAM de Steam no se intercepta durante el periodo de gracia", () => {
    expect(decide({ ...base, bypassUntil: base.now + BYPASS_MS - 1 })).toBe("ignore");
    expect(decide({ ...base, bypassUntil: base.now - 1 })).toBe("intercept");
  });
  it("si el piloto fallo, nunca intercepta", () => {
    expect(decide({ ...base, broken: true })).toBe("ignore");
  });
});
