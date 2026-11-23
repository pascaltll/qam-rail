// Página del teclado grande: fondo transparente (se quitan los fondos de los contenedores mientras está abierta) y el teclado abajo.
import { useCallback, useEffect, useRef, type FC } from "react";

import { closeBigKeyboard } from "./bigKeyboard";
import { kbNote } from "./keyboard";
import { qamEvent } from "./qamDesktop";
import { PanelKeyboard } from "./QamKeyboard";
import { COLORS, Chip, Row } from "./ui";

export const BigKeyboardPage: FC = () => {
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
  useEffect(() => { kbNote("teclado grande: abierto"); qamEvent("kb.abre").catch(() => undefined); return () => { kbNote("teclado grande: cerrado"); qamEvent("kb.cierra").catch(() => undefined); closeBigKeyboard(); }; }, []);
  return (
    <div ref={ref} style={{ position: "fixed", inset: 0, background: "transparent", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ padding: "6px 10px 8px", background: COLORS.panel, display: "flex", flexDirection: "column", gap: 3 }}>
        <PanelKeyboard onClose={closeBigKeyboard} />
        <Row gap={6}><Chip compact active onClick={() => closeBigKeyboard()}>Cerrar teclado (B)</Chip></Row>
      </div>
    </div>
  );
};
