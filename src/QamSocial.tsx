// Seccion «Social»: amigos, chats, grupos y jugar juntos. El panel muestra LISTAS (para elegir rapido con la cruceta);
// lo que necesita espacio (una conversacion, un grupo con sus salas de voz) se abre en la columna ancha de la izquierda.
// Con una llamada activa, la barra de voz queda fija arriba en todas las secciones.
import { tickEvery } from "./ticker";
import { DialogButton, Focusable, TextField } from "@decky/ui";
import { memo, useEffect, useRef, useState, type CSSProperties, type FC, type ReactNode } from "react";

import type { RunningGame } from "./game";
import { useVisible } from "./visible";
import { isOnlyMedia, renderBB } from "./bbcode";
import { dismissKeyboard } from "./keyboard";
import { SideColumn } from "./PluginColumn";
import { Card, Label, Shortcut, small } from "./QamSections";
import {
  friendsCached, friendsSig, invalidateFriends, msgsSig, readFriendById, unreadCount, voiceBusy, activateRoom, deactivateRoom, roomMessages, sendRoom,
  Persona, QUICK_REPLIES, activate, chatIsOpen, chatOpened, deactivate, groupFriends, isTyping, joinVoice, me, typing as sendTyping, messages, readGroups, recentChats, send, setMyState,
  stateColor, statusText, together, unreadTotal, voice, voiceState, type Friend, type Group,
} from "./social";
import { nextPaint, record } from "./perfLog";
import { useTap } from "./tap";
import { COLORS, Chip, ICONS2, Icon, Row, cardStyle, colorFor, focusRing } from "./ui";

/** Amigos y grupos en vivo (cada 2 s mientras se ve algo social). */
export function useFriends(ms = 2000): Friend[] {
  const [list, setList] = useState<Friend[]>(() => friendsCached(ms));
  const sig = useRef(friendsSig(list));
  const visible = useVisible();
  useEffect(() => {
    if (!visible) return undefined;
    // Solo se repinta si algo cambio (estado, juego, no leidos, ultimo mensaje, voz).
    const tick = () => { if (chatIsOpen()) return; const l = friendsCached(ms - 100); const s2 = friendsSig(l); if (s2 !== sig.current) { sig.current = s2; setList(l); } };
    tick();
    const id = tickEvery(tick, ms);
    return () => id();
  }, [ms, visible]);
  return list;
}

/** Solo el total de no leidos (globo del icono Social del riel). Sondeo mas lento. */
export function useUnread(ms = 4000): number {
  const [n, setN] = useState(() => unreadCount());
  useEffect(() => { const id = tickEvery(() => { if (!chatIsOpen()) setN(unreadCount()); }, ms); return () => id(); }, [ms]);
  return n;
}

