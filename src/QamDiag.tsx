// Mas › Pruebas y diagnostico: todo lo que antes necesitaba DevTools, con botones. Cada prueba guarda su seccion en
// ~/homebrew/settings/qam-rail/diag/informe.json (siempre la ultima); el zip junta el informe, un resumen y el registro.
import { Focusable } from "@decky/ui";
import { useEffect, useState, type FC } from "react";

import { installQRX2 } from "./diagSocial";
import { diagClear, diagIndex, diagStates, sectionLabel } from "./diagStore";
import { situation } from "./situation";
import { FEATURES, calmLeft, calmReason, calmUsesSteamQam, setCalmUsesSteamQam, featureOn, featuresOff, inCalm, onFeaturesChange, setAllFeatures, setFeature } from "./calm";
import { runningGame } from "./game";
import { activeHomeMode, loadHomeModes, saveHomeModes } from "./homeModes";
import { bundleNow, cancelSuite, runSuite, suiteState, suiteSubscribe, SUITE_STEPS, runOneStep, type SuiteStep } from "./diagTests";
import { flush, med, recentEvents, summary } from "./perfLog";
import { cancelFluency, fluencyState, fluencySubscribe, runFluency, type FluencyRow } from "./perfBench";
import { Card, Label, small } from "./QamSections";
import { COLORS, Chip, Row, ToggleRow, cardStyle } from "./ui";

const n = (x: number | null | undefined, d = 0) => (x === null || x === undefined ? "—" : x.toFixed(d));

/** Aviso fijo arriba del panel mientras corre la prueba (la prueba mueve el panel por su cuenta). */
export const FluencyBanner: FC = () => {
  const [, t] = useState(0);
  useEffect(() => fluencySubscribe(() => t((x) => x + 1)), []);
  const s = fluencyState();
  if (s.phase !== "running") return null;
  return (
    <div style={{ ...cardStyle, flexDirection: "row", alignItems: "center", gap: 8, padding: "6px 10px", background: "#3a2a12", flexShrink: 0 }}>
      <div style={{ flexGrow: 1, minWidth: 0, fontSize: 12 }}>Prueba {s.index}/{s.total} · {s.step} No toques nada.</div>
      <Chip grow={false} onClick={cancelFluency}>Cancelar</Chip>
    </div>
  );
};


type Zip = { path: string; files: string[] } | null;

const when = (f: string) => { const d = new Date(f); return Number.isNaN(d.getTime()) ? f : d.toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };

/** Semáforo de pruebas: verde = bien, ámbar = con avisos, rojo = falló, gris = sin hacer o saltada. */
const LIGHT: Record<SuiteStep["status"], string> = { pending: "#5b6170", running: "#7cc4ff", ok: COLORS.ok, warn: "#f5c542", error: "#ff6b6b", skipped: "#5b6170" };
const Lights: FC<{ steps: Array<{ id: string; label: string; status: SuiteStep["status"]; detail?: string }>; title: string }> = ({ steps, title }) => {
  const okN = steps.filter((x) => x.status === "ok").length;
  return (
    <Focusable data-qr="item" style={{ display: "flex", flexDirection: "column", gap: 3, padding: "8px 10px", borderRadius: 14, background: COLORS.track }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700 }}>
        <span style={{ flex: 1 }}>{title}</span>
        <span style={{ color: okN === steps.length ? COLORS.ok : COLORS.muted }}>{okN}/{steps.length} bien</span>
      </div>
      {steps.map((st) => (
        <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, lineHeight: "17px" }}>
          <span style={{ width: 9, height: 9, borderRadius: 5, flexShrink: 0, background: LIGHT[st.status],
            boxShadow: st.status === "ok" ? "0 0 6px rgba(63,191,111,0.8)" : st.status === "running" ? "0 0 6px rgba(124,196,255,0.8)" : "none" }} />
          <span style={{ flex: 1, color: st.status === "pending" || st.status === "skipped" ? COLORS.muted : COLORS.text }}>{st.label}</span>
          {st.detail && <span style={{ color: COLORS.muted, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>{st.detail}</span>}
        </div>
      ))}
    </Focusable>
  );
};

