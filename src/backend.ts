import { callable } from "@decky/api";

export interface Settings {
  enabled: boolean;
  open_on: "focus" | "select";
  favorites: number[];
  /** Piloto: sustituye el QAM de Steam por un panel propio. Apagado por defecto. */
  own_qam: boolean;
}

export const DEFAULT_SETTINGS: Settings = { enabled: true, open_on: "focus", favorites: [], own_qam: false };

const getRaw = callable<[], Settings>("get_settings");
const setRaw = callable<[data: Settings], Settings>("set_settings");

export async function loadSettings(): Promise<Settings> {
  try {
    return { ...DEFAULT_SETTINGS, ...(await getRaw()) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Settings): Promise<Settings> {
  try {
    return { ...DEFAULT_SETTINGS, ...(await setRaw(s)) };
  } catch {
    return s;
  }
}
