// Vigilante del perfil de pantalla por juego. Corre mientras el plugin este cargado (sondeo ligero cada 3 s: solo lee
// el juego en marcha). Al entrar en un juego aplica su perfil (o el de Steam si no tiene); al salir, el de Steam.
import { tickEvery } from "./ticker";
import { afterCalm } from "./calm";
import { STEAM, capture, diff, load, remember, save, targetFor, type PerfValues } from "./displayProfiles";
import { runningGame, type RunningGame } from "./game";
import { perfStore, perfWrite, readPerf } from "./steamPerf";

/** Escribe en Steam lo que difiera del perfil. Devuelve cuantas escrituras hizo. */
export function applyValues(target: PerfValues): number {
  const now = readPerf(perfStore());
  let n = 0;
  for (const [k, v] of diff(now, target)) {
    if (k === "sharp") {
      const f = target.filter ?? now?.filter?.value;
      if (f === 3 || f === 4) { perfWrite.sharp(f === 3 ? "fsr" : "nis", v as number); n++; }
      continue;
    }
    const w = perfWrite[k] as (x: never) => boolean;
    if (w(v as never)) n++;
  }
  return n;
}

const same = (a: PerfValues | undefined, b: PerfValues) => JSON.stringify(a ?? {}) === JSON.stringify(b);

export function startDisplayWatcher(read: () => RunningGame | null = runningGame, ms = 3000, log: (m: string) => void = () => {}, nowFn: () => number = () => Date.now()): () => void {
  let last: string | null = null;
  let changedAt = 0;
  let seen: PerfValues = {};
  const timers: number[] = [];
  const tick = () => {
    const key = read()?.key ?? STEAM;
    const now = readPerf(perfStore());
    if (!now) return;
    let p = load();
    if (key === last) {
      const cur = capture(now);
      if (key === STEAM) {
        // Fuera de juego se mantiene al día el perfil de Steam, pero no justo tras salir de uno ni al arrancar otro (el
        // detector tarda hasta 3 s en ver el juego y en ese hueco Steam ya puso el límite del juego anterior).
        if (nowFn() - changedAt > 30000 && !same(p.steam, cur)) { p = remember(p, key, cur); save(p); }
      } else if (!same(seen, cur)) {
        // Dentro de un juego, lo que cambies (a mano o con el preset) queda SOLO en ese juego.
        p = remember(p, key, cur); save(p); seen = cur;
      }
      return;
    }
    const prev = last;
    last = key;
    changedAt = nowFn();
    if (prev === null) { // primera lectura: se anota donde estamos (y, fuera de juego, el perfil de Steam si aún no hay)
      seen = capture(now); changedAt = 0;
      if (key === STEAM && !p.steam) { p = remember(p, STEAM, seen); save(p); }
      return;
    }
    // Saliendo de Steam hacia un juego sin perfil de Steam guardado: se anota lo de ahora como «Steam» (mejor eso que nada).
    if (prev === STEAM && key !== STEAM && !p.steam) { p = remember(p, STEAM, capture(now)); save(p); }
    const t = targetFor(p, key);
    if (!t) { seen = capture(now); return; }
    const n = applyValues(t);
    seen = { ...capture(now), ...t };
    log(`pantalla: perfil ${key === STEAM ? "de Steam" : key} (${n} cambios)`);
    // Steam aplica sus propios ajustes al arrancar un juego: se reafirma el perfil cuando el juego ya esta estable
    // (antes a los 2,5 s, en plena carga del juego).
    afterCalm(() => { if ((read()?.key ?? STEAM) === key) { const k = applyValues(t); if (k) log(`pantalla: perfil reafirmado (${k} cambios)`); seen = { ...capture(readPerf(perfStore())), ...t }; } }, "pantalla");
  };
  const id = tickEvery(tick, ms);
  tick();
  return () => { id(); timers.forEach((x) => window.clearTimeout(x)); };
}