const GAME_CLASSES: Array<{ id: "juego-retro" | "juego-intermedio" | "juego-exigente"; label: string }> = [
  { id: "juego-retro", label: "🕹️ Simple" }, { id: "juego-intermedio", label: "⚖️ Medio" }, { id: "juego-exigente", label: "🔥 Exigente" },
];

/**
 * Paso a paso: 1) dónde estás (lo detecta solo; con juego eliges el tipo), 2) un botón, 3) el zip.
 * Cada situación guarda sus 5 últimas pruebas con la versión de QAM Rail en que se hicieron.
 */
/** Pruebas sueltas: cualquier paso de la batería por separado, con su luz. */
const STEP_ICON: Record<string, string> = {
  entorno: "M4 5h16v11H4zM8 20h8M12 16v4",
  "contrato-panel": "M8 3h8l4 4v14H4V3h4zM9 12l2 2 4-4",
  "contrato-steam": "M8 3h8l4 4v14H4V3h4zM9 12l2 2 4-4",
  redes: "M2.5 9.3a13.5 13.5 0 0 1 19 0M5.5 12.5a9.2 9.2 0 0 1 13 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01",
  musica: "M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z",
  "musica-prueba": "M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z",
  sonido: "M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7",
  "potencia-menu": "M13 3L4 14h7l-1 7 9-11h-7z",
  procesos: "M4 4h16v16H4zM8 15v-3M12 15V9M16 15v-5",
  tema: "M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.8-.8-1.2-.8-2 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8z",
  juego: "M6 9h12a4 4 0 0 1 3.9 4.8l-.9 4a2.5 2.5 0 0 1-4.3 1.1L14.5 16h-5l-2.2 2.9a2.5 2.5 0 0 1-4.3-1.1l-.9-4A4 4 0 0 1 6 9z",
  "potencia-minima": "M13 3L4 14h7l-1 7 9-11h-7z",
  fluidez: "M3 12h4l3-8 4 16 3-8h4",
  decky: "M4 4h16v16H4zM9 9h6v6H9z",
};
const DOT: Record<string, string> = { ok: COLORS.ok, warn: COLORS.warn, error: COLORS.danger, running: "#5fb8ff", skipped: "#6b7280", pending: "transparent" };
const SingleTests: FC = () => {
  const [, t] = useState(0);
  useEffect(() => suiteSubscribe(() => t((x) => x + 1)), []);
  const s = suiteState();
  const st = (id: string) => s.steps.find((x) => x.id === id);
  return (
    <Card title="Pruebas sueltas">
      <div style={small}>Cada prueba de «Medir todo» por separado. La luz es su último resultado; el detalle va al informe.</div>
      <Focusable style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {SUITE_STEPS.filter((x) => !x.id.startsWith("amigos")).map((x) => {
          const cur = st(x.id);
          return (
            <Chip key={x.id} icon={STEP_ICON[x.id] ?? STEP_ICON.entorno} active={cur?.status === "running"}
              onClick={() => { if (!s.running) void runOneStep(x.id); }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {x.label.replace(/ \(.*\)$/, "")}
                {cur && cur.status !== "pending" && <span style={{ width: 8, height: 8, borderRadius: 4, background: DOT[cur.status], flexShrink: 0 }} />}
              </span>
            </Chip>
          );
        })}
      </Focusable>
      {s.running && <div style={small}>Probando… no cierres el panel.</div>}
    </Card>
  );
};

/** Cómo medir con un juego abierto, paso a paso. */
const GameGuide: FC<{ inGame: boolean }> = ({ inGame }) => {
  const [open, setOpen] = useState(!inGame);
  const steps: Array<[string, string]> = [
    ["Abre el juego y juega 1–2 minutos", "que esté en marcha de verdad (no en el menú del juego ni cargando)."],
    ["Pulsa QAM › Más › Pruebas y diagnóstico", "el juego sigue corriendo detrás; el panel lo mide sin pausarlo."],
    ["Elige el tipo de juego", "Simple (2D, antiguos), Medio o Exigente (3D moderno). Se recuerda para ese juego."],
    ["Pulsa «Medir todo» y no toques nada (≈ 1,5 min)", "el panel prueba varias potencias (7, 9, 12… W), mide los FPS del juego y lo fluido que va el menú, y vuelve a tu potencia."],
    ["Repite en otras situaciones", "con el cargador, en la TV o en otro juego: cada situación se guarda aparte (las 5 últimas)."],
    ["Junta el .zip y mándamelo", "«Lo guardado › Juntar en un .zip»."],
  ];
  return (
    <Card title="Cómo medir con un juego" right={<Chip grow={false} onClick={() => setOpen(!open)}>{open ? "Ocultar" : "Ver pasos"}</Chip>}>
      {open && steps.map(([h, d], i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ width: 22, height: 22, borderRadius: 11, background: COLORS.accent, color: COLORS.onAccent, fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{h}</div>
            <div style={{ ...small, fontSize: 11 }}>{d}</div>
          </div>
        </div>
      ))}
      {!open && <div style={small}>{inGame ? "Hay un juego abierto: ya puedes elegir su tipo y «Medir todo»." : "Abre un juego para medirlo con él."}</div>}
    </Card>
  );
};

const SuiteCard: FC<{ notify: (t: string) => void; onZip: (z: Zip) => void }> = ({ notify, onZip }) => {
  const [, t] = useState(0);
  useEffect(() => suiteSubscribe(() => t((x) => x + 1)), []);
  const s = suiteState();
  const [last, setLast] = useState<Record<string, { estado: string; detalle: string; fecha: string }> | null>(null);
  useEffect(() => { if (!s.running) void diagStates().then(setLast, () => setLast({})); }, [s.running]);
  const sit = situation(null, 0);
  const game = runningGame();
  const hm = loadHomeModes();
  const cls = game ? activeHomeMode(hm, { key: game.key, name: game.name }, false) : null;
  const start = (skipPower: boolean) => void runSuite({ skipPower }).then(() => {
    const z = suiteState().zip;
    if (z && !z.startsWith("Error")) { onZip({ path: z, files: [] }); notify("Pruebas hechas · zip listo"); }
  });
  return (
    <Card title="Probar ahora">
      <div style={{ ...small, color: COLORS.text, fontSize: 13 }}>1 · Situación: <b>{sit.label}</b></div>
      {game ? (
        <>
          <div style={small}>Con <b>{game.name}</b> abierto. ¿Qué tipo de juego es? (se recuerda para este juego y sus pruebas van aparte)</div>
          <Row gap={6}>
            {GAME_CLASSES.map((c) => (
              <Chip key={c.id} active={cls === c.id} onClick={() => { saveHomeModes({ ...hm, perGame: { ...hm.perGame, [game.key]: c.id } }); situation(null, 0); t((x) => x + 1); }}>{c.label}</Chip>
            ))}
          </Row>
          <div style={small}>Consejo: pruébalo al empezar el juego y otra vez ya jugando un rato; se guardan las 5 últimas de cada tipo.</div>
        </>
      ) : <div style={small}>Para medir un juego: ábrelo, juega un poco, abre el panel y vuelve aquí.</div>}
      <div style={{ ...small, color: COLORS.text, fontSize: 13 }}>2 · Medir (≈ 1,5 min, no toques nada)</div>
      {s.running ? <Chip onClick={cancelSuite}>Detener tras la prueba actual</Chip> : (
        <Row>
          <Chip active onClick={() => start(false)}>Medir todo</Chip>
          <Chip onClick={() => start(true)}>Sin cambiar la potencia</Chip>
        </Row>
      )}
      <Lights steps={s.steps.length ? s.steps : SUITE_STEPS.map((x) => ({ ...x, status: (last?.[x.id]?.estado as SuiteStep["status"]) ?? "pending", detail: last?.[x.id] ? `${last[x.id].detalle ? `${last[x.id].detalle} · ` : ""}${when(last[x.id].fecha)}` : undefined }))}
        title={s.steps.length ? (s.running ? "En marcha" : "Resultado") : last && Object.keys(last).length ? "Último resultado" : "Pruebas"} />
      <div style={{ ...small, color: COLORS.text, fontSize: 13 }}>3 · Al terminar se junta el .zip solo (o «Juntar en un .zip» abajo).</div>
    </Card>
  );
};

type Idx = Record<string, { fecha: string; version: string | null; veces?: number; versiones?: string[] }>;
const ReportCard: FC<{ zip: Zip; onZip: (z: Zip) => void; notify: (t: string) => void }> = ({ zip, onZip, notify }) => {
  const [idx, setIdx] = useState<Idx | null>(null);
  const [ask, setAsk] = useState(false);
  const reload = () => void diagIndex().then((x) => setIdx(x as Idx), () => setIdx({}));
  useEffect(() => { reload(); return suiteSubscribe(reload); }, []);
  const keys = Object.keys(idx ?? {}).sort();
  // Agrupado por situación: lo general arriba, luego cada situación con sus pruebas.
  const groups = new Map<string, string[]>();
  for (const k of keys) { const g = k.includes("@") ? k.split("@")[1] : ""; groups.set(g, [...(groups.get(g) ?? []), k]); }
  return (
    <Card title="Lo guardado" right={<Chip grow={false} onClick={() => {
      if (!ask) { setAsk(true); window.setTimeout(() => setAsk(false), 4000); return; }
      setAsk(false); void diagClear().then(() => { reload(); notify("Informe vaciado"); });
    }}>{ask ? "¿Seguro?" : "Vaciar"}</Chip>}>
      {idx === null ? <div style={small}>Leyendo…</div> : keys.length ? (
        <Focusable data-qr="item" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {[...groups.entries()].map(([g, ks]) => (
            <div key={g || "general"} style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 4 }}>
              <div style={{ ...small, fontWeight: 700 }}>{g ? sectionLabel(`x@${g}`).replace(/^x · /, "") : "General"}</div>
              {ks.map((k) => (
                <div key={k} style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: "17px" }}>
                  <span style={{ flex: 1 }}>{sectionLabel(k.split("@")[0])}{(idx![k].veces ?? 1) > 1 ? ` ×${idx![k].veces}` : ""}</span>
                  <span style={{ color: COLORS.muted }}>{when(idx![k].fecha)} · v{(idx![k].versiones ?? [idx![k].version ?? "?"]).join("/")}</span>
                </div>
              ))}
            </div>
          ))}
        </Focusable>
      ) : <div style={small}>Vacío: usa «Medir todo».</div>}
      <Chip active onClick={() => void bundleNow().then((r) => { onZip(r); reload(); notify("Diagnóstico juntado"); }, (e) => onZip({ path: `Error: ${String(e)}`, files: [] }))}>Juntar en un .zip</Chip>
      {zip && (
        <div style={{ ...small, wordBreak: "break-all" }}>
          {zip.path}
          <br />Se guardan los 3 últimos en tu carpeta personal. Por terminal: <code>ls ~/qam-rail-diagnostico-*.zip</code>
        </div>
      )}
    </Card>
  );
};

