// Plugins frecuentes: cuantas veces se abre cada plugin en cada modo. Con pocas aperturas manda una lista por defecto
// (lo que Carlos usa: Clash y Animation Changer fuera de juego; Colores y Framegen jugando).
export type UsageMode = "normal" | "game";
export type Usage = Record<UsageMode, Record<string, number>>;

const KEY = "qam-rail:plugin-usage";
const DEFAULTS: Record<UsageMode, RegExp[]> = {
  normal: [/clash|tomoon/i, /animation/i, /colores/i],
  game: [/colores/i, /framegen|lsfg/i, /clash|tomoon/i],
};

export function loadUsage(): Usage {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Usage | null;
    if (v && typeof v === "object" && v.normal && v.game) return v;
  } catch { /* almacenamiento no disponible */ }
  return { normal: {}, game: {} };
}

export function bump(u: Usage, mode: UsageMode, name: string): Usage {
  const next: Usage = { normal: { ...u.normal }, game: { ...u.game } };
  next[mode][name] = (next[mode][name] ?? 0) + 1;
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* sin almacenamiento: solo en memoria */ }
  return next;
}

/** Orden: por usos en este modo; empate → posicion en la lista por defecto; luego alfabetico. */
export function rank(names: string[], u: Usage, mode: UsageMode, limit = 3): string[] {
  const def = (n: string) => { const i = DEFAULTS[mode].findIndex((re) => re.test(n)); return i < 0 ? 99 : i; };
  return [...names]
    .sort((a, b) => (u[mode][b] ?? 0) - (u[mode][a] ?? 0) || def(a) - def(b) || a.localeCompare(b))
    .filter((n) => (u[mode][n] ?? 0) > 0 || def(n) < 99)
    .slice(0, limit);
}
