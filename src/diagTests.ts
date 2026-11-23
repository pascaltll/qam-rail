// Pruebas en el equipo (Mas › Pruebas y diagnostico). Cada una guarda su seccion del informe unificado.
// - entorno: versiones, plugins de Decky, juego, potencia, memoria y tamaño del panel.
// - contrato-panel: llama a cada metodo de LECTURA de Panel de Control que usa QAM Rail y comprueba que siguen
//   llegando los campos de los que dependemos (si Panel cambia algo en una actualizacion, se ve aqui).
// - contrato-steam: comprueba que siguen existiendo las funciones internas de Steam que usamos.
// - tema: lo que se lee del tema de Panel en cada ventana y la paleta resultante.
// "Ejecutar todo" corre las automaticas (no las de teclado/voz, que necesitan que uses el panel) y junta el zip.
import { budget } from "./budget";
import { tickerStats } from "./ticker";
import { findQamTree } from "./qamDoc";
import { appearanceMode, appearanceSource, buildPalette, cssLoaderThemes, currentPalette, findThemeBackground, refreshAppearance } from "./appearance";
import { callable } from "@decky/api";
import { probeDecky, probeMinPower } from "./diagPower";
import { installQRX2 } from "./diagSocial";
import { diagBundle, diagMark, saveSection } from "./diagStore";
import { btApi, btState, wifiState, type BtState } from "./network";
import { runningGame } from "./game";
import { callPanel } from "./panelBridge";
import { flush, recentEvents, summary } from "./perfLog";
import { fluencyState, runFluency } from "./perfBench";
import { perfStore } from "./steamPerf";
import { currentWatts, lowPower } from "./tdpControl";
import { tiers } from "./powerTiers";
import { audioState, shortName, audioTrace } from "./audio";
import { sc } from "./steam";
import { learned, menuStatsRaw } from "./menuStats";
import { readExtras, storeMethods } from "./steamPerf";
import { keyboardMethods } from "./keyboard";
import { chatProbe } from "./social";
import { VERSION } from "./version";
import { situation } from "./situation";
import { PAUSED, PLAYING, music, musicAutoPauses, musicRates, musicState, probeMusicDeep } from "./music";
import { BTN, listTarget, visualRows } from "./nav";
import { frameStats } from "./perfBench";
import { runningGame as runningGame2 } from "./game";

type Any = Record<string, unknown>;

// ---------------- Puro (probado en tests/diagTests.test.ts) ----------------
/** Lee una ruta "a.b.c" (sin ejecutar nada salvo getters). undefined si falta algun tramo. */
export function at(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const k of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    try { cur = (cur as Any)[k]; } catch { return undefined; }
  }
  return cur;
}

/** Rutas que faltan (undefined/null) en un objeto. */
export function missingPaths(obj: unknown, paths: string[]): string[] {
  return paths.filter((p) => { const v = at(obj, p); return v === undefined || v === null; });
}

/** Forma de un valor para el informe: claves de primer nivel y su tipo, sin datos. */
export function shapeOf(v: unknown): unknown {
  if (Array.isArray(v)) return `array(${v.length})`;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Any).slice(0, 60).map(([k, x]) => [k, Array.isArray(x) ? `array(${x.length})` : x === null ? "null" : typeof x]));
  return typeof v;
}

export interface Check { area: string; path: string; kind: "fn" | "obj" | "any"; ok: boolean; got: string }
export function checkSpecs(root: unknown, specs: Array<[area: string, path: string, kind: "fn" | "obj" | "any"]>): Check[] {
  return specs.map(([area, path, kind]) => {
    const v = at(root, path);
    const got = v === undefined ? "falta" : v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
    const ok = kind === "fn" ? typeof v === "function" : kind === "obj" ? !!v && typeof v === "object" : v !== undefined && v !== null;
    return { area, path, kind, ok, got };
  });
}

// ---------------- Contratos ----------------
// Metodo de Panel -> campos que leemos. Solo metodos de lectura (sin efectos).
export const PANEL_READS: Array<{ method: string; expect: string[] }> = [
  { method: "get_tdp_state", expect: ["limits.min", "limits.max", "watts", "global_watts", "follows_global", "ownership.status", "request_min", "auto_config"] },
  { method: "get_power_draw", expect: ["watts", "applied"] },
  { method: "get_power_presets", expect: [] },
  { method: "get_audio_state", expect: [] },
  { method: "get_battery_state", expect: [] },
  { method: "get_fan_state", expect: [] },
  { method: "get_fan_curve_state", expect: [] },
  { method: "get_color_state", expect: [] },
  { method: "get_hdr_state", expect: [] },
  { method: "get_night_state", expect: [] },
  { method: "get_eco_state", expect: [] },
  { method: "get_ui_prefs", expect: [] },
];