const RowView: FC<{ r: FluencyRow; best: boolean }> = ({ r, best }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 0", borderTop: `1px solid ${COLORS.track}` }}>
    <div style={{ display: "flex", gap: 8, fontSize: 13, fontWeight: 700 }}>
      <span style={{ width: 70 }}>{r.watts} W{r.appliedW !== null && Math.abs(r.appliedW - r.watts) >= 0.5 ? ` (${n(r.appliedW, 1)})` : ""}</span>
      {r.error ? <span style={{ color: COLORS.dangerSoft, fontWeight: 500 }}>{r.error}</span> : (
        <>
          <span style={{ flex: 1 }}>Sección {n(r.switchMed)} ms</span>
          <span style={{ flex: 1, color: best ? COLORS.okSoft : COLORS.text }}>Reposo {n(r.idle.fps)} fps</span>
        </>
      )}
    </div>
    {!r.error && (
      <div style={small}>
        p95 {n(r.switchP95)} ms · desplazar {n(r.scroll.fps)} fps ({n(r.scroll.slowPct)} % lentos) · columna {n(r.columnOpen)}/{n(r.columnClose)} ms ·
        JS {r.jsMs} ms · amigos {n(r.readFriendsMs, 1)} ms · Panel {n(r.panelRpcMs)} ms · bloqueos {r.longTasks} ({r.longTaskMs} ms)
      </div>
    )}
  </div>
);

