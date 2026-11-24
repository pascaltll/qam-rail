// Grabadora de navegación (Más › Pruebas y herramientas): apunta, con hora al milisegundo, lo que pasa mientras usas una app de escritorio
// (toques, desplazamiento, paradas del lector, carga del navegador y de Steam) para ver dónde se pone lento o falla. Se apaga sola a los 15 min.
import { callable } from "@decky/api";
import { useEffect, useState, type FC } from "react";
import { Card } from "./QamSections";
import { COLORS, Chip, Row, ToggleRow } from "./ui";

export interface TraceState { ok: boolean; on?: boolean; lines?: number; secs?: number; path?: string; error?: string }
export const navTrace = callable<[on?: boolean | null, mark?: string | null], TraceState>("nav_trace");

export const TRACE_MARKS: Array<[string, string]> = [
  ["lento", "Fue lento"], ["no respondió", "No respondió"], ["no abrió", "No abrió"], ["scroll mal", "Scroll mal"],
];

export const traceElapsed = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export const NavTraceCard: FC<{ notify: (t: string) => void }> = ({ notify }) => {
  const [st, setSt] = useState<TraceState | null>(null);
  useEffect(() => {
    let alive = true;
    const poll = () => { navTrace().then((r) => { if (alive) setSt(r); }).catch(() => undefined); };
    poll();
    const id = window.setInterval(poll, 2000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);
  if (st && !st.ok) return null;
  const on = !!st?.on;
  return (
    <Card title="Grabar navegación">
      <ToggleRow label="Grabar lo que hago" on={on}
        note={on ? `Grabando · ${traceElapsed(st?.secs ?? 0)} · ${st?.lines ?? 0} líneas` : "Anota toques, scroll y lo que tarda cada cosa para ver dónde falla"}
        onToggle={() => void navTrace(!on).then((r) => { setSt(r); notify(r.on ? "Grabando: usa el navegador y vuelve aquí para marcar lo que falle" : "Grabación guardada"); }).catch(() => notify("No se pudo cambiar la grabación"))} />
      {on && (
        <>
          <div style={{ fontSize: 12, color: COLORS.muted, padding: "0 10px" }}>Si algo acaba de ir mal, ábreme y pulsa lo que pasó (queda marcado con la hora):</div>
          <Row gap={6}>
            {TRACE_MARKS.map(([k, label]) => (
              <Chip key={k} compact onClick={() => void navTrace(null, k).then((r) => { setSt(r); notify(`Marcado: ${label.toLowerCase()}`); }).catch(() => undefined)}>{label}</Chip>
            ))}
          </Row>
        </>
      )}
      {!on && st?.lines ? <div style={{ fontSize: 12, color: COLORS.muted, padding: "0 10px" }}>Última grabación: {st.lines} líneas. Pásame: tail -n 400 {st.path ?? "nav-trace.log"}</div> : null}
    </Card>
  );
};