export const STEAM_SPECS: Array<[string, string, "fn" | "obj" | "any"]> = [
  ["Sistema", "SteamClient.System.SetAirplaneMode", "fn"],
  ["Sistema", "SteamClient.System.RegisterForAirplaneModeChanges", "fn"],
  ["Pantalla", "SteamClient.System.Display.RegisterForBrightnessChanges", "fn"],
  ["Audio", "SteamClient.System.Audio.GetDevices", "fn"],
  ["Apps", "SteamClient.Apps.RunGame", "fn"],
  ["Música", "SteamClient.Music.TogglePlayPause", "fn"],
  ["Música", "SteamClient.Music.PlayNext", "fn"],
  ["Música", "SteamClient.Music.RegisterForMusicPlaybackChanges", "fn"],
  ["Ajustes", "settingsStore.GetClientSetting", "fn"],
  ["Amigos", "friendStore.allFriends", "any"],
  ["Amigos", "friendStore.currentUserSteamID.GetAccountID", "fn"],
  ["Chat", "g_FriendsUIApp.ChatStore.GetFriendChat", "fn"],
  ["Chat", "g_FriendsUIApp.ChatStore.currentChatRoomGroups", "any"],
  ["Chat", "g_FriendsUIApp.ChatStore.FriendChatStore.GetFriendsWithUnreadMessages", "fn"],
  ["Voz", "g_FriendsUIApp.ChatStore.VoiceChat.InitiateFriendChat", "fn"],
  ["Voz", "g_FriendsUIApp.ChatStore.VoiceChat.OnUserEndVoiceChat", "fn"],
  ["Voz", "g_FriendsUIApp.ChatStore.VoiceChat.ToggleMicMuting", "fn"],
  ["Voz", "g_FriendsUIApp.ChatStore.VoiceChat.RegisterForVoiceChatActiveStateChange", "fn"],
  ["Avisos", "NotificationStore.m_rgNotificationTray", "any"],
  ["Avisos", "NotificationStore.MarkNotificationRead", "fn"],
  ["Ventanas", "SteamUIStore.GetFocusedWindowInstance", "fn"],
  ["Navegación", "DFL.Navigation.CloseSideMenus", "fn"],
  ["Navegación", "DFL.Navigation.NavigateToChat", "fn"],
  ["Juego", "SteamUIStore", "obj"],
  ["Decky", "DeckyBackend.call", "fn"],
  ["Decky", "DeckyPluginLoader.deckyState.publicState", "fn"],
];

// NIS es opcional: no todas las versiones de Steam lo traen (el panel lo oculta si falta).
const PERF_SETTERS = ["SetFPSLimit", "SetDisplayRefreshRateManualHz", "SetVRREnabled", "SetSplitScalingScaler", "SetSplitScalingFilter", "SetFSRSharpness"];
const CLIENT_SETTINGS = ["gamescope_allow_tearing", "steamos_vrs_enabled", "gamescope_disable_framelimit", "gamescope_app_target_framerate", "gamescope_enable_app_target_framerate"];

export async function testPanelContract(): Promise<{ ok: number; total: number; path: string }> {
  const rows: Any[] = [];
  for (const { method, expect } of PANEL_READS) {
    const t0 = performance.now();
    try {
      const res = await callPanel<unknown>(method, [], []);
      const falta = missingPaths(res, expect);
      rows.push({ method, ok: falta.length === 0, ms: Math.round(performance.now() - t0), faltan: falta, forma: shapeOf(res) });
    } catch (e) {
      rows.push({ method, ok: false, ms: Math.round(performance.now() - t0), error: String(e).slice(0, 200) });
    }
  }
  const ok = rows.filter((r) => r.ok).length;
  const path = await saveSection("contrato-panel", { fecha: new Date().toISOString(), metodos: rows }, { ok, total: rows.length });
  return { ok, total: rows.length, path };
}

export async function testSteamContract(): Promise<{ ok: number; total: number; path: string }> {
  const checks = checkSpecs(window, STEAM_SPECS);
  const ps = perfStore() as Any | null;
  checks.push({ area: "Rendimiento", path: "perfStore (almacén de rendimiento)", kind: "obj", ok: !!ps, got: ps ? "object" : "falta" });
  for (const s of PERF_SETTERS) checks.push({ area: "Rendimiento", path: `perfStore.${s}`, kind: "fn", ok: typeof ps?.[s] === "function", got: typeof ps?.[s] });
  const ss = at(window, "settingsStore") as { GetClientSetting?: (n: string) => unknown } | undefined;
  const ajustes: Any = {};
  for (const n of CLIENT_SETTINGS) { try { ajustes[n] = ss?.GetClientSetting?.(n) ?? null; } catch (e) { ajustes[n] = `error: ${String(e).slice(0, 80)}`; } }
  checks.push({ area: "Ventanas", path: "árbol de navegación QuickAccess", kind: "obj", ok: !!findQamTree(), got: findQamTree() ? "object" : "falta" });
  const ok = checks.filter((c) => c.ok).length;
  const path = await saveSection("contrato-steam", { fecha: new Date().toISOString(), comprobaciones: checks, ajustesCliente: ajustes,
    // Rendimiento avanzado: setters y claves que hay de verdad (para confirmar tearing, media resolución, overlay).
    perfAvanzado: (() => { const st = perfStore(); return {
      setters: storeMethods(st).filter((m) => /^Set/.test(m)),
      porJuego: Object.keys((st?.msgSettingsPerApp ?? {}) as object), global: Object.keys((st?.msgSettingsGlobal ?? {}) as object),
      detectado: readExtras(st) }; })(),
    faltan: checks.filter((c) => !c.ok).map((c) => c.path) }, { ok, total: checks.length });
  return { ok, total: checks.length, path };
}

