// Grabadora de navegación (Más › Pruebas y herramientas): apunta, con hora al milisegundo, lo que pasa mientras usas una app de escritorio
// (toques, desplazamiento, paradas del lector, carga del navegador y de Steam) para ver dónde se pone lento o falla. Se apaga sola a los 15 min.
import { callable } from "@decky/api";
import { useEffect, useState, type FC } from "react";
import { Card } from "./QamSections";
import { COLORS, Chip, Row, ToggleRow } from "./ui";

export interface TraceState { ok: boolean; on?: boolean; lines?: number; secs?: number; path?: string; error?: string }
export const navTrace = callable<[on?: boolean | null, mark?: string | null], TraceState>("nav_trace");

export interface SelfStep { name: string; ok: boolean | null; detail: string; ms: number | null }
export interface SelfResult { ok: boolean | null; steps: SelfStep[]; secs?: number; error?: string; at?: number; version?: string }
export interface SelfState { ok: boolean; running?: boolean; phase?: string; result?: SelfResult | null; version?: string; error?: string }
export const navSelftest = callable<[start?: boolean | null, cancel?: boolean | null], SelfState>("nav_selftest");

/** Resumen de una prueba: «14 de 14 bien» o «2 fallos de 14: …». */
export function selfSummary(r: SelfResult | null | undefined): string {
  if (!r) return "Aún sin probar";
  if (r.error && !r.steps.length) return r.error;
  const bad = r.steps.filter((x) => x.ok === false);
  return bad.length ? `${bad.length} fallo${bad.length > 1 ? "s" : ""} de ${r.steps.length}: ${bad.map((b) => b.name).join(", ")}` : `${r.steps.length} de ${r.steps.length} bien`;
}

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

/** Prueba el navegador solo: abre una página de prueba, toca, desplaza, escribe y cambia de pestaña, y dice qué falla. */
export const SelfTestCard: FC<{ notify: (t: string) => void }> = ({ notify }) => {
  const [st, setSt] = useState<SelfState | null>(null);
  useEffect(() => {
    let alive = true;
    const poll = () => { navSelftest().then((r) => { if (alive) setSt(r); }).catch(() => undefined); };
    poll();
    const id = window.setInterval(poll, 1500);
    return () => { alive = false; window.clearInterval(id); };
  }, []);
  if (st && !st.ok) return null;
  const r = st?.result;
  const stale = !!r && !!st?.version && r.version !== st.version;
  return (
    <Card title="Autoprueba del navegador">
      <div style={{ fontSize: 12, color: COLORS.muted, padding: "0 10px" }}>
        Con el navegador abierto delante: pulsa «Probar», cierra el panel y no toques la pantalla (~3 min). Abre una página de prueba y comprueba toques, desplazamiento, teclado, pop-ups, vídeo (con pantalla completa), música (sonará un tono suave unos segundos), menús, F11 y pestañas.
      </div>
      <Row gap={6}>
        {st?.running
          ? <Chip compact onClick={() => void navSelftest(null, true).then(setSt).catch(() => undefined)}>Cancelar</Chip>
          : <Chip compact onClick={() => void navSelftest(true).then((x) => { setSt(x); notify("Cierra el panel: la prueba empieza sola"); }).catch(() => notify("No se pudo iniciar la prueba"))}>Probar navegador</Chip>}
      </Row>
      {st?.running && <div style={{ fontSize: 13, padding: "0 10px" }}>{st.phase}</div>}
      {r && !st?.running && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, padding: "0 10px", color: r.ok ? COLORS.text : COLORS.accent }}>
            {r.ok ? "✓ " : "✗ "}{selfSummary(r)}{stale ? ` · de otra versión (${r.version ?? "?"})` : ""}
          </div>
          {r.steps.map((x) => (
            <div key={x.name} style={{ fontSize: 12, padding: "0 10px", color: x.ok === false ? COLORS.accent : COLORS.muted }}>
              {x.ok === false ? "✗" : "✓"} {x.name}{x.ms != null ? ` · ${x.ms} ms` : ""}{x.ok === false ? ` — ${x.detail}` : ""}
            </div>
          ))}
          <div style={{ fontSize: 11, color: COLORS.muted, padding: "0 10px" }}>Detalle: cat {"~/homebrew/settings/qam-rail-dev/selftest.json"}</div>
        </>
      )}
    </Card>
  );
};
