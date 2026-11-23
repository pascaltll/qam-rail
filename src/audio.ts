// Salida de audio y micrófono (PipeWire, desde el backend con wpctl). No depende de Steam.
import { callable } from "@decky/api";

export interface AudioNode { id: number; nombre: string; activa: boolean; volumen: number | null; silenciado: boolean; tipo: "altavoz" | "auriculares" | "hdmi" | "micro"; filtro?: boolean }
/** `crudo_activo`: los altavoces suenan por la tarjeta en crudo, sin el filtro del sistema (lo provocó 0.34). */
export interface AudioState { ok: boolean; error?: string; salidas?: AudioNode[]; entradas?: AudioNode[]; crudo_activo?: boolean; wpctl_status?: string; eq?: { id: number; nombre: string; por_defecto: boolean; destino: number | null; leido: boolean } }

export const audioState = callable<[raw?: boolean], AudioState>("audio_state");
export const audioReset = callable<[], { ok: boolean; detail: string }>("audio_reset");
export const audioSetDefault = callable<[node: number], { ok: boolean; detail: string }>("audio_set_default");
export const audioMute = callable<[node: number, on: boolean], { ok: boolean; detail: string }>("audio_mute");
export const audioVolume = callable<[node: number, vol: number], { ok: boolean; detail: string }>("audio_volume");

/** Puro (probado): nombre corto para una ficha («Family 17h HD Audio Controller Speaker» → «Altavoces»). */
export function shortName(n: AudioNode): string {
  if (n.tipo === "altavoz") return "Altavoces";
  if (n.tipo === "hdmi") return /displayport/i.test(n.nombre) && !/hdmi/i.test(n.nombre) ? "DisplayPort" : "HDMI / TV";
  if (n.tipo === "micro") return /digital|internal|family|controller/i.test(n.nombre) ? "Micrófono interno" : n.nombre.slice(0, 22);
  return n.nombre.replace(/\s*\(.*\)$/, "").slice(0, 22);
}

/** Puro (probado): orden de las salidas (activa primero, luego auriculares, HDMI, altavoces). */
export function sortOutputs(l: AudioNode[]): AudioNode[] {
  const rank = { auriculares: 0, hdmi: 1, altavoz: 2, micro: 3 } as const;
  return [...l].sort((a, b) => Number(b.activa) - Number(a.activa) || rank[a.tipo] - rank[b.tipo] || a.id - b.id);
}

export const audioTrace = callable<[seconds: number], { ok: boolean; segundos: number; muestras: number; cambios: Array<{ s: number; cambios: string[] }>; final?: unknown; pw_top?: string; bluetooth?: string[]; filter_chain?: string; registro?: string[] }>("audio_trace");
