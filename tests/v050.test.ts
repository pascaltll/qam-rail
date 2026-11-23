import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/api", () => ({ callable: () => vi.fn(async () => ({})), openFilePicker: vi.fn() }));
import { installMessage, type AppsJob, type QamApp } from "../src/qamApps";

const app = { id: "forge", name: "Forgeinator 3000", version: "3.13", path: "/x", launch: "bin/f", art: {} } as QamApp;

describe("installMessage (0.50)", () => {
  it("instalada / actualizada, con y sin verificación", () => {
    expect(installMessage({ state: "done", app } as AppsJob)).toBe("Forgeinator 3000 3.13 instalada: ya está en Apps e Inicio");
    expect(installMessage({ state: "done", app, updated: true, verified: true } as AppsJob)).toContain("actualizada · descarga verificada");
  });
  it("error con vuelta atrás: dice a qué versión se volvió", () => {
    const m = installMessage({ state: "error", error: "RuntimeError: el instalador de la app falló", rolled_back: true, back_to: "3.12" } as AppsJob);
    expect(m).toContain("Se volvió a la versión 3.12");
  });
  it("primera instalación fallida: se quitó lo hecho a medias", () => {
    expect(installMessage({ state: "error", error: "x", rolled_back: true, back_to: null } as AppsJob)).toContain("Se quitó lo instalado a medias");
  });
  it("cancelada y error sin vuelta atrás", () => {
    expect(installMessage({ state: "cancelled" } as AppsJob)).toBe("Instalación cancelada");
    expect(installMessage({ state: "error", error: "SHA-256" } as AppsJob)).not.toContain("Se volvió");
  });
});
