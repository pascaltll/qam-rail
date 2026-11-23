// Ajustes de rendimiento de Steam (los del QAM nativo: refresco, VRR, FPS, escalado y filtro).
// Steam los guarda en su almacen de rendimiento (clase con Get() y setters). Se lee y escribe ese almacen
// directamente, igual que hace la pestaña nativa; nada de protobuf a mano. [H] estructura confirmada por tipos
// de @decky/ui y por como lo usa Panel de Control; sin probar aun en la consola de Carlos.
import { findModuleExport } from "@decky/ui";

export interface PerfStore {
  msgSettingsPerApp?: Record<string, unknown>;
  msgLimits?: Record<string, unknown>;
  msgSettingsGlobal?: Record<string, unknown>;
  SetFPSLimit?: (external: boolean, v: number) => unknown;
  SetDisplayRefreshRateManualHz?: (external: boolean, v: number) => unknown;
  SetSplitScalingFilter?: (v: number) => unknown;
  SetSplitScalingScaler?: (v: number) => unknown;
  SetFSRSharpness?: (v: number) => unknown;
  SetNISSharpness?: (v: number) => unknown;
  SetVRREnabled?: (v: boolean) => unknown;
  SetScalingFilter?: (v: number) => unknown;
}

type StoreClass = { Get?: () => unknown; prototype?: { ResetCurrentPerfProfileSettings?: unknown } };
const isStoreClass = (c: unknown): c is StoreClass =>
  typeof c === "function" && typeof (c as StoreClass).Get === "function" && typeof (c as StoreClass).prototype?.ResetCurrentPerfProfileSettings === "function";
const withLimits = (s: unknown): PerfStore | null => (s && typeof s === "object" && (s as PerfStore).msgLimits ? (s as PerfStore) : null);

let cached: PerfStore | null = null;
let override: (() => PerfStore | null) | null = null;
/** Pruebas: inyecta un almacen falso (null = buscar el real). */
export function setPerfStoreReader(fn: (() => PerfStore | null) | null): void { override = fn; cached = null; }

export function perfStore(): PerfStore | null {
  if (override) return override();
  if (cached?.msgLimits) return cached;
  try {
    const g = (window as unknown as { SystemPerfStore?: unknown }).SystemPerfStore;
    cached = withLimits(g) ?? (isStoreClass(g) ? withLimits(g.Get?.()) : null);
    if (!cached) {
      const cls = findModuleExport((e: unknown) => isStoreClass(e)) as StoreClass | undefined;
      cached = cls ? withLimits(cls.Get?.()) : null;
    }
  } catch { cached = null; }
  return cached;
}

export interface Opt { value: number; label: string }
export interface PerfView {
  vrr: { on: boolean } | null;
  refresh: { value: number; options: number[] } | null;
  fps: { value: number; options: Opt[] } | null;
  scaler: { value: number; options: Opt[] } | null;
  filter: { value: number; options: Opt[] } | null;
  sharp: { kind: "fsr" | "nis"; value: number; min: number; max: number } | null;
}

export const SCALERS: Record<number, string> = { 1: "Auto", 2: "Entero", 3: "Ajustar", 4: "Llenar", 5: "Estirar" };
export const FILTERS: Record<number, string> = { 1: "Lineal", 2: "Píxel", 3: "FSR", 4: "NIS" };

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nums = (v: unknown): number[] => (Array.isArray(v) ? [...new Set(v.filter((x) => num(x) && Number.isInteger(x) && x >= 0))] as number[] : []);
const labeled = (vals: number[], names: Record<number, string>): Opt[] => vals.filter((v) => names[v]).map((v) => ({ value: v, label: names[v] }));

/** Vista pura del almacen (pantalla interna). Lo que Steam no ofrece en este equipo queda en null y no se dibuja. */
// ---- Límite de FPS por la vía moderna de Steam ----
// Medido en el Ally el 12‑11 (zip 01:42): `disable_refresh_rate_management: true`. En ese modo Steam ya no usa
// SetFPSLimit ni el refresco manual: el límite son dos ajustes de cliente, `gamescope_disable_framelimit` (sin
// límite) y `gamescope_app_target_framerate` (la meta, cualquier valor: gamescope elige el refresco). Por eso el
// control de FPS no aparecía y el preset no podía poner 40. `GetClientSetting(nombre)` devuelve [valor, función
// para cambiarlo]. [H] que Steam acepte cualquier valor de la lista: se comprueba releyendo.
export const MODERN_FPS = [30, 40, 45, 50, 60, 90, 120];
type ClientSettings = { GetClientSetting?: (n: string) => [unknown, ((v: number | boolean) => unknown)?] | undefined };
const clientStore = (): ClientSettings | null => {
  const ss = (window as unknown as { settingsStore?: ClientSettings }).settingsStore;
  return typeof ss?.GetClientSetting === "function" ? ss : null;
};
let clientOverride: (() => ClientSettings | null) | null = null;
/** Pruebas: ajustes de cliente de mentira. */
export function setClientSettingsReader(f: (() => ClientSettings | null) | null): void { clientOverride = f; }
const client = () => (clientOverride ? clientOverride() : clientStore());
const cget = (n: string): unknown => { try { return client()?.GetClientSetting?.(n)?.[0]; } catch { return undefined; } };
const cset = (n: string, v: number | boolean): boolean => {
  try { const f = client()?.GetClientSetting?.(n)?.[1]; if (typeof f !== "function") return false; f(v); return true; } catch { return false; }
};
/** Puro salvo por la lectura: el límite de FPS moderno (null si este Steam no lo tiene). */
export function modernFps(maxHz: number | undefined): PerfView["fps"] {
  const off = cget("gamescope_disable_framelimit"), target = cget("gamescope_app_target_framerate");
  if (typeof off !== "boolean" || typeof target !== "number" || !Number.isFinite(target)) return null;
  const top = typeof maxHz === "number" && maxHz > 0 ? maxHz : 60;
  const list = MODERN_FPS.filter((x) => x <= top);
  if (target > 0 && !list.includes(target)) list.push(target);
  list.sort((a, b) => a - b);
  return { value: off ? 0 : target, options: [...list.map((v) => ({ value: v, label: String(v) })), { value: 0, label: "Sin límite" }] };
}

