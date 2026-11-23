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

import { desktopOverlay, qamEvent } from "./qamDesktop";

const klog = callable<[text: string], void>("keyboard_log");
const note = (t: string): void => { void klog(t).catch(() => undefined); };
/** Anota una línea en keyboard.log (nunca lo que se escribe). */
export const kbNote = note;

/** Gestores de teclado que cuelgan de la interfaz de Steam (no de m_refKeyboard): se listan y se prueban sus métodos de «mostrar». [H] */
function steamKeyboardManagers(): Array<[string, Any]> {
  const w = window as unknown as Any;
  const out: Array<[string, Any]> = [];
  const pick = (root: string, ...path: string[]): unknown => {
    let o: unknown = w[root];
    for (const k of path) { if (!o || typeof o !== "object") return undefined; o = (o as Any)[k]; }
    return o;
  };
  const add = (name: string, o: unknown) => { if (o && typeof o === "object") out.push([name, o as Any]); };
  const tries: Array<[string, () => unknown]> = [
    ["SteamUIStore.ActiveWindowInstance.VirtualKeyboardManager", () => pick("SteamUIStore", "ActiveWindowInstance", "VirtualKeyboardManager")],
    ["SteamUIStore.VirtualKeyboardManager", () => pick("SteamUIStore", "VirtualKeyboardManager")],
    ["VirtualKeyboardManager", () => w.VirtualKeyboardManager],
    ["SteamClient.Input", () => pick("SteamClient", "Input")],
    ["SteamClient.System", () => pick("SteamClient", "System")],
  ];
  for (const [name, f] of tries) { try { add(name, f()); } catch { /* nada */ } }
  return out;
}

function methodNames(o: object): string[] {
  const names: string[] = [];
  for (let p: object | null = o, n = 0; p && p !== Object.prototype && n < 4; p = Object.getPrototypeOf(p), n++) names.push(...Object.getOwnPropertyNames(p));
  return [...new Set(names)];
}

/** Escribe en keyboard.log qué gestores existen y qué métodos de teclado tienen, para saber por dónde abrirlo. */
export function probeKeyboard(): void {
  for (const [name, o] of steamKeyboardManagers()) {
    const m = methodNames(o).filter((x) => /keyboard|vkb|osk/i.test(x));
    note(`sonda ${name}: ${m.length ? m.slice(0, 20).join(", ") : "(sin métodos de teclado)"}`);
  }
}

/** El teclado es de la interfaz de Steam: sobre una app de escritorio solo se ve con STEAM_OVERLAY=1 (como el panel). Se sube al abrirlo y se baja
 *  cuando Steam dice que ya no se muestra (o, como tope, a los 5 min). Si no se puede leer ese estado, se suelta a los ~2 s. */
export function holdOverlayWhileShowing(vkm: Any, poll = 400, first = 800, max = 300000): void {
  void Promise.resolve(desktopOverlay(true, "teclado")).catch(() => undefined);
  void Promise.resolve(qamEvent("steamkb.abre")).catch(() => undefined);
  note("teclado: overlay 1");
  let still = 0, n = 0;
  const t0 = Date.now();
  const tick = (): void => {
    let showing = false;
    try { showing = !!vkm.m_bIsVirtualKeyboardShowing; } catch { /* nada */ }
    if (n++ === 0) note(`teclado: m_bIsVirtualKeyboardShowing = ${showing}`);
    still = showing ? 0 : still + 1;
    if (still >= 3 || Date.now() - t0 > max) {
      void Promise.resolve(desktopOverlay(false, "teclado")).catch(() => undefined);
      void Promise.resolve(qamEvent("steamkb.cierra")).catch(() => undefined);
      note("teclado: overlay 0");
      return;
    }
    window.setTimeout(tick, poll);
  };
  window.setTimeout(tick, first);
}

const VKM_TRY: Array<[string, boolean]> = [
  ["ShowVirtualKeyboard", false], ["OpenVirtualKeyboard", false], ["ShowKeyboard", false],
  ["SetVirtualKeyboardShowing", true], ["SetKeyboardVisible", true], ["ShowOnScreenKeyboard", false],
];

/** Abre (o cierra) el teclado: método interno de Steam, gestores de la interfaz, enlace en el cliente y al final el backend. Cada intento queda en keyboard.log. */
export async function toggleKeyboard(close = false): Promise<string | null> {
  note(`--- ${close ? "cerrar" : "abrir"} teclado ---`);
  if (!close) probeKeyboard();
  if (!close) { const m = showKeyboard(); note(`m_refKeyboard: ${m ?? "sin método"}`); if (m) return m; }
  else if (dismissKeyboard(document) > 0) return "dismiss";
  if (!close) {
    for (const [name, o] of steamKeyboardManagers()) {
      for (const [m, arg] of VKM_TRY) {
        const f = o[m];
        if (typeof f !== "function") continue;
        try { await Promise.resolve(arg ? (f as (v: boolean) => unknown).call(o, true) : (f as () => unknown).call(o)); note(`${name}.${m}: llamado sin error`); if (/VirtualKeyboardManager$/.test(name)) holdOverlayWhileShowing(o); return `${name}.${m}`; }
        catch (e) { note(`${name}.${m}: error ${String(e).slice(0, 80)}`); }
      }
    }
  }
  const u = close ? KEYBOARD_URL.close : KEYBOARD_URL.open;
  for (const [name, fn] of urlMethods()) {
    try { await Promise.resolve(fn(u)); note(`${name}(${u}): sin error (no prueba que se abra)`); return name; } catch (e) { note(`${name}: error ${String(e).slice(0, 80)}`); }
  }
  try { const r = await urlBackend(close); note(`backend steam-url: ${JSON.stringify(r)}`); if (r?.ok) return "backend:steam-url"; } catch (e) { note(`backend: error ${String(e).slice(0, 80)}`); }
  return null;
}
