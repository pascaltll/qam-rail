// Pulsacion unica: Steam puede disparar onActivate (A / toque) y onClick (toque) para el mismo gesto.
// Este envoltorio deja pasar solo la primera llamada en 350 ms, para que un toque no active dos veces.
import { useRef } from "react";

import { pressFx } from "./fx";

export function once<A extends unknown[]>(fn: (...a: A) => void, ms = 350, now: () => number = Date.now): (...a: A) => void {
  let last = -Infinity;
  return (...a: A) => {
    const t = now();
    if (t - last < ms) return;
    last = t;
    fn(...a);
  };
}

/** Version hook: estable entre renders y siempre llama a la ultima `fn`. */
export function useTap(fn: () => void): (ev?: unknown) => void {
  const ref = useRef(fn);
  ref.current = fn;
  const h = useRef<((ev?: unknown) => void) | null>(null);
  if (!h.current) h.current = once((ev?: unknown) => { pressFx(ev); ref.current(); });
  return h.current;
}
