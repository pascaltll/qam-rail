// Informe unificado: cada prueba guarda SU seccion (sustituye la anterior) en diag/informe.json.
// El zip lleva lo ultimo de cada una + un resumen del estado en el momento de juntarlo.
import { callable } from "@decky/api";

const section = callable<[key: string, data: unknown, resumen: unknown], string>("diag_section");
const index = callable<[], Record<string, { fecha: string; version: string | null }>>("diag_index");
const clear = callable<[], boolean>("diag_clear");
const bundle = callable<[resumen: unknown], { path: string; files: string[] }>("diag_bundle");
const mark = callable<[step: string, estado: string, detalle: string], boolean>("diag_mark");
const states = callable<[], Record<string, { estado: string; detalle: string; fecha: string; version: string | null }>>("diag_states");
export const diagMark = (step: string, estado: string, detalle = "") => mark(step, estado, detalle).catch(() => false);
export const diagStates = () => states();

/** Copia JSON-segura (sin ciclos ni funciones) para que el backend no falle con objetos de Steam. */
export function plain(v: unknown, depth = 8): unknown {
  const seen = new WeakSet<object>();
  const walk = (x: unknown, d: number): unknown => {
    if (x === null || typeof x === "number" || typeof x === "boolean" || typeof x === "string") return x;
    if (typeof x === "undefined") return null;
    if (typeof x === "bigint") return String(x);
    if (typeof x === "function") return "ƒ";
    if (typeof x !== "object") return String(x);
    if (seen.has(x as object)) return "<ciclo>";
    if (d <= 0) return Array.isArray(x) ? `array(${x.length})` : "{…}";
    seen.add(x as object);
    if (Array.isArray(x)) return x.slice(0, 200).map((y) => walk(y, d - 1));
    if (x instanceof Map) return Object.fromEntries([...x.entries()].slice(0, 200).map(([k, y]) => [String(k), walk(y, d - 1)]));
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(x as object).slice(0, 300)) {
      try { out[k] = walk((x as Record<string, unknown>)[k], d - 1); } catch { out[k] = "<error>"; }
    }
    return out;
  };
  return walk(v, depth);
}

export async function saveSection(key: string, data: unknown, resumen?: unknown): Promise<string> {
  return section(key, plain(data), resumen === undefined ? null : plain(resumen));
}

export const diagIndex = () => index();
export const diagClear = () => clear();
export const diagBundle = (resumen: unknown) => bundle(plain(resumen));

/** Nombres legibles de cada seccion (para la lista de la pantalla de diagnostico). */
export const SECTION_LABEL: Record<string, string> = {
  entorno: "Entorno",
  "contrato-panel": "Contrato con Panel",
  "contrato-steam": "Contrato con Steam",
  tema: "Tema",
  "potencia-minima": "Potencia mínima",
  decky: "Decky",
  fluidez: "Fluidez",
  "amigos.explorar": "Amigos · explorar",
  "amigos.teclado": "Amigos · teclado",
  "amigos.voz": "Amigos · voz",
  "amigos.enviar": "Amigos · enviar",
  dock: "Panel (antiguo)",
  juego: "Con juego",
  apps: "Instalación de apps",
  reinicios: "Reinicios de Steam",
  redes: "Redes (Wi‑Fi y Bluetooth)",
  salida: "Salida de un juego",
  musica: "Música",
  "tema-archivos": "Tema · archivos y fondo",
  procesos: "Procesos en segundo plano",
  "musica-prueba": "Música · controles y estrés",
  sonido: "Sonido",
  "potencia-menu": "Potencia del menú",
};

const SIT_LABEL: Record<string, string> = { escritorio: "sin juego", juego: "jugando", "juego.simple": "juego simple", "juego.medio": "juego medio", "juego.exigente": "juego exigente", tv: "4K/TV", cargador: "cargador" };
/** «fluidez@juego-tv» -> «Fluidez · jugando · 4K/TV». */
export function sectionLabel(key: string): string {
  const [base, sit] = key.split("@");
  const name = SECTION_LABEL[base] ?? base;
  return sit ? `${name} · ${sit.split("-").map((x) => SIT_LABEL[x] ?? x).join(" · ")}` : name;
}