const themeExplore = callable<[name: string], Record<string, unknown>>("theme_explore");

export async function testTheme(): Promise<string> {
  const docs = await refreshAppearance(true);
  const themes = await cssLoaderThemes();
  // Fondo de Big Picture y archivos de los temas activos (para adaptar la apariencia del panel a cada tema).
  let fondo: unknown = null;
  try { const main = (at(window, "__qamRailModalEl.ownerDocument") as Document | undefined) ?? document; fondo = findThemeBackground(main); } catch (e) { fondo = String(e); }
  const archivos: Record<string, unknown> = {};
  for (const t of (themes ?? []).filter((x) => x.enabled).slice(0, 3)) {
    try { archivos[t.name] = await themeExplore(t.name); } catch (e) { archivos[t.name] = String(e); }
  }
  await saveSection("tema-archivos", { fecha: new Date().toISOString(), fondo, archivos }).catch(() => null);
  return saveSection("tema", {
    fecha: new Date().toISOString(), modo: appearanceMode(), paleta: currentPalette(), porVentana: docs,
    // Lo que daria el modo «Panel» aunque ahora uses otro (para ver que colores publica el tema activo).
    fuentePanel: appearanceSource(), paletaPanel: buildPalette("panel", appearanceSource()),
    acentoPanel: (() => { try { return window.localStorage?.getItem("pdc:accent"); } catch { return "sin acceso"; } })(),
    cssLoader: themes === null ? "no responde" : themes.map((t) => ({ nombre: t.displayName, version: t.version, activo: t.enabled, opciones: t.patches.map((p) => `${p.name} = ${p.value} [${p.options.join("/")}]`) })),
  });
}

/** Foto del estado ahora mismo. Va tambien como resumen.json del zip. */
export async function environment(): Promise<Any> {
  const loader = at(window, "DeckyPluginLoader") as Any | undefined;
  let plugins: unknown = null;
  try {
    const pub = (at(loader, "deckyState.publicState") as (() => Any) | undefined)?.call(at(loader, "deckyState"));
    const list = pub?.plugins as Array<{ name?: string; version?: string }> | undefined;
    plugins = Array.isArray(list) ? list.map((p) => `${p.name ?? "?"} ${p.version ?? ""}`.trim()) : null;
  } catch { plugins = null; }
  let tdp: Any | null = null;
  try {
    const s = await callPanel<Any>("get_tdp_state", [], []);
    tdp = { min: at(s, "limits.min"), max: at(s, "limits.max"), watts: s.watts, global: s.global_watts, sigueSteam: s.follows_global, cargador: s.on_ac, estado: at(s, "ownership.status"), motivo: at(s, "ownership.reason") };
  } catch (e) { tdp = { error: String(e).slice(0, 160) }; }
  const modal = at(window, "__qamRailModalEl") as HTMLElement | null | undefined;
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
  const g = runningGame();
  return {
    fecha: new Date().toISOString(),
    qamRail: VERSION,
    navegador: navigator.userAgent,
    pantalla: { w: screen.width, h: screen.height, dpr: window.devicePixelRatio },
    deckyVersion: (at(loader, "version") as string | undefined) ?? (at(window, "DECKY_LOADER_VERSION") as string | undefined) ?? null,
    plugins,
    juego: g ? { appid: g.liveAppid, clave: g.key, nombre: g.name } : null,
    potencia: tdp,
    potenciaPanel: currentWatts(),
    bajoConsumo: lowPower(),
    apariencia: { modo: appearanceMode(), acento: currentPalette().accent },
    memoriaMB: mem ? { usada: Math.round(mem.usedJSHeapSize / 1048576), total: Math.round(mem.totalJSHeapSize / 1048576) } : null,
    panel: modal?.isConnected ? { abierto: true, nodos: modal.querySelectorAll("*").length } : { abierto: false },
    situacion: situation(null, 0),
    pantallaSteam: (() => {
      // Que ofrece Steam sobre la pantalla (nombres de funciones, sin llamarlas) y los limites del almacen de rendimiento.
      const d = at(window, "SteamClient.System.Display") as Any | undefined;
      const names: string[] = [];
      for (let p: object | null = d ?? null, n = 0; p && p !== Object.prototype && n < 3; p = Object.getPrototypeOf(p), n++) names.push(...Object.getOwnPropertyNames(p));
      const ps = perfStore() as Any | null;
      return { funciones: [...new Set(names)].filter((x) => x !== "constructor").slice(0, 60), limites: ps?.msgLimits ?? null };
    })(),
    lectorPantalla: probeScreenReader(),
    teclado: keyboardMethods(),
    planificador: tickerStats(),
    nivelesPotencia: (() => { const t = tiers(); return { ahorroHasta: t.ecoW, fluidoDesde: t.fluidW, sugerido: t.auto, porque: t.why }; })(),
    registro: summary(recentEvents()).map((b) => ({ w: b.w, aperturas: b.opens.length, secciones: b.switches.length, bloqueos: b.longtasks.length })),
  };
}

