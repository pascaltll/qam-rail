import { crumb } from "./crumbs";

// Sonda de la API de musica de Steam (bandas sonoras). Aun no se sabe que metodos expone SteamClient en esta version,
// asi que NO se inventan controles: este diagnostico lista lo que existe para decidir como controlarla.
// Uso (consola de SharedJSContext): JSON.stringify(__qamRail.music())
export function probeMusic(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  try {
    const sc = (window as unknown as { SteamClient?: Record<string, unknown> }).SteamClient;
    if (!sc) return { error: "sin SteamClient" };
    const names = Object.keys(sc);
    out.candidates = names.filter((n) => /music|sound|audio|media/i.test(n));
    for (const n of out.candidates as string[]) {
      const obj = sc[n] as Record<string, unknown> | undefined;
      out[n] = obj && typeof obj === "object" ? Object.keys(obj).slice(0, 60) : typeof obj;
    }
  } catch (e) { out.error = String(e); }
  return out;
}

// ---- Reproductor de bandas sonoras de Steam (SteamClient.Music, segun tipos de @decky/ui) ----
// Se escucha desde que carga el plugin (no solo con el panel abierto) para conocer la pista aunque no haya cambios.
export interface MusicState { appid: number; status: number; shuffle: boolean; repeat: number; volume: number; track: number; lengthMs: number; positionS: number }
export const PLAYING = 1, PAUSED = 2;

interface MusicApi {
  TogglePlayPause?: () => void; PlayNext?: () => void; PlayPrevious?: () => void; SetPlayingShuffled?: (v: boolean) => void;
  SetPlayingRepeatStatus?: (s: number) => void; SetVolume?: (v: number) => void; SetPlaybackPosition?: (p: number) => void;
  RegisterForMusicPlaybackChanges?: (cb: (t: unknown) => void) => { unregister?: () => void };
  RegisterForMusicPlaybackPosition?: (cb: (p: number) => void) => { unregister?: () => void };
}
const api = () => (window as unknown as { SteamClient?: { Music?: MusicApi } }).SteamClient?.Music;

let state: MusicState | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const musicState = () => state;
export const musicSubscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** Traduce el aviso de Steam (false = sin musica, o el objeto MusicTrack). Pura (probada). */
export function toState(t: unknown, prev: MusicState | null): MusicState | null {
  if (!t || typeof t !== "object") return null;
  const o = t as Record<string, unknown>;
  const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    appid: num(o.uSoundtrackAppId), status: num(o.ePlaybackStatus), shuffle: o.bShuffle === true, repeat: num(o.eRepeatStatus),
    volume: num(o.nVolume, 100), track: num(o.nActiveTrack), lengthMs: num(o.nLengthInMsec),
    positionS: prev && prev.appid === num(o.uSoundtrackAppId) && prev.track === num(o.nActiveTrack) ? prev.positionS : 0,
  };
}

// Salida de audio perdida (zip 2026-11-07: al desconectar los auriculares la música «se descontrola»: no suena y el
// contador corre a toda velocidad). Steam sigue «reproduciendo» sin destino. Como un móvil: se pausa sola.
let outputLost = false;
export const musicOutputLost = () => outputLost;

/**
 * Puro (probado): ¿la posicion avanza mucho mas rapido que el reloj? (dp en s de pista, dt en s reales).
 * Se mide sobre una VENTANA de al menos 6 s: con intervalos cortos daba falsos positivos (zip 21:10: al cerrar el
 * panel o abrir un menu de Steam, los avisos de posicion llegan de golpe tras un tiron y la musica se pausaba sola).
 */
export const RACE_WINDOW_S = 6;

