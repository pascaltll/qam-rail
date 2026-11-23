// Conexiones › Bluetooth y Wi‑Fi con listas reales (antes solo habia el interruptor).
import { tickEvery } from "./ticker";
import { Focusable, Navigation } from "@decky/ui";
import { useEffect, useState, type FC, type ReactNode } from "react";

import { crumb } from "./crumbs";
import { wifiLevel, bzDo, bzKind, bzRefresh, bzSnapshot, bzSubscribe, knownNets, sortBz, wfConnect, wfConnectingTo, wfRadio, wfRefresh, wfSnapshot, wfSubscribe, type BzDevice, type BzState, type WifiState } from "./network";
import { Card, small } from "./QamSections";
import { useTap } from "./tap";
import { useVisible } from "./visible";
import { COLORS, Icon, focusRing } from "./ui";

/** «Conectando…» con puntos animados (solo mientras dura). */
const Connecting: FC<{ what: string }> = ({ what }) => {
  const [n, setN] = useState(1);
  useEffect(() => { const id = tickEvery(() => setN((x) => (x % 3) + 1), 400, { exact: true }); return () => id(); }, []);
  return <span style={{ color: COLORS.accent }}>{what}{".".repeat(n)}</span>;
};

// Iconos dibujados (antes emojis y barras de texto, que cambiaban de tamaño según la fuente).
const KIND_PATH: Record<string, string> = {
  headset: "M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2zM20 15a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2zM17 20c0 1-2 2-4 2",
  headphones: "M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2zM20 15a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z",
  speaker: "M6 3h12v18H6zM12 13a3 3 0 1 0 0 .01M12 7h.01",
  gamepad: "M6 9h12a4 4 0 0 1 3.9 4.8l-.9 4a2.5 2.5 0 0 1-4.3 1.1L14.5 16h-5l-2.2 2.9a2.5 2.5 0 0 1-4.3-1.1l-.9-4A4 4 0 0 1 6 9zM8 12v3M6.5 13.5h3M16 13h.01M18 14.5h.01",
  keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
  mouse: "M12 3a6 6 0 0 1 6 6v6a6 6 0 0 1-12 0V9a6 6 0 0 1 6-6zM12 7v4",
  phone: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  laptop: "M4 5h16v11H4zM2 19h20",
  bluetooth: "M7 7l10 10-5 4V3l5 4L7 17",
};
export const KindIcon: FC<{ kind: string; on?: boolean }> = ({ kind, on }) => (
  <span style={{ width: 30, height: 30, borderRadius: 15, background: on ? COLORS.accent : COLORS.track, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
    <Icon d={KIND_PATH[kind] ?? KIND_PATH.bluetooth} size={17} color={on ? COLORS.onAccent : COLORS.text} />
  </span>
);

/** Abanico de Wi‑Fi con 4 niveles (los arcos sin señal en gris) y candado si la red pide contraseña. */
export const WifiIcon: FC<{ level: number; secure?: boolean; on?: boolean }> = ({ level, secure, on }) => {
  const c = (i: number) => (i <= level ? (on ? COLORS.onAccent : COLORS.text) : on ? "rgba(255,255,255,0.35)" : COLORS.muted);
  return (
    <span style={{ position: "relative", width: 30, height: 30, borderRadius: 15, background: on ? COLORS.accent : COLORS.track, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="12" cy="19" r="1.4" fill={c(1)} stroke="none" />
        <path d="M8.5 15.5a5 5 0 0 1 7 0" stroke={c(2)} />
        <path d="M5.5 12.5a9.2 9.2 0 0 1 13 0" stroke={c(3)} />
        <path d="M2.5 9.3a13.5 13.5 0 0 1 19 0" stroke={c(4)} />
      </svg>
      {secure && (
        <svg width="10" height="10" viewBox="0 0 24 24" style={{ position: "absolute", right: 1, bottom: 1 }} fill={on ? COLORS.onAccent : COLORS.text}>
          <path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z" />
        </svg>
      )}
    </span>
  );
};

const DevRow: FC<{ icon: ReactNode; name: string; sub: ReactNode; action?: string; busy?: boolean; onTap?: () => void; on?: boolean }> = ({ icon, name, sub, action, busy, onTap, on }) => {
  const [f, setF] = useState(false);
  return (
    <Focusable data-qr="item" noFocusRing onActivate={onTap} onClick={onTap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderRadius: 12, background: on ? COLORS.track : "transparent", ...focusRing(f) }}>
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <div style={{ ...small, fontSize: 11 }}>{sub}</div>
      </div>
      {action && <span style={{ fontSize: 12, fontWeight: 700, color: busy ? COLORS.muted : COLORS.accent }}>{busy ? "…" : action}</span>}
    </Focusable>
  );
};

/** Interruptor de cabecera de tarjeta (Wi‑Fi / Bluetooth): se ve el cambio al instante. */
const HeadSwitch: FC<{ on: boolean; label: string; onToggle: () => void }> = ({ on, label, onToggle }) => {
  const [f, setF] = useState(false);
  const tap = useTap(onToggle);
  return (
    <Focusable data-qr="item" noFocusRing role="switch" aria-checked={on} title={label} onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 2px 2px 8px", borderRadius: 16, ...focusRing(f) }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: on ? COLORS.text : COLORS.muted }}>{on ? "Encendido" : "Apagado"}</span>
      <span style={{ width: 40, height: 24, borderRadius: 12, background: on ? COLORS.accent : COLORS.track, position: "relative", flexShrink: 0 }}>
        <span style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 18, height: 18, borderRadius: 9, background: on ? COLORS.onAccent : COLORS.muted, transition: "left 120ms ease" }} />
      </span>
    </Focusable>
  );
};

/**
 * Bluetooth: lo de cada día. Encender/apagar y conectar lo YA emparejado (audio primero). Emparejar algo nuevo es
 * raro: se hace en los ajustes de Steam. Sin búsqueda ni lista de «cerca» (era lo que más tardaba).
 */
export const BluetoothCard: FC<{ notify: (t: string) => void }> = ({ notify }) => {
  const [st, setSt] = useState<BzState | null>(bzSnapshot());
  const [busy, setBusy] = useState<string | null>(null);
  const visible = useVisible();
  useEffect(() => bzSubscribe(() => setSt(bzSnapshot())), []);
  useEffect(() => {
    if (!visible) return undefined;
    void bzRefresh();
    const id = tickEvery(() => void bzRefresh(), 8000, { name: "bluetooth" });
    return () => id();
  }, [visible]);
  const groups = sortBz(st?.devices ?? []);
  const known = [...groups.connected, ...groups.paired].slice(0, Math.max(4, groups.connected.length));
  const act = (d: BzDevice, what: "connect" | "disconnect") => {
    if (busy) return;
    setBusy(d.mac);
    crumb(`bluetooth ${what}: ${d.name}`);
    void bzDo(what, d.mac).then((r) => {
      notify(r.ok ? (what === "disconnect" ? `${d.name} desconectado` : `${d.name} conectado`) : `No se pudo con ${d.name}${/not available|NotAvailable|br-connection/i.test(r.detail) ? " (¿está encendido y cerca?)" : ""}`);
      setBusy(null);
    });
  };
  const on = !!st?.ok && !!st.powered;
  return (
    <Card title="Bluetooth" help="bluetooth" right={st?.ok ? <HeadSwitch on={on} label="Bluetooth" onToggle={() => { crumb(`bluetooth ${on ? "apagar" : "encender"}`); void bzDo(on ? "power-off" : "power-on").then((r) => { if (!r.ok) notify("No se pudo cambiar el Bluetooth"); }); }} /> : undefined}>
      {!st ? <div style={small}>Leyendo…</div> : !st.ok ? <div style={small}>No se pudo leer el Bluetooth: {st.error}</div> : !on ? null : (
        <>
          {known.map((d) => (
            <DevRow key={d.mac} icon={<KindIcon kind={bzKind(d.icon).icon} on={d.connected} />} name={d.name}
              sub={busy === d.mac ? <Connecting what={d.connected ? "Desconectando" : "Conectando"} /> : `${bzKind(d.icon).label}${d.connected ? " · conectado" : ""}`} on={d.connected}
              action={d.connected ? "Desconectar" : "Conectar"} busy={busy === d.mac} onTap={() => act(d, d.connected ? "disconnect" : "connect")} />
          ))}
          {!known.length && <div style={small}>Sin dispositivos emparejados.</div>}
        </>
      )}
      <SmallLink label="Emparejar otro" onTap={() => { try { Navigation.Navigate("/settings/bluetooth"); } catch { notify("No se pudo abrir Ajustes"); } }} />
    </Card>
  );
};

/**
 * Wi‑Fi: encender/apagar y pasar a una red ya guardada. Una red nueva (contraseña) se añade en los ajustes de Steam.
 * Estado compartido con la ficha rápida de Inicio; el cambio se ve al tocar.
 */
export const WifiCard: FC<{ notify: (t: string) => void }> = ({ notify }) => {
  const [st, setSt] = useState<WifiState | null>(wfSnapshot());
  const [, bump] = useState(0);
  const visible = useVisible();
  useEffect(() => wfSubscribe(() => { setSt(wfSnapshot()); bump((n) => n + 1); }), []);
  useEffect(() => {
    if (!visible) return undefined;
    void wfRefresh();
    const id = tickEvery(() => void wfRefresh(), 10_000, { name: "wifi" });
    return () => id();
  }, [visible]);
  const on = !!st?.ok && !!st.radio;
  const nets = knownNets(st);
  const connecting = wfConnectingTo();
  return (
    <Card title="Wi‑Fi" help="wifi" right={st?.ok ? <HeadSwitch on={on} label="Wi‑Fi" onToggle={() => { crumb(`wifi ${on ? "apagar" : "encender"}`); void wfRadio(!on).then((ok) => { if (!ok) notify("No se pudo cambiar el Wi‑Fi"); }); }} /> : undefined}>
      {!st ? <div style={small}>Leyendo…</div> : !st.ok ? <div style={small}>No se pudo leer el Wi‑Fi: {st.error}</div> : !on ? null : (
        <>
          {nets.map((n) => (
            <DevRow key={n.ssid} icon={<WifiIcon level={wifiLevel(n.signal)} secure={!!n.security} on={n.active} />} name={n.ssid} on={n.active}
              sub={connecting === n.ssid ? <Connecting what="Conectando" /> : `${n.active ? "conectada" : "guardada"} · ${n.signal} %`}
              action={n.active ? undefined : "Conectar"} busy={connecting === n.ssid}
              onTap={() => {
                if (n.active || connecting) return;
                crumb(`wifi conectar: ${n.ssid}`);
                void wfConnect(n.ssid).then((r) => notify(r.ok ? `Conectado a ${n.ssid}` : `No se pudo: ${r.detail.slice(0, 60)}`));
              }} />
          ))}
          {!nets.length && <div style={small}>Ninguna red guardada a la vista.</div>}
        </>
      )}
      <SmallLink label="Otras redes" onTap={() => { try { Navigation.Navigate("/settings/internet"); } catch { notify("No se pudo abrir Ajustes"); } }} />
    </Card>
  );
};

/** Enlace discreto al pie de una tarjeta («Otras redes ›»). */
const SmallLink: FC<{ label: string; onTap: () => void }> = ({ label, onTap }) => {
  const [f, setF] = useState(false);
  const tap = useTap(onTap);
  return (
    <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      style={{ alignSelf: "flex-start", fontSize: 12, fontWeight: 700, color: COLORS.accent, padding: "6px 8px", margin: "0 -8px", borderRadius: 10, minHeight: 28, display: "flex", alignItems: "center", ...focusRing(f) }}>
      {label} ›
    </Focusable>
  );
};
