// Otras funciones de Panel de Control (Hooandee), por RPC a su backend. No se copia su codigo: solo se llaman sus metodos
// con los argumentos de su api.ts. Cada escritura con juego abierto lleva el contexto que el backend espera (su appid).
import { callPanel } from "./panelBridge";

export type Scope = "global" | "game";

export interface EcoState { enabled?: boolean; tdp_min_w?: number }
export interface NightState { supported?: boolean; enabled?: boolean; warmth?: number; active?: boolean; schedule_enabled?: boolean }
export interface HdrState { supported?: boolean; enabled?: boolean; follows_global?: boolean }
export interface ColorState {
  supported?: boolean; appid?: string | null; follows_global?: boolean; has_game_profile?: boolean;
  oled_look?: unknown; panel?: string; presets?: string[]; active_preset?: string | null; perf_cost?: boolean;
}
export interface BatteryState {
  battery?: { present?: boolean; percent?: number | null; status?: string | null; health_percent?: number | null; cycle_count?: number | null; power_now_w?: number | null; eta_seconds?: number | null; ac_online?: boolean | null };
  charge_limit?: { supported?: boolean; adjustable?: boolean; enabled?: boolean; percent?: number; min?: number; max?: number };
}
export interface FanState { supported?: boolean; fans?: Array<{ label?: string; rpm?: number | null; percent?: number | null }>; temps?: Array<{ label?: string; celsius?: number }> }
export interface AudioState {
  supported?: boolean; enabled?: boolean; active?: boolean; route?: "speaker" | "headphone"; appid?: string | null;
  follows_global?: boolean; has_game_profile?: boolean; preset?: string; presets?: Array<{ id: string }>; device_name?: string;
  loudness?: boolean; last_apply?: { ok?: boolean; reason?: string } | null;
}
export interface FanCurve { supported?: boolean; preset?: string; global_preset?: string }

export const panel = {
  eco: () => callPanel<EcoState>("get_eco_state", [], []),
  setEco: (on: boolean, brightnessPct: number) => callPanel<EcoState>("set_eco", ["enabled", "current_brightness"], [on, Math.round(brightnessPct)]),
  night: () => callPanel<NightState>("get_night_state", [], []),
  setNight: (patch: { enabled?: boolean; warmth?: number }) => callPanel<NightState>("set_night", ["patch"], [patch]),
  hdr: () => callPanel<HdrState>("get_hdr_state", [], []),
  setHdr: (on: boolean, scope: Scope, appid: string | null) => callPanel<HdrState>("set_hdr", ["patch", "scope", "appid"], [{ enabled: on }, scope, appid]),
  color: () => callPanel<ColorState>("get_color_state", [], []),
  applyLook: (key: string, scope: Scope, appid: string | null, ctx: string | null) =>
    callPanel<ColorState>("apply_color_preset", ["key", "scope", "appid", "context_appid"], [key, scope, appid, ctx]),
  applyOled: (scope: Scope, appid: string | null, ctx: string | null) =>
    callPanel<ColorState>("apply_oled_look", ["scope", "appid", "context_appid"], [scope, appid, ctx]),
  battery: () => callPanel<BatteryState>("get_battery_state", [], []),
  setChargeLimit: (on: boolean, pct: number) => callPanel<BatteryState["charge_limit"]>("set_charge_limit", ["enabled", "percent"], [on, Math.round(pct)]),
  fans: () => callPanel<FanState>("get_fan_state", [], []),
  fanCurve: () => callPanel<FanCurve>("get_fan_curve_state", [], []),
  setFanPreset: (preset: string, scope: Scope, appid: string | null) => callPanel<FanCurve>("set_fan_preset", ["preset", "scope", "appid"], [preset, scope, appid]),
  setFanAuto: (scope: Scope, appid: string | null) => callPanel<FanCurve>("set_fan_auto", ["scope", "appid"], [scope, appid]),
  // Reescaladores de Panel (0.88+): FSR/XeSS por juego. Aquí solo se LEE el estado y se cambian calidad, nitidez y
  // generación de fotogramas de lo ya instalado; instalar y lo fino se hace en Panel.
  upscalerGame: (appid: string) => callPanel<UpscalerGame>("get_upscalers_game", ["appid"], [appid]),
  upscalerLive: (appid: string) => callPanel<UpscalerLive>("get_upscaler_live", ["appid"], [appid]),
  // Auto‑TDP de Panel con meta de FPS y rango de vatios (firma leída en su API pública: target_fps, initial_tdp,
  // scope, appid, context_appid, min_tdp, max_tdp). Panel busca solo los vatios que hacen falta para esos FPS.
  setAutoTdpConfig: (fps: number, initial: number, scope: Scope, appid: string | null, ctx: string | null, min: number | null, max: number | null) =>
    callPanel<Record<string, unknown>>("set_auto_tdp_config", ["target_fps", "initial_tdp", "scope", "appid", "context_appid", "min_tdp", "max_tdp"], [fps, initial, scope, appid, ctx, min, max]),
  setAutoTdp: (on: boolean, scope: Scope, appid: string | null, ctx: string | null) =>
    callPanel<{ auto_tdp?: boolean }>("set_auto_tdp", ["enabled", "scope", "appid", "context_appid"], [on, scope, appid, ctx]),
  colorFollow: (follow: boolean, appid: string, ctx: string | null) =>
    callPanel<ColorState>("set_color_follow_global", ["follow", "appid", "context_appid"], [follow, appid, ctx]),
  audio: () => callPanel<AudioState>("get_audio_state", [], []),
  setAudioEnabled: (on: boolean) => callPanel<AudioState>("set_audio_enabled", ["enabled"], [on]),
  applyAudio: (preset: string, scope: Scope, appid: string | null, route: string | null) =>
    callPanel<AudioState>("apply_audio_preset", ["preset", "scope", "appid", "expected_route"], [preset, scope, appid, route]),
  setAudioLoudness: (on: boolean, scope: Scope, appid: string | null, route: string | null) =>
    callPanel<AudioState>("set_audio_loudness", ["on", "scope", "appid", "expected_route"], [on, scope, appid, route]),
  audioFollow: (follow: boolean, appid: string) => callPanel<AudioState>("set_audio_follow_global", ["follow", "appid"], [follow, appid]),
  autoTdp: () => callPanel<{ auto_tdp?: boolean; auto?: { state?: string; setpoint?: number | null; fps?: number | null; target_fps?: number | null } }>("get_power_draw", [], []),
};

