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

/** Página de símbolos y números (RT en el mando): números arriba, signos habituales debajo. Un solo carácter por tecla. */
export const SYMBOL_ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["@", "#", "$", "%", "&", "*", "-", "+", "=", "_"],
  ["(", ")", "[", "]", "{", "}", "<", ">", "/", "\\"],
  ["!", "?", ".", ",", ":", ";", "'", '"', "~", "|"],
];

/** Acción del teclado grande para un botón del mando (códigos de GamepadButton de @decky/ui); null si no es de teclado. */
export type PadAction = { kind: "shift" } | { kind: "symbols" } | { kind: "caps" } | { kind: "key"; key: string };

export function padAction(button: number | undefined): PadAction | null {
  switch (button) {
    case 7: return { kind: "shift" };               // LT = Mayús
    case 8: return { kind: "symbols" };             // RT = símbolos
    case 15: return { kind: "caps" };               // L3 = Bloq Mayús
    case 5: return { kind: "key", key: "Left" };    // LB = cursor ←
    case 6: return { kind: "key", key: "Right" };   // RB = cursor →
    default: return null;
  }
}
