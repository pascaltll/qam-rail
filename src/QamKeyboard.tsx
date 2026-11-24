// Teclado en español para las apps de escritorio, a pantalla grande (ver BigKeyboardPage). Cada tecla se manda a la app de delante
// (backend `desktop_key`); como la app queda debajo, una línea muestra lo escrito. Nunca se registra lo que escribes.
// Distribución como un teclado real (filas escalonadas, 15 unidades de ancho, flechas siempre a mano, atajos plegados en "Más")
// y manejable con el mando: X = borrar, Start = Intro, Menú = espacio, B = cerrar.
import { Focusable } from "@decky/ui";
import { useRef, useState, type FC, type ReactNode } from "react";

import { kbNote } from "./keyboard";
import { ROWS, keyChar, mirror, type Key } from "./keyboardLayout";
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
const GAP = 4;
/** Hueco sin tecla (da el escalón de las filas); no recibe foco. */
const Gap: FC<{ w: number }> = ({ w }) => <div style={{ flex: w, minWidth: 0 }} />;

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
  const padBtn = (name: string, ev: { text?: string; key?: string }) => (): void => { kbNote(`mando: ${name}`); send(ev); };
  /** Tecla con peso `w` (unidades de la fila). */
  const key = (w: number, node: ReactNode, k?: string): ReactNode => <W key={k}  w={w}>{node}</W>;
  /** Tecla de carácter de la distribución. */
  const ch = (k: Key, autoFocus = false): ReactNode => {
    const c = keyChar(k, layer, alt);
    return key(1, <Chip compact={false} autoFocus={autoFocus} onClick={() => send({ text: c })}>{big(c)}</Chip>, k[0]);
  };
  const act = (w: number, label: ReactNode, key_: string): ReactNode => key(w, <Chip onClick={() => send({ key: key_ })}>{label}</Chip>, key_);
  /** Tecla de acción que se repite al mantenerla. */
  const rep = (w: number, label: ReactNode, key_: string): ReactNode => <Hold key={key_} w={w} fire={() => send({ key: key_ })}><Chip onClick={() => send({ key: key_ })}>{label}</Chip></Hold>;
  const row = (items: ReactNode[], k: string) => <Row key={k} gap={GAP}>{items}</Row>;

  return (
    <Focusable
      // Mando como en los teclados de Steam/Xbox: X borra, Start = Intro, Menú = espacio, B cierra (si hay `onClose`).
      onSecondaryButton={padBtn("X/secundario → borrar", { key: "BackSpace" })} onSecondaryActionDescription="Borrar"
      onOptionsButton={padBtn("Start → Intro", { key: "Return" })} onOptionsActionDescription="Intro"
      onMenuButton={padBtn("Menú → espacio", { text: " " })}
      onCancel={onClose ? (e: CustomEvent) => { e.stopPropagation(); onClose(); } : undefined} onCancelActionDescription={onClose ? "Cerrar teclado" : undefined}
      style={{ display: "flex", flexDirection: "column", gap: GAP }}>
      <div style={{ minHeight: 30, padding: "3px 14px", borderRadius: 12, background: COLORS.track, fontSize: 14, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", color: err ? COLORS.danger : COLORS.text }}>
          {err || buf || <span style={{ color: COLORS.muted }}>Lo que escribas aparece aquí y se manda a la app</span>}
          {!err && <span style={{ color: COLORS.muted }}>▏</span>}
        </div>
        <span style={{ fontSize: 13, color: COLORS.muted, whiteSpace: "nowrap", fontFamily: "inherit" }}>X borrar · Menú espacio · Start Intro · B cerrar</span>
        {onClose && <Chip compact grow={false} onClick={onClose}>✕ Cerrar</Chip>}
      </div>
      {row([...ROWS[0].map((k) => ch(k)), rep(2, big("⌫"), "BackSpace")], "r1")}
      {row([act(1.5, "Tab", "Tab"), ...ROWS[1].map((k) => ch(k)), <Gap key="g" w={2.5} />], "r2")}
      {row([key(1.75, <Chip active={caps} onClick={() => setCaps(!caps)}>Bloq</Chip>, "caps"), ...ROWS[2].map((k) => ch(k, k[0] === "g")), act(3.25, "Intro", "Return")], "r3")}
      {row([key(2.25, <Chip active={shift} onClick={() => setShift(!shift)}>Mayús</Chip>, "shift"), ...ROWS[3].map((k) => ch(k)), key(2.75, <Chip active={more} onClick={() => setMore(!more)}>{more ? "Menos" : "Más"}</Chip>, "more")], "r4")}
      {row([
        key(1.5, <Chip active={ctrl} onClick={() => setCtrl(!ctrl)}>Ctrl</Chip>, "ctrl"),
        key(1.5, <Chip active={alt} onClick={() => setAlt(!alt)}>AltGr</Chip>, "alt"),
        key(8, <Chip onClick={() => send({ text: " " })}>Espacio</Chip>, "space"),
        rep(1, big("←"), "Left"), rep(1, big("↑"), "Up"), rep(1, big("↓"), "Down"), rep(1, big("→"), "Right"),
      ], "r5")}
      {more && (
        <>
          {row(SHORTCUTS.map(([label, k]) => key(1, <Chip compact onClick={() => send({ text: k, ctrl: true })}>{label}</Chip>, k)), "sc")}
          {row([["Esc", "Escape"], ["Inicio", "Home"], ["Fin", "End"], ["Re Pág", "Prior"], ["Av Pág", "Next"], ["Supr", "Delete"]].map(([label, k]) => key(1, <Chip compact onClick={() => send({ key: k })}>{label}</Chip>, k)), "nv")}
        </>
      )}
    </Focusable>
  );
};
