import { Focusable } from "@decky/ui";
import { useEffect, useState, type FC } from "react";

import { benchState, benchSubscribe, cancelBench, pickLevels, runBench, summarize } from "./bench";
import { readTdp } from "./panelBridge";
import { COLORS, Chip, Row, cardStyle } from "./ui";

const fmt = (n: number | null, d = 0) => (n === null ? "—" : n.toFixed(d));

export const BenchView: FC<{ log: (m: string) => void; onBack: () => void }> = ({ log, onBack }) => {
  const [, tick] = useState(0);
  const [secs, setSecs] = useState(8);
  const [range, setRange] = useState<{ min: number; max: number } | null>(null);
  useEffect(() => benchSubscribe(() => tick((n) => n + 1)), []);
  useEffect(() => { readTdp().then((t) => t && setRange({ min: t.min, max: t.max })).catch((e) => log(`prueba: ${String(e)}`)); }, [log]);

  const st = benchState();
  const levels = range ? pickLevels(range.min, range.max, 5) : [];
  const rows = summarize(st.rows);
  const running = st.phase === "running";
  const best = rows.reduce<number>((b, r) => (r.perWatt !== null && r.perWatt > b ? r.perWatt : b), 0);

  return (
    <>
      <Chip onClick={onBack}>← Energía</Chip>
      <div style={{ ...cardStyle, fontSize: 12, color: COLORS.muted }}>
        Mide el rendimiento de CPU a {levels.length ? levels.join(", ") : "varios"} W (≈ {levels.length * (secs + 3)} s). Usa todos los núcleos:
        mejor con el cargador y sin juego abierto. Al terminar vuelve a tu potencia actual.
      </div>
      <Row>
        {[5, 8, 15].map((s) => <Chip key={s} active={secs === s} onClick={() => !running && setSecs(s)}>{s} s por nivel</Chip>)}
      </Row>
      {running ? (
        <Chip onClick={cancelBench}>Cancelar · {st.index}/{st.total} · {st.message}</Chip>
      ) : (
        <Chip active onClick={() => levels.length && void runBench(levels, secs, log)}>{levels.length ? "Ejecutar prueba" : "Leyendo potencia…"}</Chip>
      )}
      {rows.length > 0 && (
        <Focusable data-qr="item" style={{ ...cardStyle, gap: 4 }}>
          <div style={{ display: "flex", fontSize: 11, color: COLORS.muted }}>
            <span style={{ width: 40 }}>W</span><span style={{ width: 50 }}>Rend.</span><span style={{ width: 52 }}>pts/W</span><span style={{ width: 54 }}>Consumo</span><span>Temp</span>
          </div>
          {rows.map((r) => (
            <div key={r.watts} style={{ display: "flex", fontSize: 13, fontWeight: r.perWatt === best && best > 0 ? 700 : 500, color: r.error ? COLORS.dangerSoft : COLORS.text }}>
              <span style={{ width: 40 }}>{r.watts}</span>
              <span style={{ width: 50 }}>{r.pct === null ? "—" : `${r.pct}%`}</span>
              <span style={{ width: 52 }}>{fmt(r.perWatt)}</span>
              <span style={{ width: 54 }}>{r.powerW === null ? "—" : `${fmt(r.powerW, 1)} W`}</span>
              <span>{r.tempC === null ? "—" : `${fmt(r.tempC)}°`}</span>
            </div>
          ))}
          {!running && best > 0 && <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>Negrita = mejor eficiencia (pts/W). {st.saved ? "Guardado en la carpeta de ajustes (bench)." : ""}</div>}
        </Focusable>
      )}
      {st.phase === "error" && <div style={{ ...cardStyle, fontSize: 12, color: COLORS.dangerSoft }}>{st.message}</div>}
    </>
  );
};