export function readPerf(store: PerfStore | null): PerfView | null {
  if (!store?.msgLimits) return null;
  const s = store.msgSettingsPerApp ?? {};
  const l = store.msgLimits;
  const managed = l.disable_refresh_rate_management !== true;

  const vrr = l.is_vrr_supported === true && typeof s.is_vrr_enabled === "boolean" && store.SetVRREnabled ? { on: s.is_vrr_enabled } : null;

  let refresh: PerfView["refresh"] = null;
  const lo = l.display_refresh_manual_hz_min, hi = l.display_refresh_manual_hz_max;
  if (managed && l.is_manual_display_refresh_rate_available === true && store.SetDisplayRefreshRateManualHz && num(lo) && num(hi) && hi >= lo && hi - lo < 300 && num(s.display_refresh_manual_hz)) {
    const opts = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    refresh = { value: s.display_refresh_manual_hz, options: opts };
  }

  let fps: PerfView["fps"] = null;
  const fo = nums(l.fps_limit_options);
  // El valor actual puede no estar entre las opciones (p. ej. límite 60 con la pantalla a 80 Hz, que ofrece 20/40/80):
  // antes en ese caso el control desaparecía (zip 01:13: «fps: null» al aplicar un preset).
  if (managed && store.SetFPSLimit && fo.length && num(s.fps_limit)) {
    fps = { value: s.fps_limit, options: fo.map((v) => ({ value: v, label: v === 0 ? "Sin límite" : String(v) })) };
  }

  if (!managed && !fps) fps = modernFps(num(hi) ? hi : undefined);

  const split = l.is_split_scaling_and_filtering_supported !== false;
  const scOpts = labeled(nums(l.split_scaling_scalers_available), SCALERS);
  const scaler = split && store.SetSplitScalingScaler && scOpts.length && num(s.split_scaling_scaler) ? { value: s.split_scaling_scaler, options: scOpts } : null;
  const fiOpts = labeled(nums(l.split_scaling_filters_available), FILTERS);
  const filter = split && store.SetSplitScalingFilter && fiOpts.length && num(s.split_scaling_filter) ? { value: s.split_scaling_filter, options: fiOpts } : null;

  let sharp: PerfView["sharp"] = null;
  if (filter?.value === 3 && store.SetFSRSharpness && num(s.fsr_sharpness) && num(l.fsr_sharpness_min) && num(l.fsr_sharpness_max)) {
    sharp = { kind: "fsr", value: s.fsr_sharpness, min: l.fsr_sharpness_min, max: l.fsr_sharpness_max };
  } else if (filter?.value === 4 && store.SetNISSharpness && num(s.nis_sharpness) && num(l.nis_sharpness_min) && num(l.nis_sharpness_max)) {
    sharp = { kind: "nis", value: s.nis_sharpness, min: l.nis_sharpness_min, max: l.nis_sharpness_max };
  }
  return { vrr, refresh, fps, scaler, filter, sharp };
}

/** Escrituras. Devuelven false si Steam no expone el setter. Siempre pantalla interna (external=false). */
export const perfWrite = {
  vrr: (on: boolean) => call((s) => s.SetVRREnabled?.(on)),
  refresh: (hz: number) => call((s) => s.SetDisplayRefreshRateManualHz?.(false, hz)),
  fps: (v: number) => {
    const st = perfStore();
    if (st?.msgLimits?.disable_refresh_rate_management === true) { // vía moderna (ajustes de cliente)
      if (v === 0) return cset("gamescope_disable_framelimit", true);
      const a = cset("gamescope_app_target_framerate", v), b = cset("gamescope_disable_framelimit", false);
      return a && b;
    }
    return call((s) => s.SetFPSLimit?.(false, v));
  },
  scaler: (v: number) => call((s) => s.SetSplitScalingScaler?.(v)),
  filter: (v: number) => call((s) => s.SetSplitScalingFilter?.(v)),
  sharp: (kind: "fsr" | "nis", v: number) => call((s) => (kind === "fsr" ? s.SetFSRSharpness?.(v) : s.SetNISSharpness?.(v))),
};
function call(fn: (s: PerfStore) => unknown): boolean {
  const s = perfStore();
  if (!s) return false;
  try { fn(s); return true; } catch { return false; }
}