// ---- Logica pura (probada en tests/panelExtra.test.ts) ----
export const LOOK_LABEL: Record<string, string> = { native: "Nativo", cine: "Cine", vivo: "Vivo", comodo: "Cómodo", oled: "Aspecto OLED" };
export const lookLabel = (k: string) => LOOK_LABEL[k] ?? k.charAt(0).toUpperCase() + k.slice(1);

/**
 * Une la respuesta de Panel tras aplicar un look con lo que ya se sabia. Panel puede contestar solo con lo que cambio
 * (sin `supported` ni `presets`): sustituir el estado entero hacia desaparecer el selector de looks con el foco encima
 * y el mando se quedaba sin foco («estancado» en Color). Lo que la respuesta no trae se conserva.
 */
export function mergeColor(prev: ColorState | null, next: ColorState | null | undefined): ColorState | null {
  if (!next || typeof next !== "object") return prev;
  if (!prev) return next;
  const out: ColorState = { ...prev, ...next };
  if (!Array.isArray(next.presets) || next.presets.length === 0) out.presets = prev.presets;
  if (next.supported === undefined) out.supported = prev.supported;
  if (next.oled_look === undefined) out.oled_look = prev.oled_look;
  return out;
}

/** Looks a mostrar: los del backend (nativo primero) + «Aspecto OLED» si el panel es LCD y lo ofrece. */
export function looks(c: ColorState | null): Array<{ key: string; label: string; active: boolean }> {
  if (!c?.supported) return [];
  const keys = (c.presets ?? []).filter((k) => typeof k === "string");
  const out = keys.map((k) => ({ key: k, label: lookLabel(k), active: c.active_preset === k }));
  if (c.oled_look) out.splice(Math.min(1, out.length), 0, { key: "oled", label: "Aspecto OLED", active: c.active_preset === "oled" });
  return out;
}

/**
 * A que ambito escribir. Con juego en marcha (segun el backend de Panel) SIEMPRE al juego: cada juego tiene su
 * pantalla, color y sonido. Sin juego, al global (lo de Steam / modo normal). Contexto = appid del backend.
 */
export function colorTarget(c: { appid?: string | null } | null): { scope: Scope; appid: string | null; ctx: string | null } {
  const appid = c?.appid ?? null;
  if (appid) return { scope: "game", appid, ctx: appid };
  return { scope: "global", appid: null, ctx: null };
}