/** Lector de pantalla de Steam (el aviso «Screen reader enabled» del pie): que ajustes lo nombran, sin tocar nada. */
export function probeScreenReader(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const rx = /screen.?reader|narrat|lector|tts|text.?to.?speech|accessib/i;
  const walk = (o: unknown, path: string, d: number) => {
    if (!o || typeof o !== "object" || d < 0) return;
    let keys: string[] = [];
    try { keys = Object.keys(o as object).slice(0, 400); } catch { return; }
    for (const k of keys) {
      let v: unknown;
      try { v = (o as Record<string, unknown>)[k]; } catch { continue; }
      if (rx.test(k) && (typeof v !== "object" || v === null)) out[`${path}.${k}`] = typeof v === "function" ? "ƒ" : v;
      else if (v && typeof v === "object" && !Array.isArray(v)) walk(v, `${path}.${k}`, d - 1);
    }
  };
  walk(at(window, "settingsStore"), "settingsStore", 3);
  const s = at(window, "SteamClient.Settings") as Any | undefined;
  out["SteamClient.Settings"] = s ? Object.keys(s).filter((k) => /reader|access|setting/i.test(k)).slice(0, 30) : null;
  return out;
}

// ---- Música: controles, navegación y estabilidad durante toda la batería ----
async function waitFor(cond: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await sleep(150); }
  return cond();
}

/** Puro (probado): con las cajas del reproductor anclado, ¿se llega a todos sus botones con la cruceta? */
export function dockReach(rects: Array<{ left: number; right: number; top: number; bottom: number }>, dock: number[]): { fila: number; alcanzados: number; salir: boolean } {
  if (!dock.length) return { fila: 0, alcanzados: 0, salir: false };
  const rows = visualRows(dock.map((i) => rects[i])).map((r) => r.map((k) => dock[k]));
  const row = rows[rows.length - 1];
  const seen = new Set<number>([row[0]]);
  let at = row[0];
  for (let n = 0; n < row.length + 2; n++) { const to = listTarget(rects, at, BTN.RIGHT, { extra: dock }); if (to < 0) break; seen.add(to); at = to; }
  const up = listTarget(rects, rows[0][0], BTN.UP, { extra: dock });
  return { fila: row.length, alcanzados: seen.size, salir: up >= 0 && !dock.includes(up) };
}

export async function testMusic(suiteStart?: number): Promise<{ status: SuiteStep["status"]; detail: string }> {
  const out: Record<string, unknown> = { fecha: new Date().toISOString() };
  const fails: string[] = [];
  // Estabilidad: pausas automáticas y velocidad del contador mientras corrían las demás pruebas (estrés).
  const since = suiteStart ?? Date.now() - 120_000;
  const pauses = musicAutoPauses().filter((p) => p.t >= since);
  const rates = musicRates();
  out.estres = { pausasSolas: pauses, velocidades: rates.slice(-20) };
  if (pauses.length) fails.push(`${pauses.length} pausas solas`);
  const st0 = musicState();
  if (!st0 || !music.available()) {
    await saveSection("musica-prueba", { ...out, controles: "sin música sonando" });
    return { status: pauses.length ? "warn" : "skipped", detail: "pon una banda sonora para probar los controles" };
  }
  const was = st0.status;
  const ctl: Record<string, unknown> = {};
  if (musicState()?.status !== PLAYING) { music.toggle(); ctl.reproducir = await waitFor(() => musicState()?.status === PLAYING, 3000); }
  // ¿El contador avanza al ritmo del reloj? (1,0 = bien; >3 = salida de audio perdida).
  const p0 = musicState()?.positionS ?? 0, t0 = Date.now();
  await sleep(7000);
  const ratio = ((musicState()?.positionS ?? 0) - p0) / ((Date.now() - t0) / 1000);
  ctl.velocidad = Math.round(ratio * 100) / 100;
  if (!(ratio > 0.6 && ratio < 1.6)) fails.push(`contador x${ctl.velocidad}`);
  music.toggle();
  ctl.pausa = await waitFor(() => musicState()?.status === PAUSED, 3000);
  const pp = musicState()?.positionS ?? 0;
  await sleep(2000);
  ctl.quietaEnPausa = Math.abs((musicState()?.positionS ?? 0) - pp) < 1;
  music.toggle();
  ctl.seguir = await waitFor(() => musicState()?.status === PLAYING, 3000);
  const tr = musicState()?.track ?? -1;
  music.next();
  ctl.siguiente = await waitFor(() => (musicState()?.track ?? -1) !== tr, 4000);
  music.prev();
  ctl.anterior = await waitFor(() => (musicState()?.track ?? -1) === tr, 4000);
  ctl.sinPausasDuranteLaPrueba = !musicAutoPauses().some((p) => p.t >= t0);
  for (const k of ["pausa", "quietaEnPausa", "seguir", "siguiente", "anterior", "sinPausasDuranteLaPrueba"]) if (ctl[k] === false) fails.push(k);
  if (was !== PLAYING) { music.toggle(); await waitFor(() => musicState()?.status === PAUSED, 3000); }
  out.controles = ctl;
  // Navegación con la cruceta dentro del reproductor anclado (solo si el panel está abierto en Inicio).
  const root = (at(window, "__qamRailModalEl") as HTMLElement | null | undefined) ?? null;
  const all = root?.isConnected ? [...root.querySelectorAll<HTMLElement>('[data-qr="item"]')].filter((e) => e.getClientRects().length > 0) : [];
  const dock = all.map((x, i) => (x.closest("[data-qr-dock]") ? i : -1)).filter((i) => i >= 0);
  if (!dock.length) out.navegacion = "reproductor no visible (abre Inicio con música para probar la cruceta)";
  else {
    const r = dockReach(all.map((e) => e.getBoundingClientRect()), dock);
    out.navegacion = r;
    if (r.alcanzados < r.fila || !r.salir) fails.push("cruceta en el reproductor");
  }
  await saveSection("musica-prueba", out);
  return { status: fails.length ? "warn" : "ok", detail: fails.length ? fails.join(", ") : `controles bien · contador x${ctl.velocidad}` };
}

