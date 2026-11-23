// Almacén compartido de lo leído de Panel de Control (plan de mejora, fase 2).
// Antes cada tarjeta hacía su propia llamada: el estado de potencia (`get_tdp_state`, ~125 ms a 15 W y ~280 ms a
// 7 W) se pedía desde 4 tarjetas más el controlador. Ahora hay UNA entrada por clave: quien lee se suscribe, las
// lecturas simultáneas se juntan en una, y lo que lee el controlador de potencia sirve a todas.
// Sin imports a propósito (lo usan hooks.ts y tdpControl.ts).
interface Entry { data: unknown; missing: boolean; at: number; inflight: Promise<void> | null; subs: Set<() => void> }
const entries = new Map<string, Entry>();
/** Dos lecturas de la misma clave en menos de esto cuentan como una (ráfaga al montar varias tarjetas). */
export const DEDUPE_MS = 500;

export function entry(key: string): Entry {
  let e = entries.get(key);
  if (!e) { e = { data: null, missing: false, at: 0, inflight: null, subs: new Set() }; entries.set(key, e); }
  return e;
}
const tell = (e: Entry) => e.subs.forEach((f) => { try { f(); } catch { /* cada uno a lo suyo */ } });

/** Guarda un valor ya leído (o cambiado de forma optimista) y avisa a todas las tarjetas de esa clave. */
export function prime(key: string, data: unknown, now = Date.now()): void {
  const e = entry(key);
  e.data = data; e.missing = false; e.at = now;
  tell(e);
}
export function subscribe(key: string, f: () => void): () => void {
  const e = entry(key);
  e.subs.add(f);
  return () => { e.subs.delete(f); };
}
/**
 * Lee la clave una sola vez aunque la pidan varias tarjetas. `force` (tras escribir algo) espera a la lectura en
 * curso y vuelve a leer; sin `force`, una lectura reciente (< DEDUPE_MS) o en curso vale.
 */
export function fetchShared(key: string, get: () => Promise<unknown>, force = false, now = Date.now()): Promise<void> {
  const e = entry(key);
  if (e.inflight) return force ? e.inflight.then(() => fetchShared(key, get, false, e.at + DEDUPE_MS + 1)) : e.inflight;
  if (!force && e.data !== null && now - e.at < DEDUPE_MS) return Promise.resolve();
  let p: Promise<unknown>;
  try { p = get(); } catch (err) { p = Promise.reject(err); }
  e.inflight = Promise.resolve(p).then(
    (v) => { e.inflight = null; prime(key, v); },
    () => { e.inflight = null; e.missing = true; tell(e); },
  );
  return e.inflight;
}
export function clearPanelStore(): void { entries.forEach((e) => { e.data = null; e.missing = false; e.at = 0; e.inflight = null; }); }
