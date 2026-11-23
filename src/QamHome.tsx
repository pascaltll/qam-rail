import { useEffect, useState, type FC, type ReactNode } from "react";

import type { RunningGame } from "./game";
import { PowerCard } from "./QamTdp";
import { lowPower, useTdp, type UseTdp } from "./tdpControl";
import { COLORS, Deferred, Icon, Row } from "./ui";

const small = { fontSize: 12, get color() { return COLORS.muted; } };
const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

/** Desvanecimiento de 160 ms al recomponer Inicio por un cambio de modo. Solo afecta a su contenido. */
export const Fade: FC<{ k: string; children: ReactNode }> = ({ k, children }) => {
  const [settled, setSettled] = useState(k);
  useEffect(() => {
    if (settled === k) return;
    const id = window.requestAnimationFrame(() => setSettled(k));
    return () => window.cancelAnimationFrame(id);
  }, [k, settled]);
  const on = settled === k;
  const lite = lowPower(); // con poca potencia, sin desvanecimiento
  return (
    <div key={k} style={{ display: "flex", flexDirection: "column", gap: 10, opacity: on || lite ? 1 : 0, transition: on && !lite ? "opacity 160ms ease" : "none" }}>
      {children}
    </div>
  );
};

// ---------------- Modo normal ----------------
// Orden por frecuencia de uso: potencia → brillo/volumen → ajustes rapidos → plugins frecuentes → apps → musica.
export const HomeNormal: FC<{
  log: (m: string) => void; bright: ReactNode; vol: ReactNode; toggles: ReactNode; plugins: ReactNode; apps: ReactNode; music: ReactNode; kind?: ReactNode;
}> = ({ log, bright, vol, toggles, plugins, apps, music, kind }) => {
  const t = useTdp(log);
  return (
    <>
      <PowerCard t={t} variant="compact" />
      <Row gap={10}>
        <div style={{ flex: 1, minWidth: 0 }}>{bright}</div>
        <div style={{ flex: 1, minWidth: 0 }}>{vol}</div>
      </Row>
      {toggles}
      {/* Segundo tiempo: plugins y apps se montan tras el primer fotograma. */}
      <Deferred id="home-normal-rest">
        {kind}
        {plugins}
        {apps}
      </Deferred>
      {music}
    </>
  );
};

// ---------------- Modo juego ----------------
// Con juego: potencia completa (con sugerencia) → pantalla rapida (FPS, VRR, escalado, color) → brillo/volumen → plugins de juego.
export const HomeGame: FC<{
  log: (m: string) => void; game: RunningGame; bright: ReactNode; vol: ReactNode; display: ReactNode; plugins: ReactNode; music?: ReactNode; kind?: (t: UseTdp) => ReactNode;
}> = ({ log, game, bright, vol, display, plugins, music, kind }) => {
  const t = useTdp(log, { liveMs: 3000 });
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 34 }}>
        <div style={{ width: 34, height: 34, borderRadius: 12, background: COLORS.blue, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon d="M6 12h4M8 10v4M15 11h.01M18 13h.01M7 6h10a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4h-1l-2-2h-4l-2 2H7a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4z" size={19} color="#fff" />
        </div>
        <div style={{ flexGrow: 1, minWidth: 0, fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{game.name}</div>
        {t.drawW !== null && <div style={{ ...small, whiteSpace: "nowrap" }}><b style={{ color: COLORS.text }}>{fmt(t.drawW)} W</b> en uso</div>}
      </div>
      <PowerCard t={t} variant="full" showDraw={false} />
      <Row gap={10}>
        <div style={{ flex: 1, minWidth: 0 }}>{bright}</div>
        <div style={{ flex: 1, minWidth: 0 }}>{vol}</div>
      </Row>
      {/* Segundo tiempo: lo que lee de Panel y de Steam se monta tras el primer fotograma. */}
      <Deferred id="home-game-rest">
        {kind?.(t)}
        {display}
        {plugins}
      </Deferred>
      {music}
    </>
  );
};