const procSample = callable<[seconds: number], { cpu: string; procesos: Array<{ cpu: string; mem: string; proceso: string; orden?: string }> }>("post_game_sample");

export async function testEnvironment(): Promise<string> {
  const env = await environment();
  return saveSection(`entorno@${(env.situacion as { key: string }).key}`, env);
}

// ---------------- Redes: Wi‑Fi y Bluetooth (solo lectura) ----------------
/** Bluetooth (Steam), Wi‑Fi (NetworkManager), y que funciones de red de Steam hay. No cambia nada. */
export async function testNetwork(): Promise<{ path: string; summary: string; ok: boolean }> {
  const api = btApi();
  let bt: BtState | null = null;
  if (api?.RegisterForStateChanges) {
    bt = await new Promise<BtState | null>((done) => {
      let r: { unregister?: () => void } | null = null;
      const t = window.setTimeout(() => { try { r?.unregister?.(); } catch { /* nada */ } done(null); }, 2000);
      r = api.RegisterForStateChanges!((s) => { window.clearTimeout(t); window.setTimeout(() => { try { r?.unregister?.(); } catch { /* nada */ } }, 0); done(s); }) as { unregister?: () => void } | null;
    });
  }
  // BlueZ (lo que usa el panel ahora) y donde podria estar el Bluetooth en esta version de Steam.
  let bz: unknown = null;
  try { bz = await btState(); } catch (e) { bz = { ok: false, error: String(e) }; }
  const steamBtNames: string[] = [];
  try {
    const sc = (window as unknown as { SteamClient?: Record<string, unknown> }).SteamClient ?? {};
    for (const [k, v] of Object.entries(sc)) {
      if (/bluetooth/i.test(k)) steamBtNames.push(`SteamClient.${k}`);
      if (v && typeof v === "object") for (const k2 of Object.keys(v as object)) if (/bluetooth/i.test(k2)) steamBtNames.push(`SteamClient.${k}.${k2}`);
    }
    for (const k of Object.keys(window)) if (/bluetooth/i.test(k)) steamBtNames.push(`window.${k}`);
  } catch { /* nada */ }
  let wifi: unknown = null;
  try { wifi = await wifiState(false); } catch (e) { wifi = { ok: false, error: String(e) }; }
  const w = wifi as { ok?: boolean; radio?: boolean; networks?: Array<{ active: boolean; ssid: string; signal: number }> };
  const active = w?.networks?.find((n) => n.active);
  const funcs = checkSpecs(window, [
    ["Bluetooth", "SteamClient.System.Bluetooth.Connect", "fn"], ["Bluetooth", "SteamClient.System.Bluetooth.Pair", "fn"],
    ["Bluetooth", "SteamClient.System.Bluetooth.SetAdapterDiscovering", "fn"], ["Bluetooth", "SteamClient.System.Bluetooth.SetEnabled", "fn"],
    ["Wi‑Fi", "SteamClient.System.Network.SetWifiEnabled", "fn"], ["Wi‑Fi", "SteamClient.System.Network.RegisterForConnectivityTestChanges", "fn"],
    ["Avión", "SteamClient.System.SetAirplaneMode", "fn"], ["Remote Play", "SteamClient.RemotePlay", "obj"],
  ]);
  const data = {
    fecha: new Date().toISOString(),
    bluetooth: bt ? { encendido: bt.bEnabled, adaptadores: bt.vecAdapters?.map((a) => ({ nombre: a.sName, buscando: a.bDiscovering })), dispositivos: bt.vecDevices?.map((d) => ({ nombre: d.sName, tipo: d.eType, conectado: d.bConnected, emparejado: d.bPaired })) } : "sin respuesta de Steam",
    bluez: bz, steamBluetoothEn: steamBtNames, wifi, funciones: funcs,
  };
  const b = bz as { ok?: boolean; powered?: boolean; devices?: Array<{ connected: boolean }> };
  const ok = !!b?.ok && !!w?.ok;
  const summary = `BT ${b?.ok ? (b.powered ? `${b.devices?.filter((d) => d.connected).length ?? 0} conectados` : "apagado") : "sin BlueZ"} · Wi‑Fi ${w?.ok ? (w.radio ? (active ? `${active.ssid} ${active.signal} %` : "sin red") : "apagado") : "sin nmcli"}`;
  const path = await saveSection("redes", data, { ok, summary });
  return { path, summary, ok };
}