/**
 * Aislar fallos: apagar funciones de fondo para saber si un reinicio es cosa del plugin. Si con todo apagado se
 * sigue cayendo, no lo es. Las migas de cada sesión dicen qué estaba apagado.
 */
const IsolateCard: FC = () => {
  const [, bump] = useState(0);
  useEffect(() => onFeaturesChange(() => bump((x) => x + 1)), []);
  useEffect(() => { const id = window.setInterval(() => { if (inCalm()) bump((x) => x + 1); }, 1000); return () => window.clearInterval(id); }, []);
  const off = featuresOff();
  return (
    <Card title="Aislar fallos" right={off.length > 1 ? <span style={{ ...small, color: COLORS.accent }}>{off.length} apagadas</span> : undefined}>
      <div style={small}>Si Steam se reinicia, apaga lo que quieras probar, juega y cierra el juego un par de veces y junta el .zip.</div>
      <Label>Al arrancar o cerrar un juego</Label>
      <div style={{ ...small, fontSize: 11 }}>
        {inCalm() ? <b style={{ color: COLORS.accent }}>En calma ahora: {calmReason()} · {calmLeft()} s</b> : "Durante 25 s al arrancar y 15 s al cerrar, lo de fondo espera (tema, perfil de pantalla)."}
      </div>
      <ToggleRow label="QAM de Steam mientras carga" note="si está apagado, el botón abre este panel también durante la carga"
        on={calmUsesSteamQam()} onToggle={() => setCalmUsesSteamQam(!calmUsesSteamQam())} />
      <Label>Funciones de fondo</Label>
      {FEATURES.map((f) => <ToggleRow key={f.id} label={f.label} note={f.note} on={featureOn(f.id)} onToggle={() => setFeature(f.id, !featureOn(f.id))} />)}
      <Row gap={8}>
        <Chip active={off.length === FEATURES.length} onClick={() => setAllFeatures(false)}>Apagar todo</Chip>
        <Chip onClick={() => setAllFeatures(true)}>Como siempre</Chip>
      </Row>
    </Card>
  );
};

