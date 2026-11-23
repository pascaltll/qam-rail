// Página del teclado grande: fondo transparente (se quitan los fondos de los contenedores mientras está abierta) y el teclado abajo.
import { Navigation } from "@decky/ui";
import { useCallback, useEffect, useRef, type FC } from "react";

import { closeBigKeyboard, isBigKeyboardOpen } from "./bigKeyboard";
import { kbNote } from "./keyboard";
import { qamEvent } from "./qamDesktop";
import { PanelKeyboard } from "./QamKeyboard";
import { solid } from "./color";
import { COLORS } from "./ui";

export const BigKeyboardPage: FC = () => {
  // Si la ruta aparece sin que nosotros la abriéramos (entrada vieja del historial de Steam al cerrar con B: se vio el teclado «sin overlay»), se sale de ella.
  const stale = useRef(!isBigKeyboardOpen()).current;
  const saved = useRef<Array<[HTMLElement, string]>>([]);
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (el) {
      // la app debe verse a través de la interfaz: se aclaran los fondos de los contenedores hasta la raíz
      for (let p: HTMLElement | null = el; p; p = p.parentElement) { saved.current.push([p, p.style.background]); p.style.background = "transparent"; }
    } else {
      for (const [p, bg] of saved.current) p.style.background = bg;
      saved.current = [];
    }
  }, []);
  useEffect(() => {
    if (!stale) return undefined;
    kbNote("teclado grande: entrada vieja del historial, se sale");
    try { Navigation.NavigateBack(); } catch { /* nada */ }
    return undefined;
  }, [stale]);
  useEffect(() => { if (stale) return undefined; kbNote("teclado grande: abierto"); qamEvent("kb.abre").catch(() => undefined); return () => { kbNote("teclado grande: cerrado"); qamEvent("kb.cierra").catch(() => undefined); closeBigKeyboard(); }; }, []);
  if (stale) return <div />;
  return (
    <div ref={ref} style={{ position: "fixed", inset: 0, background: "transparent", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ padding: "6px 10px 8px", background: solid(COLORS.panel), boxShadow: "0 -6px 18px rgba(0,0,0,0.45)", display: "flex", flexDirection: "column", gap: 3 }}>
        <PanelKeyboard onClose={closeBigKeyboard} />
      </div>
    </div>
  );
};
