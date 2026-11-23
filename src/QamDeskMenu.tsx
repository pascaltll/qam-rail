// Menú de una app de escritorio (mantener pulsado en táctil, X con el mando): Mostrar · Minimizar · Cerrar · Forzar cierre.
import { useEffect, useRef, useState, type FC } from "react";

import {
  closeDesktopApp, killDesktopApp, loadRunning, menuOptions, minimizeDesktopApp, openDesktopApp, runningCached,
} from "./qamDesktop";
import { takeFocus } from "./nav";
import { COLORS, Chip, ICONS2, Row, cardStyle } from "./ui";

export const DeskMenu: FC<{ app: { key: string; name: string }; notify: (t: string) => void; onClose: () => void; after?: () => void }> = ({ app, notify, onClose, after }) => {
  const [running, setRunning] = useState<boolean>(() => runningCached().includes(app.key));
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => { let on = true; void loadRunning(true).then((k) => { if (on) setRunning(k.includes(app.key)); }); return () => { on = false; }; }, [app.key]);
  useEffect(() => { const t = window.setTimeout(() => { takeFocus(box.current?.querySelector<HTMLElement>("[data-qr]") ?? null); }, 80); return () => window.clearTimeout(t); }, []);

  const go = async (id: string) => {
    if (busy) return;
    setBusy(true);
    let msg = "";
    try {
      if (id === "open" || id === "show") { const r = await openDesktopApp(app.key, app.name); msg = r.ok ? `Abriendo ${app.name}` : `No se pudo abrir: ${r.error ?? "?"}`; if (r.ok) after?.(); }
      else if (id === "minimize") { const r = await minimizeDesktopApp(app.key, app.name); msg = r.ok ? `${app.name} minimizada` : `No se pudo minimizar: ${r.error ?? "?"}`; }
      else if (id === "close") { const r = await closeDesktopApp(app.key, app.name); msg = r.ok ? `${app.name} cerrada` : `No se pudo cerrar: ${r.error ?? "?"}`; }
      else if (id === "kill") { const r = await killDesktopApp(app.key, app.name); msg = r.ok ? `${app.name}: cierre forzado` : `No se pudo forzar: ${r.error ?? "?"}`; }
    } catch (e) { msg = `Error: ${String(e).slice(0, 80)}`; }
    setBusy(false);
    notify(msg);
    void loadRunning(true);
    onClose();
  };
  const icon = (id: string) => (id === "open" || id === "show" ? ICONS2.play : id === "minimize" ? ICONS2.download : ICONS2.trash);
  const opts = menuOptions(running);
  return (
    <div ref={box}>
      <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.name}</span>
          <span style={{ fontSize: 11, color: COLORS.muted }}>{running ? "abierta" : "cerrada"}</span>
        </div>
        <Row gap={6}>{opts.slice(0, 2).map((o) => <Chip key={o.id} compact active={o.id === "open" || o.id === "show"} icon={icon(o.id)} onClick={() => void go(o.id)}>{o.label}</Chip>)}</Row>
        {opts.length > 2 && <Row gap={6}>{opts.slice(2).map((o) => <Chip key={o.id} compact icon={icon(o.id)} onClick={() => void go(o.id)}>{o.label}</Chip>)}</Row>}
        <Row gap={6}><Chip compact onClick={onClose}>Cancelar</Chip></Row>
      </div>
    </div>
  );
};
