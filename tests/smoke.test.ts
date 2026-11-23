// Prueba de humo: monta el lanzador completo con @decky/ui y Panel de Control simulados y recorre los dos modos.
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@decky/api", () => ({ callable: () => vi.fn(async () => ({})) }));
vi.mock("@decky/ui", () => {
  const box = (tag: string) => ({ children, style, onActivate, onClick, ...rest }: Record<string, unknown>) =>
    h(tag, { style, "data-qr": rest["data-qr"], "aria-label": rest["aria-label"], onClick: (onActivate ?? onClick) as () => void }, children as never);
  return {
    Focusable: box("div"), DialogButton: box("button"), ModalRoot: box("div"),
    TextField: ({ value, onChange, placeholder }: Record<string, unknown>) => h("input", { value, onChange, placeholder } as never),
    Navigation: { Navigate: vi.fn(), NavigateToSteamWeb: vi.fn(), NavigateToChat: vi.fn() }, Router: {}, showModal: vi.fn(), findModuleExport: () => undefined,
  };
});

const state = (o: Record<string, unknown> = {}) => ({
  supported: true, unit: "W", limits: { min: 4, default: 12, max: 15, max_ac: 25 },
  presets: { quiet: 7, balanced: 12, turbo: 15 }, watts: 12, global_watts: 12, applied_w: 12, on_ac: false,
  appid: null, follows_global: true, tdp_control_enabled: true,
  learned: { enough: true, floor: 9, ceil: 14, seed: 11, minutes: 80, target_minutes: 30 }, ...o,
});
let panel = state();
vi.mock("../src/panelBridge", () => ({
  rpc: {
    state: vi.fn(async () => panel),
    presets: vi.fn(async () => ({ order: [], hidden: [], custom: {} })),
    draw: vi.fn(async () => ({ watts: 9.5, on_ac: false })),
    setWatts: vi.fn(async () => ({ ok: true })),
    applyPreset: vi.fn(async () => ({ ok: true })),
    follow: vi.fn(async () => panel),
    resetTelemetry: vi.fn(async () => ({})),
  },
  readTdp: vi.fn(), writeTdp: vi.fn(), bridgeDiag: () => ({}),
  callPanel: vi.fn(async (method: string) => (extra as Record<string, unknown>)[method] ?? {}),
}));
const extra: Record<string, unknown> = {
  get_color_state: { supported: true, presets: ["native", "cine", "vivo", "comodo"], active_preset: "native", oled_look: { saturation: 120 }, appid: null, follows_global: true },
  get_night_state: { supported: true, enabled: false, warmth: 40 },
  get_hdr_state: { supported: false },
  get_eco_state: { enabled: false },
  get_battery_state: {
    battery: { present: true, percent: 76, status: "Discharging", health_percent: 92, cycle_count: 120, eta_seconds: 7200 },
    charge_limit: { supported: true, adjustable: true, enabled: false, percent: 80, min: 50, max: 100 },
  },
  get_fan_curve_state: { supported: true, preset: "auto" },
  get_fan_state: { supported: true, fans: [{ rpm: 2400 }], temps: [{ label: "CPU", celsius: 61 }] },
  get_power_draw: { auto_tdp: false, watts: 9.5 },
  apply_color_preset: { supported: true, presets: ["native", "cine", "vivo", "comodo"], active_preset: "cine", appid: null },
};

import { QamApp } from "../src/Qam";
import { setRunningAppReader } from "../src/game";
import { setPerfStoreReader, type PerfStore } from "../src/steamPerf";
import { resetTdpCache } from "../src/tdpControl";
import { resetStickyForTest } from "../src/game";
import { clearPanelCache } from "../src/hooks";
import { invalidateFriends } from "../src/social";

let perf: PerfStore;
const makePerf = (): PerfStore => {
  const st: PerfStore = {
    msgLimits: {
      is_vrr_supported: true, disable_refresh_rate_management: false, is_manual_display_refresh_rate_available: true,
      display_refresh_manual_hz_min: 40, display_refresh_manual_hz_max: 60, fps_limit_options: [0, 15, 30, 60],
      is_split_scaling_and_filtering_supported: true, split_scaling_scalers_available: [1, 2, 3, 4, 5], split_scaling_filters_available: [1, 2, 3, 4],
      fsr_sharpness_min: 0, fsr_sharpness_max: 20,
    },
    msgSettingsPerApp: { is_vrr_enabled: false, display_refresh_manual_hz: 60, fps_limit: 0, split_scaling_scaler: 1, split_scaling_filter: 1, fsr_sharpness: 5 },
  };
  st.SetFPSLimit = vi.fn((_e: boolean, v: number) => { st.msgSettingsPerApp!.fps_limit = v; });
  st.SetVRREnabled = vi.fn((v: boolean) => { st.msgSettingsPerApp!.is_vrr_enabled = v; });
  st.SetDisplayRefreshRateManualHz = vi.fn();
  st.SetSplitScalingScaler = vi.fn((v: number) => { st.msgSettingsPerApp!.split_scaling_scaler = v; });
  st.SetSplitScalingFilter = vi.fn((v: number) => { st.msgSettingsPerApp!.split_scaling_filter = v; });
  st.SetFSRSharpness = vi.fn();
  return st;
};