// ---------------- Prueba con juego abierto ----------------
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
async function panelFrames(ms: number): Promise<number[]> {
  const win = (at(window, "__qamRailModalEl.ownerDocument.defaultView") as Window | undefined) ?? window;
  const out: number[] = [];
  let last = performance.now();
  const end = last + ms;
  await new Promise<void>((done) => {
    const step = () => { const now = performance.now(); out.push(now - last); last = now; if (now < end) win.requestAnimationFrame(step); else done(); };
    win.requestAnimationFrame(step);
    window.setTimeout(done, ms + 1500);
  });
  return out.slice(1);
}
const fpsReasons = new Set<string>();
async function gameFps(samples: number, every = 500): Promise<Array<number | null>> {
  const out: Array<number | null> = [];
  for (let i = 0; i < samples; i++) {
    try {
      const r = await callPanel<{ fps?: number | null; reason?: string }>("get_kiosk_live", [], []);
      out.push(r.fps ?? null);
      if (r.fps == null && r.reason) fpsReasons.add(r.reason);
    } catch (e) { out.push(null); fpsReasons.add(String(e).slice(0, 60)); }
    await sleep(every);
  }
  return out;
}
const medianOf = (xs: Array<number | null>) => { const v = xs.filter((x): x is number => typeof x === "number").sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };

/**
 * Con un juego abierto (hay que lanzarlo y abrir el panel encima): FPS del juego con el panel abierto, fluidez del
 * panel normal y con el juego CONGELADO (la funcion de Panel que usan sus temas: pause_theme_game, renovada cada 1 s).
 * Responde si «pausar el juego mientras el panel esta abierto» merece la pena en este equipo.
 */
export async function testGame(): Promise<{ path: string; summary: string }> {
  const g = runningGame2();
  if (!g) throw new Error("No hay juego abierto: lanza uno y abre el panel encima");
  const sit = situation(null, 0);
  fpsReasons.clear();
  const fpsOpen = await gameFps(6);
  const normal = frameStats(await panelFrames(2500));
  let paused: ReturnType<typeof frameStats> | null = null;
  let pauseOk: unknown = null;
  let fpsPaused: Array<number | null> = [];
  try {
    pauseOk = await callPanel<boolean>("pause_theme_game", ["appid", "ms"], [String(g.liveAppid), 3000]);
    if (pauseOk) {
      const keep = window.setInterval(() => { void callPanel("pause_theme_game", ["appid", "ms"], [String(g.liveAppid), 3000]).catch(() => null); }, 1000);
      try {
        await sleep(300);
        const [fr, fp] = await Promise.all([panelFrames(2500), gameFps(4)]);
        paused = frameStats(fr);
        fpsPaused = fp;
      } finally { window.clearInterval(keep); }
    }
  } catch (e) { pauseOk = `error: ${String(e).slice(0, 120)}`; } finally {
    await callPanel("resume_theme_game", [], []).catch(() => null);
  }
  const fpsAfter = await gameFps(4);
  const data = {
    fecha: new Date().toISOString(), situacion: sit, juego: { appid: g.liveAppid, nombre: g.name },
    fpsJuegoConPanel: fpsOpen, fpsJuegoCongelado: fpsPaused, fpsJuegoDespues: fpsAfter,
    panelNormal: normal, panelConJuegoCongelado: paused, congelar: pauseOk, potencia: currentWatts(),
    sinFpsPorque: [...fpsReasons],
  };
  const res = { fpsJuego: medianOf(fpsOpen), panel: normal.fps, panelCongelado: paused?.fps ?? null, w: currentWatts().applied };
  const path = await saveSection(`juego@${sit.key}`, data, res);
  const summary = `juego ${res.fpsJuego ?? "?"} fps · panel ${Math.round(normal.fps ?? 0)} fps${paused ? ` → ${Math.round(paused.fps ?? 0)} con el juego congelado` : " (congelar no disponible)"}`;
  return { path, summary };
}

/** Junta el zip con lo ultimo de cada prueba y un resumen fresco. */
export async function bundleNow(): Promise<{ path: string; files: string[] }> {
  await flush().catch(() => null);
  return diagBundle(await environment());
}

// ---------------- Ejecutar todo ----------------
export interface SuiteStep { id: string; label: string; status: "pending" | "running" | "ok" | "warn" | "error" | "skipped"; detail?: string }
export interface SuiteState { running: boolean; steps: SuiteStep[]; zip?: string }

let suite: SuiteState = { running: false, steps: [] };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const suiteState = () => suite;
export const suiteSubscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
let stop = false;
export const cancelSuite = () => { stop = true; };