/** Puro (probado): posicion de Steam (ms) a segundos. */
export function toSeconds(raw: number, _lengthMs = 0): number {
  return Number.isFinite(raw) && raw > 0 ? raw / 1000 : 0;
}
export const racing = (dp: number, dt: number) => dt >= RACE_WINDOW_S && dp > dt * 3;
/** Ventanas seguidas con ritmo raro antes de pausar (un salto manual de la barra es una sola ventana). */
export const RACE_STRIKES = 2;
/** Puro (probado): ¿hay que pausar? `strikes` = ventanas seguidas con `racing` hasta esta (incluida). */
export const shouldAutoPause = (strikes: number) => strikes >= RACE_STRIKES;

// Vigilancia de la velocidad de la posicion (para la prueba de musica: cuanto avanza por segundo real).
const rateLog: number[] = [];
export const musicRates = () => [...rateLog];

/** Pausa si esta sonando (al desconectar auriculares, salida perdida...). */
let autoPauses: Array<{ t: number; reason: string }> = [];
export const musicAutoPauses = () => [...autoPauses];
export function pauseMusic(reason: string): boolean {
  if (!state || state.status !== PLAYING) return false;
  autoPauses = [...autoPauses.slice(-19), { t: Date.now(), reason }];
  api()?.TogglePlayPause?.();
  outputLost = true;
  crumb(`música en pausa: ${reason}`);
  emit();
  return true;
}

export function startMusicWatch(): () => void {
  const a = api();
  // Inicio de la ventana de medida: se reinicia al pausar, cambiar de pista o saltar hacia atras.
  let win: { p: number; t: number; track: number } | null = null;
  let strikes = 0;
  const h1 = a?.RegisterForMusicPlaybackChanges?.((t) => {
    state = toState(t, state);
    if (state?.status === PLAYING) outputLost = false; else { win = null; strikes = 0; }
    emit();
  });
  const h2 = a?.RegisterForMusicPlaybackPosition?.((raw) => {
    if (!state) return;
    const now = Date.now() / 1000;
    // Steam da la posicion en MILISEGUNDOS (prueba de musica 0.32: el contador avanzaba x1000). Antes se mostraba
    // como segundos: el contador «se aceleraba» y el detector de salida perdida pausaba la musica cada 6 s.
    const p = toSeconds(raw, state.lengthMs);
    if (state.status !== PLAYING || !win || win.track !== state.track || p < win.p) { win = { p, t: now, track: state.track }; strikes = 0; }
    else if (now - win.t >= RACE_WINDOW_S) {
      const dp = p - win.p, dt = now - win.t;
      rateLog.push(Math.round((dp / dt) * 100) / 100);
      if (rateLog.length > 60) rateLog.splice(0, rateLog.length - 60);
      // Ritmo raro (zip 2026-11-23: Steam perdió su salida de audio, sin stream en PipeWire, y el contador corría solo):
      // se anota y, a la segunda ventana seguida, se pausa. Steam necesita reiniciarse para reabrir el audio.
      if (racing(dp, dt)) {
        strikes += 1;
        crumb(`música: contador raro (x${Math.round((dp / dt) * 10) / 10})`);
        if (shouldAutoPause(strikes)) { strikes = 0; pauseMusic("el contador corre mucho más rápido que el reloj (Steam sin salida de audio: reinícialo)"); }
      } else strikes = 0;
      win = { p, t: now, track: state.track };
    }
    state = { ...state, positionS: p };
    emit();
  });
  return () => { h1?.unregister?.(); h2?.unregister?.(); };
}

// «Detener»: Steam no trae Stop (solo play/pausa). Se pausa, se vuelve al principio y el reproductor se oculta hasta
// que vuelva a sonar algo (desde Steam o desde los álbumes).
let stoppedApp: number | null = null;
export const musicStopped = (s: MusicState | null) => !!s && stoppedApp === s.appid && s.status !== PLAYING;
export function stopMusic(): void {
  const s = state;
  if (!s) return;
  if (s.status === PLAYING) api()?.TogglePlayPause?.();
  try { api()?.SetPlaybackPosition?.(0); } catch { /* nada */ }
  stoppedApp = s.appid;
  emit();
}

