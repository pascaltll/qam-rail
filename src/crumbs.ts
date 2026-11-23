// Migas: lo ultimo que se hizo en el panel, guardado al instante (no cada 20 s como el registro). Si Steam se
// reinicia o se cuelga, al volver se sabe que estabas haciendo justo antes (abrir una app, la columna de un
// plugin, cerrar el panel...). El backend junta ademas los registros de Steam/gamescope de ese momento.
import { callable } from "@decky/api";

import type { BootInfo } from "./boot";
import { VERSION } from "./version";

const crumbCall = callable<[text: string], void>("diag_crumb");
const beginCall = callable<[info: unknown], { previous_unclean: boolean; saved: string | null }>("session_begin");
const endCall = callable<[], void>("session_end");

export function crumb(text: string): void {
  try { void crumbCall(String(text).slice(0, 160)).catch(() => null); } catch { /* sin backend */ }
}

export async function sessionBegin(b: BootInfo): Promise<void> {
  try {
    await beginCall({ version: VERSION, loadedAt: b.loadedAt, readyAt: b.readyAt, settledAt: b.settledAt, waitedFor: b.waitedFor, ua: navigator.userAgent });
  } catch { /* sin backend */ }
}

export async function sessionEnd(): Promise<void> {
  try { await endCall(); } catch { /* sin backend */ }
}
