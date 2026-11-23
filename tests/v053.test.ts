import { describe, expect, it, vi } from "vitest";
vi.mock("@decky/api", () => ({ callable: () => async () => ({ ok: true }) }));

import { channelLine, isActive, kindName, other, switchMessage, type ChannelInfo } from "../src/qamChannel";
import { HELP } from "../src/help";

const info = (o: Partial<ChannelInfo> = {}): ChannelInfo => ({ me: "dev", active: "dev", dev_installed: true, stable_installed: true, version: "0.53.0-dev.1", notice: null, ...o });

describe("canales 0.53", () => {
  it("solo dibuja el QAM la copia activa; sin dato se comporta como siempre", () => {
    expect(isActive(info())).toBe(true);
    expect(isActive(info({ me: "stable", active: "dev" }))).toBe(false);
    expect(isActive(null)).toBe(true);
    expect(isActive(undefined)).toBe(true);
  });
  it("la otra copia y si se puede pasar a ella", () => {
    expect(other(info())).toEqual({ kind: "stable", installed: true });
    expect(other(info({ stable_installed: false }))).toEqual({ kind: "stable", installed: false });
    expect(other(info({ me: "stable", active: "stable", dev_installed: false }))).toEqual({ kind: "dev", installed: false });
  });
  it("línea de estado", () => {
    expect(channelLine(info())).toContain("desarrollo 0.53.0-dev.1 activa");
    expect(channelLine(info())).toContain("también instalada la estable");
    expect(channelLine(info({ me: "stable", active: "dev", version: "0.53.0" }))).toContain("en pausa · activa: desarrollo");
    expect(channelLine(info({ stable_installed: false }))).not.toContain("también");
  });
  it("mensajes", () => {
    expect(kindName("dev")).toBe("desarrollo");
    expect(switchMessage({ ok: true, restarting: true }, "stable")).toContain("estable");
    expect(switchMessage({ ok: false, error: "x" }, "dev")).toBe("No se pudo: x");
  });
  it("hay ayuda de canales con el comando de terminal", () => {
    expect(HELP.canales.text.join(" ")).toContain("./canal.sh estable");
  });
});