export const music = {
  stop: stopMusic,
  toggle: () => { stoppedApp = null; outputLost = false; api()?.TogglePlayPause?.(); },
  next: () => api()?.PlayNext?.(),
  prev: () => api()?.PlayPrevious?.(),
  shuffle: (v: boolean) => api()?.SetPlayingShuffled?.(v),
  repeat: (s: number) => api()?.SetPlayingRepeatStatus?.(s),
  volume: (v: number) => api()?.SetVolume?.(v),
  seek: (s: number) => api()?.SetPlaybackPosition?.(Math.round(s * 1000)), // en ms, como la posicion
  available: () => !!api()?.TogglePlayPause,
};

export function soundtrackName(appid: number): string {
  try {
    const o = (window as unknown as { appStore?: { GetAppOverviewByAppID?: (id: number) => { display_name?: string } | null } }).appStore?.GetAppOverviewByAppID?.(appid);
    return o?.display_name || "Banda sonora";
  } catch { return "Banda sonora"; }
}

// ---- Biblioteca de bandas sonoras (apps de tipo «álbum de música», EAppType.MusicAlbum = 8192) ----
export interface Album { appid: number; name: string; capsule: string | null; header: string; installed: boolean | null; art: string[] }
const CAP = /^(?:[0-9a-f]+\/)?[\w.-]+\.(?:jpe?g|png|webp)$/i;

/** Puro (probado): los álbumes de una lista de resúmenes de apps de Steam. */
export function albumsFrom(list: unknown): Album[] {
  if (!Array.isArray(list)) return [];
  const out: Album[] = [];
  const seen = new Set<number>();
  for (const raw of list) {
    const o = raw as Record<string, unknown> | null;
    if (!o || o.app_type !== 8192 || typeof o.appid !== "number" || seen.has(o.appid)) continue;
    const name = typeof o.display_name === "string" ? o.display_name.replace(/\s*(?:[-–:]\s*)?(?:Original\s+)?(?:Soundtrack|Banda sonora|OST)\s*$/i, "").trim() : "";
    if (!name) continue;
    seen.add(o.appid);
    const file = o.library_capsule_filename;
    const per = Array.isArray(o.per_client_data) ? (o.per_client_data[0] as Record<string, unknown> | undefined) : undefined;
    const capsule = typeof file === "string" && CAP.test(file) ? `/assets/${o.appid}/${file}` : null;
    out.push({
      appid: o.appid, name, art: artCandidates(o.appid, capsule, typeof o.header_filename === "string" ? o.header_filename : null),
      // Las bandas sonoras casi nunca traen carátula de biblioteca (salian rotas): la cabecera de la tienda siempre existe.
      capsule,
      header: `https://cdn.cloudflare.steamstatic.com/steam/apps/${o.appid}/header.jpg`,
      installed: typeof o.installed === "boolean" ? o.installed : typeof per?.installed === "boolean" ? (per.installed as boolean) : null,
    });
  }
  return out.sort((a, b) => Number(b.installed === true) - Number(a.installed === true) || a.name.localeCompare(b.name));
}

/**
 * Puro (probado): carátulas a probar en orden (la primera que cargue). La vertical primero (portada del álbum);
 * luego la cabecera. Las apps nuevas (p. ej. las bandas sonoras de Expedition 33, 2025) ya no tienen
 * «steam/apps/<id>/header.jpg» en el CDN antiguo: sus imagenes van en «store_item_assets» (a veces con nombre propio).
 */
export function artCandidates(appid: number, capsule: string | null, headerFile: string | null): string[] {
  const cdn = "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps";
  return [
    capsule,
    `${cdn}/${appid}/library_600x900.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
    headerFile && /^[\w./-]+\.(?:jpe?g|png|webp)$/i.test(headerFile) ? `${cdn}/${appid}/${headerFile}` : null,
    `${cdn}/${appid}/header.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
  ].filter((x): x is string => !!x);
}

