// Puente hacia el backend de "Panel de Control" (Hooandee, GPL-3.0). NO copiamos su codigo:
// solo llamamos a sus metodos ya existentes (get_tdp_state / set_tdp_watts) a traves de Decky.
// [H] La ruta "loader/call_plugin_method" de Decky no esta verificada en la maquina: se prueban
// varias y se recuerda la que funcione. Si ninguna sirve, la tarjeta de potencia lo dice.

const PANEL_NAME = "Panel de Control";

interface DeckyWin {
  DeckyBackend?: { call?: (route: string, ...args: unknown[]) => Promise<unknown> };
  DeckyPluginLoader?: { callPluginMethod?: (plugin: string, method: string, args: unknown) => Promise<unknown> };
}
const dw = (): DeckyWin => window as unknown as DeckyWin;

type Strategy = (method: string, args: Record<string, unknown>, list: unknown[]) => Promise<unknown>;

const strategies: Array<{ id: string; run: Strategy }> = [
  {
    id: "loader/call_plugin_method(list)",
    run: (m, _a, list) => {
      const c = dw().DeckyBackend?.call;
      if (!c) return Promise.reject(new Error("sin DeckyBackend.call"));
      return c.call(dw().DeckyBackend, "loader/call_plugin_method", PANEL_NAME, m, ...list);
    },
  },
  {
    id: "loader/call_plugin_method(obj)",
    run: (m, a) => {
      const c = dw().DeckyBackend?.call;
      if (!c) return Promise.reject(new Error("sin DeckyBackend.call"));
      return c.call(dw().DeckyBackend, "loader/call_plugin_method", PANEL_NAME, m, a);
    },
  },
  {
    id: "DeckyPluginLoader.callPluginMethod",
    run: (m, a) => {
      const f = dw().DeckyPluginLoader?.callPluginMethod;
      if (!f) return Promise.reject(new Error("sin callPluginMethod"));
      return f.call(dw().DeckyPluginLoader, PANEL_NAME, m, a);
    },
  },
];

let working: number | null = null;
let lastError = "";

/** Desenvuelve respuestas tipo {success, result} que usan algunas rutas de Decky. */
function unwrap(v: unknown): unknown {
  if (v && typeof v === "object" && "result" in (v as Record<string, unknown>) && "success" in (v as Record<string, unknown>)) {
    const o = v as { success: unknown; result: unknown };
    if (o.success === false) throw new Error(String(o.result));
    return o.result;
  }
  return v;
}

/** Llama a un metodo del backend de Panel de Control. `args` en orden de parametros de Python. */
export async function callPanel<T>(method: string, names: string[], values: unknown[]): Promise<T> {
  const obj: Record<string, unknown> = {};
  names.forEach((n, i) => { obj[n] = values[i]; });
  const order = working !== null ? [working] : strategies.map((_, i) => i);
  let err: unknown = null;
  for (const i of order) {
    try {
      const res = unwrap(await strategies[i].run(method, obj, values));
      working = i;
      return res as T;
    } catch (e) {
      err = e;
      lastError = `${strategies[i].id}: ${String(e)}`;
    }
  }
  working = null;
  throw err ?? new Error("sin via al backend de Panel de Control");
}

