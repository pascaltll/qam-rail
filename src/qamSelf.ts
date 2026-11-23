import { callable } from "@decky/api";

import type { GhUpdate } from "./qamApps";

export interface SelfInfo { version: string | null; channel: "stable" | "beta"; kind?: "stable" | "dev"; last_check: number | null; backup_version: string | null; repo: string; }
export interface SelfResult { ok: boolean; restarting?: boolean; from?: string; to?: string; error?: string; }

export const selfInfo = callable<[], SelfInfo>("self_info");
export const selfCheck = callable<[force?: boolean], GhUpdate>("self_check");
export const selfUpdate = callable<[], SelfResult>("self_update");
export const selfRollback = callable<[], SelfResult>("self_rollback");
export const selfSetChannel = callable<[channel: string], SelfInfo>("self_set_channel");

/** Línea de estado bajo el título: qué versión hay y qué pasa. */
export function selfStatus(info: SelfInfo | null, upd: GhUpdate | null, checking: boolean): string {
  if (!info) return "Leyendo…";
  if (checking) return `Versión ${info.version ?? "?"} · buscando…`;
  if (!upd) return `Versión ${info.version ?? "?"}`;
  if (upd.state === "update") return `Versión ${info.version ?? "?"} · disponible ${upd.latest}${upd.prerelease ? " (beta)" : ""}`;
  if (upd.state === "current") return `Versión ${info.version ?? "?"} · al día`;
  if (upd.state === "error") return `Versión ${info.version ?? "?"} · no se pudo comprobar`;
  return `Versión ${info.version ?? "?"}`;
}

/** Texto de resultado para el aviso. */
export function selfMessage(r: SelfResult): string {
  if (r.ok) return r.restarting ? `${r.from ?? "?"} → ${r.to ?? "?"}: reiniciando Decky (unos segundos)` : `${r.from ?? "?"} → ${r.to ?? "?"}`;
  return `No se pudo: ${r.error ?? "error desconocido"}`;
}