const STEPS: Array<{ id: string; label: string; run: () => Promise<{ status: SuiteStep["status"]; detail?: string }> }> = [
  { id: "entorno", label: "Entorno", run: async () => { await testEnvironment(); return { status: "ok" }; } },
  { id: "contrato-panel", label: "Contrato con Panel", run: async () => { const r = await testPanelContract(); return { status: r.ok === r.total ? "ok" : "warn", detail: `${r.ok}/${r.total}` }; } },
  { id: "contrato-steam", label: "Contrato con Steam", run: async () => { const r = await testSteamContract(); return { status: r.ok === r.total ? "ok" : "warn", detail: `${r.ok}/${r.total}` }; } },
  { id: "redes", label: "Redes (Wi‑Fi y Bluetooth)", run: async () => { const r = await testNetwork(); return { status: r.ok ? "ok" : "warn", detail: r.summary }; } },
  { id: "musica", label: "Música (bandas sonoras)", run: async () => {
    const d = probeMusicDeep();
    await saveSection("musica", { fecha: new Date().toISOString(), ...d });
    const n = (d.albumes as unknown[]).length;
    return { status: n ? "ok" : "warn", detail: n ? `${n} álbumes` : "sin álbumes encontrados" };
  } },
  { id: "procesos", label: "Procesos en segundo plano", run: async () => {
    // Al salir de un juego se vio gst-launch-1.0 (~40 % CPU, ¿grabación/captura?) y opengamepad-ui (~26 %).
    const r = await procSample(4);
    const heavy = r.procesos.filter((p) => Number(p.cpu) >= 15 && !/^steamwebhelper|^steam$|^gamescope/.test(p.proceso));
    await saveSection("procesos", { fecha: new Date().toISOString(), ...r, pesados: heavy });
    return { status: heavy.length ? "warn" : "ok", detail: heavy.length ? heavy.map((p) => `${p.proceso} ${p.cpu} %`).join(", ").slice(0, 120) : "nada pesado" };
  } },
  { id: "sonido", label: "Sonido (salidas y micrófono)", run: async () => {
    const r = await audioState(true); // con el texto de wpctl tal cual, para ver filtros y nombres reales
    await saveSection("sonido", { fecha: new Date().toISOString(), ...r });
    if (!r.ok) return { status: "warn", detail: r.error ?? "wpctl no responde" };
    const act = r.salidas?.find((x) => x.activa), mic = r.entradas?.find((x) => x.activa);
    if (r.crudo_activo) return { status: "warn", detail: "altavoces sin su filtro del sistema: pulsa «Restaurar» en Sonido" };
    return { status: r.salidas?.length ? "ok" : "warn", detail: `${r.salidas?.length ?? 0} salidas · suena por ${act ? shortName(act) : "?"}${mic ? ` · micro ${mic.silenciado ? "silenciado" : "activo"}` : ""}` };
  } },
  { id: "sonido-seguimiento", label: "Sonido · seguimiento 20 s (con música sonando)", run: async () => {
    // Para cazar «subo el volumen y baja solo» y los cortes: el backend anota cada cambio de salida, destino del
    // ecualizador, volumen y estado; mientras, aquí se sube el volumen por Steam a los 5 s y se mira si aguanta.
    const A = sc().System?.Audio;
    const dev = async () => { const i = await Promise.resolve(A?.GetDevices?.()).catch(() => null); const d = i?.vecDevices.find((x) => x.bIsDefaultOutputDevice); return d ? { id: d.id, vol: Math.round(d.flOutputVolume * 100) } : null; };
    const steam: Array<{ s: number; id: number | null; vol: number | null; nota?: string }> = [];
    const t0 = Date.now();
    const job = audioTrace(20).catch((e) => ({ ok: false, error: String(e) }));
    let pedido: number | null = null, antes: number | null = null;
    for (let k = 0; k < 20; k++) {
      const d = await dev();
      const row: (typeof steam)[number] = { s: Math.round((Date.now() - t0) / 100) / 10, id: d?.id ?? null, vol: d?.vol ?? null };
      if (k === 5 && d) { antes = d.vol; pedido = Math.min(100, d.vol + 15) === d.vol ? d.vol - 15 : Math.min(100, d.vol + 15); A?.SetDeviceVolume?.(d.id, 1, pedido / 100); row.nota = `se pide ${pedido} %`; }
      steam.push(row);
      await new Promise((r) => window.setTimeout(r, 1000));
    }
    const fin = await dev();
    if (fin && antes !== null) A?.SetDeviceVolume?.(fin.id, 1, antes / 100); // se deja como estaba
    const r = await job;
    const aguanta = pedido !== null && fin !== null && Math.abs(fin.vol - pedido) <= 3;
    await saveSection("sonido-seguimiento", { fecha: new Date().toISOString(), volumenSteam: steam, pedido, antes, quedo: fin?.vol ?? null, aguanta, ...r });
    const nCh = "cambios" in r && Array.isArray(r.cambios) ? r.cambios.length - 1 : 0;
    if (!r.ok) return { status: "warn", detail: "el seguimiento no respondió" };
    return { status: aguanta && nCh <= 2 ? "ok" : "warn", detail: `${aguanta ? "el volumen aguanta" : `volumen pedido ${pedido} % → quedó ${fin?.vol ?? "?"} %`} · ${nCh} cambios en 20 s` };
  } },
  { id: "teclado-efectos", label: "Teclado y efectos del chat", run: async () => {
    // Antes: manda un efecto (fuegos artificiales…) a un amigo desde el chat de Steam, o pídele que te lo mande.
    const r = chatProbe();
    await saveSection("chatEfectos", { fecha: new Date().toISOString(), ...r, tecladoMetodos: keyboardMethods() });
    return { status: r.etiquetas.length ? "ok" : "warn", detail: r.etiquetas.length ? `etiquetas: ${r.etiquetas.map((x) => x.tag).join(", ")}` : `${r.mensajes} mensajes leídos, sin etiquetas nuevas: manda un efecto y repite` };
  } },
  { id: "presupuesto", label: "Presupuesto de fluidez (abrir, sección, saltos)", run: async () => {
    // Uso real de la última hora (no cuenta lo que mide la propia prueba de fluidez, que fuerza 7 W).
    const since = Date.now() - 60 * 60 * 1000;
    const r = budget(recentEvents().filter((e) => e.t >= since), tiers().fluidW);
    await saveSection("presupuesto", { fecha: new Date().toISOString(), ...r, planificador: tickerStats() });
    const bad = r.lineas.filter((l) => !l.ok).map((l) => `${l.que}: ${l.mediana} ms (tope ${l.limite})`);
    if (r.saltos) bad.push(`${r.saltos} saltos de pantalla`);
    return { status: !r.lineas.length ? "skipped" : bad.length ? "warn" : "ok", detail: !r.lineas.length ? "usa el panel un rato y repite" : bad.length ? bad.join(" · ") : "dentro del tope" };
  } },
  { id: "potencia-menu", label: "Potencia del menú (lo aprendido)", run: async () => {
    const g = learned("escritorio"), j = learned("juego"), t = tiers();
    await saveSection("potencia-menu", { fecha: new Date().toISOString(), umbrales: t, sinJuego: g, conJuego: j, crudo: menuStatsRaw() });
    return { status: "ok", detail: `ahorro ≤ ${t.ecoW} W · fluido ≥ ${t.fluidW} W · ${g || j ? "aprendido" : "aún midiendo"}` };
  } },
  { id: "tema", label: "Tema", run: async () => { await testTheme(); return { status: "ok", detail: currentPalette().accent }; } },
  { id: "juego", label: "Con juego (FPS y congelar)", run: async () => {
    if (!runningGame2()) return { status: "skipped", detail: "sin juego abierto" };
    const r = await testGame(); return { status: "ok", detail: r.summary };
  } },
  { id: "potencia-minima", label: "Potencia mínima", run: async () => { await probeMinPower(); return { status: "ok" }; } },
  { id: "decky", label: "Decky", run: async () => { await probeDecky(); return { status: "ok" }; } },
  { id: "amigos.explorar", label: "Amigos · explorar", run: async () => { const q = installQRX2(); await q.explorar(); await q.guardar(); return { status: "ok" }; } },
  {
    id: "fluidez", label: "Fluidez (rápida)", run: async () => {
      await runFluency(true);
      const s = fluencyState();
      return { status: s.phase === "done" ? "ok" : s.phase === "cancelled" ? "skipped" : "error", detail: s.phase === "done" ? `${s.rows.length} niveles` : s.step };
    },
  },
  // Al final: así incluye si la música se pausó sola o se descontroló durante todo lo anterior (estrés).
  { id: "musica-prueba", label: "Música · controles, cruceta y estrés", run: () => testMusic(suiteT0) },
];
let suiteT0 = 0;

