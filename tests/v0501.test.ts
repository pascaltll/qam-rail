import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@decky/api", () => ({ callable: () => async () => ({ ok: true }) }));
import { toggleKeyboard, urlMethods, KEYBOARD_URL } from "../src/keyboard";

describe("teclado por enlace de Steam", () => {
  beforeEach(() => { delete (window as any).SteamClient; delete (window as any).BrowserAndBackstackInstances; });
  it("usa los enlaces de SDL", () => {
    expect(KEYBOARD_URL.open).toBe("steam://open/keyboard");
    expect(KEYBOARD_URL.close).toBe("steam://close/keyboard");
  });
  it("sin SteamClient cae al backend", async () => {
    expect(urlMethods()).toEqual([]);
    expect(await toggleKeyboard()).toBe("backend:steam-url");
  });
  it("con URL.ExecuteSteamURL lo usa y pasa el enlace", async () => {
    const f = vi.fn();
    (window as any).SteamClient = { URL: { ExecuteSteamURL: f } };
    expect(await toggleKeyboard()).toBe("URL.ExecuteSteamURL");
    expect(f).toHaveBeenCalledWith("steam://open/keyboard");
    await toggleKeyboard(true);
    expect(f).toHaveBeenLastCalledWith("steam://close/keyboard");
  });
  it("si el método falla prueba el siguiente", async () => {
    const g = vi.fn();
    (window as any).SteamClient = { URL: { ExecuteSteamURL: () => { throw new Error("x"); } }, System: { OpenURL: g } };
    expect(await toggleKeyboard()).toBe("System.OpenURL");
    expect(g).toHaveBeenCalled();
  });
});
