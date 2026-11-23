// Modo del lanzador: "game" cuando hay un juego en marcha, "normal" si no. Solo cambia el contenido de Inicio;
// el riel y las demas secciones son identicos en ambos modos (memoria muscular).
import { tickEvery } from "./ticker";
import { useEffect, useRef, useState } from "react";

import { runningGameSticky, type RunningGame } from "./game";

export type Mode = "game" | "normal";

/** Modo efectivo: con juego en marcha es "game", salvo que el usuario haya pedido ver el Inicio normal. */
export function resolveMode(game: RunningGame | null, showNormal: boolean): Mode {
  return game && !showNormal ? "game" : "normal";
}

/** Aviso breve al cambiar el juego en marcha (null = no avisar). */
export function modeToast(prev: RunningGame | null, next: RunningGame | null): string | null {
  if (prev?.key === next?.key) return null;
  if (!prev && next) return `Juego: ${next.name}`;
  if (prev && !next) return "Juego cerrado";
  return next ? `Juego: ${next.name}` : null;
}

export const MODE_POLL_MS = 2000;

export interface UseMode {
  mode: Mode;
  game: RunningGame | null;
  showNormal: boolean;
  toggleNormal(): void;
}

/**
 * Lee el juego en marcha mientras el panel esta abierto (cada 2 s; no hay lectura con el panel cerrado porque el
 * componente solo existe abierto). `onChange` recibe el aviso a mostrar cuando el juego aparece o desaparece.
 */
export function useMode(onChange?: (toast: string) => void, read: () => RunningGame | null = runningGameSticky): UseMode {
  const [game, setGame] = useState<RunningGame | null>(read);
  const [showNormal, setShowNormal] = useState(false);
  const prev = useRef<RunningGame | null>(game);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const id = tickEvery(() => {
      const next = read();
      if (next?.key === prev.current?.key) return;
      const msg = modeToast(prev.current, next);
      prev.current = next;
      setGame(next);
      if (!next) setShowNormal(false); // sin juego no hay nada que forzar
      if (msg) cb.current?.(msg);
    }, MODE_POLL_MS, { exact: true, name: "modo" });
    return () => id();
  }, [read]);

  return {
    mode: resolveMode(game, showNormal),
    game,
    showNormal,
    toggleNormal: () => { if (game) setShowNormal((v) => !v); },
  };
}