let host: HTMLElement;
let running: unknown = null;
const flush = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const mount = async () => {
  const root = createRoot(host);
  await act(async () => { root.render(h(QamApp, { log: () => {}, onNative: () => {}, onClose: () => {} })); });
  await flush();
  // Inicio abre en dos tiempos: lo de abajo se monta tras el primer fotograma.
  await act(async () => { vi.advanceTimersByTime(60); });
  await flush();
  return root;
};

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.appendChild(host);
  (window as unknown as Record<string, unknown>).SteamClient = { System: {} };
  setRunningAppReader(() => running);
  panel = state(); running = null;
  perf = makePerf();
  setPerfStoreReader(() => perf);
  resetTdpCache(); clearPanelCache(); invalidateFriends(); resetStickyForTest();
  try { window.localStorage.clear(); } catch { /* nada */ }
  (window as unknown as Record<string, unknown>).collectionStore = { localGamesCollection: { allApps: [
    { appid: 3000000001, display_name: "MiniTube", app_type: 1073741824, gameid: "g1" },
    { appid: 3000000002, display_name: "Recomp Hub", app_type: 1073741824, gameid: "g2" },
  ] } };
});
afterEach(() => { vi.useRealTimers(); host.remove(); setRunningAppReader(null); setPerfStoreReader(null); delete (window as unknown as Record<string, unknown>).collectionStore; });

