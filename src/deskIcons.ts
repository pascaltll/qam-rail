// Iconos de las apps de escritorio en las listas: se piden solo para las filas que se muestran, en lotes, y se recuerdan.
// El backend los lee una vez por app (icono pequeño, ≤200 KB); aquí nunca se vuelve a pedir uno ya pedido (ni los que no tienen).
import { callable } from "@decky/api";
import { useEffect, useState } from "react";

const call = callable<[string[]], Record<string, string | null>>("desktop_icons");
const BATCH = 16;

const known = new Map<string, string | null>();
const asked = new Set<string>();
const subs = new Set<() => void>();
let queue: string[] = [];
let timer: number | null = null;

/** Puro: las claves que aún no se han pedido, sin repetir, en orden. */
export function missing(keys: string[], seen: { has(k: string): boolean }): string[] {
  const out: string[] = [];
  for (const k of keys) if (!seen.has(k) && !out.includes(k)) out.push(k);
  return out;
}

async function flush(): Promise<void> {
  timer = null;
  const batch = queue.splice(0, BATCH);
  if (queue.length) timer = window.setTimeout(() => void flush(), 60); // lotes seguidos, sin bloquear la interfaz
  if (!batch.length) return;
  let res: Record<string, string | null> = {};
  try { res = (await call(batch)) ?? {}; } catch { /* sin iconos: quedan las letras */ }
  for (const k of batch) known.set(k, typeof res[k] === "string" ? res[k] : null);
  subs.forEach((f) => f());
}

export function requestIcons(keys: string[]): void {
  const need = missing(keys, asked);
  if (!need.length) return;
  need.forEach((k) => asked.add(k));
  queue.push(...need);
  if (timer === null) timer = window.setTimeout(() => void flush(), 30);
}

export const iconOf = (key: string): string | null => known.get(key) ?? null;

/** Pide los iconos de `keys` y vuelve a pintar cuando llegan. */
export function useDeskIcons(keys: string[]): (key: string) => string | null {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  const sig = keys.join("|");
  useEffect(() => { requestIcons(keys); }, [sig]);
  return iconOf;
}

export const resetIconsForTest = () => { known.clear(); asked.clear(); queue = []; if (timer !== null) { window.clearTimeout(timer); timer = null; } };
