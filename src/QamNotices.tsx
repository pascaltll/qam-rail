// Seccion «Avisos»: la bandeja de notificaciones de Steam, agrupada y con acciones (abrir, quitar, quitar todo).
import { tickEvery } from "./ticker";
import { Focusable } from "@decky/ui";
import { useEffect, useState, type FC } from "react";

import { ago, dismiss, markRead, onTrayChange, readNotices, unviewed, viewed, type Notice } from "./notifications";
import { Label, small } from "./QamSections";
import { useTap } from "./tap";
import { COLORS, Chip, Row, cardStyle, focusRing } from "./ui";
import { useVisible } from "./visible";

/** Contador para el globo del riel (barato: un numero; aviso inmediato de Steam). */
export function useUnviewed(): number {
  const [n, setN] = useState(() => unviewed());
  useEffect(() => {
    const f = () => setN(unviewed());
    const off = onTrayChange(f);
    const id = tickEvery(f, 5000);
    return () => { off(); id(); };
  }, []);
  return n;
}

const NoticeRow: FC<{ n: Notice; onOpen: () => void; onDismiss: () => void }> = ({ n, onOpen, onDismiss }) => {
  const tap = useTap(onOpen);
  const [f, setF] = useState(false);
  return (
    <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      onSecondaryButton={onDismiss} onSecondaryActionDescription="Quitar"
      style={{ ...cardStyle, flexDirection: "row", alignItems: "center", gap: 10, padding: "8px 12px", ...focusRing(f) }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.track }}>
        {n.logo ?? <span style={{ fontSize: 14 }}>🔔</span>}
      </div>
      <div style={{ minWidth: 0, flexGrow: 1 }}>
        <div style={{ fontSize: 13, fontWeight: n.isNew ? 700 : 600, overflow: "hidden", maxHeight: 36 }}>{n.title ?? n.group}</div>
        {n.body && <div style={{ ...small, overflow: "hidden", maxHeight: 32 }}>{n.body}</div>}
      </div>
      <div style={{ ...small, fontSize: 11, whiteSpace: "nowrap", alignSelf: "flex-start" }}>{ago(n.at)}</div>
      {n.isNew && <span style={{ width: 8, height: 8, borderRadius: 4, background: COLORS.accent, flexShrink: 0 }} />}
    </Focusable>
  );
};

export const NoticesSection: FC<{ notify: (t: string) => void; onNative: () => void }> = ({ notify, onNative }) => {
  const [list, setList] = useState<Notice[]>(() => readNotices());
  const visible = useVisible();
  useEffect(() => {
    if (!visible) return undefined;
    viewed();
    const f = () => setList(readNotices());
    f();
    return onTrayChange(f);
  }, [visible]);
  const open = (n: Notice) => {
    markRead(n.id);
    if (n.onClick) { try { n.onClick(); } catch { notify("No se pudo abrir"); } }
    else notify("Este aviso no tiene acción");
  };
  const remove = (n: Notice) => { if (dismiss(n.id)) setList(readNotices()); else notify("Steam no permite quitarlo desde aquí"); };
  if (!list.length) {
    return (
      <>
        <div style={{ ...cardStyle, alignItems: "center", padding: 20, gap: 6 }}>
          <span style={{ fontSize: 26 }}>🔔</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Sin avisos</span>
          <span style={small}>Descargas, amigos, logros y avisos del sistema aparecerán aquí.</span>
        </div>
        <Chip onClick={onNative}>Abrir los avisos de Steam</Chip>
      </>
    );
  }
  const groups = [...new Set(list.map((n) => n.group))];
  return (
    <>
      <Row>
        <Chip onClick={() => { if (dismiss(null)) setList([]); else notify("Steam no permite quitarlos desde aquí"); }}>Quitar todos</Chip>
        <Chip onClick={onNative}>Avisos de Steam</Chip>
      </Row>
      <div style={{ ...small, fontSize: 11 }}>A abre · X quita</div>
      {groups.map((g) => (
        <div key={g} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Label>{g}</Label>
          {list.filter((n) => n.group === g).slice(0, 12).map((n, i) => (
            <NoticeRow key={`${n.id ?? "x"}-${i}`} n={n} onOpen={() => open(n)} onDismiss={() => remove(n)} />
          ))}
        </div>
      ))}
    </>
  );
};