describe("QamApp (humo)", () => {
  it("modo normal: Inicio con musica, potencia compacta y apps; sin sugerencia", async () => {
    const root = await mount();
    const t = host.textContent ?? "";
    expect(t).toContain("Banda sonora de Steam");
    expect(t).toContain("Potencia en Steam");
    expect(t).toContain("12 W");
    expect(t).toContain("MiniTube");
    expect(t).toContain("Recomp Hub");
    expect(t).toContain("Más apps");
    expect(t).toContain("No molestar");
    expect(t).not.toContain("Sugerido");
    expect(t).not.toContain("Colores");
    act(() => root.unmount());
  });

  it("modo juego: cabecera, potencia con sugerencia y modulo anclado", async () => {
    running = { appid: 730, display_name: "CS2" };
    panel = state({ appid: "730" });
    const root = await mount();
    const t = host.textContent ?? "";
    expect(t).toContain("CS2");
    expect(t).toContain("Potencia de este juego");
    expect(t).toContain("Tipo de juego");
    expect(t).toContain("Zona sugerida 9–14 W");
    expect(t).toContain("Sugerido 11 W");
    expect(t).toContain("Sin límite");
    expect(t).toContain("VRR");
    expect(t).toContain("Color: Nativo");
    expect(t).not.toContain("Banda sonora de Steam");
    act(() => root.unmount());
  });

  it("el juego aparece con el panel abierto: Inicio se recompone y avisa", async () => {
    const root = await mount();
    expect(host.textContent).toContain("Banda sonora de Steam");
    running = { appid: 730, display_name: "CS2" };
    panel = state({ appid: "730" });
    await act(async () => { vi.advanceTimersByTime(2100); });
    await flush();
    await act(async () => { vi.advanceTimersByTime(400); });
    await flush();
    await act(async () => { vi.advanceTimersByTime(300); });
    await flush();
    const t = host.textContent ?? "";
    expect(t).toContain("Juego: CS2");
    expect(t).toContain("Zona sugerida");
    act(() => root.unmount());
  });

  it("el juego se cierra: vuelve el Inicio normal", async () => {
    running = { appid: 730, display_name: "CS2" };
    panel = state({ appid: "730" });
    const root = await mount();
    running = null; panel = state();
    // Un juego visto hace poco se mantiene unos segundos (lecturas vacías pasajeras de Steam): se espera el margen.
    await act(async () => { vi.advanceTimersByTime(5900); });
    await flush();
    expect(host.textContent).not.toContain("Juego cerrado"); // aún dentro del margen
    await act(async () => { vi.advanceTimersByTime(400); });
    await flush();
    await act(async () => { vi.advanceTimersByTime(300); });
    await flush();
    const t = host.textContent ?? "";
    expect(t).toContain("Juego cerrado");
    expect(t).toContain("Banda sonora de Steam");
    act(() => root.unmount());
  });

  const rail = () => [...host.querySelectorAll("[aria-label]")] as HTMLElement[];
  // Texto visible: las secciones visitadas siguen montadas pero ocultas (display: none).
  const shown = () => { const c = host.cloneNode(true) as HTMLElement; c.querySelectorAll<HTMLElement>("[style*='display: none']").forEach((e) => e.remove()); return c.textContent ?? ""; };
  const click = async (el: Element | undefined) => { await act(async () => { (el as HTMLElement).click(); }); await flush(); };
  const byText = (t: string) => [...host.querySelectorAll("div,button,span")].filter((e) => e.children.length === 0 && e.textContent === t).pop();

  it("el riel tiene 6 iconos fijos, en el mismo orden en los dos modos", async () => {
    const want = ["Inicio", "Rendimiento", "Imagen y sonido", "Conexiones", "Apps", "Social", "Más"];
    let root = await mount();
    expect(rail().map((e) => e.getAttribute("aria-label"))).toEqual(want);
    act(() => root.unmount());
    running = { appid: 730, display_name: "CS2" };
    panel = state({ appid: "730" });
    root = await mount();
    expect(rail().map((e) => e.getAttribute("aria-label"))).toEqual(want);
    act(() => root.unmount());
  });

  it("con juego, Energia muestra lo aprendido y 'olvidar' pide confirmacion", async () => {
    running = { appid: 730, display_name: "CS2" };
    panel = state({ appid: "730" });
    const root = await mount();
    await click(rail()[1]);
    const t = host.textContent ?? "";
    // Lo aprendido va dentro de la tarjeta de potencia (antes otra tarjeta aparte).
    expect(t).toContain("Aprendido · zona 9–14 W");
    const { rpc } = await import("../src/panelBridge");
    await click(byText("Olvidar"));
    expect(host.textContent).toContain("¿Seguro?");
    expect(rpc.resetTelemetry).not.toHaveBeenCalled();
    await click(byText("¿Seguro?"));
    expect(rpc.resetTelemetry).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("A en Inicio con juego abierto alterna Inicio de juego e Inicio normal", async () => {
    running = { appid: 730, display_name: "CS2" };
    panel = state({ appid: "730" });
    const root = await mount();
    expect(host.textContent).toContain("Zona sugerida");
    await click(rail()[0]);
    await act(async () => { vi.advanceTimersByTime(400); });
    await flush();
    await act(async () => { vi.advanceTimersByTime(300); });
    await flush();
    expect(host.textContent).toContain("Banda sonora de Steam");
    await click(rail()[0]);
    await act(async () => { vi.advanceTimersByTime(400); });
    await flush();
    await act(async () => { vi.advanceTimersByTime(300); });
    await flush();
    expect(host.textContent).toContain("Zona sugerida");
    act(() => root.unmount());
  });

  it("Apps: pestañas Apps / Plugins con tienda y ajustes de Decky; Pantalla y sonido sin brillo ni volumen duplicados", async () => {
    const root = await mount();
    await click(rail()[4]);
    await click(byText("Plugins"));
    expect(host.textContent).toContain("Tienda");
    expect(host.textContent).toContain("Ajustes de Decky");
    await click(rail()[2]);
    const t = shown();
    expect(t).toContain("Modo noche");
    // Imagen y sonido lleva también brillo y volumen (quien entra, los busca); no lleva FPS ni escalado.
    expect(t).toContain("Brillo");
    expect(t).not.toContain("Límite de FPS");
    act(() => root.unmount());
  });

  it("Panel de Control ausente: la tarjeta lo dice y no rompe el Inicio", async () => {
    const { rpc } = await import("../src/panelBridge");
    (rpc.state as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("sin via"));
    const root = await mount();
    expect(host.textContent).toContain("Potencia no disponible");
    expect(host.textContent).toContain("Banda sonora de Steam");
    act(() => root.unmount());
  });
  const deckyWith = (plugins: unknown[]) => {
    const setActivePlugin = vi.fn();
    (window as unknown as Record<string, unknown>).DeckyPluginLoader = { deckyState: { publicState: () => ({ plugins }), setActivePlugin } };
    return setActivePlugin;
  };

  it("Apps › Plugins lista los de Decky (sin los propios) y uno se abre en la columna; B/✕ la cierra", async () => {
    deckyWith([
      { name: "Colores", content: h("div", null, "CONTENIDO-COLORES") },
      { name: "QAM Rail", content: h("div", null, "propio") },
    ]);
    const root = await mount();
    await click(rail()[4]);
    await click(byText("Plugins"));
    expect(host.textContent).not.toContain("propio");
    await click(byText("Colores"));
    expect(host.textContent).toContain("CONTENIDO-COLORES");
    await click(host.querySelector('[aria-label="Cerrar columna"]') as Element);
    expect(host.textContent).not.toContain("CONTENIDO-COLORES");
    delete (window as unknown as Record<string, unknown>).DeckyPluginLoader;
    act(() => root.unmount());
  });

  it("plugins frecuentes: en Inicio de juego aparecen Colores y Framegen y se abren en la columna", async () => {
    deckyWith([
      { name: "Colores", content: h("div", null, "RGB") },
      { name: "Decky Framegen", content: h("div", null, "FG") },
      { name: "Otro", content: h("div", null, "x") },
    ]);
    running = { appid: 730, display_name: "CS2" };
    panel = state({ appid: "730" });
    const root = await mount();
    const t = host.textContent ?? "";
    expect(t).toContain("Plugins para jugar");
    expect(t).toContain("Decky Framegen");
    expect(t).not.toContain("Otro");
    await click(byText("Decky Framegen"));
    expect(host.textContent).toContain("FG");
    delete (window as unknown as Record<string, unknown>).DeckyPluginLoader;
    act(() => root.unmount());
  });

  it("plugin que lanza error al pintarse: se cierra la columna y se usa el QAM anterior", async () => {
    const setActive = deckyWith([{ name: "Roto", content: h(() => { throw new Error("x"); }) }]);
    const onNative = vi.fn();
    const root = createRoot(host);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => { root.render(h(QamApp, { log: () => {}, onNative, onClose: () => {} })); });
    await flush();
    await click(rail()[4]);
    await click(byText("Plugins"));
    await click(byText("Roto"));
    await flush();
    expect(setActive).toHaveBeenCalledWith("Roto");
    expect(onNative).toHaveBeenCalledWith(999);
    err.mockRestore(); delete (window as unknown as Record<string, unknown>).DeckyPluginLoader;
    act(() => root.unmount());
  });

  it("Pantalla sin juego: fluidez y color de Steam; escalado apagado (es por juego)", async () => {
    const root = await mount();
    await click(rail()[1]); // Rendimiento: FPS y escalado
    const t = host.textContent ?? "";
    expect(t).toContain("Límite de FPS");
    expect(t).toContain("Refresco");
    expect(t).toContain("Se ajusta para cada juego");
    expect(t).not.toContain("Nitidez");
    await click(byText("30"));
    expect(perf.SetFPSLimit).toHaveBeenCalledWith(false, 30);
    await click(byText("Estirar"));
    expect(perf.SetSplitScalingScaler).not.toHaveBeenCalled();
    await click(rail()[2]); // Imagen y sonido: color
    expect(host.textContent).toContain("Aspecto OLED");
    await click(byText("Cine"));
    const { callPanel } = await import("../src/panelBridge");
    expect(callPanel).toHaveBeenCalledWith("apply_color_preset", expect.anything(), ["cine", "global", null, null]);
    act(() => root.unmount());
  });

  it("Pantalla con juego: escalado, filtro y nitidez se guardan en el perfil del juego; color crea su perfil", async () => {
    running = { appid: 730, display_name: "CS2" };
    panel = state({ appid: "730" });
    extra.get_color_state = { ...(extra.get_color_state as object), appid: "730", follows_global: true };
    const root = await mount();
    await click(rail()[1]);
    expect(host.textContent).toContain("Este juego");
    expect(host.textContent).not.toContain("Como en Steam");
    await click(byText("Estirar"));
    expect(perf.SetSplitScalingScaler).toHaveBeenCalledWith(5);
    await click(byText("FSR"));
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(host.textContent).toContain("Nitidez FSR");
    const saved = JSON.parse(window.localStorage.getItem("qam-rail:display-profiles2") ?? "{}");
    expect(saved.games?.["730"]?.scaler).toBe(5);
    expect(saved.games?.["730"]?.filter).toBe(3);
    await click(rail()[2]);
    await click(byText("Cine"));
    await flush();
    const { callPanel } = await import("../src/panelBridge");
    expect(callPanel).toHaveBeenCalledWith("set_color_follow_global", expect.anything(), [false, "730", "730"]);
    expect(callPanel).toHaveBeenCalledWith("apply_color_preset", expect.anything(), ["cine", "game", "730", "730"]);
    extra.get_color_state = { ...(extra.get_color_state as object), appid: null };
    act(() => root.unmount());
  });

  it("Pantalla sin almacen de Steam: atajo al nativo, sin controles inventados", async () => {
    setPerfStoreReader(() => null);
    const root = await mount();
    await click(rail()[1]);
    const t = host.textContent ?? "";
    expect(t).toContain("Rendimiento de Steam");
    expect(t).not.toContain("Límite de FPS");
    act(() => root.unmount());
  });

  it("Energía: batería con salud y ciclos, límite de carga, Modo Eco y ventiladores", async () => {
    const root = await mount();
    await click(rail()[1]);
    await flush();
    const t = host.textContent ?? "";
    expect(t).toContain("76 %");
    expect(t).toContain("salud 92 %");
    expect(t).toContain("120 ciclos");
    expect(t).toContain("Limitar carga");
    expect(t).toContain("Descargas");
    expect(t).not.toContain("Modo Eco");
    // Ventiladores: plegados en «Avanzado» (casi nunca se tocan).
    expect(t).not.toContain("2400 rpm");
    await click(byText("Avanzado"));
    await flush();
    expect(host.textContent).toContain("2400 rpm");
    const { callPanel } = await import("../src/panelBridge");
    await click(byText("Silencio"));
    expect(callPanel).toHaveBeenCalledWith("set_fan_preset", expect.anything(), ["silent", "global", null]);
    act(() => root.unmount());
  });

  it("Conexiones: Wi‑Fi, Bluetooth, No molestar y avión llaman a Steam", async () => {
    const setWifi = vi.fn(async () => ({}));
    const setPlane = vi.fn();
    const setDnd = vi.fn();
    (window as unknown as Record<string, unknown>).SteamClient = { System: { SetAirplaneMode: setPlane, Network: { SetWifiEnabled: setWifi } } };
    (window as unknown as Record<string, unknown>).friendStore = { m_FriendsUIFriendStore: { GetUserDoNotDisturb: () => false, SetUserDoNotDisturb: setDnd } };
    const root = await mount();
    // Fichas rápidas de Inicio: Wi‑Fi (si el sistema no contesta, se intenta por Steam) y No molestar.
    await click(byText("Wi‑Fi"));
    await flush();
    await click(byText("No molestar"));
    await click(rail()[3]);
    await click(byText("Modo avión"));
    expect(setWifi).toHaveBeenCalledWith(false);
    expect(setPlane).toHaveBeenCalledWith(true);
    expect(setDnd).toHaveBeenCalledWith(true);
    delete (window as unknown as Record<string, unknown>).friendStore;
    act(() => root.unmount());
  });
  const player = (id: number, name: string, state: number, appid = 0, game = "") => ({
    persona: {
      m_strPlayerName: name, m_ePersonaState: state, m_unGamePlayedAppID: appid, m_rtLastSeenOnline: 0,
      GetCurrentGameName: () => game, avatar_url_medium: "",
      m_steamid: { ConvertTo64BitString: () => `7656119${id}`, GetAccountID: () => id },
    },
  });
  let voiceChat: Record<string, unknown> & { active: number; InitiateFriendChat: ReturnType<typeof vi.fn>; OnUserEndVoiceChat: ReturnType<typeof vi.fn> };
  const setupSocial = () => {
    invalidateFriends();
    const chat = {
      m_rgChatMessages: [
        { unAccountID: 11, strMessage: "¿jugamos?", rtTimestamp: 1000 },
        { unAccountID: 1, strMessage: "[b]vale[/b]", rtTimestamp: 1010 },
      ],
      m_cUnreadChatMessages: 2, m_bFriendIsTyping: true,
      SendChatMessage: vi.fn(async () => {}), ToggleVoiceChat: vi.fn(), BVoiceActive: () => false, BIsVoiceAllowed: () => true,
      LoadChatLogs: vi.fn(async () => {}), OnActivate: vi.fn(), OnDeactivate: vi.fn(), OnTyping: vi.fn(),
    };
    voiceChat = {
      active: 0,
      IsVoiceChatActive() { return this.active !== 0; }, GetActiveOneOnOneVoiceChatAccountID() { return this.active; }, GetActiveChatRoomGroupID: () => "",
      IsVoiceActiveForFriend(id: number) { return this.active === id; }, IsMicMuted: () => false, IsOutputMuted: () => false,
      InitiateFriendChat: vi.fn(function (this: { active: number }, id: number) { this.active = id; }),
      OnUserEndVoiceChat: vi.fn(function (this: { active: number }) { this.active = 0; }),
      ToggleMicMuting: vi.fn(), ToggleOutputMuting: vi.fn(), GetOneOnOneCallsWaitingForJoinOrAccept: () => new Map(),
      RegisterForVoiceChatActiveStateChange: () => ({ Unregister: () => {} }),
    };
    const w = window as unknown as Record<string, unknown>;
    w.friendStore = {
      currentUserSteamID: { GetAccountID: () => 1 },
      allFriends: [player(11, "Mateo", 1, 730, "CS2"), player(12, "Lucía", 1), player(13, "Andrés", 3), player(14, "Sofía", 0)],
      m_FriendsUIFriendStore: { m_self: { persona: { m_strPlayerName: "Carlos", m_ePersonaState: 1 } }, m_eUserPersonaState: 1, SetUserPersonaState: vi.fn() },
    };
    w.g_FriendsUIApp = { ChatStore: { GetFriendChat: (id: number) => (id === 11 ? chat : null), VoiceChat: voiceChat } };
    return chat;
  };
  const clearSocial = () => { const w = window as unknown as Record<string, unknown>; delete w.friendStore; delete w.g_FriendsUIApp; };

  it("Social: grupos por estado, desconectados plegados, globo de no leidos en el riel", async () => {
    setupSocial();
    const root = await mount();
    expect(rail()[5].textContent).toContain("2");
    await click(rail()[5]);
    const t = host.textContent ?? "";
    expect(t).toContain("Carlos");
    expect(t).toContain("Jugando (1)");
    expect(t).toContain("Jugando · CS2");
    expect(t).toContain("En línea (1)");
    expect(t).toContain("Ausentes (1)");
    expect(t).toContain("Desconectados (1)");
    expect(t).not.toContain("Sofía");
    await click(byText("Chats"));
    expect(host.textContent).toContain("Tú: vale");
    clearSocial();
    act(() => root.unmount());
  });

  it("Social: abrir un amigo muestra la conversacion en la columna; respuesta rapida y llamada", async () => {
    const chat = setupSocial();
    const root = await mount();
    await click(rail()[5]);
    await click(byText("Mateo"));
    const t = host.textContent ?? "";
    expect(t).toContain("¿jugamos?");
    expect(t).toContain("vale");
    expect(t).toContain("está escribiendo");
    await click(byText("👍"));
    expect(chat.SendChatMessage).toHaveBeenCalledWith("👍");
    expect(chat.LoadChatLogs).toHaveBeenCalled();
    expect(chat.OnActivate).toHaveBeenCalled();
    await click([...host.querySelectorAll("button")].find((b) => b.textContent === "Llamar"));
    expect(voiceChat.InitiateFriendChat).toHaveBeenCalledWith(11);
    // La barra de voz aparece al instante y colgar usa OnUserEndVoiceChat.
    await act(async () => { vi.advanceTimersByTime(3100); });
    expect(host.textContent).toContain("En llamada con Mateo");
    await click([...host.querySelectorAll("button")].find((b) => b.textContent === "Colgar" && !b.closest("[data-x]")));
    expect(voiceChat.OnUserEndVoiceChat).toHaveBeenCalled();
    await click(host.querySelector('[aria-label="Cerrar columna"]') as Element);
    expect(host.textContent).not.toContain("está escribiendo");
    expect(chat.OnDeactivate).toHaveBeenCalled();
    clearSocial();
    act(() => root.unmount());
  });

  it("Social con juego: pestaña Jugar juntos invita por Remote Play Together", async () => {
    setupSocial();
    const invite = vi.fn(async () => 1);
    (window as unknown as Record<string, unknown>).SteamClient = { System: {}, RemotePlay: { CreateInviteAndSession: invite } };
    running = { appid: 730, display_name: "CS2" };
    panel = state({ appid: "730" });
    const root = await mount();
    await click(rail()[5]);
    const t = host.textContent ?? "";
    expect(t).toContain("También juegan a CS2");
    expect(t).toContain("Remote Play Together");
    const btn = [...host.querySelectorAll("button")].find((b) => b.textContent === "Invitar");
    await click(btn);
    expect(invite).toHaveBeenCalledWith("765611912", "730");
    clearSocial();
    act(() => root.unmount());
  });

  it("Más › Pruebas y diagnóstico: ejecutar todo, informe, fluidez, contratos y amigos sin DevTools", async () => {
    const root = await mount();
    await click(rail()[6]);
    expect(host.textContent).toContain("Apariencia");
    // Apariencia es una pantalla propia: colores, personalizar (acento, esquinas, espacio, al pulsar) y el tema.
    await click(byText("Apariencia"));
    const ap = shown();
    for (const x of ["Como Panel", "Personalizar", "Esquinas", "Espacio", "Al pulsar", "Tema de Panel de Control"]) expect(ap).toContain(x);
    await click(byText("Redondas"));
    const { currentPalette } = await import("../src/appearance");
    expect(currentPalette().cardRadius).toBe(28);
    await click(byText("Del tema"));
    await click(byText("← Más"));
    await click(byText("Pruebas y diagnóstico"));
    const t = host.textContent ?? "";
    expect(t).toContain("Probar ahora");
    expect(t).toContain("Sin cambiar la potencia");
    expect(t).toContain("Juntar en un .zip");
    await click(byText("Pruebas avanzadas y registro ▾"));
    expect(host.textContent).toContain("Contrato con Panel");
    expect(host.textContent).toContain("Contrato con Steam");
    expect(host.textContent).toContain("Cómo medir con un juego");
    // Pruebas sueltas: cualquier paso por separado, con su luz.
    expect(host.textContent).toContain("Sonido");
    await click(byText("Potencia del menú"));
    await flush();
    const { suiteState } = await import("../src/diagTests");
    expect(suiteState().steps.find((x) => x.id === "potencia-menu")?.status).toBe("ok");
    expect(host.textContent).toContain("Prueba de fluidez del panel");
    expect(host.textContent).toContain("Completa (5, ≈ 2 min)");
    expect(host.textContent).toContain("Registro (uso real, por potencia)");
    expect(host.textContent).toContain("Teclado 30 s");
    expect((window as unknown as Record<string, unknown>).__qamRailUI).toBeTruthy();
    act(() => root.unmount());
    expect((window as unknown as Record<string, unknown>).__qamRailUI).toBeUndefined();
  });

  it("secciones visitadas siguen montadas: volver es instantaneo y la oculta no se ve", async () => {
    const root = await mount();
    await click(rail()[1]);
    await flush();
    expect(shown()).toContain("Batería");
    await click(rail()[0]);
    expect(shown()).not.toContain("Batería");
    expect(host.textContent).toContain("Batería");
    await act(async () => { vi.advanceTimersByTime(400); }); // el mismo icono no se activa dos veces en 350 ms
    await click(rail()[1]);
    expect(shown()).toContain("Batería");
    act(() => root.unmount());
  });

  it("Avisos: bandeja de Steam agrupada, globo de no vistos, abrir y quitar", async () => {
    const open = vi.fn();
    const removed: unknown[] = [];
    const tray = [
      { eType: 1, notifications: [{ notificationID: 5, eType: 1, rtCreated: 100, bNewIndicator: true, data: { title: "Descarga completada", body: "Hades II", onClick: open } }] },
      { eType: 4, notifications: [{ notificationID: 6, eType: 4, rtCreated: 50, data: { title: "Mateo está en línea" } }] },
    ];
    const ns = {
      m_rgNotificationTray: tray, m_nUnviewedNotifications: 2, Viewed: vi.fn(), MarkNotificationRead: vi.fn(),
      RemoveFromTrayWhere: vi.fn((cb: (t: unknown) => boolean) => { removed.push(cb({ notificationID: 6 })); }),
      m_cbkNotificationTray: { Register: () => ({ Unregister: () => {} }) },
    };
    (window as unknown as Record<string, unknown>).NotificationStore = ns;
    const root = await mount();
    // Avisos es una pestaña de Social; el globo del riel suma mensajes y avisos sin ver.
    expect(rail()[5].textContent).toContain("2");
    await click(rail()[5]);
    const t = shown();
    expect(t).toContain("Descargas");
    expect(t).toContain("Descarga completada");
    expect(t).toContain("Amigos");
    expect(ns.Viewed).toHaveBeenCalled();
    await click(byText("Descarga completada"));
    expect(open).toHaveBeenCalled();
    expect(ns.MarkNotificationRead).toHaveBeenCalledWith(5);
    await click(byText("Quitar todos"));
    expect(removed[0]).toBe(true);
    delete (window as unknown as Record<string, unknown>).NotificationStore;
    act(() => root.unmount());
  });

  it("Grupos: icono, salas de texto y de voz, mensajes con autor y envío; Enter envía sin salir", async () => {
    setupSocial();
    const general = {
      name: "general", m_rgChatMessages: [{ unAccountID: 11, strMessage: "hola grupo", rtTimestamp: 5 }],
      SendChatMessage: vi.fn(async () => {}), LoadChatLogs: vi.fn(async () => {}), OnActivate: vi.fn(), OnDeactivate: vi.fn(),
    };
    const voz = { name: "Voz", voice_allowed: true, m_rgChatMessages: [], StartVoiceChat: vi.fn(), SendChatMessage: vi.fn(), OnActivate: vi.fn(), OnDeactivate: vi.fn() };
    const app = (window as unknown as { g_FriendsUIApp: { ChatStore: Record<string, unknown> } }).g_FriendsUIApp;
    app.ChatStore.currentChatRoomGroups = [{ name: "Los del viernes", chatRoomList: [general, voz], online_member_count: 3 }];
    const root = await mount();
    await click(rail()[5]);
    await click(byText("Grupos"));
    expect(shown()).toContain("Los del viernes");
    expect(shown()).toContain("3 en línea · 2 salas · 1 de voz");
    await click(byText("Los del viernes"));
    expect(host.textContent).toContain("hola grupo");
    expect(host.textContent).toContain("Mateo"); // autor del mensaje
    expect(general.LoadChatLogs).toHaveBeenCalled();
    expect(general.OnActivate).toHaveBeenCalled();
    const input = host.querySelector("input") as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "nos vemos");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const outer = vi.fn();
    host.addEventListener("keydown", outer);
    await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    await flush();
    expect(general.SendChatMessage).toHaveBeenCalledWith("nos vemos");
    expect(outer).not.toHaveBeenCalled();
    await click([...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Voz")));
    await click([...host.querySelectorAll("button")].find((b) => b.textContent === "Entrar"));
    expect(voz.StartVoiceChat).toHaveBeenCalled();
    clearSocial();
    act(() => root.unmount());
  });

  it("Música: con algo sonando, mini reproductor real (play/pausa, siguiente, aleatorio)", async () => {
    let cb: ((t: unknown) => void) | null = null;
    let posCb: ((p: number) => void) | null = null;
    const Music = {
      TogglePlayPause: vi.fn(), PlayNext: vi.fn(), PlayPrevious: vi.fn(), SetPlayingShuffled: vi.fn(), SetPlayingRepeatStatus: vi.fn(),
      RegisterForMusicPlaybackChanges: (f: (t: unknown) => void) => { cb = f; return { unregister: () => {} }; },
      RegisterForMusicPlaybackPosition: (f: (p: number) => void) => { posCb = f; return { unregister: () => {} }; },
    };
    (window as unknown as Record<string, unknown>).SteamClient = { System: {}, Music };
    (window as unknown as Record<string, unknown>).appStore = { GetAppOverviewByAppID: () => ({ display_name: "Hades II Soundtrack" }) };
    const { startMusicWatch } = await import("../src/music");
    const stop = startMusicWatch();
    const root = await mount();
    expect(shown()).toContain("Elegir qué escuchar");
    await act(async () => { cb!({ uSoundtrackAppId: 9, ePlaybackStatus: 1, bShuffle: false, eRepeatStatus: 0, nVolume: 80, nActiveTrack: 2, nLengthInMsec: 180000 }); });
    expect(shown()).toContain("Hades II Soundtrack");
    expect(shown()).toContain("Pista 3");
    // Steam da la posición en milisegundos: 83 500 ms = 1:23 (antes salía 1391:40 y «el contador se aceleraba»).
    await act(async () => { posCb!(83_500); });
    expect(shown()).toContain("1:23 / 3:00");
    const btn = (label: string) => host.querySelector(`[aria-label="${label}"]`) as HTMLElement;
    await click(btn("Pausa"));
    expect(Music.TogglePlayPause).toHaveBeenCalled();
    await click(btn("Siguiente"));
    expect(Music.PlayNext).toHaveBeenCalled();
    await click(btn("Aleatorio"));
    expect(Music.SetPlayingShuffled).toHaveBeenCalledWith(true);
    stop();
    delete (window as unknown as Record<string, unknown>).appStore;
    act(() => root.unmount());
  });

  it("Conexiones: Wi‑Fi y Bluetooth con lo ya conocido, enlaces a Ajustes y Remote Play como próximamente", async () => {
    const root = await mount();
    await click(rail()[3]);
    const t = host.textContent ?? "";
    expect(t).toContain("Wi‑Fi");
    expect(t).toContain("Bluetooth");
    expect(t).toContain("Otras redes");
    expect(t).toContain("Emparejar otro");
    expect(t).toContain("Modo avión");
    expect(t).toContain("próximamente");
    expect(t).not.toContain("Buscar");
    act(() => root.unmount());
  });

  it("Amigos: mi estado con punto e icono; elegir Invisible lo pide a Steam", async () => {
    setupSocial();
    const fs = (window as unknown as { friendStore: { m_FriendsUIFriendStore: { SetUserPersonaState: ReturnType<typeof vi.fn> } } }).friendStore;
    const root = await mount();
    await click(rail()[5]);
    // La ficha de mi estado va arriba (antes que la lista, donde «En línea» también sale bajo cada amigo).
    await click([...host.querySelectorAll("span")].find((e) => e.textContent === "En línea"));
    expect(host.textContent).toContain("te ven desconectado; tú lo ves todo");
    await click(byText("Invisible"));
    expect(fs.m_FriendsUIFriendStore.SetUserPersonaState).toHaveBeenCalledWith(7, true);
    expect(host.textContent).not.toContain("te ven desconectado; tú lo ves todo");
    clearSocial();
    act(() => root.unmount());
  });

  it("potencia compartida: lo que cambias en Inicio se ve en Energía (aunque Energía siga montada)", async () => {
    const root = await mount();
    await click(rail()[1]);
    await flush();
    await act(async () => { vi.advanceTimersByTime(400); });
    await flush();
    await act(async () => { vi.advanceTimersByTime(300); });
    await flush();
    const { rpc } = await import("../src/panelBridge");
    (rpc.applyPreset as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => { panel = state({ global_watts: 7, watts: 7, applied_w: 7 }); return { ok: true }; });
    await click(rail()[0]);
    await click(byText("Eco 7"));
    await act(async () => { vi.advanceTimersByTime(400); });
    await flush();
    await act(async () => { vi.advanceTimersByTime(300); });
    await flush();
    await flush();
    await click(rail()[1]);
    await flush();
    expect(shown()).toMatch(/Potencia en Steam\s*7 W/);
    act(() => root.unmount());
  });

});