export const AUDIO_LABEL: Record<string, string> = {
  flat: "Plano", voices: "Voces / FPS", bass: "Graves", cinema: "Cine", music: "Música", device_tuned: "Mejorado", custom: "Personalizado",
};
export const audioLabel = (id: string, device?: string) => (id === "device_tuned" && device ? `${device} mejorado` : AUDIO_LABEL[id] ?? id);

export const FAN_PRESETS: Array<{ key: string; label: string }> = [
  { key: "auto", label: "Auto" }, { key: "silent", label: "Silencio" }, { key: "balanced", label: "Equilibrado" }, { key: "performance", label: "Máximo" },
];

export function batteryLine(b: BatteryState | null): string | null {
  const x = b?.battery;
  if (!x?.present) return null;
  const parts: string[] = [];
  if (typeof x.percent === "number") parts.push(`${Math.round(x.percent)} %`);
  if (x.status === "Charging") parts.push("cargando");
  else if (typeof x.eta_seconds === "number" && x.eta_seconds > 0) {
    const m = Math.round(x.eta_seconds / 60);
    parts.push(m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min restantes` : `${m} min restantes`);
  }
  if (typeof x.health_percent === "number") parts.push(`salud ${Math.round(x.health_percent)} %`);
  if (typeof x.cycle_count === "number") parts.push(`${x.cycle_count} ciclos`);
  return parts.join(" · ") || null;
}

// ---- Reescaladores de Panel (forma de lo que devuelve su API; solo los campos que usamos) ----
export interface UpscalerGame {
  appid?: string; name?: string;
  install?: { build?: string; status?: string; options?: { quality?: string | null; sharpness?: string | null; fg?: "on" | "off"; fg_route?: string | null; model?: string | null } } | null;
  solution?: { quality?: { owner?: "panel" | "game" }; blocked_reason?: string | null; fg_plan?: unknown } | null;
  fg_plan?: unknown;
  analysis?: { anti_cheat?: boolean };
}
export interface UpscalerLive { result?: string; resolution?: { render?: number[]; output?: number[] } | null; fg?: boolean | null; fps?: number | null; provider_name?: string | null; provider_version?: string | null }
export const UP_QUALITY: Array<{ value: string; label: string }> = [
  { value: "native", label: "Nativo" }, { value: "quality", label: "Calidad" }, { value: "balanced", label: "Equilibrado" }, { value: "performance", label: "Rendimiento" }, { value: "ultra", label: "Ultra" },
];
export const UP_SHARP: Array<{ value: string; label: string }> = [{ value: "off", label: "Sin nitidez" }, { value: "soft", label: "Suave" }, { value: "high", label: "Alta" }];
export const UP_STATUS: Record<string, string> = { active: "activo", pending: "pendiente", loaded: "cargado", not_run: "sin probar", broken: "con fallo" };
/** Puro (probado): nombre legible de una compilación («fsr-4.0.2» → «FSR 4.0.2»). */
export function buildLabel(id: string | undefined): string {
  if (!id) return "Reescalador";
  const m = /^([a-z]+)[-_ ]?(.*)$/i.exec(id);
  if (!m) return id;
  const fam: Record<string, string> = { fsr: "FSR", xess: "XeSS", dlss: "DLSS", helixsr: "HelixSR", proton: "Proton" };
  return `${fam[m[1].toLowerCase()] ?? m[1]} ${m[2].replace(/[-_]/g, " ")}`.trim();
}
/** Puro (probado): la configuración de este juego en pares (etiqueta, valor, ¿encendido?) para mostrarla. */
export function upscalerFacts(g: UpscalerGame, live: UpscalerLive | null): Array<[string, string, boolean]> {
  const o = g.install?.options ?? {};
  const q = UP_QUALITY.find((x) => x.value === o.quality)?.label;
  const sh = UP_SHARP.find((x) => x.value === o.sharpness)?.label;
  const out: Array<[string, string, boolean]> = [];
  out.push(["Calidad", g.solution?.quality?.owner === "game" || !q ? "la del juego" : q, true]);
  if (sh) out.push(["Nitidez", sh === "Sin nitidez" ? "no" : sh, o.sharpness !== "off"]);
  const fgOn = typeof live?.fg === "boolean" ? live.fg : o.fg === "on";
  if (o.fg || typeof live?.fg === "boolean") out.push(["Generar fotogramas", fgOn ? "sí" : "no", fgOn]);
  if (o.model) out.push(["Modelo", String(o.model), true]);
  if (typeof live?.fps === "number") out.push(["FPS ahora", String(Math.round(live.fps)), true]);
  return out;
}
