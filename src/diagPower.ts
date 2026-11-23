// Diagnosticos de potencia y de Decky (para analizar desde la consola sin DevTools).
import { saveSection } from "./diagStore";
import { rpc } from "./panelBridge";
import { refreshTdpNow } from "./tdpControl";

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** Pide el minimo que acepta Panel (request_min), espera, guarda lo que responde el equipo y restaura. */
export async function probeMinPower(): Promise<string> {
  const before = await rpc.state();
  const draw0 = await rpc.draw().catch(() => null);
  const min = Number(before.request_min ?? before.limits?.min ?? 3);
  const game = before.appid ?? null;
  const steps: unknown[] = [];
  try {
    for (const w of [min, min + 1, min + 2]) {
      const res = await rpc.setWatts(w, game ? "game" : "global", game, game).catch((e) => ({ error: String(e) }));
      await sleep(3500);
      const st = await rpc.state().catch(() => null);
      const dr = await rpc.draw().catch(() => null);
      steps.push({ pedido: w, respuesta: res, ownership: st?.ownership, applied_w: st?.applied_w, draw: dr });
    }
  } finally {
    if (game) {
      if (before.follows_global !== false) await rpc.follow(true, game, game).catch(() => null);
      else await rpc.setWatts(Number(before.watts), "game", game, game).catch(() => null);
    } else await rpc.setWatts(Number(before.global_watts ?? before.watts), "global", null, null).catch(() => null);
    refreshTdpNow();
  }
  return saveSection("potencia-minima", { fecha: new Date().toISOString(), antes: before, consumo: draw0, pasos: steps });
}

/** Metodos que expone Decky en el frontend (para instalar/actualizar desde la tienda integrada). */
export async function probeDecky(): Promise<string> {
  const w = window as unknown as Record<string, unknown>;
  const describe = (o: unknown) => {
    if (!o || typeof o !== "object") return typeof o;
    const out: Record<string, string> = {};
    for (let p: object | null = o as object, n = 0; p && p !== Object.prototype && n < 4; p = Object.getPrototypeOf(p), n++) {
      for (const k of Object.getOwnPropertyNames(p)) {
        if (k in out || k === "constructor") continue;
        try {
          const v = (o as Record<string, unknown>)[k];
          out[k] = typeof v === "function" ? String(v).replace(/\s+/g, " ").slice(0, 300) : typeof v;
        } catch { out[k] = "?"; }
      }
    }
    return out;
  };
  const loader = w.DeckyPluginLoader as Record<string, unknown> | undefined;
  let pub: unknown = null;
  try { pub = (loader?.deckyState as { publicState?: () => Record<string, unknown> } | undefined)?.publicState?.(); } catch { pub = null; }
  const pubKeys = pub && typeof pub === "object" ? Object.fromEntries(Object.entries(pub as Record<string, unknown>).map(([k, v]) => [k, v instanceof Map ? `Map(${v.size}) ${[...v.keys()].slice(0, 5).join(",")}` : Array.isArray(v) ? `array(${v.length})` : typeof v])) : null;
  return saveSection("decky", { fecha: new Date().toISOString(), DeckyPluginLoader: describe(loader), deckyState: describe(loader?.deckyState), publicState: pubKeys, DeckyBackend: describe(w.DeckyBackend) });
}
