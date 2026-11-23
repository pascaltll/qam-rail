import { alpha } from "./appearance";
import { Focusable } from "@decky/ui";
import { useRef, useState, type FC, type ReactNode } from "react";

import { useTdp, type UseTdp } from "./tdpControl";
import { tiers } from "./powerTiers";
import { isActivePreset, type TdpView } from "./tdpModel";
import { COLORS, Chip, ICONS, Icon, Keep, Row, cardStyle, focusRing, useDrag } from "./ui";

const ERROR = "#ff8d8d";
const DIR_LEFT = 11;
const DIR_RIGHT = 12;
const small = { fontSize: 12, get color() { return COLORS.muted; }, lineHeight: "16px" };

const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");
const pct = (v: number, min: number, max: number) => Math.min(100, Math.max(0, ((v - min) / Math.max(1, max - min)) * 100));

/**
 * Barra de potencia. El numero es el control: izquierda/derecha del mando cambian 1 W.
 * Sobre la misma barra: zona sugerida por Panel (translucida) y marca del consumo real (blanca).
 */
export const PowerBar: FC<{
  value: number; min: number; max: number; band?: { floor: number; ceil: number } | null; drawW?: number | null;
  onChange: (w: number) => void; big?: boolean; floor?: number | null;
}> = ({ value, min, max, band, drawW, onChange, big = true, floor }) => {
  const [focused, setFocused] = useState(false);
  // Con el mando (TV, sin táctil) ir de 9 a 18 W eran 9 pulsaciones y cada una esperaba a Panel: ahora se parte del
  // último objetivo (no del valor aún sin confirmar) y, si se mantiene el ritmo, el paso sube a 2 y a 3 W.
  const run = useRef({ t: 0, n: 0, dir: 0, target: Math.round(value) });
  const nudge = (d: number) => {
    const r = run.current, now = Date.now();
    if (now - r.t > 600 || r.dir !== d) { r.n = 0; r.target = Math.round(value); }
    r.t = now; r.dir = d; r.n++;
    const step = r.n > 10 ? 3 : r.n > 5 ? 2 : 1;
    r.target = Math.min(max, Math.max(min, r.target + d * step));
    onChange(r.target);
  };
  const p = pct(value, min, max);
  const drag = useDrag(min, max, 1, onChange);
  return (
    <Focusable
      data-qr="item"
      data-qr-h="1"
      noFocusRing
      onGamepadFocus={() => setFocused(true)}
      onGamepadBlur={() => setFocused(false)}
      onGamepadDirection={(e: { detail?: { button?: number } }) => {
        const b = e.detail?.button;
        if (b === DIR_LEFT) nudge(-1);
        else if (b === DIR_RIGHT) nudge(1);
      }}
      style={{ position: "relative", height: big ? 26 : 22, borderRadius: 8, ...focusRing(focused) }}
    >
      {/* Capa de toque: arrastrar con el dedo sobre toda la barra (con margen extra arriba y abajo). */}
      <div {...drag} style={{ ...drag.style, position: "absolute", left: -6, right: -6, top: -8, bottom: -8, zIndex: 2 }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: big ? 8 : 6, height: 10, borderRadius: 5, background: COLORS.track }} />
      {typeof floor === "number" && floor > min && (
        // Zona que el equipo no aplica (por debajo de su minimo real): rayada.
        <div style={{ position: "absolute", top: big ? 8 : 6, height: 10, borderRadius: 5, left: 0, width: `${pct(floor, min, max)}%`, zIndex: 1,
          background: "repeating-linear-gradient(135deg, rgba(0,0,0,0.55) 0 3px, rgba(0,0,0,0) 3px 6px)" }} />
      )}
      {band && (
        <div style={{ position: "absolute", top: big ? 8 : 6, height: 10, borderRadius: 5, background: alpha(COLORS.accent, 0.28), left: `${pct(band.floor, min, max)}%`, width: `${Math.max(2, pct(band.ceil, min, max) - pct(band.floor, min, max))}%` }} />
      )}
      <div style={{ position: "absolute", left: 0, top: big ? 8 : 6, height: 10, borderRadius: 5, background: COLORS.accent, width: `${p}%` }} />
      {typeof drawW === "number" && drawW >= min && drawW <= max && (
        <div style={{ position: "absolute", top: big ? 3 : 1, width: 2, height: big ? 20 : 20, borderRadius: 1, background: COLORS.text, opacity: 0.7, left: `${pct(drawW, min, max)}%` }} />
      )}
      <div style={{ position: "absolute", top: big ? 2 : 1, width: 22, height: 22, marginLeft: -11, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.5)", left: `${p}%` }} />
    </Focusable>
  );
};

