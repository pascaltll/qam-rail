import { findQamTree } from "./qamDoc";
import type { ButtonHandlers } from "./rail";

// Codigos del enum GamepadButton de @decky/ui 4.16.5 (comprobado en sus tipos): CANCEL 2, DIR_RIGHT 12.
// Que RegisterGlobalButtonHandler funcione en el arbol del QAM esta sin verificar en el dispositivo.
const BTN_CANCEL = 2;
const BTN_RIGHT = 12;

function consume(event: unknown): void {
  if (!event || typeof event !== "object") return;
  for (const m of ["preventDefault", "stopPropagation"] as const) {
    const fn = Reflect.get(event, m);
    if (typeof fn === "function") fn.call(event);
  }
}

// Registra B y Derecha en el arbol del QAM. Si el manejador devuelve false, Steam sigue con su
// comportamiento normal [H: sin verificar que false deje pasar el boton]. Si el registro falla, el
// riel sigue funcionando por clic/foco, solo sin B-para-volver ni Derecha-para-entrar.
export function registerQamButtons(handlers: ButtonHandlers, log: (m: string) => void): () => void {
  const tree = findQamTree();
  const register = tree?.RegisterGlobalButtonHandler;
  if (!tree || typeof register !== "function") {
    log("sin RegisterGlobalButtonHandler en el arbol del QAM");
    return () => {};
  }
  const releases: Array<() => void> = [];
  const bind = (button: number, fn: () => boolean) => {
    const release = register.call(tree, button, (event?: unknown) => {
      let handled = false;
      try {
        handled = fn();
      } catch (e) {
        log(`manejador ${button}: ${String(e)}`);
      }
      if (handled) consume(event);
      return handled;
    });
    if (typeof release === "function") releases.push(release as () => void);
  };
  try {
    bind(BTN_RIGHT, handlers.right);
    bind(BTN_CANCEL, handlers.cancel);
  } catch (e) {
    log(`registro de botones fallo: ${String(e)}`);
    releases.splice(0).forEach((r) => r());
    return () => {};
  }
  return () => releases.splice(0).reverse().forEach((r) => r());
}
