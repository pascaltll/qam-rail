// Barra de modos de Inicio y editor de «plugins en Inicio» para el modo activo.
import { Focusable } from "@decky/ui";
import { useState, type FC } from "react";

import { HOME_MODES, modeDef, type HomeModeId } from "./homeModes";
import { Card, small } from "./QamSections";
import { COLORS, Chip, Segments } from "./ui";

/**
 * Segmento de la barra de modos. El foco es un anillo INTERIOR fino (antes el anillo exterior era enorme para un
 * boton tan pequeño y quedaba cortado por el borde de la barra).
 */
const ModeChip: FC<{ on: boolean; label: string; icon?: string; onTap: () => void; seg?: boolean }> = ({ on, label, icon, onTap, seg }) => {
  const [f, setF] = useState(false);
  return (
    <Focusable data-qr="item" noFocusRing onActivate={onTap} onClick={onTap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      style={{
        flex: seg ? "1 1 0" : "0 0 auto", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
        fontSize: 12, fontWeight: on ? 700 : 600, padding: "6px 8px", borderRadius: 12, whiteSpace: "nowrap",
        background: on ? COLORS.accent : "transparent", color: on ? COLORS.onAccent : COLORS.muted,
        boxShadow: f ? `inset 0 0 0 2px ${on ? COLORS.onAccent : COLORS.focus}` : "none",
        transition: "background 140ms ease, color 140ms ease",
      }}>
      {icon && <span style={{ fontSize: 13, lineHeight: "14px" }}>{icon}</span>}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </Focusable>
  );
};

/** Iconos de línea de cada situación (antes emojis, que desentonaban con el resto del panel). */
const MODE_ICON: Partial<Record<HomeModeId, string>> = {
  escritorio: "M3 11l9-7 9 7M5 10v10h14V10",
  pelicula: "M4 5h16v14H4zM10 9l5 3-5 3z",
  tv: "M3 5h18v11H3zM8 20h8M12 16v4",
};

/**
 * Situación sin juego: barra de posiciones (una parada del mando, un toque). Antes: una fila «Modo · Cambiar» que
 * había que abrir para elegir.
 */
export const HomeModeBar: FC<{ active: HomeModeId; game: boolean; onPick: (id: HomeModeId) => void }> = ({ active, game, onPick }) => {
  const modes = game ? HOME_MODES.filter((m) => m.game).reverse() : HOME_MODES.filter((m) => !m.game);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Segments tall opts={modes.map((m) => ({ value: m.id, label: m.label, icon: MODE_ICON[m.id] }))} value={active} onPick={(id: HomeModeId) => onPick(id)} />
      <div style={{ ...small, fontSize: 11, padding: "6px 6px 0" }}>{modeDef(active).hint}</div>
    </div>
  );
};

/** Elegir los plugins de Inicio de este modo (se guardan por modo). */
export const PinEditor: FC<{ mode: HomeModeId; all: string[]; pinned: string[]; onToggle: (n: string) => void; onReset: () => void; onDone: () => void }> = ({ mode, all, pinned, onToggle, onReset, onDone }) => (
  <Card title={`Plugins en Inicio · ${modeDef(mode).label}`}>
    <div style={small}>Toca para añadir o quitar (se muestran en el orden en que los elijas). Cada modo guarda los suyos.</div>
    <Focusable style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {all.map((n) => {
        const i = pinned.indexOf(n);
        return <ModeChip key={n} on={i >= 0} label={i >= 0 ? `${i + 1}. ${n}` : n} onTap={() => onToggle(n)} />;
      })}
    </Focusable>
    <div style={{ display: "flex", gap: 6 }}>
      <Chip active onClick={onDone}>Listo</Chip>
      <Chip onClick={onReset}>Automático (los más usados)</Chip>
    </div>
  </Card>
);
