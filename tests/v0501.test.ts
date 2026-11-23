import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@decky/api", () => ({ callable: () => async () => ({ ok: true }) }));
const ov = vi.fn(async (_on?: boolean) => ({ ok: true }));
vi.mock("../src/qamDesktop", () => ({ desktopOverlay: (on: boolean, _r?: string) => ov(on), qamEvent: async () => undefined }));
import { toggleKeyboard, urlMethods, KEYBOARD_URL, holdOverlayWhileShowing } from "../src/keyboard";

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

describe("teclado sobre una app de escritorio", () => {
  beforeEach(() => { ov.mockClear(); vi.useFakeTimers(); });
  it("sube el overlay mientras se muestra y lo baja al ocultarse", () => {
    const vkm: any = { m_bIsVirtualKeyboardShowing: true };
    holdOverlayWhileShowing(vkm);
    expect(ov).toHaveBeenCalledWith(true);
    vi.advanceTimersByTime(5000);
    expect(ov).not.toHaveBeenCalledWith(false);   // sigue visible
    vkm.m_bIsVirtualKeyboardShowing = false;
    vi.advanceTimersByTime(2000);
    expect(ov).toHaveBeenLastCalledWith(false);
    vi.useRealTimers();
  });
  it("si no se puede leer el estado, lo suelta a los pocos segundos", () => {
    holdOverlayWhileShowing({});
    vi.advanceTimersByTime(3000);
    expect(ov).toHaveBeenLastCalledWith(false);
    vi.useRealTimers();
  });
  it("ShowVirtualKeyboard del gestor de Steam sube el overlay", async () => {
    vi.useRealTimers();
    const show = vi.fn();
    (window as any).SteamUIStore = { ActiveWindowInstance: { VirtualKeyboardManager: { ShowVirtualKeyboard: show, m_bIsVirtualKeyboardShowing: true } } };
    expect(await toggleKeyboard()).toBe("SteamUIStore.ActiveWindowInstance.VirtualKeyboardManager.ShowVirtualKeyboard");
    expect(show).toHaveBeenCalled();
    expect(ov).toHaveBeenCalledWith(true);
    delete (window as any).SteamUIStore;
  });
});