export const Avatar: FC<{ f: { name: string; avatar: string | null }; dot?: string; size?: number; status?: Friend }> = ({ f, dot, size = 34, status }) => (
  <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", background: colorFor(f.name), display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.42 }}>
      {f.avatar ? <img src={f.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : f.name.slice(0, 1).toUpperCase()}
    </div>
    {status ? <StatusBadge f={status} size={size >= 30 ? 13 : 10} /> : dot && <span style={{ position: "absolute", right: -1, bottom: -1, width: 11, height: 11, borderRadius: "50%", background: dot, border: `2px solid ${COLORS.card}` }} />}
  </div>
);

const Badge: FC<{ n: number }> = ({ n }) => (n > 0 ? (
  <span style={{ minWidth: 20, height: 20, padding: "0 6px", boxSizing: "border-box", borderRadius: 10, background: COLORS.accent, color: COLORS.onAccent, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{n > 99 ? "99+" : n}</span>
) : null);

const FriendRow: FC<{ f: Friend; sub?: string; right?: ReactNode; onOpen: () => void }> = ({ f, sub, right, onOpen }) => {
  const tap = useTap(onOpen);
  const [fc, setFc] = useState(false);
  return (
    <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setFc(true)} onGamepadBlur={() => setFc(false)}
      style={{ ...cardStyle, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, padding: "6px 12px", ...focusRing(fc) }}>
      <Avatar f={f} status={f} />
      <div style={{ minWidth: 0, flexGrow: 1 }}>
        <div style={{ fontSize: 14, fontWeight: f.unread ? 700 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
        <div style={{ ...small, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: f.appid ? "#a8d672" : COLORS.muted }}>{sub ?? statusText(f)}</div>
      </div>
      {f.voice && <Icon d={PHONE} size={16} color={COLORS.okSoft} />}
      <Badge n={f.unread} />
      {right}
    </Focusable>
  );
};

const PHONE = "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2";
// Mi estado: punto de color + icono + texto (antes una ficha que cambiaba de texto al tocarla, sin pista de qué era).
export const STATES: Array<{ s: Persona; label: string; note: string; color: string; icon: string }> = [
  { s: Persona.Online, label: "En línea", note: "tus amigos te ven conectado", color: COLORS.info, icon: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" },
  { s: Persona.Away, label: "Ausente", note: "conectado, pero no estás", color: COLORS.warn, icon: "M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z" },
  { s: Persona.Invisible, label: "Invisible", note: "te ven desconectado; tú lo ves todo", color: "#8b929a", icon: "M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6a12 12 0 0 1-3 3.6M6.6 6.6C4.6 7.9 3.2 9.8 2.5 12c1 2 4.5 6 9.5 6 1.6 0 3-.4 4.3-1" },
];
export const stateInfo = (p: Persona) => STATES.find((x) => x.s === p) ?? STATES[0];

const TAB_ICON = {
  friends: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M17 11a3 3 0 1 0 0-6M19 14a5 5 0 0 1 3 5v2",
  chats: "M4 5h16v11H8l-4 4zM8 9h8M8 12h5",
  groups: "M12 3l8 4v6c0 4-3.5 7-8 8-4.5-1-8-4-8-8V7zM9 12l2 2 4-4",
  together: "M6 9h12a4 4 0 0 1 3.9 4.8l-.9 4a2.5 2.5 0 0 1-4.3 1.1L14.5 16h-5l-2.2 2.9a2.5 2.5 0 0 1-4.3-1.1l-.9-4A4 4 0 0 1 6 9z",
};

/** Insignia de estado en la esquina del avatar: jugando (mando), en línea (punto), ausente (luna), fuera (aro). */
export const StatusBadge: FC<{ f: Friend; size?: number }> = ({ f, size = 14 }) => {
  const playing = !!f.appid;
  const off = f.state === Persona.Offline || f.state === Persona.Invisible;
  const away = !playing && !off && f.state !== Persona.Online;
  const color = stateColor(f);
  const base: CSSProperties = { position: "absolute", right: -2, bottom: -2, width: size, height: size, borderRadius: size / 2, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${COLORS.card}`, boxSizing: "content-box" };
  if (off) return <span style={{ ...base, background: COLORS.card, boxShadow: `inset 0 0 0 2px ${color}` }} />;
  return (
    <span style={{ ...base, background: color }}>
      {playing && <Icon d="M8 12h3M9.5 10.5v3M14.5 12h.01M16.5 12h.01" size={size - 3} color="#10161c" />}
      {away && <Icon d="M17 13.5A6 6 0 1 1 10.5 7a4.5 4.5 0 0 0 6.5 6.5z" size={size - 3} color="#10161c" />}
    </span>
  );
};

const StatusDot: FC<{ color: string; size?: number }> = ({ color, size = 10 }) => (
  <span style={{ width: size, height: size, borderRadius: size / 2, background: color, flexShrink: 0, boxShadow: `0 0 0 2px ${COLORS.card}` }} />
);

/** Ficha de mi estado y, al tocarla, las opciones con su explicación (una por fila: fácil con la cruceta). */
const StatusPicker: FC<{ value: Persona; open: boolean; onToggle: () => void }> = ({ value, open, onToggle }) => {
  const cur = stateInfo(value);
  const [f, setF] = useState(false);
  const tap = useTap(onToggle);
  return (
    <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      onOKActionDescription={open ? "Cerrar" : "Cambiar estado"}
      style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", minHeight: 40, boxSizing: "border-box", margin: "-7px 0", borderRadius: 16, background: COLORS.track, flexShrink: 0, ...focusRing(f) }}>
      <StatusDot color={cur.color} />
      <span style={{ fontSize: 12, fontWeight: 700 }}>{cur.label}</span>
      <Icon d={open ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} size={14} color={COLORS.muted} />
    </Focusable>
  );
};

const StatusOption: FC<{ st: (typeof STATES)[number]; on: boolean; onPick: () => void }> = ({ st, on, onPick }) => {
  const [f, setF] = useState(false);
  const tap = useTap(onPick);
  return (
    <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 12, background: on ? COLORS.track : "transparent", ...focusRing(f) }}>
      <span style={{ width: 28, height: 28, borderRadius: 14, background: `${st.color}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon d={st.icon} size={16} color={st.color} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{st.label}</div>
        <div style={{ ...small, fontSize: 11 }}>{st.note}</div>
      </div>
      {on && <Icon d="M5 12l5 5 9-10" size={16} color={COLORS.accent} />}
    </Focusable>
  );
};

type Tab = "friends" | "chats" | "groups" | "together" | "notices";

/**
 * Lista principal. `onOpenFriend` abre la conversacion en la columna; `onOpenGroup` el grupo.
 * Pestañas: Amigos · Chats · Grupos · Jugar juntos (esta solo con un juego abierto).
 */
export const SocialSection: FC<{
  game: RunningGame | null; notify: (t: string) => void; onOpenFriend: (id: number) => void; onOpenGroup: (id: string) => void; onNative: () => void;
  /** Avisos de Steam como una pestaña más (antes tenían su propio icono en el riel). */
  notices?: ReactNode; unseen?: number;
}> = ({ game, notify, onOpenFriend, onOpenGroup, onNative, notices, unseen = 0 }) => {
  const friends = useFriends();
  const [tab, setTab] = useState<Tab>(game ? "together" : "friends");
  const [showOffline, setShowOffline] = useState(false);
  const self = me();
  const [myState, setMy] = useState<Persona>(self?.state ?? Persona.Online);
  const [pickState, setPickState] = useState(false);
  const chats = recentChats(friends);
  const unread = unreadTotal(friends);
  if (!friends.length && !self) {
    // Sin amigos legibles, los avisos siguen a mano.
    return <><Shortcut label="Amigos y chat de Steam" hint="no se pudieron leer aquí" onOpen={onNative} />{notices}</>;
  }
  const g = groupFriends(friends, game?.liveAppid ?? null);
  const section = (title: string, list: Friend[]) => (list.length ? (
    <>
      <Label>{title} ({list.length})</Label>
      {list.map((f) => <FriendRow key={f.accountId} f={f} onOpen={() => onOpenFriend(f.accountId)} />)}
    </>
  ) : null);
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {self && <Avatar f={self} size={30} />}
        <div style={{ flexGrow: 1, minWidth: 0, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{self?.name ?? "Tú"}</div>
        <StatusPicker value={myState} open={pickState} onToggle={() => setPickState((x) => !x)} />
      </div>
      {pickState && (
        <div style={{ ...cardStyle, padding: 4, gap: 2 }}>
          {STATES.map((st) => (
            <StatusOption key={st.s} st={st} on={st.s === myState} onPick={() => {
              setMy(st.s); setPickState(false);
              if (!setMyState(st.s)) notify("Steam no permite cambiar el estado desde aquí");
            }} />
          ))}
        </div>
      )}
      {/* Pestañas: una rejilla de columnas iguales (icono arriba, nombre abajo). Antes eran fichas en fila que, con 5, se
          aplastaban y solo quedaba visible la última. */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${game ? (notices ? 5 : 4) : notices ? 4 : 3}, minmax(0, 1fr))`, gap: 6 }}>
        <Chip stack icon={TAB_ICON.friends} active={tab === "friends"} onClick={() => setTab("friends")}>Amigos</Chip>
        <Chip stack icon={TAB_ICON.chats} badge={unread} active={tab === "chats"} onClick={() => setTab("chats")}>Chats</Chip>
        <Chip stack icon={TAB_ICON.groups} active={tab === "groups"} onClick={() => setTab("groups")}>Grupos</Chip>
        {game && <Chip stack icon={TAB_ICON.together} active={tab === "together"} onClick={() => setTab("together")}>Juntos</Chip>}
        {notices && <Chip stack icon="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0" badge={unseen} active={tab === "notices"} onClick={() => setTab("notices")}>Avisos</Chip>}
      </div>
      {tab === "friends" && (
        <>
          {game && section(`Juegan a ${game.name}`, g.here)}
          {section("Jugando", g.playing)}
          {section("En línea", g.online)}
          {section("Ausentes", g.away)}
          {g.offline.length > 0 && (showOffline ? section("Desconectados", g.offline)
            : <Shortcut label={`Desconectados (${g.offline.length})`} hint="mostrar" onOpen={() => setShowOffline(true)} />)}
        </>
      )}
      {tab === "chats" && (chats.length ? chats.map((f) => (
        <FriendRow key={f.accountId} f={f} sub={f.lastMsg ? `${f.lastMsg.mine ? "Tú: " : ""}${f.lastMsg.text}` : undefined} onOpen={() => onOpenFriend(f.accountId)} />
      )) : <div style={small}>Sin conversaciones recientes. Abre un amigo para escribirle.</div>)}
      {tab === "groups" && <GroupsList onOpen={onOpenGroup} onNative={onNative} />}
      {tab === "notices" && notices}
      {tab === "together" && game && <TogetherTab game={game} friends={friends} notify={notify} onOpenFriend={onOpenFriend} />}
    </>
  );
};

const GroupRow: FC<{ g: Group; onOpen: () => void }> = ({ g, onOpen }) => {
  const tap = useTap(onOpen);
  const [fc, setFc] = useState(false);
  const inVoice = g.voiceChannels.some((v) => v.joined);
  return (
    <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setFc(true)} onGamepadBlur={() => setFc(false)}
      style={{ ...cardStyle, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, padding: "6px 12px", ...focusRing(fc) }}>
      <GroupIcon g={g} />
      <div style={{ minWidth: 0, flexGrow: 1 }}>
        <div style={{ fontSize: 14, fontWeight: g.unread ? 700 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</div>
        <div style={{ ...small, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {[g.online ? `${g.online} en línea` : null, g.rooms.length ? `${g.rooms.length} salas` : null, g.voiceChannels.length ? `${g.voiceChannels.length} de voz` : null].filter(Boolean).join(" · ") || "Grupo"}
        </div>
      </div>
      {inVoice && <Icon d={PHONE} size={16} color={COLORS.okSoft} />}
      <Badge n={g.unread} />
    </Focusable>
  );
};

const GroupsList: FC<{ onOpen: (id: string) => void; onNative: () => void }> = ({ onOpen, onNative }) => {
  const [groups, setGroups] = useState<Group[]>(() => readGroups());
  const visible = useVisible();
  useEffect(() => { if (!visible) return undefined; const id = tickEvery(() => setGroups(readGroups()), 3000); return () => id(); }, [visible]);
  if (!groups.length) return <Shortcut label="Grupos de chat" hint="abrir en Steam" onOpen={onNative} />;
  return <>{groups.map((g) => <GroupRow key={g.id} g={g} onOpen={() => onOpen(g.id)} />)}</>;
};

/** Jugar juntos: invitar con Remote Play Together al juego abierto y ver quien esta conectado. */
const TogetherTab: FC<{ game: RunningGame; friends: Friend[]; notify: (t: string) => void; onOpenFriend: (id: number) => void }> = ({ game, friends, notify, onOpenFriend }) => {
  const [guests, setGuests] = useState<string[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  useEffect(() => together.watch(setGuests), []);
  const g = groupFriends(friends, game.liveAppid);
  const candidates = [...g.online, ...g.away, ...g.playing].slice(0, 12);
  const can = together.available();
  return (
    <>
      {g.here.length > 0 && (
        <>
          <Label>También juegan a {game.name}</Label>
          {g.here.map((f) => <FriendRow key={f.accountId} f={f} onOpen={() => onOpenFriend(f.accountId)} />)}
        </>
      )}
      {guests.length > 0 && (
        <Card title="Invitados conectados">
          {guests.map((s) => {
            const f = friends.find((x) => x.steam64 === s);
            return (
              <Row key={s} gap={6}>
                <div style={{ flexGrow: 1, fontSize: 13, alignSelf: "center" }}>{f?.name ?? "Invitado"}</div>
                <Chip grow={false} onClick={() => { void together.cancel(s).then((ok) => notify(ok ? "Invitado desconectado" : "No se pudo")); }}>Quitar</Chip>
              </Row>
            );
          })}
        </Card>
      )}
      <Label>Remote Play Together</Label>
      {!can ? <div style={small}>Esta versión de Steam no permite invitar desde aquí. Usa el botón Steam › Invitar amigo.</div>
        : candidates.length ? candidates.map((f) => (
          <FriendRow key={f.accountId} f={f} onOpen={() => onOpenFriend(f.accountId)}
            right={
              <DialogButton data-qr="item" disabled={invited.has(f.steam64)} onClick={(e: { stopPropagation?: () => void }) => {
                e.stopPropagation?.();
                void together.invite(f.steam64, String(game.liveAppid)).then((ok) => {
                  if (ok) setInvited((s) => new Set(s).add(f.steam64));
                  notify(ok ? `Invitación enviada a ${f.name}` : "No se pudo invitar");
                });
              }} style={{ minWidth: 0, width: "auto", height: 32, padding: "0 12px", borderRadius: 16, fontSize: 12, fontWeight: 600 }}>
                {invited.has(f.steam64) ? "Invitado" : "Invitar"}
              </DialogButton>
            } />
        )) : <div style={small}>No hay amigos en línea para invitar.</div>}
    </>
  );
};

// ---------------- Columna: conversacion con un amigo ----------------
const fmtTime = (at: number) => { try { return new Date(at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

type ChatMsg = { key: string; mine: boolean; text: string; at: number; author_name?: string; raw?: string };

/** Burbujas del chat. Memo: escribir en el compositor no vuelve a pintar (ni a interpretar BBCode de) los 40 mensajes. */
const MessageList = memo<{ msgs: ChatMsg[]; showAuthors?: boolean; empty: string }>(({ msgs, showAuthors, empty }) => (
  <>
    {msgs.length === 0 && <div style={{ ...small, textAlign: "center", marginTop: 20 }}>{empty}</div>}
    {msgs.map((m, i) => {
      const showName = showAuthors && !m.mine && (i === 0 || msgs[i - 1].author_name !== m.author_name || msgs[i - 1].mine);
      return (
        <div key={m.key} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "84%", display: "flex", flexDirection: "column", gap: 2 }}>
          {showName && <div style={{ fontSize: 11, color: colorFor(m.author_name ?? ""), fontWeight: 700, marginLeft: 6 }}>{m.author_name}</div>}
          <div style={isOnlyMedia(m.raw ?? "") ? { padding: 2 } : { padding: "7px 11px", borderRadius: 16, borderBottomRightRadius: m.mine ? 4 : 16, borderBottomLeftRadius: m.mine ? 16 : 4,
            background: m.mine ? COLORS.accent : COLORS.card, color: m.mine ? COLORS.onAccent : COLORS.text, fontSize: 13, lineHeight: "18px", wordBreak: "break-word" }}>
            {m.raw ? renderBB(m.raw, m.key) : m.text}
            <div style={{ fontSize: 10, opacity: 0.7, textAlign: "right", marginTop: 2 }}>{fmtTime(m.at)}</div>
          </div>
        </div>
      );
    })}
  </>
));

/**
 * Vista de conversacion comun (amigo o sala de grupo): historial con burbujas, «escribiendo», respuestas rapidas y
 * compositor. Enter envia y NO sale de aqui (antes el Enter del teclado llegaba al modal y lo cerraba).
 */
const ChatView: FC<{
  msgs: ChatMsg[]; typingName?: string | null; showAuthors?: boolean; onSend: (t: string) => Promise<boolean>; onTyping?: () => void;
  placeholder: string; empty: string;
}> = ({ msgs, typingName, showAuthors, onSend, onTyping, placeholder, empty }) => {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  // Mensajes propios recién enviados: se ven al momento («enviando…») hasta que Steam los devuelve en el historial.
  const [pending, setPending] = useState<ChatMsg[]>([]);
  const list = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);
  const keyN = useRef(0);
  // Al cerrar la conversacion se quita el teclado de Steam.
  useEffect(() => { const off = chatOpened(); return () => { off(); dismissKeyboard(list.current?.ownerDocument); }; }, []);
  // Un pendiente se quita cuando llega el mensaje real (mismo texto, mío) o a los 12 s.
  const shown = pending.filter((p) => !msgs.some((m) => m.mine && (m.raw ?? m.text).trim() === p.text.trim() && m.at >= p.at - 5));
  // Siempre al final (lo ultimo dicho), salvo que hayas subido a leer. Antes dependía de msgs.length, que con 40
  // mensajes (el tope) no cambia al enviar: el nuevo no se veía hasta hacer scroll.
  const lastKey = shown.length ? shown[shown.length - 1].key : msgs.length ? msgs[msgs.length - 1].key : "";
  useEffect(() => {
    const el = list.current;
    if (!el || !stick.current) return;
    const win = el.ownerDocument?.defaultView ?? window;
    win.requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [lastKey, msgs.length, shown.length, !!typingName]);
  const doSend = (t: string) => {
    if (!t.trim() || sending) return;
    const mine: ChatMsg = { key: `pend-${Date.now()}`, mine: true, text: t.trim(), raw: t.trim(), at: Math.floor(Date.now() / 1000) };
    setSending(true);
    stick.current = true;
    setPending((l) => [...l, mine]);
    setText("");
    window.setTimeout(() => setPending((l) => l.filter((x) => x.key !== mine.key)), 12000);
    void onSend(t).then((ok) => { if (!ok) { setPending((l) => l.filter((x) => x.key !== mine.key)); setText(t); } }).finally(() => setSending(false));
  };
  return (
    <>
      <div ref={list} style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", padding: "4px 14px", display: "flex", flexDirection: "column", gap: 6 }}
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48; }}>
        <MessageList msgs={shown.length ? [...msgs, ...shown] : msgs} showAuthors={showAuthors} empty={empty} />
        {typingName && <div style={{ ...small, fontStyle: "italic" }}>{typingName} está escribiendo…</div>}
      </div>
      <div style={{ padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, borderTop: `1px solid ${COLORS.track}` }}>
        <Focusable style={{ display: "flex", gap: 6, overflowX: "auto" }} flow-children="row">
          {QUICK_REPLIES.map((q, i) => (
            <DialogButton key={q} data-qr="item" {...(i === 0 ? { "data-qr-first": "1" } : {})} onClick={() => doSend(q)}
              style={{ minWidth: 0, width: "auto", flexShrink: 0, height: 30, padding: "0 12px", borderRadius: 15, fontSize: 12, fontWeight: 600 }}>{q}</DialogButton>
          ))}
        </Focusable>
        <Focusable style={{ display: "flex", gap: 6, alignItems: "center", background: COLORS.card, borderRadius: 22, padding: "2px 4px 2px 12px" }} flow-children="row">
          <div style={{ flexGrow: 1, minWidth: 0 }}
            // El Enter del teclado no debe subir al modal (lo cerraria): se envia aqui y se para.
            onKeyDownCapture={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); doSend(text); } }}>
            <TextField value={text} placeholder={placeholder} onChange={(e) => {
              // Registro: cuanto tarda en pintarse cada tecla (para saber si la lentitud es nuestra o del teclado de Steam).
              const t0 = performance.now();
              const win = list.current?.ownerDocument?.defaultView ?? window;
              void nextPaint(win).then(() => { if (++keyN.current % 3 === 1) record("key", { ms: Math.round(performance.now() - t0), sec: "chat" }); });
              setText(e.target.value); onTyping?.();
            }} />
          </div>
          <DialogButton data-qr="item" onClick={() => doSend(text)} disabled={!text.trim() || sending}
            style={{ minWidth: 0, width: 38, height: 38, padding: 0, borderRadius: 19, display: "flex", alignItems: "center", justifyContent: "center",
              background: text.trim() ? COLORS.accent : COLORS.track }}>
            <Icon d="M4 12l16-8-6 16-2-7z" size={18} color={text.trim() ? COLORS.onAccent : COLORS.muted} />
          </DialogButton>
        </Focusable>
      </div>
    </>
  );
};

// ---------------- Columna: conversacion con un amigo ----------------
export const FriendColumn: FC<{
  accountId: number; game: RunningGame | null; notify: (t: string) => void; onClose: () => void; onProfile: (steam64: string) => void;
}> = ({ accountId, game, notify, onClose, onProfile }) => {
  // Solo este amigo (no los 120) y solo se repinta si cambia algo.
  const [f, setF] = useState<Friend | null>(() => readFriendById(accountId));
  const fSig = useRef("");
  const [msgs, setMsgsRaw] = useState(() => messages(accountId));
  const mSig = useRef(msgsSig(msgs));
  const setMsgs = (l: ReturnType<typeof messages>) => { const s2 = msgsSig(l); if (s2 !== mSig.current) { mSig.current = s2; setMsgsRaw(l); } };
  const [typing, setTyping] = useState(() => isTyping(accountId));
  useEffect(() => {
    const id = tickEvery(() => {
      const nf = readFriendById(accountId);
      const s2 = nf ? friendsSig([nf]) : "";
      if (s2 !== fSig.current) { fSig.current = s2; setF(nf); }
    }, 2500);
    return () => id();
  }, [accountId]);
  useEffect(() => {
    // Como Steam al abrir la conversacion: la activa (marca leido) y al cerrar la desactiva.
    activate(accountId);
    const tick = () => { setMsgs(messages(accountId)); setTyping(isTyping(accountId)); };
    const first = window.setTimeout(tick, 400); // el historial llega un poco despues de pedirlo
    const id = tickEvery(tick, 1200, { exact: true, name: "chat" });
    return () => { window.clearTimeout(first); id(); deactivate(accountId); };
  }, [accountId]);
  if (!f) return <SideColumn title="Amigo" onClose={onClose} focusKey={`friend:${accountId}`}><div style={{ padding: 14, ...small }}>No se encontró a este amigo.</div></SideColumn>;
  const canCall = voice.canCall(accountId);
  return (
    <SideColumn title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}><Avatar f={f} status={f} size={26} />{f.name}</span>}
      subtitle={statusText(f)} onClose={onClose} focusKey={`friend:${accountId}`} focusSelector="[data-qr-first]"
      bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Focusable style={{ display: "flex", gap: 6, padding: "0 14px 8px" }} flow-children="row">
        {canCall && <Chip grow={false} active={f.voice} icon={PHONE} onClick={() => { if (!voice.toggleCall(accountId)) notify("No se pudo iniciar la llamada"); }}>{f.voice ? "Colgar" : "Llamar"}</Chip>}
        {game && together.available() && f.state !== Persona.Offline && (
          <Chip grow={false} icon={ICONS2.play} onClick={() => { void together.invite(f.steam64, String(game.liveAppid)).then((ok) => notify(ok ? `Invitación a ${game.name} enviada` : "No se pudo invitar")); }}>Invitar</Chip>
        )}
        <Chip grow={false} icon={ICONS2.users} onClick={() => onProfile(f.steam64)}>Perfil</Chip>
      </Focusable>
      <ChatView msgs={msgs} typingName={typing ? f.name : null} placeholder={`Mensaje para ${f.name}`} empty="Todavía no hay mensajes. Saluda 👋"
        onTyping={() => sendTyping(accountId)}
        onSend={async (t) => {
          const ok = await send(accountId, t);
          if (ok) window.setTimeout(() => setMsgs(messages(accountId)), 300);
          else notify("No se pudo enviar el mensaje");
          return ok;
        }} />
    </SideColumn>
  );
};

// ---------------- Columna: grupo (salas de texto y de voz) ----------------
export const GroupColumn: FC<{ groupId: string; notify: (t: string) => void; onClose: () => void; onOpenInSteam: () => void }> = ({ groupId, notify, onClose, onOpenInSteam }) => {
  const [groups, setGroups] = useState<Group[]>(() => readGroups());
  const gr = groups.find((x) => x.id === groupId) ?? null;
  const [roomId, setRoomId] = useState<string | null>(null);
  const room = gr?.rooms.find((r) => r.id === roomId) ?? gr?.rooms[0] ?? null;
  const [msgs, setMsgsRaw] = useState<ReturnType<typeof roomMessages>>([]);
  const mSig = useRef("");
  const setMsgs = (l: ReturnType<typeof roomMessages>) => { const s2 = msgsSig(l); if (s2 !== mSig.current) { mSig.current = s2; setMsgsRaw(l); } };
  const gSig = useRef("");
  useEffect(() => {
    const id = tickEvery(() => {
      const g = readGroups();
      const s2 = g.map((x) => `${x.id}:${x.unread}:${x.online}:${x.rooms.map((r) => `${r.id}${r.joined ? 1 : 0}${r.unread}`).join(",")}`).join("|");
      if (s2 !== gSig.current) { gSig.current = s2; setGroups(g); }
    }, 2500);
    return () => id();
  }, []);
  useEffect(() => {
    if (!room) return undefined;
    activateRoom(room);
    const tick = () => setMsgs(roomMessages(room, friendsCached(10000)));
    tick();
    const first = window.setTimeout(tick, 500);
    const id = tickEvery(tick, 1500, { exact: true, name: "sala" });
    return () => { window.clearTimeout(first); id(); deactivateRoom(room); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, gr?.id]);
  if (!gr) return <SideColumn title="Grupo" onClose={onClose} focusKey={`group:${groupId}`}><div style={{ padding: 14, ...small }}>No se encontró el grupo.</div></SideColumn>;
  return (
    <SideColumn title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}><GroupIcon g={gr} size={26} />{gr.name}</span>}
      subtitle={`${gr.online} en línea${room ? ` · #${room.name}` : ""}`} onClose={onClose} focusKey={`group:${groupId}`} focusSelector="[data-qr-first]"
      bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {gr.rooms.length > 1 && (
        <Focusable style={{ display: "flex", gap: 6, padding: "0 14px 8px", overflowX: "auto", flexShrink: 0 }} flow-children="row">
          {gr.rooms.map((r) => (
            <Chip key={r.id} grow={false} active={room?.id === r.id} onClick={() => setRoomId(r.id)}>
              {r.voice ? "🔊 " : "# "}{r.name}{r.unread ? ` · ${r.unread}` : ""}
            </Chip>
          ))}
        </Focusable>
      )}
      {room?.voice && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px 8px", flexShrink: 0 }}>
          <span style={{ ...small, flexGrow: 1 }}>{room.joined ? "Estás en la sala de voz" : room.voiceMembers ? `${room.voiceMembers} en la sala de voz` : "Sala de voz vacía"}</span>
          <Chip grow={false} active={room.joined} icon={PHONE} onClick={() => {
            if (room.joined) { if (!voice.hangUp()) notify("No se pudo salir"); }
            else if (!joinVoice(gr, room.id)) notify("No se pudo entrar en la sala");
          }}>{room.joined ? "Salir" : "Entrar"}</Chip>
        </div>
      )}
      {room ? (
        <ChatView msgs={msgs} showAuthors placeholder={`Mensaje en #${room.name}`} empty="Sin mensajes recientes en esta sala."
          onSend={async (t) => {
            const ok = await sendRoom(room, t);
            if (ok) window.setTimeout(() => setMsgs(roomMessages(room, friendsCached(5000))), 300);
            else notify("No se pudo enviar al grupo");
            return ok;
          }} />
      ) : (
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={small}>No se pudieron leer las salas de este grupo.</div>
          <Shortcut label="Abrir el chat del grupo" hint="Steam" onOpen={onOpenInSteam} />
        </div>
      )}
    </SideColumn>
  );
};

/** Icono del grupo: su avatar o la inicial sobre color. */
export const GroupIcon: FC<{ g: { name: string; avatar: string | null }; size?: number }> = ({ g, size = 34 }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.3, overflow: "hidden", flexShrink: 0, background: colorFor(g.name), display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.42 }}>
    {g.avatar ? <img src={g.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : g.name.slice(0, 1).toUpperCase()}
  </div>
);

// ---------------- Barra de voz (fija arriba, en todas las secciones) ----------------
/**
 * Llamada en curso (con quien, conectando, micro, sonido, colgar) y llamadas entrantes (aceptar/rechazar).
 * Se actualiza al instante con el aviso de Steam (RegisterForVoiceChatActiveStateChange) y cada 0,6 s mientras hay voz.
 */
export const VoiceBar: FC<{ notify: (t: string) => void }> = ({ notify }) => {
  // En reposo solo se comprueba si hay voz (barato); los amigos (para los nombres) se leen solo con una llamada.
  const [busy, setBusy] = useState(() => voiceBusy());
  const [, tick] = useState(0);
  useEffect(() => {
    const refresh = () => { setBusy(voiceBusy()); tick((n) => n + 1); };
    const off = voice.onChange(() => { invalidateFriends(); refresh(); });
    const id = tickEvery(refresh, busy ? 600 : 3000, { exact: busy, name: "voz" });
    return () => { off(); id(); };
  }, [busy]);
  if (!busy) return null;
  const v = voiceState(friendsCached(2000));
  const has = voice.has();
  return (
    <>
      {v.incoming.map((c) => (
        <div key={c.accountId} style={{ ...cardStyle, flexDirection: "row", alignItems: "center", gap: 8, padding: "6px 10px", background: "#2b3a1f", flexShrink: 0 }}>
          <Icon d={PHONE} size={18} color="#a8d672" />
          <div style={{ flexGrow: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name} te llama</div>
          <Focusable style={{ display: "flex", gap: 6 }} flow-children="row">
            <Chip grow={false} active onClick={() => { if (!voice.accept(c.accountId)) notify("No se pudo aceptar"); tick((n) => n + 1); }}>Aceptar</Chip>
            <Chip grow={false} onClick={() => { if (!voice.reject(c.accountId)) notify("No se pudo rechazar"); tick((n) => n + 1); }}>Rechazar</Chip>
          </Focusable>
        </div>
      ))}
      {v.active && (
        <div style={{ ...cardStyle, flexDirection: "row", alignItems: "center", gap: 8, padding: "6px 10px", background: "#1f3b2c", flexShrink: 0 }}>
          <Icon d={PHONE} size={18} color={COLORS.okSoft} />
          <div style={{ flexGrow: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {v.connecting ? "Conectando…" : v.withName ? `En llamada con ${v.withName}` : v.group ? "En una sala de voz" : "En llamada"}
          </div>
          <Focusable style={{ display: "flex", gap: 6 }} flow-children="row">
            {has.mic && <Chip grow={false} active={v.micMuted === true} onClick={() => { voice.toggleMic(); tick((n) => n + 1); }}>{v.micMuted ? "Micro off" : "Micro"}</Chip>}
            {has.out && <Chip grow={false} active={v.outMuted === true} onClick={() => { voice.toggleOut(); tick((n) => n + 1); }}>{v.outMuted ? "Sonido off" : "Sonido"}</Chip>}
            <Chip grow={false} onClick={() => { if (!voice.hangUp()) notify("No se pudo colgar"); tick((n) => n + 1); }}>Colgar</Chip>
          </Focusable>
        </div>
      )}
    </>
  );
};
