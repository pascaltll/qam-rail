// Tarjeta «Sonido» (abajo en Pantalla y sonido): el micrófono, la salida solo si hay de verdad para elegir, y el
// enlace a lo avanzado de Panel de Control. Los altavoces se ofrecen por su FILTRO del sistema (ecualizador y
// limitador de Bazzite), nunca la tarjeta en crudo: 0.34 la ofrecía y sonaba más fuerte y raro.
import { tickEvery } from "./ticker";
import { useEffect, useRef, useState, type FC } from "react";
import { sc } from "./steam";

import { audioMute, audioReset, audioSetDefault, audioState, audioVolume, boostNote, boostPct, shortName, sortOutputs, type AudioNode, type AudioState } from "./audio";
import { crumb } from "./crumbs";
import { small } from "./QamSections";
import { Chip, ICONS2, Icon, Segments, ToggleRow, XSlider, COLORS } from "./ui";
import { autoTvOn, setAutoTv } from "./audioTv";
import { useVisible } from "./visible";

const ICON: Record<AudioNode["tipo"], string> = { altavoz: ICONS2.speaker, auriculares: ICONS2.headphones, hdmi: ICONS2.hdmi, micro: ICONS2.mic };

/** Controles del sistema (sin tarjeta propia): van DENTRO de la tarjeta «Sonido», debajo del ecualizador de Panel. */
export const AudioControls: FC<{ notify: (t: string) => void }> = ({ notify }) => {
  const [st, setSt] = useState<AudioState | null>(null);
  const visible = useVisible();
  const [tvAuto, setTvAuto] = useState(autoTvOn);
  const hold = useRef(0);
  const load = () => { if (Date.now() < hold.current) return; void audioState(false).then(setSt, () => setSt({ ok: false, error: "sin respuesta" })); };
  useEffect(() => {
    if (!visible) return undefined;
    load();
    const id = tickEvery(load, 20_000); // 0.49.4: antes 6 s (cada lectura lanza 5 procesos contra PipeWire)
    return () => id();
  }, [visible]);
  // Zip 14‑11: tras mover la barra el micro seguía «19 % · silenciado»: algo (Steam) lo devuelve a su sitio. Se manda
  // también por Steam [H: SetDeviceVolume(id, 0, v) = entrada] y a los 1,5 s se comprueba; si no quedó, se dice.
  const steamMic = (v: number) => {
    try {
      const a = sc().System?.Audio;
      void Promise.resolve(a?.GetDevices?.()).then((i) => {
        const d = i?.vecDevices.find((x) => x.bIsDefaultInputDevice) ?? i?.vecDevices.find((x) => x.bHasInput);
        if (d) (a?.SetDeviceVolume as ((id: number, ch: number, v: number) => unknown) | undefined)?.(d.id, 0, v);
        crumb(`audio: micro por Steam ${d ? `id ${d.id} → ${Math.round(v * 100)} %` : "sin dispositivo de entrada"}`);
      }, () => null);
    } catch { /* sin API */ }
  };
  const checking = useRef(0);
  const checkMic = (id: number, want: number | null, wantMuted: boolean) => {
    window.clearTimeout(checking.current);
    checking.current = window.setTimeout(() => {
      void audioState(false).then((s2) => {
        setSt(s2);
        const m = s2.entradas?.find((e) => e.id === id) ?? s2.entradas?.[0];
        if (!m) return;
        const got = Math.round((m.volumen ?? 0) * 100);
        const bad = m.silenciado !== wantMuted || (want !== null && Math.abs(got - want) > 6);
        crumb(`audio: micro pedido ${want ?? "—"} %${wantMuted ? " silenciado" : ""} → quedó ${got} %${m.silenciado ? " silenciado" : ""}`);
        if (bad) notify("El sistema devolvió el micrófono a como estaba. Se cambia en Ajustes de Steam › Audio.");
      }, () => null);
    }, 1500);
  };
  const outs = sortOutputs(st?.salidas ?? []);
  const mic = (st?.entradas ?? []).find((x) => x.activa) ?? st?.entradas?.[0] ?? null;
  // Refuerzo: en la salida activa que no sean auriculares (el Bluetooth lleva su volumen propio y se oye de cerca).
  const boostTarget = outs.find((n) => n.activa && n.tipo !== "auriculares" && n.tipo !== "micro") ?? null;
  const pick = (n: AudioNode) => {
    if (n.activa) return;
    crumb(`audio: salida ${shortName(n)}${n.filtro ? " (filtro)" : ""}`);
    setSt((s) => (s ? { ...s, salidas: s.salidas?.map((x) => ({ ...x, activa: x.id === n.id })) } : s));
    hold.current = Date.now() + 4500; // Panel tarda unos segundos en llevar su ecualizador al dispositivo nuevo: no se pinta lo intermedio
    void audioSetDefault(n.id).then((r) => {
      notify(r.ok ? `Sonido por ${shortName(n)}` : "No se pudo cambiar la salida");
      window.setTimeout(() => { hold.current = 0; load(); }, 4600);
    });
  };
  return (
    <>
      {st?.crudo_activo && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, background: "rgba(232,176,75,0.15)" }}>
          <Icon d={ICONS2.speaker} size={18} color={COLORS.warn} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>Los altavoces suenan sin su ecualizador (lo cambió QAM Rail 0.34).</div>
          <Chip grow={false} onClick={() => { crumb("audio: restaurar salida del sistema"); void audioReset().then((r) => { notify(r.ok ? "Sonido restaurado" : "No se pudo restaurar"); load(); }); }}>Restaurar</Chip>
        </div>
      )}
      {outs.length >= 2 && (
        <>
          <div style={{ ...small, fontSize: 11, fontWeight: 700 }}>Suena por</div>
          <Segments tall opts={outs.slice(0, 4).map((n) => ({ value: n.id, label: shortName(n), icon: ICON[n.tipo] }))} value={outs.find((n) => n.activa)?.id ?? null}
            onPick={(id: number) => { const n = outs.find((x) => x.id === id); if (n) pick(n); }} />
          {st?.eq?.por_defecto && <div style={{ ...small, fontSize: 11 }}>Pasa por el ecualizador de Panel de Control{st.eq.leido ? "" : " (destino supuesto)"}.</div>}
          {!outs.some((n) => n.activa) && (
            <Chip grow={false} onClick={() => { crumb("audio: restaurar salida del sistema"); void audioReset().then((r) => { notify(r.ok ? "Sonido restaurado" : "No se pudo restaurar"); load(); }); }}>Restaurar el sonido del sistema</Chip>
          )}
          {outs.some((n) => n.tipo === "hdmi") && (
            <ToggleRow icon={ICONS2.hdmi} label="Pasar a la TV al conectarla" on={tvAuto} note={tvAuto ? "El sonido cambia solo a la TV" : "Lo eliges tú"}
              onToggle={() => { setAutoTv(!tvAuto); setTvAuto(!tvAuto); }} />
          )}
        </>
      )}
      {boostTarget && (
        <BoostRow node={boostTarget} viaEq={!!st?.eq} notify={notify}
          onChange={(pct) => {
            crumb(`audio: refuerzo ${pct} % en ${shortName(boostTarget)}`);
            if (boostTarget.silenciado) void audioMute(boostTarget.id, false);
            void audioVolume(boostTarget.id, pct / 100).then((r) => { if (!r.ok) notify("No se pudo cambiar el volumen"); });
          }} />
      )}
      {mic && (
        <MicRow mic={mic}
          onMute={() => {
            const on = !mic.silenciado;
            crumb(`audio: micrófono ${on ? "silenciado" : "activo"}`);
            setSt((x) => (x ? { ...x, entradas: x.entradas?.map((e) => (e.id === mic.id ? { ...e, silenciado: on } : e)) } : x));
            void audioMute(mic.id, on).then(load);
            if (!on) checkMic(mic.id, null, false);
          }}
          onVolume={(v) => {
            // Mover la barra con el micro silenciado no hacía nada visible (zip 13‑11: 19 % y silenciado): ahora lo activa.
            if (mic.silenciado && v > 0) {
              setSt((x) => (x ? { ...x, entradas: x.entradas?.map((e) => (e.id === mic.id ? { ...e, silenciado: false } : e)) } : x));
              void audioMute(mic.id, false);
            }
            void audioVolume(mic.id, v / 100).then((r) => { if (!r.ok) notify("No se pudo cambiar el micrófono"); });
            steamMic(v / 100);
            checkMic(mic.id, v, false);
          }} />
      )}
      {st && !st.ok && <div style={small}>No se pudo leer el sonido del sistema.</div>}
    </>
  );
};

