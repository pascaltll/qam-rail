// Sonido a la TV sin buscarlo (0.47). En el Ally la salida HDMI solo existe con una pantalla conectada (zips 11‑11 y
// 13‑11): si aparece y antes no estaba, el sonido pasa a ella; al desconectarla, el sistema vuelve solo a los altavoces.
import { audioSetDefault, audioState, shortName, type AudioNode } from "./audio";
import { crumb } from "./crumbs";

const LS_ON = "qam-rail:audio-tv-auto", LS_SEEN = "qam-rail:audio-tv-seen";
const get = (k: string) => { try { return window.localStorage?.getItem(k) ?? null; } catch { return null; } };
const put = (k: string, v: string) => { try { window.localStorage?.setItem(k, v); } catch { /* nada */ } };
export const autoTvOn = (): boolean => get(LS_ON) !== "off";
export const setAutoTv = (on: boolean): void => put(LS_ON, on ? "on" : "off");

/** Puro (probado): la salida de TV a la que hay que pasar, o null. `seen` = había TV la última vez que se miró. */
export function tvTarget(outs: AudioNode[], seen: boolean, enabled: boolean): AudioNode | null {
  const tv = outs.find((o) => o.tipo === "hdmi") ?? null;
  if (!enabled || !tv || seen || tv.activa) return null;
  return tv;
}

/** Se llama al abrir el panel (una lectura). Devuelve el nombre de la salida si cambió. */
export async function checkTvAudio(): Promise<string | null> {
  const st = await audioState(false).catch(() => null);
  if (!st?.ok) return null;
  const outs = st.salidas ?? [];
  const has = outs.some((o) => o.tipo === "hdmi");
  const seen = get(LS_SEEN) === "1";
  const t = tvTarget(outs, seen, autoTvOn());
  if (has !== seen) put(LS_SEEN, has ? "1" : "0");
  if (!t) return null;
  const r = await audioSetDefault(t.id).catch(() => ({ ok: false }));
  crumb(`audio: TV conectada → ${r.ok ? "sonido a" : "no se pudo pasar a"} ${shortName(t)}`);
  return r.ok ? shortName(t) : null;
}
