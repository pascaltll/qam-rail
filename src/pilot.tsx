import { bootInfo, bootReady, missingForReady } from "./boot";
import { noteRunningGame } from "./gameWatch";
import { calmLeft, calmReason, calmUsesSteamQam, featureOn, inCalm } from "./calm";
import { runningGame } from "./game";
import { crumb } from "./crumbs";
import { ModalRoot, Navigation, Router, showModal } from "@decky/ui";
import { useCallback, useEffect, type FC } from "react";

import type { Settings } from "./backend";
import { patchMenus, type MenuPatch } from "./menuPatch";
import { setRunningAppReader } from "./game";
import { QamApp } from "./Qam";
import { dockRight } from "./ui";
import { BYPASS_MS, decide } from "./pilotLogic";
import { guardNavigation } from "./navGuard";
import { markClosed, markCloseReason, markOpenStart } from "./perfLog";
import { dismissKeyboard, inputFocused } from "./keyboard";

export interface PilotHooks {
  getSettings(): Settings;
  setSettings(s: Settings): void;
  log(msg: string): void;
}

interface PanelProps {
  closeModal?: () => void;
  onClosed: () => void;
  onNative: (tab?: number) => void;
  hooks: PilotHooks;
}

const PilotPanel: FC<PanelProps> = ({ closeModal, onClosed, onNative, hooks }) => {
  useEffect(() => () => {
    // Al cerrar: fuera el foco del campo de texto y el teclado de Steam (no debe quedarse activo detras).
    dismissKeyboard((window as unknown as { __qamRailModalEl?: HTMLElement | null }).__qamRailModalEl?.ownerDocument);
    markClosed();
    onClosed();
  }, [onClosed]);
  // Anclaje una sola vez por apertura. Antes la ref era una funcion nueva en cada render: React la volvia a llamar,
  // dockRight quitaba y ponia la transformacion y el panel «temblaba» (y los toques caian fuera) cada 2-3 s.
  const dock = useCallback((el: HTMLDivElement | null) => {
    (window as unknown as Record<string, unknown>).__qamRailModalEl = el;
    if (el) dockRight(el);
  }, []);
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    const close = () => { markCloseReason("cierre forzado (panel duplicado)"); closeModal?.(); };
    w.__qamRailCloseModal = close;
    return () => { if (w.__qamRailCloseModal === close) delete w.__qamRailCloseModal; };
  }, [closeModal]);
  return (
  // Cada via de cierre deja su motivo en el registro de rendimiento (si se cierra sin motivo, lo cerro Steam).
  // onOK vacio: el Enter del teclado de Steam (al enviar un mensaje) llegaba al modal como «Aceptar» y lo cerraba.
  <ModalRoot closeModal={() => { markCloseReason("tocar fuera / Steam cerró el modal"); closeModal?.(); }} onCancel={() => { markCloseReason("B en el riel"); closeModal?.(); }}
    onOK={() => { /* nada: A y Enter son de los controles del panel */ }}>
    <div style={{ width: "max-content" }} ref={dock}>
      <QamApp log={hooks.log} onNative={onNative} onClose={() => { markCloseReason("botón Cerrar / app lanzada"); closeModal?.(); }} />
    </div>
  </ModalRoot>
  );
};

