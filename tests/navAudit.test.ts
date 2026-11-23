// Auditoría de navegación con el mando: monta cada sección y busca trampas de foco y controles inalcanzables.
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@decky/api", () => ({ callable: () => vi.fn(async () => ({})) }));
vi.mock("@decky/ui", () => {
  const box = (tag: string) => ({ children, style, onActivate, onClick, ...rest }: Record<string, unknown>) =>
    h(tag, { style, "data-focusable": "1", "data-qr": rest["data-qr"], "data-qr-h": rest["data-qr-h"], "data-qr-seg": rest["data-qr-seg"], role: rest["role"], "aria-label": rest["aria-label"], onClick: (onActivate ?? onClick) as () => void }, children as never);
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


const FOCUS = "[data-focusable]";
const isRowFlex = (el: HTMLElement) => el.style.display === "flex" && (el.style.flexDirection || "row") !== "column";
/** Problemas de navegación con cruceta de lo montado. */
export function audit(root: HTMLElement): string[] {
  const out: string[] = [];
  // 1) Trampa: un control que captura izquierda/derecha (barra, segmentos) junto a otro control en la misma fila: con la
  //    cruceta se entra al segundo pero no se puede volver (izquierda se queda dentro de la barra).
  root.querySelectorAll<HTMLElement>("[data-qr-h]").forEach((el) => {
    let p = el.parentElement;
    while (p && p !== root && !isRowFlex(p) && !p.querySelector(":scope > [data-focusable]")) p = p.parentElement;
    if (!p || p === root) return;
    const hermanos = [...p.children].filter((c) => c !== el && !el.contains(c) && (c.matches(FOCUS) || c.querySelector(FOCUS)));
    if (isRowFlex(p) && hermanos.length) out.push(`trampa horizontal: «${(el.textContent ?? "").slice(0, 24)}» comparte fila con ${hermanos.length} control(es)`);
  });
  // 2) Botones (role=button) fuera de cualquier elemento enfocable: el mando no llega.
  root.querySelectorAll<HTMLElement>("[role=button]").forEach((el) => { if (!el.closest(FOCUS)) out.push(`inalcanzable: «${(el.textContent ?? "").slice(0, 24)}»`); });
  // 3) Enfocables anidados (dos paradas para lo mismo), salvo los segmentos internos.
  root.querySelectorAll<HTMLElement>("[data-qr=item]").forEach((el) => { if (el.parentElement?.closest("[data-qr=item]")) out.push(`enfocable dentro de otro: «${(el.textContent ?? "").slice(0, 24)}»`); });
  return out;
}

describe("auditoría de navegación con mando", () => {
  for (const game of [false, true]) {
    it(`todas las secciones, ${game ? "con juego" : "sin juego"}`, async () => {
      if (game) { running = { appid: 730, display_name: "CS2" }; panel = state({ appid: "730" }); }
      const root = await mount();
      const labels = [...host.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label") as string).filter((l) => l && l !== "Cerrar columna");
      const problems: string[] = [];
      expect(labels.length).toBeGreaterThanOrEqual(7); // el riel entero
      for (const l of labels) {
        const btn = host.querySelector(`[aria-label="${l}"]`) as HTMLElement | null;
        if (!btn) continue;
        await act(async () => { btn.click(); });
        await flush();
        await act(async () => { vi.advanceTimersByTime(400); });
        await flush();
        for (const p of audit(host)) problems.push(`[${l}] ${p}`);
      }
      act(() => root.unmount());
      expect(problems).toEqual([]);
    });
  }
});

describe("la auditoría detecta lo que debe", () => {
  const dom = (html: string) => { const d = document.createElement("div"); d.innerHTML = html; return d; };
  it("trampa: una barra junto a otro control en la misma fila", () => {
    const d = dom('<div style="display:flex"><div data-focusable="1" data-qr="item">VRR</div><div data-focusable="1" data-qr="item" data-qr-h="1">60 Hz</div></div>');
    expect(audit(d)).toHaveLength(1);
  });
  it("una barra sola en su fila está bien", () => {
    const d = dom('<div style="display:flex;flex-direction:column"><div data-focusable="1" data-qr="item" data-qr-h="1">FPS</div><div data-focusable="1" data-qr="item">VRR</div></div>');
    expect(audit(d)).toEqual([]);
  });
  it("un botón fuera de lo enfocable es inalcanzable", () => {
    expect(audit(dom('<div role="button">Hola</div>'))).toHaveLength(1);
  });
});
