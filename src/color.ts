// Colores (puro, sin interfaz).

/** El teclado tapa parte de la app: su fondo nunca es translúcido (temas de cristal), se mezcla con negro. */
export function solid(c: string): string {
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?\s*\)$/i.exec(c.trim());
  if (!m) return c;
  const a = m[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(m[4])));
  const k = (v: string) => Math.round(Number(v) * a);
  return `rgb(${k(m[1])}, ${k(m[2])}, ${k(m[3])})`;
}