/** Lo que Steam mismo usa para pintar la app (si lo expone): va delante de las adivinadas. */
function steamArt(appid: number): string[] {
  const out: string[] = [];
  try {
    const st = (window as unknown as { appStore?: Record<string, unknown> }).appStore;
    const ov = (st?.GetAppOverviewByAppID as ((id: number) => unknown) | undefined)?.call(st, appid);
    if (!st || !ov) return out;
    for (const m of ["GetVerticalCapsuleURLForApp", "GetCachedVerticalImageURLForApp", "GetLandscapeImageURLForApp", "GetCachedLandscapeImageURLForApp"]) {
      const f = st[m];
      if (typeof f !== "function") continue;
      try {
        const r = (f as (o: unknown) => unknown).call(st, ov);
        const u = Array.isArray(r) ? r[0] : r;
        if (typeof u === "string" && u && !out.includes(u)) out.push(u);
      } catch { /* siguiente */ }
    }
  } catch { /* nada */ }
  return out;
}
const artCache = new Map<number, string[]>();
/** Carátulas a probar para un álbum (las de Steam primero). */
export function albumArt(a: Album): string[] {
  let l = artCache.get(a.appid);
  if (!l) { l = [...new Set([...steamArt(a.appid), ...a.art])]; artCache.set(a.appid, l); }
  return l;
}

// La lista de apps de Steam tiene miles de entradas: recorrerla en cada repintado (el reproductor se repinta cada
// segundo con la posicion) costaba fotogramas y cortaba el audio a 10 W. Se calcula como mucho cada 2 min.
let albumCache: { at: number; list: Album[]; byId: Map<number, Album> } | null = null;
export function readAlbums(): Album[] {
  if (albumCache && Date.now() - albumCache.at < 120_000) return albumCache.list;
  const w = window as unknown as { appStore?: { allApps?: unknown }; collectionStore?: { allAppsCollection?: { allApps?: unknown } } };
  let list: Album[] = [];
  for (const l of [w.appStore?.allApps, w.collectionStore?.allAppsCollection?.allApps]) {
    const a = albumsFrom(l);
    if (a.length) { list = a; break; }
  }
  albumCache = { at: Date.now(), list, byId: new Map(list.map((a) => [a.appid, a])) };
  return list;
}
export const albumById = (appid: number): Album | undefined => { readAlbums(); return albumCache?.byId.get(appid); };
export const resetAlbumsForTest = () => { albumCache = null; };

/** Sonda para el diagnostico: que expone Steam sobre musica (sin llamar a nada). */
export function probeMusicDeep(): Record<string, unknown> {
  const w = window as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { steamClient: probeMusic(), globales: {} as Record<string, string[]> };
  for (const k of Object.keys(w)) {
    if (!/music|soundtrack|audio(?!context)/i.test(k)) continue;
    const v = w[k];
    const names: string[] = [];
    for (let p: object | null = v && typeof v === "object" ? (v as object) : null, n = 0; p && p !== Object.prototype && n < 3; p = Object.getPrototypeOf(p), n++) names.push(...Object.getOwnPropertyNames(p));
    (out.globales as Record<string, string[]>)[k] = [...new Set(names)].slice(0, 80);
  }
  out.albumes = readAlbums().slice(0, 30).map((a, i) => ({ appid: a.appid, nombre: a.name, instalado: a.installed, ...(i < 4 ? { caratulas: albumArt(a) } : {}) }));
  out.metodosImagen = (() => { try { const st = (w.appStore ?? {}) as object; const n: string[] = []; for (let p: object | null = st, k = 0; p && p !== Object.prototype && k < 3; p = Object.getPrototypeOf(p), k++) n.push(...Object.getOwnPropertyNames(p)); return [...new Set(n)].filter((x) => /image|capsule|icon|art|logo|hero/i.test(x)).slice(0, 40); } catch { return []; } })();
  return out;
}
