// Teclado en español para las apps de escritorio, a pantalla grande (ver BigKeyboardPage). Cada tecla se manda a la app de delante
// (backend `desktop_key`); como la app queda debajo, una línea muestra lo escrito. Nunca se registra lo que escribes.
// Distribución como un teclado real (filas escalonadas, 15 unidades de ancho, flechas siempre a mano, atajos plegados en "Más")
// y manejable con el mando: X = borrar, Y = espacio, Start (menú) = Intro, B = cerrar.
import { Focusable } from "@decky/ui";
import { useEffect, useRef, useState, type FC, type ReactNode } from "react";

import { kbNote } from "./keyboard";
import { ROWS, SYMBOL_ROWS, keyChar, mirror, padAction, type Key } from "./keyboardLayout";
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
  const [symbols, setSymbols] = useState(false);
  const rootEl = useRef<HTMLDivElement | null>(null);
  const lastPad = useRef({ b: -1, t: 0 });
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
  /** LT/RT/L3/LB/RB. Llega por dos vías (prop y evento DOM «vgp_onbuttondown»): se descarta el duplicado de menos de 60 ms. [H] sin probar en el equipo. */
  const onPad = (e: { detail?: { button?: number } }): void => {
    const b = e.detail?.button;
    const a = padAction(b);
    if (!a) return;
    const now = Date.now();
    if (lastPad.current.b === b && now - lastPad.current.t < 60) return;
    lastPad.current = { b: b as number, t: now };
    kbNote(`mando: botón ${b} → ${a.kind}`);
    if (a.kind === "shift") setShift((v) => !v);
    else if (a.kind === "caps") setCaps((v) => !v);
    else if (a.kind === "symbols") setSymbols((v) => !v);
    else send({ key: a.key });
  };
  const padRef = useRef(onPad);
  padRef.current = onPad;
  useEffect(() => {
    const el = rootEl.current;
    if (!el) return undefined;
    const h = (ev: Event) => padRef.current(ev as unknown as { detail?: { button?: number } });
    el.addEventListener("vgp_onbuttondown", h);
    return () => el.removeEventListener("vgp_onbuttondown", h);
  }, []);
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
      // Mando como el teclado de Xbox: X borra, Y = espacio, Menú (Start) = Intro, B cierra. En Steam la «opción» (onOptionsButton) es la Y y el «menú»
      // (onMenuButton) es Start: la barra de ayudas de Steam lo dice sola con las descripciones de abajo.
      onSecondaryButton={padBtn("X/secundario → borrar", { key: "BackSpace" })} onSecondaryActionDescription="Borrar"
      onOptionsButton={padBtn("Y/opciones → espacio", { text: " " })} onOptionsActionDescription="Espacio"
      onMenuButton={padBtn("Start/menú → Intro", { key: "Return" })} onMenuActionDescription="Intro"
      onCancel={onClose ? (e: CustomEvent) => { e.stopPropagation(); onClose(); } : undefined} onCancelActionDescription={onClose ? "Cerrar teclado" : undefined}
      {...({ onButtonDown: (e: { detail?: { button?: number } }) => padRef.current(e), ref: rootEl } as Record<string, unknown>)}
      style={{ display: "flex", flexDirection: "column", gap: GAP }}>
      <div style={{ minHeight: 30, padding: "3px 14px", borderRadius: 12, background: COLORS.track, fontSize: 14, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", color: err ? COLORS.danger : COLORS.text }}>
          {err || buf || <span style={{ color: COLORS.muted }}>Lo que escribas aparece aquí y se manda a la app</span>}
          {!err && <span style={{ color: COLORS.muted }}>▏</span>}
        </div>
        {onClose && <Chip compact grow={false} onClick={onClose}>✕ Cerrar</Chip>}
      </div>
      {symbols ? (
        <>
          {SYMBOL_ROWS.map((r, i) => row([...r.map((c) => key(1, <Chip compact={false} autoFocus={i === 0 && c === "1"} onClick={() => send({ text: c })}>{big(c)}</Chip>, c)), ...(i === 0 ? [rep(2, big("⌫"), "BackSpace")] : [])], `s${i}`))}
          {row([
            key(2, <Chip active onClick={() => setSymbols(false)}>ABC</Chip>, "abc"),
            key(8, <Chip onClick={() => send({ text: " " })}>Espacio</Chip>, "space"),
            act(2, "Intro", "Return"),
            rep(1, big("←"), "Left"), rep(1, big("→"), "Right"),
          ], "sr5")}
        </>
      ) : (<>
      {row([...ROWS[0].map((k) => ch(k)), rep(2, big("⌫"), "BackSpace")], "r1")}
      {row([act(1.5, "Tab", "Tab"), ...ROWS[1].map((k) => ch(k)), <Gap key="g" w={2.5} />], "r2")}
      {row([key(1.75, <Chip active={caps} onClick={() => setCaps(!caps)}>Bloq</Chip>, "caps"), ...ROWS[2].map((k) => ch(k, k[0] === "g")), act(3.25, "Intro", "Return")], "r3")}
      {row([key(2.25, <Chip active={shift} onClick={() => setShift(!shift)}>Mayús</Chip>, "shift"), ...ROWS[3].map((k) => ch(k)), key(2.75, <Chip active={more} onClick={() => setMore(!more)}>{more ? "Menos" : "Más"}</Chip>, "more")], "r4")}
      {row([
        key(1.5, <Chip active={ctrl} onClick={() => setCtrl(!ctrl)}>Ctrl</Chip>, "ctrl"),
        key(1.5, <Chip active={alt} onClick={() => setAlt(!alt)}>AltGr</Chip>, "alt"),
        key(8, <Chip onClick={() => send({ text: " " })}>Espacio</Chip>, "space"),
        rep(1, big("←"), "Left"), rep(1, big("↑"), "Up"), rep(1, big("↓"), "Down"), rep(1, big("→"), "Right"),
        key(1.5, <Chip onClick={() => setSymbols(true)}>123</Chip>, "sym"),
      ], "r5")}
      </>)}
      {!symbols && more && (
        <>
          {row(SHORTCUTS.map(([label, k]) => key(1, <Chip compact onClick={() => send({ text: k, ctrl: true })}>{label}</Chip>, k)), "sc")}
          {row([["Esc", "Escape"], ["Inicio", "Home"], ["Fin", "End"], ["Re Pág", "Prior"], ["Av Pág", "Next"], ["Supr", "Delete"]].map(([label, k]) => key(1, <Chip compact onClick={() => send({ key: k })}>{label}</Chip>, k)), "nv")}
        </>
      )}
    </Focusable>
  );
};
