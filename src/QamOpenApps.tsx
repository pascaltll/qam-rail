// Franja de Inicio con las apps de escritorio abiertas: Mostrar (toca el nombre), Volver a Steam y el interruptor «mando como ratón».
import { useEffect, useState, type FC } from "react";

import { backToSteam, desktopAnim, desktopRepair, loadRunning, openDesktopApp, padMouse, runningAppsCached, showOpenStrip, type Pin } from "./qamDesktop";
import { openBigKeyboard } from "./bigKeyboard";
import { tickEvery } from "./ticker";
import { COLORS, Chip, ICONS2, Row, cardStyle } from "./ui";

export const OpenAppsStrip: FC<{ notify: (t: string) => void; after: () => void }> = ({ notify, after }) => {
  const [apps, setApps] = useState<Pin[]>(() => runningAppsCached());
  const [pad, setPad] = useState<boolean | null>(null);
  const [anim, setAnim] = useState<boolean | null>(null);
  useEffect(() => {
    let on = true;
    void padMouse().then((p) => { if (on) setPad(p.on); }).catch(() => null);
    void desktopAnim().then((p) => { if (on) setAnim(p.on); }).catch(() => null);
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
    <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, color: COLORS.muted }}>Apps abiertas · tocar para mostrar</div>
      <Row gap={6}>
        {apps.slice(0, 3).map((a) => (
          <Chip key={a.key} compact icon={ICONS2.play} onClick={() => { void openDesktopApp(a.key, a.name).then((r) => { if (!r.ok) notify(`No se pudo mostrar ${a.name}: ${r.error ?? "?"}`); else after(); }); }}>{a.name}</Chip>
        ))}
        <Chip compact active icon={ICONS2.home} onClick={() => { void backToSteam().then((r) => { if (!r.ok) notify("No se pudo volver a Steam"); else after(); }); }}>Volver a Steam</Chip>
      </Row>
      <Row gap={6}>
        {pad !== null && <Chip compact active={pad} onClick={() => void padMouse(!pad).then((p) => { setPad(p.on); notify(p.on ? "Mando como ratón: sí" : "Mando como ratón: no"); })}>{pad ? "Mando: ratón" : "Mando: normal"}</Chip>}
        {anim !== null && <Chip compact active={anim} onClick={() => void desktopAnim(!anim).then((p) => { setAnim(p.on); notify(p.on ? "Animación al volver: sí" : "Animación al volver: no"); })}>{anim ? "Animación: sí" : "Animación: no"}</Chip>}
        <Chip compact onClick={() => { after(); window.setTimeout(() => { if (!openBigKeyboard()) notify("No se pudo abrir el teclado grande"); }, 350); }}>Teclado</Chip>
        <Chip compact onClick={() => void desktopRepair().then((r) => notify(r.ok ? (r.fixed?.length ? `Reparado: ${r.fixed.join(", ")}` : "Nada que reparar") : `No se pudo reparar: ${r.error ?? "?"}`)).catch(() => notify("No se pudo reparar"))}>Reparar</Chip>
      </Row>
    </div>
  );
};