export const DiagView: FC<{ onBack: () => void; notify: (t: string) => void; log: (m: string) => void }> = ({ onBack, notify, log }) => {
  const [, t] = useState(0);
  useEffect(() => fluencySubscribe(() => t((x) => x + 1)), []);
  useEffect(() => { const id = window.setInterval(() => t((x) => x + 1), 2000); return () => window.clearInterval(id); }, []);
  const s = fluencyState();
  const [qrx, setQrx] = useState<{ busy: string | null; saved: string | null }>({ busy: null, saved: null });
  const buckets = summary(recentEvents());
  const closes = recentEvents().filter((e) => e.k === "close").slice(-4).reverse();
  const bestFps = Math.max(0, ...s.rows.map((r) => r.idle?.fps ?? 0));

  const [zip, setZip] = useState<{ path: string; files: string[] } | null>(null);
  const [adv, setAdv] = useState(false);
  const runQ = async (label: string, fn: (q: ReturnType<typeof installQRX2>) => Promise<unknown>) => {
    if (qrx.busy) return;
    setQrx({ busy: label, saved: null });
    try {
      const q = installQRX2();
      await fn(q);
      const saved = await q.guardar();
      setQrx({ busy: null, saved: String(saved) });
      notify("Diagnóstico guardado");
    } catch (e) { setQrx({ busy: null, saved: `Error: ${String(e)}` }); }
  };

  return (
    <>
      <Chip onClick={onBack}>← Más</Chip>
      <SuiteCard notify={notify} onZip={setZip} />
      <SingleTests />
      <GameGuide inGame={!!runningGame()} />
      <ReportCard zip={zip} onZip={setZip} notify={notify} />
      <IsolateCard />
      <Chip onClick={() => setAdv((x) => !x)}>{adv ? "Ocultar pruebas avanzadas ▴" : "Pruebas avanzadas y registro ▾"}</Chip>
      {adv && (<>

      <Card title="Prueba de fluidez del panel">
        <div style={small}>
          Recorre varios niveles de potencia (más en los bajos) y en cada uno mide cambios de sección, fotogramas en reposo y al
          desplazar, la columna lateral, las lecturas que repite el panel y la latencia de Panel de Control. Al terminar vuelve a tu
          potencia. Mejor sin juego abierto; si hay juego, se prueba sobre su perfil y luego se restaura.
        </div>
        {s.phase === "running" ? <Chip onClick={cancelFluency}>Cancelar · {s.index}/{s.total}</Chip> : (
          <Row>
            <Chip onClick={() => void runFluency(true, log)}>Rápida (3 niveles, ≈ 1 min)</Chip>
            <Chip active onClick={() => void runFluency(false, log)}>Completa (5, ≈ 2 min)</Chip>
          </Row>
        )}
        {(s.phase === "error" || s.phase === "cancelled") && <div style={{ ...small, color: COLORS.dangerSoft }}>{s.step}</div>}
        {s.rows.length > 0 && (
          <Focusable data-qr="item" style={{ display: "flex", flexDirection: "column" }}>
            {s.rows.map((r) => <RowView key={r.watts} r={r} best={!!r.idle?.fps && r.idle.fps === bestFps} />)}
            {s.saved && <div style={{ ...small, marginTop: 4 }}>Guardado: {s.saved}</div>}
          </Focusable>
        )}
      </Card>

      <Card title="Registro (uso real, por potencia)" right={<Chip grow={false} onClick={() => void flush().then((p) => notify(p ? "Registro guardado" : "Nada nuevo que guardar"))}>Guardar</Chip>}>
        {buckets.length ? buckets.map((b) => (
          <div key={b.w} style={{ fontSize: 12, lineHeight: "17px" }}>
            <b>{b.w}</b> · abrir {n(med(b.opens))} ms ({b.opens.length}) · sección {n(med(b.switches))} ms · columna {n(med(b.columns))} ms{b.keys.length ? ` · tecla ${n(med(b.keys))} ms (máx ${Math.max(...b.keys)})` : ""}
            {b.longtasks.length ? ` · ${b.longtasks.length} bloqueos (máx ${Math.max(...b.longtasks)} ms${b.own.length ? `, nuestros ${Math.round((100 * b.own.reduce((x, y) => x + y, 0)) / Math.max(1, b.longtasks.reduce((x, y) => x + y, 0)))} %` : ""})` : ""}
            {b.shifts ? ` · ${b.shifts} saltos de pantalla` : ""}
          </div>
        )) : <div style={small}>Aún no hay datos: se anotan solos al usar el panel.</div>}
        {closes.length > 0 && (
          <>
            <Label>Últimos cierres</Label>
            {closes.map((c) => <div key={c.t} style={{ fontSize: 12 }}>{new Date(c.t).toLocaleTimeString()} · {c.d}</div>)}
          </>
        )}
        <div style={small}>Archivo: diag/perf-log.jsonl (se guarda cada 20 s y al cerrar).</div>
      </Card>

      <Card title="Amigos, chat y voz (para analizar)">
        <div style={small}>«Teclado» y «Voz» vigilan durante un rato mientras usas el panel: pulsa y ve a Social. Cada una tiene su sitio en el informe; no se pisan.</div>
        <Row>
          <Chip onClick={() => void runQ("Explorando…", (q) => q.explorar())}>Explorar</Chip>
          <Chip onClick={() => void runQ("Vigilando teclado 30 s…", (q) => q.teclado(30))}>Teclado 30 s</Chip>
          <Chip onClick={() => void runQ("Vigilando voz 45 s…", (q) => q.voz(45))}>Voz 45 s</Chip>
        </Row>
        {qrx.busy && <div style={small}>{qrx.busy}</div>}
        {qrx.saved && <div style={small}>{qrx.saved.startsWith("/") ? "Guardado en el informe." : qrx.saved}</div>}
      </Card>
      </>)}
    </>
  );
};
