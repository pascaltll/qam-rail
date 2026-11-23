const state = { supported: true, unit: "W", limits: { min: 4, default: 12, max: 15, max_ac: 25 }, presets: { quiet: 7, balanced: 12, turbo: 15 }, watts: 12, global_watts: 12, applied_w: 12, on_ac: false, appid: null, follows_global: true, tdp_control_enabled: true, learned: { enough: true, floor: 9, ceil: 14, seed: 11, minutes: 80, target_minutes: 30 } };
export const extra: Record<string, unknown> = {
  get_color_state: { supported: true, presets: ["native", "oled", "cine", "vivo", "comodo"], active_preset: "native", oled_look: { saturation: 120 }, appid: null, follows_global: true },
  get_night_state: { supported: true, enabled: false, warmth: 40 },
  get_hdr_state: { supported: true, enabled: false },
  apply_color_preset: { supported: true, presets: ["native", "oled", "cine", "vivo", "comodo"], active_preset: "cine", oled_look: { saturation: 120 }, appid: null, follows_global: true },
  get_eco_state: { enabled: false },
  get_battery_state: { battery: { present: true, percent: 76, status: "Discharging", health_percent: 92, cycle_count: 120, eta_seconds: 7200 }, charge_limit: { supported: true, adjustable: true, enabled: false, percent: 80, min: 50, max: 100 } },
  get_fan_curve_state: { supported: true, preset: "auto" },
  get_fan_state: { supported: true, fans: [{ rpm: 2400 }], temps: [{ label: "CPU", celsius: 61 }] },
  get_power_draw: { auto_tdp: false, watts: 9.5 },
};
extra.get_audio_state = { supported: true, enabled: true, active: true, route: "speaker", preset: "flat", presets: [{ id: "flat" }, { id: "voice_fps" }, { id: "bass" }, { id: "cinema" }, { id: "music" }], device_name: "ROG Ally", follows_global: true };
export const rpc = {
  state: async () => state, presets: async () => ({ order: [], hidden: [], custom: {} }), draw: async () => ({ watts: 9.5, on_ac: false }),
  setWatts: async () => ({ ok: true }), applyPreset: async () => ({ ok: true }), follow: async () => state, resetTelemetry: async () => ({}),
};
export const readTdp = () => {}; export const writeTdp = () => {}; export const bridgeDiag = () => ({});
export const callPanel = async (m: string) => (m === "apply_color_preset" && (globalThis as any).__partial ? { active_preset: "cine" } : extra[m] ?? {});

(globalThis as any).__partial = false;
