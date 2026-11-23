// Teclado en español para las apps de escritorio, a pantalla grande (ver BigKeyboardPage). Cada tecla se manda a la app de delante
// (backend `desktop_key`); como la app queda debajo, una línea muestra lo escrito. Nunca se registra lo que escribes.
// Compacto (teclas de 32 px, atajos y navegación plegados en "Más") y manejable con el mando: X = borrar, Start = Intro, B = cerrar.
import { Focusable } from "@decky/ui";
import { useRef, useState, type FC, type ReactNode } from "react";

import { kbNote } from "./keyboard";
import { ROWS, keyChar, mirror } from "./keyboardLayout";
import { createRepeater } from "./keyRepeat";
import { desktopKey, qamEvent } from "./qamDesktop";
import { COLORS, Chip, Row } from "./ui";

const big = (c: ReactNode) => <span style={{ fontSize: 16, fontWeight: 700 }}>{c}</span>;
/** Tecla con peso propio dentro de la fila (la barra espaciadora es más ancha). */
const W: FC<{ w: number; children: ReactNode }> = ({ w, children }) => <div style={{ flex: w, minWidth: 0, display: "flex" }}>{children}</div>;

/** Envuelve una tecla para que, mantenida pulsada con ratón/dedo, se repita; el clic que llega al soltar se ignora si ya repitió. */
const Hold: FC<{ w?: number; fire: () => void; children: ReactNode }> = ({ w = 1, fire, children }) => {
  const rep = useRef(createRepeater(() => fire())).current;
  const skip = useRef(false);
  return (
    <div style={{ flex: w, minWidth: 0, display: "flex" }}
      onPointerDown={() => { skip.current = false; rep.start(); }}
      onPointerUp={() => { skip.current = rep.stop(); }}
      onPointerLeave={() => { skip.current = rep.stop(); }}
      onClickCapture={(e) => { if (skip.current) { skip.current = false; e.stopPropagation(); e.preventDefault(); } }}>
      {children}
    </div>
  );
};

const SHORTCUTS: Array<[label: string, key: string]> = [["Todo", "a"], ["Copiar", "c"], ["Pegar", "v"], ["Cortar", "x"], ["Deshacer", "z"], ["Dirección", "l"], ["Pestaña +", "t"], ["Cerrar pestaña", "w"]];

export const PanelKeyboard: FC<{ notify?: (t: string) => void; onClose?: () => void }> = ({ notify, onClose }) => {
  const [shift, setShift] = useState(false);
  const [caps, setCaps] = useState(false);
  const [alt, setAlt] = useState(false);
  const [ctrl, setCtrl] = useState(false);
  const [more, setMore] = useState(false);
  const [buf, setBuf] = useState("");
  const [err, setErr] = useState("");
  const layer = shift || caps;

  const send = (ev: { text?: string; key?: string; ctrl?: boolean }) => {
    const mods = ev.ctrl || ctrl ? ["ctrl"] : null;
    if (!mods) setBuf((b) => mirror(b, ev));
    setShift(false); setAlt(false); setCtrl(false);
    void desktopKey(ev.text ?? null, ev.key ?? null, mods).then((r) => {
      if (r?.ok) { setErr(""); return; }
      const why = r?.error ?? "sin respuesta";
      setErr(`No se pudo escribir: ${why}`);
      kbNote(`teclado: fallo al enviar (${why})`);
      void Promise.resolve(qamEvent("kb.fallo", { motivo: why })).catch(() => undefined);
      notify?.(`No se pudo escribir: ${why}`);
    }).catch(() => { setErr("No se pudo escribir"); kbNote("teclado: fallo al enviar (sin respuesta del backend)"); });
  };
  const nav = (label: string, key: string) => <Hold key={key} fire={() => send({ key })}><Chip compact onClick={() => send({ key })}>{label}</Chip></Hold>;
  const padBtn = (name: string, ev: { text?: string; key?: string }) => (): void => { kbNote(`mando: ${name}`); send(ev); };

  return (
    <Focusable
      // Mando como en los teclados de Steam/Xbox: X borra, Start = Intro, B cierra (si hay `onClose`).
      onSecondaryButton={padBtn("X/secundario → borrar", { key: "BackSpace" })} onSecondaryActionDescription="Borrar"
      onOptionsButton={padBtn("Start → Intro", { key: "Return" })} onOptionsActionDescription="Intro"
      onMenuButton={padBtn("Menú → espacio", { text: " " })}
      onCancel={onClose ? (e: CustomEvent) => { e.stopPropagation(); onClose(); } : undefined} onCancelActionDescription={onClose ? "Cerrar teclado" : undefined}
      style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ minHeight: 24, padding: "2px 12px", borderRadius: 10, background: COLORS.track, fontSize: 13, fontFamily: "monospace", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", color: err ? "#e5484d" : COLORS.text, display: "flex", alignItems: "center" }}>
        {err || buf || <span style={{ color: COLORS.muted }}>Lo que escribas aparece aquí y se manda a la app</span>}
        {!err && <span style={{ color: COLORS.muted }}>▏</span>}
      </div>
      {ROWS.map((row, i) => (
        <Row key={i} gap={3}>
          {row.map((k) => {
            const c = keyChar(k, layer, alt);
            return <Chip key={k[0]} compact autoFocus={i === 2 && k[0] === "g"} onClick={() => send({ text: c })}>{big(c)}</Chip>;
          })}
        </Row>
      ))}
      <Row gap={3}>
        <Chip compact active={shift} onClick={() => setShift(!shift)}>Mayús</Chip>
        <Chip compact active={caps} onClick={() => setCaps(!caps)}>Bloq</Chip>
        <Chip compact active={alt} onClick={() => setAlt(!alt)}>AltGr</Chip>
        <Chip compact active={ctrl} onClick={() => setCtrl(!ctrl)}>Ctrl</Chip>
        <W w={4}><Chip compact onClick={() => send({ text: " " })}>Espacio</Chip></W>
        <Hold fire={() => send({ key: "BackSpace" })}><Chip compact onClick={() => send({ key: "BackSpace" })}>{big("⌫")}</Chip></Hold>
        <Chip compact onClick={() => send({ key: "Return" })}>Intro</Chip>
        <Chip compact active={more} onClick={() => setMore(!more)}>Más</Chip>
      </Row>
      {more && (
        <>
          <Row gap={3}>{SHORTCUTS.map(([label, k]) => <Chip key={k} compact onClick={() => send({ text: k, ctrl: true })}>{label}</Chip>)}</Row>
          <Row gap={3}>
            {nav("Tab", "Tab")}{nav("Esc", "Escape")}{nav("←", "Left")}{nav("↑", "Up")}{nav("↓", "Down")}{nav("→", "Right")}
            {nav("Inicio", "Home")}{nav("Fin", "End")}{nav("Re Pág", "Prior")}{nav("Av Pág", "Next")}
          </Row>
        </>
      )}
    </Focusable>
  );
};