const Blocked: FC<{ v: TdpView; label: string }> = ({ v, label }) => (
  <div style={{ ...cardStyle, gap: 6 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ ...small, flexGrow: 1 }}>{label}</span>
      {v.status === "steam" && <span style={{ fontSize: 22, fontWeight: 700 }}>{Math.round(v.watts)} W</span>}
    </div>
    <div style={small}>{v.note}</div>
  </div>
);

/**
 * Tarjeta de potencia (TDP). variant "full" = con juego: selector Global/Este juego, zona sugerida y boton «Sugerido».
 * variant "compact" = Inicio normal. `showDraw` controla si se escribe el consumo en vivo (el Inicio de juego ya lo muestra arriba).
 */
export const PowerCard: FC<{ t: UseTdp; variant?: "full" | "compact"; showDraw?: boolean; label?: string; extra?: ReactNode; zones?: boolean; modes?: ReactNode; onForget?: () => void }> = (props) => (
  // Mientras lee Panel, guarda el alto de la vez anterior: lo de debajo no salta.
  <Keep id={`tdp-${props.variant ?? "full"}`} loading={props.t.loading}><PowerCardInner {...props} /></Keep>
);

const PowerCardInner: FC<{ t: UseTdp; variant?: "full" | "compact"; showDraw?: boolean; label?: string; extra?: ReactNode; zones?: boolean; modes?: ReactNode; onForget?: () => void }> = ({ t, variant = "full", showDraw = true, label, extra, zones, modes, onForget }) => {
  const v = t.view;
  if (t.loading) return <div style={{ ...cardStyle, ...small, flexGrow: 1 }}>Leyendo Panel de Control…</div>;
  if (t.missing || !v) return <div style={{ ...cardStyle, ...small }}>Potencia no disponible: no se pudo hablar con Panel de Control (¿está instalado y activo?).</div>;
  if (v.status !== "ok") return <Blocked v={v} label={label ?? "Potencia"} />;

  const full = variant === "full";
  const sug = full ? v.suggestion : null;
  // Con juego: siempre la de este juego. Sin juego: la de Steam (la que se usa fuera de los juegos y la que heredan los que no tienen propia).
  const title = label ?? (v.game ? "Potencia de este juego" : "Potencia en Steam");
  const presets = v.presets.slice(0, sug?.enough ? 3 : 4);
  const caption = sug?.enough ? `Zona sugerida ${sug.floor}–${sug.ceil} W` : null;
  const detail = [
    v.appliedW !== null && Math.abs(v.appliedW - v.watts) >= 0.5 ? `Aplicado ${fmt(v.appliedW)} W` : null,
    showDraw && t.drawW !== null ? `En uso ${fmt(t.drawW)} W` : null,
    v.onAc ? "Con cargador" : null,
  ].filter(Boolean).join(" · ");
  const note = t.error ?? v.hint;

  return (
    <div style={{ ...cardStyle, gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon d={ICONS.bolt} size={16} color={COLORS.muted} />
        <span style={{ ...small, fontSize: 13, flexGrow: 1 }}>{title}</span>
        <span style={{ fontSize: full ? 26 : 22, fontWeight: 700, letterSpacing: -0.5, minWidth: 58, textAlign: "right" }}>{Math.round(v.watts)} W</span>
      </div>
      <PowerBar value={v.watts} min={v.min} max={v.max} onChange={t.setWatts}
        band={sug?.enough && sug.floor !== null && sug.ceil !== null ? { floor: sug.floor, ceil: sug.ceil } : null} drawW={t.drawW} big={full} floor={v.floor} />
      {zones && <MenuZones min={v.min} max={v.max} />}
      <div style={{ display: "flex", ...small, fontSize: 11 }}>
        <span style={{ width: 40 }}>{v.min} W</span>
        <span style={{ flex: 1, textAlign: "center" }}>{caption ?? (v.onAc ? "Con cargador: hasta " + v.max + " W" : "")}</span>
        <span style={{ width: 40, textAlign: "right" }}>{v.max} W</span>
      </div>
      <Row gap={6}>
        {sug?.enough && sug.seed !== null && (
          <Chip compact active={Math.abs(sug.seed - v.watts) < 0.5} onClick={() => t.setWatts(sug.seed as number)}>Sugerido {sug.seed} W</Chip>
        )}
        {presets.map((p) => (
          <Chip compact key={p.id} active={isActivePreset(p, v.watts)} onClick={() => t.applyPreset(p)}>{p.label} {p.watts}</Chip>
        ))}
      </Row>
      {/* Siempre con su hueco: cuando llegaba «En uso … W» empujaba lo de abajo (saltos medidos en Inicio). */}
      <div style={{ ...small, minHeight: 16, color: t.error ? ERROR : COLORS.muted }}>{note ?? detail}{note && detail ? ` · ${detail}` : ""}</div>
      {modes}
      {full && sug && <LearnRow sug={sug} onForget={onForget} />}
      {extra}
    </div>
  );
};

/** Lo que Panel ha aprendido de este juego: una fila con barra de progreso (antes, una frase suelta que desentonaba). */
const LearnRow: FC<{ sug: NonNullable<TdpView["suggestion"]>; onForget?: () => void }> = ({ sug, onForget }) => {
  const [ask, setAsk] = useState(false);
  const done = sug.enough;
  const p = done ? 100 : Math.min(100, ((sug.minutes ?? 0) / Math.max(1, sug.target ?? 30)) * 100);
  const known = done || sug.learning;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 32 }}>
      <Icon d={done ? "M5 12l5 5 9-10" : "M4 20V10M10 20V4M16 20v-8"} size={16} color={done ? COLORS.ok : COLORS.muted} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...small, fontSize: 12, color: COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {done ? `Aprendido · zona ${sug.floor}–${sug.ceil} W` : sug.learning ? "Aprendiendo este juego" : "Se aprende jugando"}
        </div>
        {sug.learning && !done && (
          <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: COLORS.track, overflow: "hidden" }}>
            <div style={{ width: `${p}%`, height: "100%", background: COLORS.accent }} />
          </div>
        )}
      </div>
      {sug.learning && !done && <span style={{ ...small, fontSize: 11, whiteSpace: "nowrap" }}>{sug.minutes ?? 0}/{sug.target ?? 30} min</span>}
      {onForget && known && (
        <Chip compact grow={false} onClick={() => { if (!ask) { setAsk(true); window.setTimeout(() => setAsk(false), 4000); return; } setAsk(false); onForget(); }}>{ask ? "¿Seguro?" : "Olvidar"}</Chip>
      )}
    </div>
  );
};

