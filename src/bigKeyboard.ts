// Teclado grande sobre la app: una ruta propia, transparente y vacía salvo el teclado. Steam pone su pantalla de inicio (la fila de juegos)
// sobre cualquier app que no lance él; llevando Steam a esta ruta, la app se ve por encima del teclado. [H] hasta probarlo en el equipo.
import { Navigation } from "@decky/ui";

import { desktopOverlay } from "./qamDesktop";

export const BIG_KEYBOARD_ROUTE = "/qam-rail/teclado";

let shown = false;
let lastToggle = 0;

/** ¿Está abierto el teclado grande? (lo sabemos porque solo se abre y se cierra desde aquí) */
export function isBigKeyboardOpen(): boolean { return shown; }

/** Steam + Y desde el mando: abre el teclado grande, o lo cierra si ya está. Ignora repeticiones de menos de 700 ms. */
export function toggleBigKeyboard(now: number = Date.now()): boolean {
  if (now - lastToggle < 700) return false;
  lastToggle = now;
  if (shown) { closeBigKeyboard(); return true; }
  return openBigKeyboard();
}

/** Abre la ruta del teclado (con el overlay de Steam arriba, que es lo que deja ver la interfaz sobre la app). */
export function openBigKeyboard(): boolean {
  try {
    void Promise.resolve(desktopOverlay(true, "teclado")).catch(() => undefined);
    Navigation.Navigate(BIG_KEYBOARD_ROUTE);
    shown = true;
    return true;
  } catch {
    return false;
  }
}

/** Cierra el teclado y devuelve a Steam a donde estaba. */
export function closeBigKeyboard(): void {
  const was = shown;
  shown = false;
  if (!was) return;
  try { Navigation.NavigateBack(); } catch { /* nada */ }
  void Promise.resolve(desktopOverlay(false, "teclado")).catch(() => undefined);
}
