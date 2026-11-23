import { callable } from "@decky/api";

// Canales (0.53): «qam-rail» (estable, GitHub) y «qam-rail-dev» (desarrollo) pueden estar instalados a la vez; solo uno dibuja el QAM.
export type Kind = "stable" | "dev";
export interface ChannelInfo { me: Kind; active: Kind; dev_installed: boolean; stable_installed: boolean; version: string | null; notice: string | null; }
export interface SwitchResult { ok: boolean; restarting?: boolean; active?: Kind; error?: string; }

export const channelInfo = callable<[], ChannelInfo>("channel_info");
export const channelSwitch = callable<[target: Kind], SwitchResult>("channel_switch");
export const channelOk = callable<[], boolean>("channel_ok");

/** ¿Este plugin debe dibujar el QAM? Sin dato (backend viejo o sin respuesta) se comporta como siempre: sí. */
export const isActive = (i: ChannelInfo | null | undefined): boolean => !i || i.me === i.active;

export const kindName = (k: Kind): string => (k === "dev" ? "desarrollo" : "estable");

/** La otra versión y si se puede pasar a ella (está instalada). */
export function other(i: ChannelInfo): { kind: Kind; installed: boolean } {
  const k: Kind = i.me === "dev" ? "stable" : "dev";
  return { kind: k, installed: k === "dev" ? i.dev_installed : i.stable_installed };
}

/** Línea de estado para la tarjeta de canal. */
export function channelLine(i: ChannelInfo): string {
  const v = i.version ? ` ${i.version}` : "";
  if (i.me !== i.active) return `Versión ${kindName(i.me)}${v} en pausa · activa: ${kindName(i.active)}`;
  const o = other(i);
  return `Versión ${kindName(i.me)}${v} activa${o.installed ? ` · también instalada la ${kindName(o.kind)}` : ""}`;
}

export function switchMessage(r: SwitchResult, to: Kind): string {
  if (r.ok) return `Pasando a la versión ${kindName(to)}: reiniciando Decky (unos segundos)`;
  return `No se pudo: ${r.error ?? "error desconocido"}`;
}
