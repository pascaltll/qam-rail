// Teclado virtual de Steam: al cerrar el chat o el panel se quita el foco del campo y se pide ocultar el teclado.
// Sospecha (registro 2026-11-05 12:46): tras escribir en el chat y cerrar con el boton QAM, la siguiente sesion fue lenta
// con bloqueos continuos, como si el teclado siguiera activo detras. [H] nombres de metodos del teclado.
import { callable } from "@decky/api";
type Any = Record<string, unknown>;

function keyboards(): Any[] {
  const out: Any[] = [];
  try {
    const bb = (window as unknown as { BrowserAndBackstackInstances?: Record<string, Any> }).BrowserAndBackstackInstances;
    if (bb) for (const k of Object.keys(bb)) { const kb = (bb[k]?.m_refKeyboard as Any | undefined); if (kb) out.push(kb); }
  } catch { /* nada */ }
  return out;
}

/** Quita el foco de cualquier campo de texto del documento dado y pide ocultar los teclados de Steam. */
export function dismissKeyboard(doc: Document | null | undefined): number {
  let n = 0;
  try {
    const a = doc?.activeElement as HTMLElement | null | undefined;
    if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) { a.blur(); n++; }
  } catch { /* nada */ }
  for (const kb of keyboards()) {
    for (const m of ["HideVirtualKeyboard", "Hide", "HideKeyboard", "SetVisible"]) {
      const f = kb[m];
      if (typeof f === "function") {
        try { (f as (v?: boolean) => void).call(kb, m === "SetVisible" ? false : undefined); n++; } catch { /* siguiente */ }
        break;
      }
    }
  }
  return n;
}

/** Para el registro: ¿habia un campo de texto con foco en la ventana principal al abrir el panel? */
export function inputFocused(doc: Document | null | undefined): boolean {
  try { const a = doc?.activeElement; return !!a && /^(INPUT|TEXTAREA)$/.test(a.tagName); } catch { return false; }
}

// ---- Mostrar el teclado (pestaña «Teclado» del QAM de Steam) ----
// [H] Los gestores de teclado de cada ventana (m_refKeyboard) traen el «Hide»; se busca su pareja «Show». La prueba
// «Contrato con Steam» guarda los métodos que tienen para confirmarlo en el equipo.
export function keyboardMethods(): string[][] {
  return keyboards().map((kb) => {
    const names: string[] = [];
    for (let p: object | null = kb, n = 0; p && p !== Object.prototype && n < 3; p = Object.getPrototypeOf(p), n++) names.push(...Object.getOwnPropertyNames(p));
    return [...new Set(names)].filter((x) => /keyboard|show|hide|visible/i.test(x)).slice(0, 30);
  });
}

/** Pide a Steam que muestre su teclado en pantalla. Devuelve el método usado o null si no hay forma. */
export function showKeyboard(): string | null {
  for (const kb of keyboards()) {
    for (const m of ["ShowVirtualKeyboard", "ShowKeyboard", "Show", "SetVisible"]) {
      const f = kb[m];
      if (typeof f !== "function") continue;
      try { (f as (v?: boolean) => void).call(kb, m === "SetVisible" ? true : undefined); return m; } catch { /* siguiente */ }
    }
  }
  return null;
}

/** ¿Hay algún teclado con un método para mostrarlo? (en 0.33 la sonda no encontró ninguno: el atajo se oculta). */
export const keyboardAvailable = (): boolean => keyboards().some((kb) => ["ShowVirtualKeyboard", "ShowKeyboard", "Show", "SetVisible"].some((m) => typeof kb[m] === "function"));

// ---- Enlace profundo de Steam (el mismo que usa SDL): steam://open/keyboard y steam://close/keyboard [H en el equipo] ----
export const KEYBOARD_URL = { open: "steam://open/keyboard", close: "steam://close/keyboard" } as const;
const urlBackend = callable<[close?: boolean], { ok: boolean }>("keyboard_url");

/** Orden de intentos del enlace en el cliente de Steam. Devuelve los métodos que existen, para probarlos uno a uno. */
export function urlMethods(): Array<[string, (u: string) => unknown]> {
  const sc = (window as unknown as { SteamClient?: Any }).SteamClient;
  const out: Array<[string, (u: string) => unknown]> = [];
  const url = sc?.URL as Any | undefined;
  if (url && typeof url.ExecuteSteamURL === "function") out.push(["URL.ExecuteSteamURL", (u) => (url.ExecuteSteamURL as (x: string) => unknown)(u)]);
  const sys = sc?.System as Any | undefined;
  if (sys && typeof sys.OpenURL === "function") out.push(["System.OpenURL", (u) => (sys.OpenURL as (x: string) => unknown)(u)]);
  return out;
}

/** Abre (o cierra) el teclado: método interno de Steam, luego enlace en el cliente, y al final el respaldo del backend. */
export async function toggleKeyboard(close = false): Promise<string | null> {
  if (!close) { const m = showKeyboard(); if (m) return m; }
  else if (dismissKeyboard(document) > 0) return "dismiss";
  const u = close ? KEYBOARD_URL.close : KEYBOARD_URL.open;
  for (const [name, fn] of urlMethods()) {
    try { await Promise.resolve(fn(u)); return name; } catch { /* siguiente */ }
  }
  try { const r = await urlBackend(close); if (r?.ok) return "backend:steam-url"; } catch { /* nada */ }
  return null;
}
