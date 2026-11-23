// Conexiones del sistema por SteamClient y friendStore: Wi‑Fi, modo avion y No molestar. Bluetooth sigue en steam.ts.
// [H] Wi‑Fi se lee de la prueba de conectividad de Steam (resultado 5 = Wi‑Fi apagado); no hay lectura directa sin protobuf.
import type { Unreg } from "./steam";

interface Host {
  SteamClient?: {
    System?: {
      SetAirplaneMode?: (v: boolean) => void;
      RegisterForAirplaneModeChanges?: (cb: (s: { bEnabled: boolean }) => void) => Unreg;
      Network?: {
        SetWifiEnabled?: (v: boolean) => Promise<unknown>;
        RegisterForConnectivityTestChanges?: (cb: (t: { eConnectivityTestResult: number }) => void) => Unreg;
      };
    };
  };
  friendStore?: { m_FriendsUIFriendStore?: { GetUserDoNotDisturb?: () => boolean; SetUserDoNotDisturb?: (v: boolean) => void } };
}
const h = () => window as unknown as Host;
const WIFI_DISABLED = 5;

export const sys = {
  setWifi: (on: boolean): boolean => { try { void h().SteamClient?.System?.Network?.SetWifiEnabled?.(on); return !!h().SteamClient?.System?.Network?.SetWifiEnabled; } catch { return false; } },
  onWifi: (cb: (on: boolean) => void): Unreg | null => {
    try { return h().SteamClient?.System?.Network?.RegisterForConnectivityTestChanges?.((t) => cb(t.eConnectivityTestResult !== WIFI_DISABLED)) ?? null; } catch { return null; }
  },
  setPlane: (on: boolean): boolean => { try { h().SteamClient?.System?.SetAirplaneMode?.(on); return !!h().SteamClient?.System?.SetAirplaneMode; } catch { return false; } },
  onPlane: (cb: (on: boolean) => void): Unreg | null => {
    try { return h().SteamClient?.System?.RegisterForAirplaneModeChanges?.((s) => cb(!!s.bEnabled)) ?? null; } catch { return null; }
  },
  dnd: (): boolean | null => { try { const f = h().friendStore?.m_FriendsUIFriendStore; return f?.GetUserDoNotDisturb ? !!f.GetUserDoNotDisturb() : null; } catch { return null; } },
  setDnd: (on: boolean): boolean => { try { const f = h().friendStore?.m_FriendsUIFriendStore; f?.SetUserDoNotDisturb?.(on); return !!f?.SetUserDoNotDisturb; } catch { return false; } },
};