// Sustituye la apertura del QAM de Steam por un panel propio (modal). Piloto: ver README.
// El QAM de Steam solo se abre desde botones/atajos del panel propio. Vias de vuelta atras:
// (1) ficha "QAM Steam", (2) ajuste en Apps, (3) archivo DISABLE en la carpeta de ajustes.
export function startPilot(doc: Document, hooks: PilotHooks): () => void {
  // Misma fuente que usa Panel de Control para saber que juego esta en marcha.
  setRunningAppReader(() => (Router as unknown as { MainRunningApp?: unknown } | undefined)?.MainRunningApp);
  let modal: { Close(): void } | null = null;
  let openedAt = 0;
  let bypassUntil = 0;
  let broken = false;

  // Mientras el panel propio esta activo, el contenido del QAM de Steam se oculta al instante (evita el parpadeo).
  const hideStyle = doc.createElement("style");
  hideStyle.textContent = "html.qr-own, html.qr-own body { visibility: hidden !important; }";
  doc.head.appendChild(hideStyle);
  const hideNative = (on: boolean) => doc.documentElement.classList.toggle("qr-own", on);

  // Mientras el panel esta abierto, navegar a otra pagina (Decky Clash, tienda/ajustes de Decky, perfil...) lo cierra antes.
  let unguard: (() => void) | null = null;
  const dropGuard = () => { unguard?.(); unguard = null; };
  // Cerrar de verdad: si el modal sigue en pantalla tras Close() (otro modal encima, p. ej. el de un plugin), se
  // reintenta con el closeModal del propio panel. Antes quedaban paneles fantasma montados que duplicaban el trabajo.
  const closeOwn = () => {
    dropGuard();
    const m = modal;
    modal = null;
    try { m?.Close(); } catch { /* ya cerrado */ }
    window.setTimeout(() => {
      const el = (window as unknown as { __qamRailModalEl?: HTMLElement | null }).__qamRailModalEl;
      if (el?.isConnected) {
        hooks.log("cierre: el panel seguia montado, se fuerza el cierre");
        try { (window as unknown as { __qamRailCloseModal?: () => void }).__qamRailCloseModal?.(); } catch { /* nada */ }
        try { m?.Close(); } catch { /* nada */ }
      }
    }, 350);
  };
  const onClosed = () => { dropGuard(); modal = null; };
  // Unica via al QAM de Steam: un boton/atajo del panel propio (opcionalmente a una pestaña concreta).
  const openNative = (tab?: number) => {
    markCloseReason(`QAM nativo${tab !== undefined ? ` (pestaña ${tab})` : ""}`);
    bypassUntil = Date.now() + BYPASS_MS;
    hideNative(false);
    closeOwn();
    window.setTimeout(() => { try { (Navigation.OpenQuickAccessMenu as (t?: number) => void)(tab); } catch (e) { hooks.log(`QAM nativo: ${String(e)}`); } }, 60);
  };

  // Migas del arranque: cada pulsacion del boton QAM mientras Steam carga (como mucho una por segundo).
  let lastBootPress = 0;
  const bootPress = () => {
    const now = Date.now();
    if (now - lastBootPress < 1000) return;
    lastBootPress = now;
    const b = bootInfo();
    crumb(`botón QAM en el arranque (${Math.round((now - b.loadedAt) / 1000)} s; ${b.readyAt ? "listo" : `falta: ${missingForReady(window as never).join(", ") || "?"}`}) → QAM de Steam`);
  };

  let lastLaunchPress = 0;
  const launchPress = (why?: string) => {
    const now = Date.now();
    if (now - lastLaunchPress < 1000) return;
    lastLaunchPress = now;
    crumb(`botón QAM ${why ?? `en calma (${calmReason()}, faltan ${calmLeft(now)} s)`} → QAM de Steam`);
  };

  const openPanel = (now: number) => {
    // Un solo panel: si quedo uno montado (fantasma), se cierra antes de abrir otro.
    const prev = (window as unknown as { __qamRailModalEl?: HTMLElement | null }).__qamRailModalEl;
    if (prev?.isConnected) {
      hooks.log("apertura: habia un panel montado; se cierra primero");
      try { (window as unknown as { __qamRailCloseModal?: () => void }).__qamRailCloseModal?.(); } catch { /* nada */ }
    }
    // Se anota si el QAM antiguo estaba abierto al abrir el nuestro (era la causa de las sesiones lentas).
    const mainDoc = (window as unknown as { __qamRailModalEl?: HTMLElement | null }).__qamRailModalEl?.ownerDocument ?? null;
    markOpenStart([doc.visibilityState === "visible" ? "QAM antiguo abierto al abrir" : null, inputFocused(mainDoc) ? "campo de texto con foco" : null].filter(Boolean).join(" · ") || undefined);
    if (doc.visibilityState === "visible") { try { Navigation.CloseSideMenus(); } catch { /* nada */ } }
    try {
      hideNative(true);
      Navigation.CloseSideMenus();
      modal = showModal(
        <PilotPanel onClosed={onClosed} onNative={openNative} hooks={hooks} />,
        undefined,
        { strTitle: "QAM propio", bHideMainWindowForPopouts: false },
      ) as unknown as { Close(): void };
      openedAt = now;
      dropGuard();
      unguard = guardNavigation([Navigation as unknown as Record<string, unknown>, Router as unknown as Record<string, unknown>], () => {
        if (modal !== null) { markCloseReason("navegación (plugin o atajo abrió una página)"); hooks.log("navegacion: se cierra el panel para mostrar la pagina"); closeOwn(); hideNative(false); }
      });
    } catch (e) {
      // Si algo falla, el piloto se apaga para esta sesion y el QAM de Steam queda como siempre.
      broken = true;
      hideNative(false);
      hooks.log(`piloto desactivado por error: ${String(e)}`);
    }
  };

  // Via principal: el boton del QAM llama a MenuStore y nunca llega a abrirse la ventana de Steam.
  // Un fallo aqui nunca debe impedir que el piloto arranque: queda la via de respaldo por visibilidad.
  let lastHandled = 0;
  let patch: MenuPatch | null = null;
  try {
    patch = patchMenus(
      () => {
        const now = Date.now();
        if (now - lastHandled < 400) return; // un pulso puede llamar varias veces a MenuStore
        lastHandled = now;
        if (modal !== null) { markCloseReason("botón QAM"); closeOwn(); hideNative(false); } else openPanel(now);
      },
      // Si el QAM antiguo esta abierto (se fue a el desde el panel, o lo abrio otra via), el boton lo CIERRA como
      // siempre en vez de abrir el nuestro encima: antes quedaba abierto y oculto detras, trabajando, y el panel nuevo
      // iba 5-10 veces mas lento (registro de rendimiento 2026-11-05).
      // Mientras Steam arranca (inicio, paso desde Escritorio) el boton abre el QAM de Steam: no competimos con la carga.
      () => {
        if (!bootReady()) { bootPress(); return true; }
        // Juego arrancando: QAM de Steam (abrir el nuestro aqui coincidio con un reinicio de Steam).
        if (modal === null) {
          noteRunningGame();
          if (inCalm() && calmUsesSteamQam()) { launchPress(); return true; }
          if (!featureOn("qamGame") && runningGame()) { launchPress("aislado: panel con juego apagado"); return true; }
        }
        return broken || Date.now() < bypassUntil || (modal === null && doc.visibilityState === "visible");
      },
      hooks.log,
    );
  } catch (e) {
    hooks.log(`intercepcion de MenuStore fallo: ${String(e)}`);
  }
  (window as unknown as Record<string, unknown>).__qamRailPatch = patch ?? { info: () => ({ stores: 0, patched: [], errors: ["fallo al enganchar"] }) };

  // Respaldo: si el QAM de Steam llegara a abrirse por otra via, se esconde y se sustituye.
  const onVis = () => {
    // Durante el arranque el QAM de Steam es el que vale: no se sustituye (era el «poquito» de QAM antiguo y el
    // abrir/cerrar en bucle que se veia en las migas al encender: «cerrar panel: QAM nativo apareció»).
    if (!bootReady()) return;
    if (modal === null && ((inCalm() && calmUsesSteamQam()) || (!featureOn("qamGame") && runningGame()))) return;
    const now = Date.now();
    const action = decide({ now, visible: doc.visibilityState === "visible", modalOpen: modal !== null, openedAt, bypassUntil, broken });
    if (action === "ignore") return;
    if (action === "close") {
      markCloseReason("QAM nativo apareció");
      hideNative(true);
      closeOwn();
      Navigation.CloseSideMenus();
      return;
    }
    // Se abrio el QAM antiguo por una via no interceptada: se cierra DE VERDAD (no solo se oculta) y se abre el nuestro.
    hideNative(true);
    try { Navigation.CloseSideMenus(); } catch { /* nada */ }
    window.setTimeout(() => {
      if (doc.visibilityState === "visible") hooks.log("aviso: el QAM antiguo sigue visible tras cerrarlo");
      openPanel(Date.now());
    }, 180);
  };

  doc.addEventListener("visibilitychange", onVis);
  hooks.log("piloto de QAM propio activo");
  return () => {
    doc.removeEventListener("visibilitychange", onVis);
    patch?.dispose();
    hideNative(false);
    hideStyle.remove();
    closeOwn();
  };
}
