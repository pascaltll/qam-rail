// Decision pura del piloto (sin dependencias de Steam, para poder probarla).
export interface PilotState {
  now: number;
  visible: boolean;
  modalOpen: boolean;
  openedAt: number;
  bypassUntil: number;
  broken: boolean;
}

export const REOPEN_WINDOW_MS = 1500;
export const BYPASS_MS = 4000;

export type PilotAction = "ignore" | "intercept" | "close";

// - intercept: el QAM de Steam acaba de abrirse y lo sustituimos por el panel propio.
// - close:     el boton del QAM con el panel ya abierto = cerrarlo (el QAM de Steam NUNCA se muestra por esta via).
// - ignore:    no es una apertura, o el piloto esta roto/en pausa.
export function decide(s: PilotState): PilotAction {
  if (!s.visible || s.broken) return "ignore";
  if (s.now < s.bypassUntil) return "ignore";
  if (s.modalOpen || s.now - s.openedAt < REOPEN_WINDOW_MS) return "close";
  return "intercept";
}
