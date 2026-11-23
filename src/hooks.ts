// Hooks de estado vivo: ajustes de Steam, estados de Panel de Control y conexiones. Todos se paran al desmontar.
import { tickEvery } from "./ticker";
import { clearPanelStore, entry, fetchShared, prime, subscribe } from "./panelStore";
import { bzDo, bzRefresh, bzSnapshot, bzSubscribe, wfRadio, wfRefresh, wfSnapshot, wfSubscribe } from "./network";
import { useVisible } from "./visible";
import { useCallback, useEffect, useRef, useState } from "react";

import { STEAM, capture, forget, hasOwn, load, remember, save } from "./displayProfiles";
import { applyValues } from "./displayWatch";
import { perfStore, perfWrite, readPerf, type PerfView } from "./steamPerf";
import { sys } from "./system";
import { sc, type Unreg } from "./steam";

/**
 * Ajustes de rendimiento de Steam. Se relee cada 1,5 s y justo tras escribir. Cada escritura se guarda en el perfil
 * de `profileKey` (clave del juego, o «steam» en modo normal): asi cada juego recuerda su pantalla.
 */
export function usePerf(profileKey: string = STEAM, ms = 1500): { view: PerfView | null; write: typeof perfWrite; refresh: () => void; own: boolean; reset: () => void } {
  const [view, setView] = useState<PerfView | null>(() => perfCached(0));
  const [own, setOwn] = useState(() => hasOwn(load(), profileKey));
  const refresh = useCallback(() => setView(perfCached(ms - 100)), [ms]);
  const visible = useVisible();
  useEffect(() => {
    if (!visible) return undefined;
    refresh();
    const id = tickEvery(refresh, ms);
    return () => id();
  }, [ms, refresh, visible]);
  useEffect(() => setOwn(hasOwn(load(), profileKey)), [profileKey]);
  const keyRef = useRef(profileKey);
  keyRef.current = profileKey;
  const write = useRef<typeof perfWrite | null>(null);
  if (!write.current) {
    const later = () => {
      window.setTimeout(() => {
        const v = readPerf(perfStore());
        perfCache = { at: Date.now(), v };
        setView(v);
        save(remember(load(), keyRef.current, capture(v)));
        setOwn(hasOwn(load(), keyRef.current));
      }, 150);
      window.setTimeout(refresh, 600);
    };
    write.current = Object.fromEntries(Object.entries(perfWrite).map(([k, fn]) => [k, (...a: unknown[]) => { const ok = (fn as (...x: unknown[]) => boolean)(...a); later(); return ok; }])) as unknown as typeof perfWrite;
  }
  // «Como en Steam»: el juego olvida su perfil y vuelve a los valores de Steam.
  const reset = () => {
    const p = forget(load(), keyRef.current);
    save(p);
    setOwn(false);
    if (p.steam) applyValues(p.steam);
    window.setTimeout(refresh, 150);
  };
  return { view, write: write.current, refresh, own, reset };
}

// Lectura compartida de los ajustes de Steam (varias tarjetas a la vez no leen el almacen cada una).
let perfCache: { at: number; v: PerfView | null } = { at: 0, v: null };
function perfCached(maxAge: number): PerfView | null {
  const now = Date.now();
  if (maxAge <= 0 || now - perfCache.at > maxAge) perfCache = { at: now, v: readPerf(perfStore()) };
  return perfCache.v;
}

// Cache de la ultima respuesta de cada metodo: al volver a una seccion se pinta al instante y se refresca detras
// (sin «Leyendo…» ni saltos de altura cada vez).
/** Pruebas: vacia lo leído. */
export function clearPanelCache(): void { clearPanelStore(); }

