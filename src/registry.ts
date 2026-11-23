import type { ComponentType } from "react";

// Registro de modulos: cada tarjeta/seccion puede vivir en su propio plugin de Decky (su propio zip) y registrarse aqui.
// Se crea de forma perezosa (lo hace quien cargue primero: el nucleo o un modulo), asi no importa el orden de carga.
export const API_VERSION = 1;

export type SectionId = "home" | "game" | "energy" | "display" | "connect" | "apps" | "social" | "notices" | "more";

export interface CardProps {
  log: (m: string) => void;
  /** Aviso corto ("solo diseño por ahora"). */
  tap: (text: string) => void;
  /** Abre el QAM de Steam (opcionalmente una pestaña). Unica via al QAM original. */
  openNative: (tab?: number) => void;
  /** Piezas visuales del nucleo (Chip, XSlider, Row, Icon, COLORS...), para que los modulos no las dupliquen. */
  kit: Record<string, unknown>;
}

export interface CardSpec {
  /** Id unico del modulo, p. ej. "friends". */
  id: string;
  name: string;
  version: string;
  /** "replace": sustituye el contenido de la seccion; "append": se añade al final. */
  mode: "replace" | "append";
  section: SectionId;
  Component: ComponentType<CardProps>;
}

export interface Registry {
  apiVersion: number;
  cards: Map<string, CardSpec>;
  subs: Set<() => void>;
  kit: Record<string, unknown> | null;
  register(card: CardSpec): () => void;
}

const g = window as unknown as { __qamRailModules?: Registry };

export function getRegistry(): Registry {
  if (!g.__qamRailModules) {
    const reg: Registry = {
      apiVersion: API_VERSION,
      cards: new Map(),
      subs: new Set(),
      kit: null,
      register(card) {
        reg.cards.set(card.id, card);
        reg.subs.forEach((f) => f());
        return () => {
          if (reg.cards.get(card.id) === card) reg.cards.delete(card.id);
          reg.subs.forEach((f) => f());
        };
      },
    };
    g.__qamRailModules = reg;
  }
  return g.__qamRailModules;
}
