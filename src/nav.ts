// Navegacion con mando dentro del panel: cuando el foco esta en la ultima fila de una seccion, «abajo» pasa a la
// siguiente seccion; en la primera fila, «arriba» vuelve a la anterior. L1/R1 cambian de seccion desde cualquier sitio.
export const BTN = { L1: 5, R1: 6, UP: 9, DOWN: 10, LEFT: 11, RIGHT: 12 } as const;

export interface Box { top: number; bottom: number }
/** Fila del elemento activo respecto al resto: "first", "last", "only" (una sola fila) o "middle". */
export function rowOf(active: Box, all: Box[], tol = 6): "first" | "last" | "only" | "middle" {
  if (!all.length) return "only";
  const minTop = Math.min(...all.map((b) => b.top));
  const maxTop = Math.max(...all.map((b) => b.top));
  const first = active.top <= minTop + tol;
  const last = active.top >= maxTop - tol;
  return first && last ? "only" : first ? "first" : last ? "last" : "middle";
}

/** Indice de la seccion vecina (sin dar la vuelta: en la ultima, «abajo» no hace nada). */
export function neighbor(index: number, count: number, d: 1 | -1): number | null {
  const n = index + d;
  return n < 0 || n >= count ? null : n;
}

/** El item enfocable que contiene a `el` (o null). */
export function itemOf(el: Element | null, root: Element | null): HTMLElement | null {
  let n: Element | null = el;
  while (n && n !== root) {
    if ((n as HTMLElement).dataset?.qr === "item") return n as HTMLElement;
    n = n.parentElement;
  }
  return null;
}

interface NavNode { TakeFocus?: () => void }
/**
 * Nodo de navegacion de Steam de un elemento. El foco del mando de Steam NO sigue a element.focus(): hay que pedirselo
 * al nodo (TakeFocus). El nodo vive en el estado de React del componente Focusable: se busca subiendo por las fibras.
 * [H] estructura interna de Steam; si no se encuentra, se usa focus() del DOM como antes.
 */
export function navNodeOf(el: Element | null): NavNode | null {
  if (!el) return null;
  const rec = el as unknown as Record<string, unknown>;
  const key = Object.keys(rec).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
  type Fiber = { return?: Fiber; memoizedState?: Hook | null; stateNode?: unknown };
  type Hook = { memoizedState?: unknown; next?: Hook | null };
  let f = key ? (rec[key] as Fiber) : undefined;
  const isNode = (v: unknown): v is NavNode => !!v && typeof v === "object" && typeof (v as NavNode).TakeFocus === "function";
  for (let i = 0; f && i < 6; i++, f = f.return) {
    if (isNode(f.stateNode)) return f.stateNode;
    let h = f.memoizedState;
    for (let j = 0; h && typeof h === "object" && j < 24; j++, h = h.next ?? null) {
      const v = h.memoizedState;
      if (isNode(v)) return v;
      const c = v && typeof v === "object" ? (v as { current?: unknown }).current : undefined;
      if (isNode(c)) return c;
    }
  }
  return null;
}

/** Da el foco del mando a `el` (nodo de Steam si se encuentra; si no, foco del DOM). */
export function takeFocus(el: HTMLElement | null): boolean {
  if (!el) return false;
  const n = navNodeOf(el);
  try { if (n?.TakeFocus) { n.TakeFocus(); return true; } } catch { /* sigue con el DOM */ }
  try { el.focus({ preventScroll: false }); } catch { /* nada */ }
  return false;
}

export interface Rect { left: number; right: number; top: number; bottom: number }
/**
 * Rejilla de iconos: a que icono se va con la cruceta. Steam decide por cercania y en rejillas con etiquetas de alto
 * distinto saltaba al extremo contrario. Aqui: arriba/abajo = la fila vecina, el icono con el centro mas cercano;
 * izquierda/derecha = el vecino de la misma fila. null = salir de la rejilla (arriba de la 1.ª fila / abajo de la ultima);
 * -1 = quedarse (borde lateral).
 */