/** Micrófono: interruptor de silencio y una barra a todo el ancho (misma pieza que el resto de barras: alcanzable con la cruceta). */
const MicRow: FC<{ mic: AudioNode; onMute: () => void; onVolume: (v: number) => void }> = ({ mic, onMute, onVolume }) => {
  const [vol, setVol] = useState(Math.round((mic.volumen ?? 1) * 100));
  const dragging = useRef(0);
  useEffect(() => { if (Date.now() > dragging.current) setVol(Math.round((mic.volumen ?? 1) * 100)); }, [mic.volumen]);
  const change = (v: number) => { dragging.current = Date.now() + 1500; setVol(v); onVolume(v); };
  return (
    <>
      <ToggleRow icon={mic.silenciado ? ICONS2.micOff : ICONS2.mic} label="Micrófono" on={!mic.silenciado} note={mic.silenciado ? "Silenciado" : "Activo"} onToggle={onMute} />
      <XSlider label="Volumen del micrófono" icon={ICONS2.mic} value={vol} min={0} max={150} step={5} suffix=" %" onChange={change} />
    </>
  );
};

/** Refuerzo de volumen (100–200 %): sube el nivel del dispositivo por encima de lo normal, útil cuando el ecualizador de
 *  Panel de Control deja el sonido bajo. Con el EQ delante, la barra de Steam mueve el EQ y esta el dispositivo real:
 *  son independientes. Sin EQ, mover el volumen de Steam puede volver a dejarlo en 100 %. */
const BoostRow: FC<{ node: AudioNode; viaEq: boolean; notify: (t: string) => void; onChange: (pct: number) => void }> = ({ node, viaEq, onChange }) => {
  const [pct, setPct] = useState(boostPct(node.volumen));
  const dragging = useRef(0);
  useEffect(() => { if (Date.now() > dragging.current) setPct(boostPct(node.volumen)); }, [node.volumen, node.id]);
  const change = (v: number) => { dragging.current = Date.now() + 1500; setPct(v); onChange(v); };
  return (
    <>
      <XSlider label="Refuerzo de volumen" icon={ICONS2.speaker} value={pct} min={100} max={200} step={10} suffix=" %" onChange={change} />
      <div style={{ ...small, fontSize: 11, color: pct > 160 ? COLORS.warn : undefined }}>
        {boostNote(pct)}{pct > 100 && !viaEq ? " · si cambias el volumen de Steam puede volver a 100 %" : ""}
      </div>
    </>
  );
};