/** Lectura de Panel compartida por clave (ver panelStore.ts): varias tarjetas, una sola llamada. */
export function usePanel<T>(key: string, get: () => Promise<T>, ms = 0): { data: T | null; missing: boolean; set: (v: T | null) => void; refresh: () => void } {
  const e = entry(key);
  const [, bump] = useState(0);
  useEffect(() => subscribe(key, () => bump((n) => n + 1)), [key]);
  // La respuesta de una escritura de Panel puede traer solo lo que cambio: se une a lo que ya se sabia (si no, tarjetas
  // enteras pasaban a «no soportado» y el control enfocado desaparecia: el mando se quedaba sin foco).
  const setData = useCallback((v: T | null) => {
    if (v === null) return;
    const prev = entry(key).data as unknown;
    const plain = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
    prime(key, plain(prev) && plain(v) ? { ...prev, ...v } : v);
  }, [key]);
  const getRef = useRef(get);
  getRef.current = get;
  // `refresh()` a mano (tras escribir) fuerza la lectura; al montar y en el sondeo, una reciente vale.
  const refresh = useCallback(() => { void fetchShared(key, () => getRef.current(), true); }, [key]);
  const soft = useCallback(() => { void fetchShared(key, () => getRef.current()); }, [key]);
  const visible = useVisible();
  // Primera lectura al montar; el sondeo periodico solo mientras la seccion se ve (y al volver se relee).
  useEffect(() => {
    if (!visible) return undefined;
    soft();
    // El planificador ya espacia en ahorro (a mitad de ritmo).
    const off = ms > 0 ? tickEvery(soft, ms, { name: `panel:${key}` }) : null;
    return () => { off?.(); };
  }, [ms, soft, visible]);
  return { data: e.data as T | null, missing: e.missing, set: setData, refresh };
}

export interface Conn {
  bt: boolean; wifi: boolean; plane: boolean; dnd: boolean;
  setBt: (v: boolean) => void; setWifi: (v: boolean) => void; setPlane: (v: boolean) => void; setDnd: (v: boolean) => void;
}

/** Bluetooth, Wi‑Fi, modo avion y No molestar con su estado real cuando Steam lo publica. */
export function useConn(notify: (t: string) => void): Conn {
  const [bt, setBtS] = useState(false);
  const [wifi, setWifiS] = useState(true);
  const [plane, setPlaneS] = useState(false);
  const [dnd, setDndS] = useState(() => sys.dnd() ?? false);
  useEffect(() => {
    const regs: Array<Unreg | null> = [];
    try { regs.push(sc().System?.Bluetooth?.RegisterForStateChanges?.((s) => setBtS(!!s.bEnabled)) ?? null); } catch { /* sin BT */ }
    if (!sc().System?.Bluetooth?.RegisterForStateChanges) {
      // BlueZ: el mismo estado que la tarjeta de dispositivos (cambia a la vez en los dos sitios).
      const sync = () => { const r = bzSnapshot(); if (r?.ok) setBtS(!!r.powered); };
      sync();
      regs.push({ unregister: bzSubscribe(sync) });
      void bzRefresh();
    }
    // Wi‑Fi: mismo estado que la tarjeta de redes (nmcli), que cambia al instante.
    const syncW = () => { const r = wfSnapshot(); if (r?.ok) setWifiS(!!r.radio); };
    syncW();
    regs.push({ unregister: wfSubscribe(syncW) });
    void wfRefresh();
    regs.push(sys.onPlane(setPlaneS));
    return () => regs.forEach((r) => r?.unregister?.());
  }, []);
  return {
    bt, wifi, plane, dnd,
    setBt: (v) => {
      setBtS(v);
      // Steam ya no trae SteamClient.System.Bluetooth en algunas versiones: entonces BlueZ desde el backend.
      const steamBt = sc().System?.Bluetooth?.SetEnabled;
      if (steamBt) { try { steamBt(v); } catch { notify("No se pudo cambiar el Bluetooth"); } return; }
      void bzDo(v ? "power-on" : "power-off").then((r) => { if (!r.ok) { setBtS(!v); notify("No se pudo cambiar el Bluetooth"); } });
    },
    setWifi: (v) => { setWifiS(v); void wfRadio(v).then((ok) => { if (!ok && !sys.setWifi(v)) { setWifiS(!v); notify("No se pudo cambiar el Wi‑Fi"); } }); },
    setPlane: (v) => { setPlaneS(v); if (!sys.setPlane(v)) notify("Steam no permite el modo avión desde aquí"); },
    setDnd: (v) => { setDndS(v); if (!sys.setDnd(v)) notify("No molestar no está disponible"); },
  };
}