export function gridTarget(rects: Rect[], from: number, dir: number, tol = 12): number | null {
  const cur = rects[from];
  if (!cur) return null;
  const cx = (r: Rect) => (r.left + r.right) / 2;
  const rowTops = [...new Set(rects.map((r) => Math.round(r.top)))].sort((a, b) => a - b);
  const rowIdx = (r: Rect) => rowTops.findIndex((t) => Math.abs(t - r.top) <= tol);
  const myRow = rowIdx(cur);
  if (dir === BTN.LEFT || dir === BTN.RIGHT) {
    const same = rects.map((r, i) => ({ r, i })).filter((x) => rowIdx(x.r) === myRow).sort((a, b) => a.r.left - b.r.left);
    const k = same.findIndex((x) => x.i === from);
    const n = same[k + (dir === BTN.RIGHT ? 1 : -1)];
    return n ? n.i : -1;
  }
  if (dir === BTN.UP || dir === BTN.DOWN) {
    // Filas agrupadas por tolerancia (no por top exacto).
    const rows: number[] = [];
    rects.forEach((r) => { const ri = rowIdx(r); if (!rows.includes(ri)) rows.push(ri); });
    rows.sort((a, b) => a - b);
    const target = rows[rows.indexOf(myRow) + (dir === BTN.DOWN ? 1 : -1)];
    if (target === undefined) return null;
    let best = -1, bestD = Infinity;
    rects.forEach((r, i) => { if (rowIdx(r) === target) { const d = Math.abs(cx(r) - cx(cur)); if (d < bestD) { bestD = d; best = i; } } });
    return best >= 0 ? best : null;
  }
  return null;
}

/**
 * Filas visuales: dos elementos estan en la misma fila si se solapan en vertical al menos la mitad del mas bajo.
 * Devuelve, por fila (de arriba abajo), los indices ordenados de izquierda a derecha.
 */
export function visualRows(rects: Rect[]): number[][] {
  const order = rects.map((_r, i) => i).sort((a, b) => rects[a].top - rects[b].top || rects[a].left - rects[b].left);
  const rows: Array<{ top: number; bottom: number; items: number[] }> = [];
  for (const i of order) {
    const r = rects[i];
    const h = Math.max(1, r.bottom - r.top);
    const row = rows.find((x) => Math.min(x.bottom, r.bottom) - Math.max(x.top, r.top) >= 0.5 * Math.min(h, x.bottom - x.top));
    if (row) { row.items.push(i); row.top = Math.min(row.top, r.top); row.bottom = Math.max(row.bottom, r.bottom); } else rows.push({ top: r.top, bottom: r.bottom, items: [i] });
  }
  rows.sort((a, b) => a.top - b.top);
  return rows.map((x) => x.items.sort((a, b) => rects[a].left - rects[b].left));
}

/**
 * Navegacion de una seccion como lista de filas (modelo de Android TV / tvOS): arriba/abajo cambia de fila,
 * izquierda/derecha se mueve dentro de la fila; al volver a una fila se recupera el elemento donde estabas
 * (`remembered(rowIndex)` devuelve el indice recordado o null); si no, el mas cercano en horizontal.
 * Devuelve el indice destino o -1 (quedarse: borde). Las filas «extra» (reproductor anclado) van siempre al final.
 */
export function listTarget(rects: Rect[], from: number, dir: number, opts: { extra?: number[]; remembered?: (rowItems: number[]) => number | null } = {}): number {
  const extra = new Set(opts.extra ?? []);
  const main = rects.map((_, i) => i).filter((i) => !extra.has(i));
  const rowsMain = visualRows(main.map((i) => rects[i])).map((row) => row.map((k) => main[k]));
  const rowsExtra = extra.size ? visualRows([...extra].map((i) => rects[i])).map((row) => row.map((k) => [...extra][k])) : [];
  const rows = [...rowsMain, ...rowsExtra];
  const ri = rows.findIndex((row) => row.includes(from));
  if (ri < 0) return -1;
  const row = rows[ri];
  if (dir === BTN.LEFT || dir === BTN.RIGHT) {
    const k = row.indexOf(from) + (dir === BTN.RIGHT ? 1 : -1);
    return k >= 0 && k < row.length ? row[k] : -1;
  }
  if (dir !== BTN.UP && dir !== BTN.DOWN) return -1;
  const target = rows[ri + (dir === BTN.DOWN ? 1 : -1)];
  if (!target) return -1;
  const mem = opts.remembered?.(target);
  if (mem !== null && mem !== undefined && target.includes(mem)) return mem;
  const cx = (i: number) => (rects[i].left + rects[i].right) / 2;
  return target.reduce((best, i) => (Math.abs(cx(i) - cx(from)) < Math.abs(cx(best) - cx(from)) ? i : best), target[0]);
}
