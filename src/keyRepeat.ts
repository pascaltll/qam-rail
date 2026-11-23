// Repetición al mantener pulsada una tecla (⌫, flechas): primero un toque, tras una pausa se repite a ritmo fijo. Lógica pura, se prueba aparte.
export interface Repeater { start: () => void; stop: () => boolean; }

/** `fn` se llama una vez en `start`; si se mantiene más de `delay` ms, se repite cada `every` ms. `stop` devuelve si hubo repeticiones (para ignorar el clic posterior). */
export function createRepeater(fn: () => void, delay = 380, every = 55): Repeater {
  let t: ReturnType<typeof setTimeout> | null = null;
  let iv: ReturnType<typeof setInterval> | null = null;
  let repeated = false;
  const clear = () => { if (t) clearTimeout(t); if (iv) clearInterval(iv); t = null; iv = null; };
  return {
    start() {
      clear(); repeated = false;
      t = setTimeout(() => { t = null; repeated = true; fn(); iv = setInterval(fn, every); }, delay);
    },
    stop() { clear(); const r = repeated; repeated = false; return r; },
  };
}
