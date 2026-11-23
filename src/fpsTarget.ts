// Poner una meta de FPS en Steam y COMPROBAR que quedó (0.39 la ponía a ciegas y se quedaba en 60).
// Steam solo deja limitar a los valores de `fps_limit_options`, que dependen del refresco de la pantalla (medido en
// el Ally a 120 Hz: 30, 60, 120). Para 40 hay que poner antes la pantalla a 80 Hz y esperar a que Steam ofrezca 40.
// Si Steam no llega a ofrecerla, se deja el refresco como estaba y se usa la opción más baja que cumpla la meta
// («mínimo 40» → 60, nunca 30).
import { hzFor } from "./gameKind";

export interface FpsIo {
  read: () => { fps: { value: number; options: number[] } | null; hz: { value: number; min: number; max: number } | null };
  setRefresh: (hz: number) => void;
  setFps: (v: number) => void;
  wait: (ms: number) => Promise<void>;
}
export interface FpsResult { ok: boolean; fps: number | null; hz: number | null; meta: number; visto: number[]; nota: string }

/** Puro (probado): sin la meta exacta, la opción más baja que la cumple; si no hay, la más alta. */
export function fallbackFps(options: number[], target: number): number | null {
  const o = options.filter((x) => x > 0).sort((a, b) => a - b);
  if (!o.length) return null;
  return o.find((x) => x >= target) ?? o[o.length - 1];
}

export async function applyFpsTarget(target: number, io: FpsIo, prefHz?: number): Promise<FpsResult> {
  // Refresco preferido del preset (solo donde Steam deja elegirlo): se pone antes y se espera a las opciones nuevas.
  const pre = io.read();
  if (prefHz && pre.hz && prefHz >= pre.hz.min && prefHz <= pre.hz.max && prefHz !== pre.hz.value) {
    io.setRefresh(prefHz);
    for (let i = 0; i < 6 && io.read().hz?.value !== prefHz; i++) await io.wait(300);
    await io.wait(300);
  }
  const v0 = io.read();
  if (!v0.fps) return { ok: false, fps: null, hz: null, meta: target, visto: [], nota: "Steam no ofrece el límite de FPS" };
  let seen = v0.fps.options;
  let hzSet: number | null = prefHz && v0.hz?.value === prefHz ? prefHz : null;
  const has = () => { const v = io.read(); if (v.fps) seen = v.fps.options; return !!v.fps && v.fps.options.includes(target); };
  if (!has() && v0.hz) {
    const hz = hzFor(target, v0.hz.min, v0.hz.max);
    if (hz && hz !== v0.hz.value) {
      io.setRefresh(hz); hzSet = hz;
      for (let i = 0; i < 10 && !has(); i++) await io.wait(300);
      if (!has()) { io.setRefresh(v0.hz.value); hzSet = null; await io.wait(300); } // no sirvió: como estaba
    }
  }
  const want = has() ? target : fallbackFps(seen, target);
  if (want === null) return { ok: false, fps: null, hz: hzSet, meta: target, visto: seen, nota: "sin opciones de FPS" };
  io.setFps(want);
  await io.wait(400);
  const got = io.read().fps?.value ?? null;
  const ok = got === target;
  return { ok, fps: got, hz: hzSet, meta: target, visto: seen,
    nota: ok ? (hzSet ? `pantalla a ${hzSet} Hz` : "") : got === want ? `Steam no ofrece ${target} FPS aquí: queda en ${got}` : `Steam no aceptó ${want} FPS (sigue en ${got ?? "?"})` };
}