/**
 * Debajo de la barra de potencia: por dónde va el panel (ámbar = modo ahorro, verde = fluido). Antes era una segunda
 * barra en su propia tarjeta («Potencia del menú»): dos barras de vatios en la misma pantalla confundían.
 */
const MenuZones: FC<{ min: number; max: number }> = ({ min, max }) => {
  const tz = tiers();
  const pct = (x: number) => `${Math.max(0, Math.min(100, ((x - min) / Math.max(1, max - min)) * 100))}%`;
  return (
    <div title="Panel: ahorro / fluido" style={{ position: "relative", height: 4, borderRadius: 2, background: COLORS.track, overflow: "hidden", marginTop: -2 }}>
      <div style={{ position: "absolute", left: 0, width: pct(tz.ecoW + 0.5), top: 0, bottom: 0, background: COLORS.warn }} />
      <div style={{ position: "absolute", left: pct(tz.fluidW - 0.5), right: 0, top: 0, bottom: 0, background: COLORS.ok }} />
    </div>
  );
};

/** Energía: una sola tarjeta de potencia (barra, zonas del panel, modos, lo aprendido y el ahorro del panel dentro). */
export const EnergyTdp: FC<{ log: (m: string) => void; modes?: ReactNode; saver?: ReactNode; kind?: (t: UseTdp) => ReactNode }> = ({ log, modes, saver, kind }) => {
  const t = useTdp(log, { liveMs: 3000 });
  return (
    <>
      {kind?.(t)}
      <PowerCard t={t} variant="full" zones modes={modes} extra={saver} onForget={() => t.forgetLearned()} />
    </>
  );
};
