// Distribución española del teclado del panel y su lógica (pura, sin interfaz: se prueba aparte).

/** Una tecla: [normal, con Mayús, con AltGr]. */
export type Key = [base: string, shift?: string, alt?: string];

export const ROWS: Key[][] = [
  [["º", "ª", "\\"], ["1", "!", "|"], ["2", '"', "@"], ["3", "·", "#"], ["4", "$", "~"], ["5", "%", "€"], ["6", "&", "¬"], ["7", "/"], ["8", "("], ["9", ")"], ["0", "="], ["'", "?"], ["¡", "¿"]],
  [["q"], ["w"], ["e"], ["r"], ["t"], ["y"], ["u"], ["i"], ["o"], ["p"], ["+", "*", "]"]],
  [["a"], ["s"], ["d"], ["f"], ["g"], ["h"], ["j"], ["k"], ["l"], ["ñ"]],
  [["z"], ["x"], ["c"], ["v"], ["b"], ["n"], ["m"], [",", ";"], [".", ":"], ["-", "_"]],
];

/** Carácter de una tecla según las capas activas (AltGr manda sobre Mayús si la tecla lo tiene). */
export function keyChar(k: Key, shift: boolean, alt: boolean): string {
  if (alt && k[2]) return k[2];
  if (shift) return k[1] ?? k[0].toUpperCase();
  return k[0];
}

/** Lo que muestra la línea de vista previa tras una tecla: texto, borrar o Intro (nueva línea). Se limita a los últimos 80 caracteres. */
export function mirror(buf: string, ev: { text?: string; key?: string }): string {
  let out = buf;
  if (ev.text) out += ev.text;
  else if (ev.key === "BackSpace") out = out.slice(0, -1);
  else if (ev.key === "Return") out = "";
  return out.slice(-80);
}