// ---- Llamadas crudas al backend de Panel de Control (una por metodo; la logica vive en tdpModel/tdpControl) ----
export interface RawTdpState {
  supported?: boolean;
  unit?: string;
  request_min?: number;
  watts?: number;
  applied_w?: number | null;
  global_watts?: number;
  on_ac?: boolean;
  appid?: string | null;
  has_game_profile?: boolean;
  follows_global?: boolean;
  display_source?: string;
  recovery_pending?: boolean;
  tdp_control_enabled?: boolean;
  boost_mode?: string;
  limits?: { min?: number; default?: number; max?: number; max_ac?: number };
  presets?: { quiet?: number; balanced?: number; turbo?: number; turbo_ac?: number };
  game_power_owner?: { supported?: boolean; owner?: string; write_allowed?: boolean; reason?: string; revision?: number };
  ownership?: {
    status?: string; reason?: string; requested?: { pl1?: number }; target?: { pl1?: number }; applied?: { pl1?: number | null };
    conflict_persistent?: boolean; overshoot?: { state?: string; target_w?: number } | null;
  };
  charger_unstable?: unknown;
  learned?: { floor?: number | null; ceil?: number | null; seed?: number | null; enough?: boolean; reason?: string; minutes?: number; target_minutes?: number };
}
export interface RawPresets {
  order?: string[];
  hidden?: string[];
  custom?: Record<string, { watts?: number; icon?: string; name?: string; boost?: { mode: string; off2: number; off3: number } | null }>;
}
export interface RawDraw { watts?: number | null; applied?: number | null; on_ac?: boolean; ownership?: RawTdpState["ownership"] }
export interface ApplyResult { requested_w?: number; applied_w?: number | null; ok?: boolean; detail?: string }

export const rpc = {
  state: () => callPanel<RawTdpState>("get_tdp_state", [], []),
  presets: () => callPanel<RawPresets>("get_power_presets", [], []),
  draw: () => callPanel<RawDraw>("get_power_draw", [], []),
  setWatts: (watts: number, scope: "global" | "game", appid: string | null, context: string | null) =>
    callPanel<ApplyResult>("set_tdp_watts", ["watts", "scope", "appid", "context_appid"], [Math.round(watts), scope, appid, context]),
  applyPreset: (watts: number, scope: "global" | "game", appid: string | null, boost: unknown, context: string | null) =>
    callPanel<ApplyResult>("apply_power_preset", ["watts", "scope", "appid", "boost", "context_appid"], [Math.round(watts), scope, appid, boost ?? null, context]),
  resetTelemetry: () => callPanel<unknown>("reset_telemetry", [], []),
  follow: (follow: boolean, appid: string, context: string | null) =>
    callPanel<RawTdpState>("set_tdp_follow_global", ["follow", "appid", "context_appid"], [follow, appid, context]),
};

// ---- Compatibilidad (prueba de rendimiento y diagnostico): lectura/escritura GLOBAL simple ----
export interface PanelTdp {
  supported: boolean;
  watts: number;
  min: number;
  max: number;
  presets: Array<{ label: string; watts: number }>;
  unit: string;
}

export async function readTdp(): Promise<PanelTdp | null> {
  const s = await rpc.state();
  if (!s || s.supported === false || (s.unit ?? "W").toLowerCase() === "level" || !s.limits) return null;
  const min = Number(s.limits.min ?? 3);
  const max = Number((s.on_ac ? s.limits.max_ac : s.limits.max) ?? s.limits.max ?? 15);
  const watts = Number(s.global_watts ?? s.applied_w ?? s.watts ?? min);
  const p = s.presets;
  const presets: PanelTdp["presets"] = [];
  if (p?.quiet) presets.push({ label: "Eco", watts: p.quiet });
  if (p?.balanced) presets.push({ label: "Equilibrado", watts: p.balanced });
  const top = s.on_ac ? p?.turbo_ac ?? p?.turbo : p?.turbo;
  if (top) presets.push({ label: "Máximo", watts: top });
  return { supported: true, watts, min, max, presets, unit: s.unit ?? "W" };
}

/** Escritura global. El contexto debe ser el juego en marcha (Panel rechaza la orden si no coincide). */
export async function writeTdp(watts: number): Promise<boolean> {
  const st = await rpc.state();
  const r = await rpc.setWatts(watts, "global", null, st?.appid ?? null);
  return !!r?.ok;
}

export function bridgeDiag(): { working: string | null; lastError: string } {
  return { working: working !== null ? strategies[working].id : null, lastError };
}
