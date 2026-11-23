// Remote Play · PROTOTIPO de interfaz (sin funcionalidad): para ver cómo queda antes de conectarlo a Steam.
// Dos partes, como en Steam: «Jugar juntos» (Remote Play Together: invitar, invitados y sus permisos, enlace de
// invitado) y «Transmitir» (este equipo como origen o destino). Ningún botón llama a Steam: avisan de que es prototipo.
// Cuando se conecte: SteamClient.RemotePlay (CreateInviteAndSession, RegisterForRemoteClientStarted/Stopped,
// SetPerUserControllerInputEnabled, SetPerUserKeyboardInputEnabled, SetPerUserMouseInputEnabled, CreateGuestInvite…) [H].
import { Focusable } from "@decky/ui";
import { useState, type FC } from "react";

import type { RunningGame } from "./game";
import { Card, Label, small } from "./QamSections";
import { Avatar, useFriends } from "./QamSocial";
import { Persona } from "./social";
import { useTap } from "./tap";
import { COLORS, Chip, Icon, Row, focusRing } from "./ui";

type Perm = "mando" | "teclado" | "raton";
const PERMS: Array<{ id: Perm; label: string; icon: string }> = [
  { id: "mando", label: "Mando", icon: "M6 9h12a4 4 0 0 1 3.9 4.8l-.9 4a2.5 2.5 0 0 1-4.3 1.1L14.5 16h-5l-2.2 2.9a2.5 2.5 0 0 1-4.3-1.1l-.9-4A4 4 0 0 1 6 9z" },
  { id: "teclado", label: "Teclado", icon: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10" },
  { id: "raton", label: "Ratón", icon: "M12 3a6 6 0 0 1 6 6v6a6 6 0 0 1-12 0V9a6 6 0 0 1 6-6zM12 7v4" },
];

const ProtoBadge: FC = () => (
  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, padding: "2px 8px", borderRadius: 8, background: COLORS.track, color: COLORS.accent }}>PROTOTIPO</span>
);

/** Fila de persona con acción a la derecha (invitar / quitar). */
const PersonRow: FC<{ name: string; avatar: string | null; sub: string; action: string; onTap: () => void; dot?: string }> = ({ name, avatar, sub, action, onTap, dot }) => {
  const [f, setF] = useState(false);
  const tap = useTap(onTap);
  return (
    <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 12, ...focusRing(f) }}>
      <Avatar f={{ name, avatar }} dot={dot} size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <div style={{ ...small, fontSize: 11 }}>{sub}</div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.accent }}>{action}</span>
    </Focusable>
  );
};

/** Invitado conectado: su nombre y tres permisos (mando, teclado, ratón) como fichas con icono. */
const GuestCard: FC<{ name: string; avatar: string | null; example?: boolean; proto: () => void }> = ({ name, avatar, example, proto }) => {
  const [perms, setPerms] = useState<Record<Perm, boolean>>({ mando: true, teclado: false, raton: false });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", borderRadius: 14, boxShadow: `inset 0 0 0 1px ${COLORS.track}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar f={{ name, avatar }} dot="#57cbde" size={28} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>{name}{example ? <span style={{ ...small, fontSize: 11 }}> · ejemplo</span> : null}</div>
        <Chip grow={false} onClick={proto}>Quitar</Chip>
      </div>
      <Row gap={6}>
        {PERMS.map((p) => (
          <Chip key={p.id} icon={p.icon} active={perms[p.id]} onClick={() => setPerms({ ...perms, [p.id]: !perms[p.id] })}>{p.label}</Chip>
        ))}
      </Row>
    </div>
  );
};

export const RemotePlayView: FC<{ game: RunningGame | null; notify: (t: string) => void; onBack: () => void; onNative: () => void }> = ({ game, notify, onBack, onNative }) => {
  const friends = useFriends(5000);
  const proto = () => notify("Prototipo: este botón aún no hace nada");
  const online = friends.filter((f) => f.state !== Persona.Offline).slice(0, 3);
  const [hosting, setHosting] = useState(true);
  return (
    <>
      <Chip onClick={onBack}>← Conexiones</Chip>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>Remote Play</div>
        <ProtoBadge />
      </div>

      <Card title="Jugar juntos">
        {game ? (
          <>
            <div style={small}>Invita a amigos a <b style={{ color: COLORS.text }}>{game.name}</b>: juegan desde su equipo como si estuvieran a tu lado.</div>
            <Label>Invitados (1)</Label>
            <GuestCard name="Invitado" avatar={null} example proto={proto} />
            <Label>Invitar</Label>
            {online.length ? online.map((f) => (
              <PersonRow key={f.accountId} name={f.name} avatar={f.avatar} sub={f.gameName || "En línea"} action="Invitar" onTap={proto} dot="#57cbde" />
            )) : <div style={small}>Ningún amigo en línea ahora.</div>}
            <Row gap={8}>
              <Chip icon="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" onClick={proto}>Enlace de invitado</Chip>
              <Chip onClick={proto}>Terminar sesión</Chip>
            </Row>
          </>
        ) : (
          <div style={small}>Abre un juego compatible con «Remote Play Together» y vuelve aquí para invitar a tus amigos.</div>
        )}
      </Card>

      <Card title="Transmitir" right={<Chip grow={false} active={hosting} onClick={() => setHosting(!hosting)}>{hosting ? "Permitido" : "No permitido"}</Chip>}>
        <div style={small}>Juega a lo de este equipo desde otro (o al revés) en tu misma red.</div>
        <PersonRow name="PC del salón" avatar={null} sub="ejemplo · disponible" action="Conectar" onTap={proto} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, ...small }}>
          <Icon d="M12 3v3M12 18v3M3 12h3M18 12h3" size={14} color={COLORS.muted} /> Buscando otros equipos…
        </div>
      </Card>

      <Chip onClick={onNative}>Remote Play de Steam ›</Chip>
    </>
  );
};
