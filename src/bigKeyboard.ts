// Teclado grande sobre la app: una ruta propia, transparente y vacía salvo el teclado. Steam pone su pantalla de inicio (la fila de juegos)
// sobre cualquier app que no lance él; llevando Steam a esta ruta, la app se ve por encima del teclado. [H] hasta probarlo en el equipo.
import { Navigation } from "@decky/ui";

import { desktopOverlay } from "./qamDesktop";

export const BIG_KEYBOARD_ROUTE = "/qam-rail/teclado";

/** Abre la ruta del teclado (con el overlay de Steam arriba, que es lo que deja ver la interfaz sobre la app). */
export function openBigKeyboard(): boolean {
  try {
    void Promise.resolve(desktopOverlay(true, "teclado")).catch(() => undefined);
    Navigation.Navigate(BIG_KEYBOARD_ROUTE);
    return true;
  } catch {
    return false;
  }
}

/** Cierra el teclado y devuelve a Steam a donde estaba. */
export function closeBigKeyboard(): void {
  try { Navigation.NavigateBack(); } catch { /* nada */ }
  void Promise.resolve(desktopOverlay(false, "teclado")).catch(() => undefined);
}
