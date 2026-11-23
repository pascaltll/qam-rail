import { Router } from "@decky/ui";

// Sustituye de verdad el QAM: en vez de dejar que Steam abra su ventana y esconderla despues, se envuelven las
// funciones de MenuStore que abren el menu rapido. [H] Los nombres (OpenQuickAccessMenu / OpenSideMenu(2) /
// ToggleSideMenu(2)) vienen de los tipos de @decky/ui; cual usa el boton fisico no esta comprobado, por eso se envuelven las tres.
const SIDE_MENU_QAM = 2;

// Los originales se guardan fuera del objeto de Steam (puede estar sellado/congelado y no admitir propiedades nuevas).
const originals = new WeakMap<object, { open?: unknown; side?: unknown; toggle?: unknown }>();

interface MenuStoreLike {
  OpenQuickAccessMenu?: (...a: unknown[]) => unknown;
  OpenSideMenu?: (menu: number, ...a: unknown[]) => unknown;
  ToggleSideMenu?: (menu: number, ...a: unknown[]) => unknown;
}

function findStores(): MenuStoreLike[] {
  const found = new Set<MenuStoreLike>();
  const add = (w: unknown) => {
    const ms = (w as { MenuStore?: MenuStoreLike } | null | undefined)?.MenuStore;
    if (ms && typeof ms === "object") found.add(ms);
  };
  try {
    const su = (window as unknown as { SteamUIStore?: { GetFocusedWindowInstance?: () => unknown } }).SteamUIStore;
    add(su?.GetFocusedWindowInstance?.());
    const ws = (Router as unknown as { WindowStore?: { GamepadUIMainWindowInstance?: unknown; SteamUIWindows?: unknown[] } }).WindowStore;
    add(ws?.GamepadUIMainWindowInstance);
    (ws?.SteamUIWindows ?? []).forEach(add);
  } catch { /* sin stores: queda la via por visibilidad */ }
  return [...found];
}

export interface MenuPatch {
  dispose(): void;
  info(): { stores: number; patched: string[]; errors: string[] };
}

/** Asigna una funcion en el objeto; si la asignacion directa no esta permitida prueba defineProperty. */
function setFn(ms: MenuStoreLike, key: keyof MenuStoreLike, fn: unknown): void {
  try {
    (ms as unknown as Record<string, unknown>)[key] = fn;
    if ((ms as unknown as Record<string, unknown>)[key] === fn) return;
  } catch { /* se prueba defineProperty */ }
  Object.defineProperty(ms, key, { value: fn, writable: true, configurable: true });
}

/**
 * `handle` se llama en lugar de abrir el QAM de Steam; `pass()` devuelve true cuando el QAM de Steam debe abrirse de verdad
 * (peticion explicita del usuario o piloto roto).
 */
export function patchMenus(handle: () => void, pass: () => boolean, log: (m: string) => void): MenuPatch {
  const patched: string[] = [];
  const errors: string[] = [];
  const stores = findStores();
  for (const ms of stores) {
    if (originals.has(ms)) continue;
    const orig = { open: ms.OpenQuickAccessMenu, side: ms.OpenSideMenu, toggle: ms.ToggleSideMenu };
    originals.set(ms, orig);
    const attempt = (name: string, fn: () => void) => {
      try { fn(); patched.push(name); } catch (e) { errors.push(`${name}: ${String(e)}`); }
    };
    if (typeof orig.open === "function") {
      attempt("OpenQuickAccessMenu", () => setFn(ms, "OpenQuickAccessMenu", function (this: unknown, ...a: unknown[]) {
        if (pass()) return (orig.open as (...x: unknown[]) => unknown).apply(this, a);
        handle();
        return undefined;
      }));
    }
    if (typeof orig.side === "function") {
      attempt("OpenSideMenu", () => setFn(ms, "OpenSideMenu", function (this: unknown, menu: number, ...a: unknown[]) {
        if (menu === SIDE_MENU_QAM && !pass()) { handle(); return undefined; }
        return (orig.side as (...x: unknown[]) => unknown).apply(this, [menu, ...a]);
      }));
    }
    if (typeof orig.toggle === "function") {
      attempt("ToggleSideMenu", () => setFn(ms, "ToggleSideMenu", function (this: unknown, menu: number, ...a: unknown[]) {
        if (menu === SIDE_MENU_QAM && !pass()) { handle(); return undefined; }
        return (orig.toggle as (...x: unknown[]) => unknown).apply(this, [menu, ...a]);
      }));
    }
  }
  log(`MenuStore: ${stores.length} store(s), envueltas: ${patched.join(",") || "ninguna"}${errors.length ? ` | errores: ${errors.join("; ")}` : ""}`);
  return {
    dispose() {
      for (const ms of stores) {
        const o = originals.get(ms);
        if (!o) continue;
        try {
          if (o.open) setFn(ms, "OpenQuickAccessMenu", o.open);
          if (o.side) setFn(ms, "OpenSideMenu", o.side);
          if (o.toggle) setFn(ms, "ToggleSideMenu", o.toggle);
        } catch { /* nada mas que restaurar */ }
        originals.delete(ms);
      }
    },
    info: () => ({ stores: stores.length, patched, errors }),
  };
}