/** Siguiente/anterior de una lista ciclica. */
export const step = <T,>(list: T[], cur: T, d: number): T => {
  const i = list.indexOf(cur);
  return list[(Math.max(0, i) + d + list.length) % list.length];
};

// ---- Rendimiento avanzado (lo que solo estaba en la pestaña de Steam) ----
// [H] Los nombres exactos de los ajustes y de sus setters no están confirmados en el equipo: se BUSCAN por patrón y la
// opción solo aparece si existen las dos cosas (el valor actual y su setter). Tras cambiarla se relee: si Steam no
// la aceptó, se avisa. La prueba «Contrato con Steam» guarda los nombres que hay (`perfAvanzado`).
export interface ExtraToggle { id: "lowlatency" | "overlaysteam" | "tearing" | "halfrate"; label: string; on: boolean; setter: string; key: string; global?: boolean }
export interface OverlayLevel { value: number; setter: string }

// Nombres reales vistos en el Ally (contrato 0.34): SetFPSLimitEnabled/is_fps_limit_enabled,
// SetLowLatencyModeEnabled/is_low_latency_mode_enabled, SetShowPerfOverlayOverSteamEnabled (global),
// SetPerfOverlayLevel/perf_overlay_level. Tearing y media resolución no existen en esta versión de Steam.
const EXTRA: Array<{ id: ExtraToggle["id"]; label: string; key: RegExp; setter: RegExp; global?: boolean }> = [
  { id: "lowlatency", label: "Baja latencia", key: /^is_low_latency_mode_enabled$/, setter: /^SetLowLatencyModeEnabled$/ },
  { id: "overlaysteam", label: "Overlay también en Steam", key: /^is_show_perf_overlay_over_steam_enabled$/, setter: /^SetShowPerfOverlayOverSteamEnabled$/, global: true },
  { id: "tearing", label: "Permitir tearing", key: /^is_tearing_enabled$/, setter: /tearing/i },
  { id: "halfrate", label: "Media resolución", key: /^is_variable_resolution_enabled$/, setter: /variable.?resolution|half.?rate/i },
];

/** Nombres de todas las funciones del almacén (incluidas las del prototipo). */
export function storeMethods(s: PerfStore | null): string[] {
  const out: string[] = [];
  for (let p: object | null = s, n = 0; p && p !== Object.prototype && n < 4; p = Object.getPrototypeOf(p), n++) {
    for (const k of Object.getOwnPropertyNames(p)) {
      try { if (typeof (p as Record<string, unknown>)[k] === "function" && k !== "constructor") out.push(k); } catch { /* getter raro */ }
    }
  }
  return [...new Set(out)];
}

/** Puro (probado con un almacén falso): opciones avanzadas disponibles. */
export function readExtras(s: PerfStore | null): { toggles: ExtraToggle[]; overlay: OverlayLevel | null } {
  if (!s) return { toggles: [], overlay: null };
  const per = (s.msgSettingsPerApp ?? {}) as Record<string, unknown>;
  const glob = (s.msgSettingsGlobal ?? {}) as Record<string, unknown>;
  const fns = storeMethods(s).filter((m) => /^Set/.test(m));
  const toggles: ExtraToggle[] = [];
  for (const e of EXTRA) {
    const src = e.global ? glob : per;
    const key = Object.keys(src).find((k) => e.key.test(k) && typeof src[k] === "boolean");
    const setter = fns.find((f) => e.setter.test(f));
    if (key && setter) toggles.push({ id: e.id, label: e.label, on: src[key] as boolean, setter, key, global: e.global });
  }
  const ov = glob.perf_overlay_level;
  const ovSet = fns.find((f) => /overlay.?level/i.test(f));
  return { toggles, overlay: num(ov) && ovSet ? { value: ov, setter: ovSet } : null };
}

/** Cambia una opción avanzada y comprueba que Steam la aceptó (true/false) un momento después. */
export async function setExtra(setter: string, value: boolean | number, check: () => unknown): Promise<boolean> {
  const s = perfStore() as unknown as Record<string, unknown> | null;
  const f = s?.[setter];
  if (typeof f !== "function") return false;
  // Algunos setters de Steam llevan delante «external» (como SetFPSLimit): si el primero no cuaja, se prueba así.
  try { (f as (v: unknown) => unknown).call(s, value); } catch { /* probar la otra forma */ }
  await new Promise((r) => window.setTimeout(r, 600));
  if (check() === value) return true;
  try { (f as (a: unknown, v: unknown) => unknown).call(s, false, value); } catch { return false; }
  await new Promise((r) => window.setTimeout(r, 600));
  return check() === value;
}
