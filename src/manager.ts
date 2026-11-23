import { registerQamButtons } from "./buttons";
import { findQamTree, qamDocumentOf } from "./qamDoc";
import type { Settings } from "./backend";
import { startPilot, type PilotHooks } from "./pilot";
import { createProbe, type Probe } from "./probe";
import { domMeasure, RailController, type RailOpenOn } from "./rail";

const FIND_DELAYS_MS = [500, 1000, 2000, 5000, 15000];

// Modo de prueba: localStorage.qamRailMode = "rail" (colapsado) | "invert" (por defecto).
function readMode(doc: Document): "rail" | "invert" {
  try {
    return doc.defaultView?.localStorage?.getItem("qamRailMode") === "rail" ? "rail" : "invert";
  } catch {
    return "invert";
  }
}

export interface RailManager {
  apply(enabled: boolean, openOn: RailOpenOn, ownQam?: boolean): void;
  diag(): string;
  probe(): Probe | null;
  dispose(): void;
}

// Busca el documento del QAM (puede tardar en existir) y crea/destruye el controlador segun los ajustes.
export interface ManagerHooks {
  getSettings(): Settings;
  setSettings(s: Settings): void;
}

export function createRailManager(
  hooks: ManagerHooks,
  log: (m: string) => void = (m) => console.log(`[qam-rail] ${m}`),
): RailManager {
  let controller: RailController | null = null;
  let doc: Document | null = null;
  let probe: Probe | null = null;
  let want: { enabled: boolean; openOn: RailOpenOn; ownQam: boolean } = { enabled: false, openOn: "focus", ownQam: false };
  let pilotStop: (() => void) | null = null;
  const stopPilot = () => {
    pilotStop?.();
    pilotStop = null;
  };
  let timer: number | null = null;
  let attempt = 0;
  let disposed = false;

  const stop = () => {
    controller?.dispose();
    controller = null;
  };

  const startNow = () => {
    if (disposed) return;
    doc = doc ?? qamDocumentOf(findQamTree());
    if (!doc) {
      const delay = FIND_DELAYS_MS[Math.min(attempt++, FIND_DELAYS_MS.length - 1)];
      timer = window.setTimeout(startNow, delay);
      return;
    }
    const d = doc;
    // La sonda se instala siempre (aunque el riel este apagado) para poder comparar con/sin riel.
    if (!probe) probe = createProbe(d);
    if (want.enabled && want.ownQam && !pilotStop) {
      const ph: PilotHooks = { getSettings: hooks.getSettings, setSettings: hooks.setSettings, log };
      try {
        pilotStop = startPilot(d, ph);
      } catch (e) {
        log(`el piloto no pudo arrancar: ${String(e)}`);
        (window as unknown as Record<string, unknown>).__qamRailPilotError = String(e);
      }
    }
    // Con el piloto activo el riel no se usa: el QAM de Steam ni siquiera se muestra.
    if (!want.enabled || want.ownQam || controller) return;
    controller = new RailController(d, { openOn: want.openOn, invert: readMode(d) === "invert" }, {
      measure: domMeasure,
      registerButtons: (h) => registerQamButtons(h, log),
      focus: (el) => el.focus({ preventScroll: true }),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (id) => window.clearTimeout(id),
      log,
    });
    controller.start();
    log(`riel iniciado (${want.openOn})`);
  };

  return {
    apply(enabled, openOn, ownQam = false) {
      const changed = enabled !== want.enabled || openOn !== want.openOn || ownQam !== want.ownQam;
      want = { enabled, openOn, ownQam };
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      if (changed) {
        stop();
        stopPilot();
      }
      startNow();
    },
    diag: () => controller?.diag() ?? JSON.stringify({ state: "off", doc: !!doc }),
    probe: () => probe,
    dispose() {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      stop();
      stopPilot();
      probe?.dispose();
      probe = null;
    },
  };
}