export async function runSuite(opts: { skipPower?: boolean } = {}): Promise<void> {
  if (suite.running) return;
  stop = false;
  suiteT0 = Date.now();
  suite = { running: true, steps: STEPS.map((s) => ({ id: s.id, label: s.label, status: "pending" })) };
  emit();
  const set = (id: string, p: Partial<SuiteStep>) => { suite = { ...suite, steps: suite.steps.map((s) => (s.id === id ? { ...s, ...p } : s)) }; emit(); };
  for (const s of STEPS) {
    const skip = stop || (opts.skipPower && (s.id === "potencia-minima" || s.id === "fluidez"));
    if (skip) { set(s.id, { status: "skipped" }); continue; }
    set(s.id, { status: "running" });
    try { const r = await s.run(); set(s.id, r); void diagMark(s.id, r.status, r.detail ?? ""); } catch (e) { set(s.id, { status: "error", detail: String(e).slice(0, 120) }); void diagMark(s.id, "error", String(e).slice(0, 120)); }
  }
  try { const z = await bundleNow(); suite = { ...suite, zip: z.path }; } catch (e) { suite = { ...suite, zip: `Error: ${String(e)}` }; }
  suite = { ...suite, running: false };
  emit();
}
export const SUITE_STEPS = STEPS.map(({ id, label }) => ({ id, label }));

/** Una sola prueba de la batería (las «Pruebas sueltas»). Su luz se actualiza igual que en «Medir todo». */
export async function runOneStep(id: string): Promise<SuiteStep | null> {
  const s = STEPS.find((x) => x.id === id);
  if (!s || suite.running) return null;
  suiteT0 = Date.now() - 120_000;
  const base = suite.steps.length ? suite.steps : STEPS.map((x) => ({ id: x.id, label: x.label, status: "pending" as const }));
  const put = (p: Partial<SuiteStep>) => { suite = { ...suite, steps: base.map((x) => (x.id === id ? { ...x, ...p } : (suite.steps.find((y) => y.id === x.id) ?? x))) }; emit(); };
  suite = { ...suite, running: true }; put({ status: "running" });
  let r: SuiteStep;
  try { r = { id, label: s.label, ...(await s.run()) }; } catch (e) { r = { id, label: s.label, status: "error", detail: String(e).slice(0, 120) }; }
  suite = { ...suite, running: false }; put(r);
  void diagMark(id, r.status, r.detail ?? "");
  return r;
}
