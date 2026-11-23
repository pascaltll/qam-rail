// Franja de Inicio con las apps de escritorio abiertas: Mostrar (toca el nombre), Volver a Steam y el interruptor «mando como ratón».
import { Focusable } from "@decky/ui";
import { useEffect, useState, type FC, type ReactNode } from "react";

import { backToSteam, desktopAnim, desktopCursor, desktopRepair, loadRunning, openDesktopApp, padMouse, padTouch, touchLabel, touchNext, type TouchState, runningAppsCached, showOpenStrip, type Pin } from "./qamDesktop";
import { openBigKeyboard } from "./bigKeyboard";
import { Card } from "./QamSections";
import { useTap } from "./tap";
import { tickEvery } from "./ticker";
import { AppGlyph, COLORS, Chip, Icon, ICONS2, Row, focusRing } from "./ui";

/** Ficha de app abierta: icono grande, nombre y un punto verde; una sola parada del mando, toque con respuesta inmediata. */
const OpenTile: FC<{ name: string; icon?: string | null; glyph?: ReactNode; accent?: boolean; onTap: () => void }> = ({ name, icon, glyph, accent, onTap }) => {
  const tap = useTap(onTap);
  const [f, setF] = useState(false);
  return (
    <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      style={{ width: 78, minHeight: 74, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "6px 4px", borderRadius: 16, boxSizing: "border-box", background: f ? COLORS.track : "transparent", ...focusRing(f) }}>
      {glyph ? (
        <div style={{ width: 44, height: 44, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", background: accent ? COLORS.accent : COLORS.track }}>{glyph}</div>
      ) : (
        <div style={{ position: "relative" }}>
          <AppGlyph name={name} src={icon} size={44} />
          <span style={{ position: "absolute", right: -2, bottom: -2, width: 11, height: 11, borderRadius: 6, background: "#3ecf8e", boxShadow: `0 0 0 2px ${COLORS.card}` }} />
        </div>
      )}
      <div style={{ fontSize: 11.5, lineHeight: 1.15, textAlign: "center", width: "100%", maxHeight: 27, overflow: "hidden", color: COLORS.text }}>{name}</div>
    </Focusable>
  );
};

export const OpenAppsStrip: FC<{ notify: (t: string) => void; after: () => void }> = ({ notify, after }) => {
  const [apps, setApps] = useState<Pin[]>(() => runningAppsCached());
  const [pad, setPad] = useState<boolean | null>(null);
  const [anim, setAnim] = useState<boolean | null>(null);
  const [cur, setCur] = useState<boolean | null>(null);
  const [touch, setTouch] = useState<TouchState | null>(null);
  useEffect(() => {
    let on = true;
    void padMouse().then((p) => { if (on) setPad(p.on); }).catch(() => null);
    void padTouch().then((p) => { if (on && p.ok) setTouch(p); }).catch(() => null);
    void desktopAnim().then((p) => { if (on) setAnim(p.on); }).catch(() => null);
    void desktopCursor().then((p) => { if (on && p.ok) setCur(p.on); }).catch(() => null);
    return () => { on = false; };
  }, []);
  useEffect(() => {
    let on = true;
    const read = () => void loadRunning().then(() => { if (on) setApps(runningAppsCached()); });
    read();
    const stop = tickEvery(read, 5000, { name: "open-apps-strip" });
    return () => { on = false; stop(); };
  }, []);
  if (!showOpenStrip(apps)) return null;
  return (
    <Card title="Abiertas ahora" right={<span style={{ fontSize: 11, color: COLORS.muted }}>tocar para mostrar</span>}>
      <Focusable style={{ display: "flex", gap: 4, flexWrap: "wrap" }} flow-children="row">
        {apps.slice(0, 4).map((a) => (
          <OpenTile key={a.key} name={a.name} icon={a.icon} onTap={() => { void openDesktopApp(a.key, a.name).then((r) => { if (!r.ok) notify(`No se pudo mostrar ${a.name}: ${r.error ?? "?"}`); else after(); }); }} />
        ))}
        <OpenTile name="Volver a Steam" accent glyph={<Icon d={ICONS2.home} size={24} color={COLORS.onAccent} />}
          onTap={() => { void backToSteam().then((r) => { if (!r.ok) notify("No se pudo volver a Steam"); else after(); }); }} />
      </Focusable>
      <div style={{ height: 1, background: COLORS.track, margin: "2px 0" }} />
      <div style={{ fontSize: 11, color: COLORS.muted }}>Escritorio</div>
      <Row gap={6}>
        {pad !== null && <Chip compact active={pad} onClick={() => void padMouse(!pad).then((p) => { setPad(p.on); notify(p.on ? "Mando como ratón: sí" : "Mando como ratón: no"); })}>{pad ? "Mando: ratón" : "Mando: normal"}</Chip>}
        {cur !== null && <Chip compact active={cur} onClick={() => void desktopCursor(!cur).then((p) => { setCur(p.on); notify(p.on ? "Puntero Xbox: sí (se aplica al mover el puntero)" : "Puntero Xbox: no (reabre la app para volver al normal)"); })}>{cur ? "Puntero Xbox: sí" : "Puntero Xbox: no"}</Chip>}
        {anim !== null && <Chip compact active={anim} onClick={() => void desktopAnim(!anim).then((p) => { setAnim(p.on); notify(p.on ? "Animación al volver: sí" : "Animación al volver: no"); })}>{anim ? "Animación: sí" : "Animación: no"}</Chip>}
      </Row>
      <Row gap={6}>
        {touch !== null && <Chip compact active={touch.on} onClick={() => { const [a, b] = touchNext(touch); void padTouch(a, b).then((p) => { setTouch(p); notify(`Táctil: ${touchLabel(p)}`); }); }}>{`Táctil: ${touchLabel(touch)}`}</Chip>}
        <Chip compact icon={ICONS2.terminal} onClick={() => { after(); window.setTimeout(() => { if (!openBigKeyboard()) notify("No se pudo abrir el teclado grande"); }, 350); }}>Teclado</Chip>
        <Chip compact icon={ICONS2.refresh} onClick={() => void desktopRepair().then((r) => notify(r.ok ? (r.fixed?.length ? `Reparado: ${r.fixed.join(", ")}` : "Nada que reparar") : `No se pudo reparar: ${r.error ?? "?"}`)).catch(() => notify("No se pudo reparar"))}>Reparar</Chip>
      </Row>
      {touch !== null && touch.on && touch.full && (
        <Row gap={6}>
          <Chip compact active={touch.text} onClick={() => void padTouch(null, null, !touch.text).then((p) => { setTouch(p); notify(p.text ? "Al tocar un texto se abre el teclado" : "Teclado al tocar texto: no"); })}>{touch.text ? "Tocar texto abre el teclado: sí" : "Tocar texto abre el teclado: no"}</Chip>
        </Row>
      )}
    </Card>
  );
};
