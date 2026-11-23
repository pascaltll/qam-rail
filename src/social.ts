// Capa social: amigos, chats 1:1, grupos, voz y Remote Play Together. Todo acceso a Steam es defensivo: lo que no
// exista en esta version del cliente devuelve null/[] y la interfaz oculta esa accion (o ofrece abrir lo de Steam).
// Fuentes: friendStore.allFriends [V]; g_FriendsUIApp.ChatStore / VoiceStore y SteamClient.RemotePlay [H] (tipos de
// @decky/ui y nombres habituales del cliente; se confirman con __qamRail.social()).

export enum Persona { Offline = 0, Online = 1, Busy = 2, Away = 3, Snooze = 4, Trade = 5, Play = 6, Invisible = 7 }

export interface Friend {
  accountId: number;
  steam64: string;
  name: string;
  state: Persona;
  appid: number;        // juego en marcha (0 = ninguno)
  gameName: string;     // nombre del juego o estado de Rich Presence
  avatar: string | null;
  lastOnline: number;   // rt (segundos)
  unread: number;
  lastMsg: { text: string; at: number; mine: boolean } | null;
  voice: boolean;       // llamada de voz activa con el
}

export interface Message { key: string; mine: boolean; text: string; at: number; author: number; raw?: string }

type Any = Record<string, unknown>;
const w = () => window as unknown as Any;
const fn = (o: unknown, name: string): ((...a: unknown[]) => unknown) | null => {
  const f = o && typeof o === "object" ? (o as Any)[name] : undefined;
  return typeof f === "function" ? (f as (...a: unknown[]) => unknown).bind(o) : null;
};
const call = <T,>(o: unknown, name: string, ...a: unknown[]): T | null => { try { const f = fn(o, name); return f ? (f(...a) as T) : null; } catch { return null; } };
/** Primer metodo existente de una lista de nombres candidatos. */
const pick = (o: unknown, names: string[]) => { for (const n of names) { const f = fn(o, n); if (f) return { name: n, f }; } return null; };

const app = () => w().g_FriendsUIApp as Any | undefined;
const chatStore = () => app()?.ChatStore as Any | undefined;
// [V] La voz vive en ChatStore.VoiceChat (clase de VoiceChatStore); g_FriendsUIApp.VoiceStore es el mismo objeto.
const voiceStore = () => ((chatStore()?.VoiceChat ?? app()?.VoiceStore) as Any | undefined);
/** Duck typing de mapas: los de Steam son mapas observables (mobx), no instancias de Map. */
const mapValues = (m: unknown): Any[] => { try { const v = (m as { values?: () => Iterable<Any> })?.values?.(); return v ? [...v] : []; } catch { return []; } };
const friendsUI = () => (w().friendStore as Any | undefined)?.m_FriendsUIFriendStore as Any | undefined;

// ---------- Texto de mensajes (BBCode de Steam → texto plano) ----------
export function plainText(bb: string): string {
  return String(bb ?? "")
    .replace(/\[emoticon\]([^[]*)\[\/emoticon\]/g, ":$1:")
    .replace(/\[(?:img|sticker|gameinvite|lobbyinvite|tradeoffer|spoiler)[^\]]*\][\s\S]*?\[\/[a-z]+\]/gi, (m) => (/gameinvite|lobbyinvite/i.test(m) ? "🎮 Invitación a jugar" : /sticker|img/i.test(m) ? "🖼 Imagen" : "…"))
    .replace(/\[\/?[a-z]+(?:=[^\]]*)?\]/gi, "")
    .trim();
}

/** [V] El texto del mensaje esta en strMessage (strMessageInternal en tipos antiguos). */
const msgText = (m: Any) => plainText(String(m.strMessage ?? m.strMessageInternal ?? ""));

// ---------- Amigos ----------
function readFriend(p: Any, myId: number | null): Friend | null {
  try {
    const per = ((p.persona as Any) ?? p) as Any;
    const sid = (p.m_steamid ?? per.m_steamid ?? p.steamid) as Any | undefined;
    const steam64 = String(call<string>(sid, "ConvertTo64BitString") ?? (p as Any).steamid64 ?? "");
    const accountId = Number(call<number>(p, "GetAccountID") ?? call<number>(per, "GetAccountID") ?? p.accountid ?? call<number>(sid, "GetAccountID") ?? 0);
    const name = String(per.m_strPlayerName ?? p.m_strPlayerName ?? "");
    if (!name || !accountId) return null;
    const appid = Number(per.m_unGamePlayedAppID ?? 0) || 0;
    const gameName = String(call<string>(per, "GetCurrentGameName") ?? per.m_strGameExtraInfo ?? "") || "";
    const avatar = (per.avatar_url_medium ?? per.avatar_url ?? null) as string | null;
    const chat = friendChat(accountId, false);
    const msgs = (chat?.m_rgChatMessages as Any[] | undefined) ?? [];
    const last = msgs.length ? msgs[msgs.length - 1] : null;
    const lastText = last ? msgText(last) : "";
    return {
      accountId, steam64, name,
      state: Number(per.m_ePersonaState ?? 0) as Persona,
      appid, gameName,
      avatar: typeof avatar === "string" && avatar ? avatar : null,
      lastOnline: Number(per.m_rtLastSeenOnline ?? 0) || 0,
      unread: Number(chat?.m_cUnreadChatMessages ?? 0) || 0,
      lastMsg: last && lastText ? { text: lastText, at: Number(last.rtTimestamp ?? 0), mine: myId !== null && Number(last.unAccountID) === myId }
        : chat?.m_strLastMessage ? { text: plainText(String(chat.m_strLastMessage)), at: Number(chat.time_last_message ?? chat.m_rtLastMessageReceived ?? 0), mine: myId !== null && Number(chat.m_accountIDLastMessage) === myId } : null,
      voice: !!call<boolean>(voiceStore(), "IsVoiceActiveForFriend", accountId),
    };
  } catch { return null; }
}

export function myAccountId(): number | null {
  const fs = w().friendStore as Any | undefined;
  const sid = fs?.currentUserSteamID as Any | undefined;
  const id = call<number>(sid, "GetAccountID");
  return typeof id === "number" && id > 0 ? id : null;
}

// Lectura compartida: varias tarjetas (globo del riel, barra de voz, lista, columna) reutilizan la misma lectura si es
// reciente, en vez de recorrer cada una los ~120 amigos con su chat y su voz.
let cache: Friend[] = [];
let cacheAt = 0;
export function friendsCached(maxAgeMs = 1500): Friend[] {
  const now = Date.now();
  if (now - cacheAt > maxAgeMs) { cache = readFriends(); cacheAt = now; }
  return cache;
}
export function invalidateFriends(): void { cacheAt = 0; }

/** No leidos sin recorrer a todos los amigos: lista de Steam de chats con mensajes sin leer. [V] FriendChatStore. */
export function unreadCount(): number {
  try {
    const list = call<Any[]>(chatStore()?.FriendChatStore, "GetFriendsWithUnreadMessages", null);
    if (Array.isArray(list)) return list.reduce((n, c) => n + (Number(c.unread_message_count ?? c.m_cUnreadChatMessages ?? 0) || 0), 0);
  } catch { /* abajo */ }
  return unreadTotal(friendsCached(4000));
}

/** ¿Hay voz o llamada entrante? Sin leer amigos (para la barra de voz en reposo). */
export function voiceBusy(): boolean {
  const vs = voiceStore();
  if (call<boolean>(vs, "IsVoiceChatActive")) return true;
  const w = call<{ size?: number }>(vs, "GetOneOnOneCallsWaitingForJoinOrAccept");
  return !!w && Number(w.size ?? 0) > 0;
}

/** Solo un amigo (la conversacion abierta): no recorre el chat y la voz de los demas. */
export function readFriendById(accountId: number): Friend | null {
  try {
    const list = ((w().friendStore as Any | undefined)?.allFriends as Any[] | undefined) ?? [];
    const p = list.find((x) => Number(x.m_unAccountID ?? 0) === accountId)
      ?? list.find((x) => Number(call<number>((((x.persona as Any) ?? x).m_steamid) as Any, "GetAccountID") ?? 0) === accountId);
    return p ? readFriend(p, myAccountId()) : null;
  } catch { return null; }
}

/** Firma corta para no repintar si nada cambio. */
export const friendsSig = (l: Friend[]) => l.map((f) => `${f.accountId}:${f.state}:${f.appid}:${f.unread}:${f.lastMsg?.at ?? 0}:${f.voice ? 1 : 0}`).join("|");
export const msgsSig = (l: Message[]) => `${l.length}:${l[0]?.key ?? ""}:${l[l.length - 1]?.key ?? ""}:${l[l.length - 1]?.raw ?? ""}`;

export function readFriends(): Friend[] {
  try {
    const list = ((w().friendStore as Any | undefined)?.allFriends as Any[] | undefined) ?? [];
    const me = myAccountId();
    return list.map((p) => readFriend(p, me)).filter((f): f is Friend => !!f);
  } catch { return []; }
}

export function me(): { name: string; state: Persona; avatar: string | null } | null {
  const self = friendsUI()?.m_self as Any | undefined;
  const per = ((self?.persona as Any) ?? self) as Any | undefined;
  if (!per) return null;
  return { name: String(per.m_strPlayerName ?? ""), state: Number(friendsUI()?.m_eUserPersonaState ?? per.m_ePersonaState ?? 1) as Persona, avatar: (per.avatar_url_medium as string) ?? null };
}

export function setMyState(s: Persona): boolean { return call(friendsUI(), "SetUserPersonaState", s, true) !== null || !!fn(friendsUI(), "SetUserPersonaState"); }

// ---------- Orden y grupos (puro) ----------
export interface FriendGroups { here: Friend[]; playing: Friend[]; online: Friend[]; away: Friend[]; offline: Friend[] }
const isOn = (f: Friend) => f.state !== Persona.Offline && f.state !== Persona.Invisible;
const isAway = (f: Friend) => f.state === Persona.Away || f.state === Persona.Snooze || f.state === Persona.Busy;

/** Juegan a tu juego → jugando → en linea → ausentes → desconectados (por ultima conexion). Dentro: no leidos primero, luego nombre. */
export function groupFriends(list: Friend[], currentAppid: number | null): FriendGroups {
  const by = (a: Friend, b: Friend) => (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) || a.name.localeCompare(b.name);
  const g: FriendGroups = { here: [], playing: [], online: [], away: [], offline: [] };
  for (const f of list) {
    if (!isOn(f)) g.offline.push(f);
    else if (currentAppid && f.appid === currentAppid) g.here.push(f);
    else if (f.appid) g.playing.push(f);
    else if (isAway(f)) g.away.push(f);
    else g.online.push(f);
  }
  g.here.sort(by); g.playing.sort(by); g.online.sort(by); g.away.sort(by);
  g.offline.sort((a, b) => (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) || b.lastOnline - a.lastOnline || a.name.localeCompare(b.name));
  return g;
}

/** Chats recientes: con mensajes, por fecha del ultimo (no leidos primero). */
export function recentChats(list: Friend[]): Friend[] {
  return list.filter((f) => f.lastMsg || f.unread).sort((a, b) => (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) || (b.lastMsg?.at ?? 0) - (a.lastMsg?.at ?? 0));
}

export const unreadTotal = (list: Friend[]) => list.reduce((n, f) => n + f.unread, 0);

export function statusText(f: Friend, now = Date.now() / 1000): string {
  if (f.appid) return f.gameName ? `Jugando · ${f.gameName}` : "Jugando";
  switch (f.state) {
    case Persona.Online: case Persona.Trade: case Persona.Play: return "En línea";
    case Persona.Away: case Persona.Snooze: return "Ausente";
    case Persona.Busy: return "Ocupado";
    default: {
      if (!f.lastOnline) return "Desconectado";
      const d = Math.max(0, now - f.lastOnline);
      if (d < 3600) return `Hace ${Math.max(1, Math.round(d / 60))} min`;
      if (d < 86400) return `Hace ${Math.round(d / 3600)} h`;
      return `Hace ${Math.round(d / 86400)} d`;
    }
  }
}
export const stateColor = (f: Friend) => (f.appid ? "#8bc34a" : f.state === Persona.Offline || f.state === Persona.Invisible ? "#6b7280" : isAway(f) ? "#e0b84a" : "#5fb8ff");

// ---------- Chat 1:1 ----------
export function friendChat(accountId: number, create: boolean): Any | null {
  const cs = chatStore();
  return (call<Any>(cs, "GetFriendChat", accountId, create) ?? call<Any>(cs, "GetFriendChatIfExists", accountId)) || null;
}

const historyAsked = new Set<number>();
export function messages(accountId: number, limit = 40): Message[] {
  const chat = friendChat(accountId, true);
  // [V] El historial no se carga hasta pedirlo (m_bChatLogsLoaded=false): se pide una vez al abrir la conversacion.
  if (chat && !historyAsked.has(accountId)) { historyAsked.add(accountId); try { void (chat.LoadChatLogs as (() => Promise<unknown>) | undefined)?.call(chat); } catch { /* sin historial */ } }
  const me_ = myAccountId();
  const list = (chat?.m_rgChatMessages as Any[] | undefined) ?? [];
  return list.slice(-limit).map((m, i) => ({
    key: String(call(m, "UniqueKey") ?? `${m.rtTimestamp}-${i}`),
    author: Number(m.unAccountID ?? 0),
    mine: me_ !== null && Number(m.unAccountID) === me_,
    text: msgText(m),
    raw: String(m.strMessage ?? m.strMessageInternal ?? ""),
    at: Number(m.rtTimestamp ?? 0),
  })).filter((m) => m.text || m.raw);
}

export const isTyping = (accountId: number) => !!friendChat(accountId, false)?.m_bFriendIsTyping;

/** [V] Abrir/cerrar la conversacion como lo hace Steam: OnActivate marca leido (y lo confirma al servidor). */
export function activate(accountId: number): void { call(friendChat(accountId, false), "OnActivate"); }
export function deactivate(accountId: number): void { call(friendChat(accountId, false), "OnDeactivate"); }
export const markRead = activate;
/** [V] Aviso de «escribiendo…» al amigo (Steam lo limita solo a uno cada pocos segundos). */
// «Escribiendo…» a Steam como mucho cada 3 s (antes, en cada tecla).
const typingAt = new Map<number, number>();
export function typing(accountId: number, now = Date.now()): boolean {
  if (now - (typingAt.get(accountId) ?? -Infinity) < 3000) return false;
  typingAt.set(accountId, now);
  call(friendChat(accountId, false), "OnTyping");
  return true;
}

// Con una conversacion abierta, la lista de amigos de fondo (120 amigos) deja de releerse: la columna lee solo al suyo.
let openChats = 0;
export const chatOpened = (): (() => void) => { openChats++; return () => { openChats = Math.max(0, openChats - 1); }; };
export const chatIsOpen = () => openChats > 0;

export async function send(accountId: number, text: string): Promise<boolean> {
  const t = text.trim();
  if (!t) return false;
  const chat = friendChat(accountId, true);
  const f = pick(chat, ["SendChatMessage"]);
  if (!f) return false;
  try { await f.f(t); return true; } catch { return false; }
}

// ---------- Voz ----------
// [V] VoiceChatStore: IsVoiceChatActive, GetActiveOneOnOneVoiceChatAccountID, GetActiveChatRoomGroupID, IsMicMuted,
// IsOutputMuted, ToggleMicMuting, ToggleOutputMuting, OnUserEndVoiceChat, InitiateFriendChat, IsVoiceActiveForFriend,
// GetOneOnOneCallsWaitingForJoinOrAccept, AcceptPartnersOneOnOneChatRequest, OnRejectOneOnOneVoiceChatForPartner,
// RegisterForVoiceChatActiveStateChange. g_FriendsUIApp.m_exportsVoiceInterface.EndVoiceChat cuelga cualquier llamada.
export interface VoiceState {
  active: boolean; connecting: boolean; withAccount: number; withName: string | null; group: boolean;
  micMuted: boolean | null; outMuted: boolean | null; incoming: Array<{ accountId: number; name: string }>;
}

export function voiceState(friends: Friend[]): VoiceState {
  const vs = voiceStore();
  const active = !!call<boolean>(vs, "IsVoiceChatActive");
  const withAccount = Number(call<number>(vs, "GetActiveOneOnOneVoiceChatAccountID") ?? 0) || 0;
  const group = !!call<string>(vs, "GetActiveChatRoomGroupID");
  const nameOf = (id: number) => friends.find((f) => f.accountId === id)?.name ?? null;
  const incoming: VoiceState["incoming"] = [];
  try {
    const waiting = call<{ keys?: () => Iterable<number> }>(vs, "GetOneOnOneCallsWaitingForJoinOrAccept");
    for (const id of waiting?.keys ? [...waiting.keys()] : []) {
      const n = Number(id);
      if (n === withAccount && active) continue;
      if (call<boolean>(vs, "BSelfHadPreviouslyJoinedOneOnOneChat", n)) continue;
      if (call<boolean>(vs, "BPartnerHasRequestedAndIsInOneOnOneChat", n) === false) continue;
      incoming.push({ accountId: n, name: nameOf(n) ?? "Un amigo" });
    }
  } catch { /* sin llamadas entrantes */ }
  return {
    active, withAccount, group, incoming,
    connecting: !!call<boolean>(vs, "IsAttemptingInitialConnection") || !!call<boolean>(vs, "IsAttemptingReconnect"),
    withName: withAccount ? nameOf(withAccount) : null,
    micMuted: call<boolean>(vs, "IsMicMuted"),
    outMuted: call<boolean>(vs, "IsOutputMuted"),
  };
}

export const voice = {
  canCall: (accountId: number) => !!fn(voiceStore(), "InitiateFriendChat") && (call<boolean>(friendChat(accountId, true), "BIsVoiceAllowed") ?? true) !== false,
  /** Llamar o colgar con un amigo (como el boton de llamada del chat de Steam). */
  toggleCall: (accountId: number) => {
    const vs = voiceStore();
    if (call<boolean>(vs, "IsVoiceActiveForFriend", accountId)) return voice.hangUp();
    if (fn(vs, "InitiateFriendChat")) { call(vs, "InitiateFriendChat", accountId); return true; }
    return call(friendChat(accountId, true), "ToggleVoiceChat") !== null;
  },
  toggleMic: () => call(voiceStore(), "ToggleMicMuting") !== null || !!fn(voiceStore(), "ToggleMicMuting"),
  toggleOut: () => call(voiceStore(), "ToggleOutputMuting") !== null || !!fn(voiceStore(), "ToggleOutputMuting"),
  /** Colgar al instante: interfaz de voz exportada por Steam; si no, OnUserEndVoiceChat del almacen. */
  hangUp: () => {
    const ex = app()?.m_exportsVoiceInterface as Any | undefined;
    if (fn(ex, "EndVoiceChat")) { call(ex, "EndVoiceChat"); return true; }
    if (fn(voiceStore(), "OnUserEndVoiceChat")) { call(voiceStore(), "OnUserEndVoiceChat"); return true; }
    return false;
  },
  accept: (accountId: number) => fn(voiceStore(), "AcceptPartnersOneOnOneChatRequest") ? (call(voiceStore(), "AcceptPartnersOneOnOneChatRequest", accountId), true) : false,
  reject: (accountId: number) => fn(voiceStore(), "OnRejectOneOnOneVoiceChatForPartner") ? (call(voiceStore(), "OnRejectOneOnOneVoiceChatForPartner", accountId), true) : false,
  has: () => ({ mic: !!fn(voiceStore(), "ToggleMicMuting"), out: !!fn(voiceStore(), "ToggleOutputMuting") }),
  /** Aviso inmediato cuando empieza/termina una llamada (para no esperar al sondeo). */
  onChange: (cb: () => void): (() => void) => {
    try {
      const h = call<{ Unregister?: () => void; unregister?: () => void }>(voiceStore(), "RegisterForVoiceChatActiveStateChange", cb);
      return () => { try { h?.Unregister?.(); h?.unregister?.(); } catch { /* nada */ } };
    } catch { return () => {}; }
  },
};

// ---------- Grupos ----------
// [V] Los grupos estan en ChatStore.currentChatRoomGroups. Estructura interna de grupo/sala [H] (nombres habituales del
// cliente; se confirman con Mas › Diagnostico › Explorar): name, avatar_url, chatRoomList / m_mapRooms, y cada sala con
// los mismos metodos que un chat 1:1 (SendChatMessage, LoadChatLogs, m_rgChatMessages, OnActivate).
export interface Room { id: string; name: string; voice: boolean; voiceMembers: number; joined: boolean; unread: number; raw: Any }
export interface Group { id: string; name: string; avatar: string | null; online: number; unread: number; rooms: Room[]; voiceChannels: Room[]; raw: Any }

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
function readRoom(r: Any, i: number): Room {
  const voice = call<boolean>(r, "BIsVoiceAllowed") ?? (r.voice_allowed as boolean | undefined) ?? (r.m_bVoiceAllowed as boolean | undefined) ?? false;
  const members = (r.voice_active_member_list ?? r.m_rgVoiceActiveMembers ?? r.m_setVoiceMembers) as { length?: number; size?: number } | undefined;
  return {
    id: String(r.chat_id ?? r.m_ulChatID ?? call(r, "GetChatID") ?? r.unique_id ?? i),
    name: str(r.name) ?? str(r.m_strName) ?? str(call(r, "GetName")) ?? (i === 0 ? "General" : `Sala ${i + 1}`),
    voice: !!voice,
    voiceMembers: Number(members?.length ?? members?.size ?? 0) || 0,
    joined: !!call<boolean>(r, "BVoiceActive") || !!call<boolean>(r, "BIsVoiceActive") || r.m_bVoiceActive === true,
    unread: Number(r.unread_message_count ?? r.m_cUnreadChatMessages ?? 0) || 0,
    raw: r,
  };
}

export function readGroups(): Group[] {
  const cs = chatStore();
  let list: Any[] = [];
  try {
    const cur = cs?.currentChatRoomGroups;
    list = Array.isArray(cur) ? (cur as Any[]) : mapValues(cs?.m_mapChatGroups);
  } catch { list = []; }
  return list.map((g, gi) => {
    let roomsRaw: Any[] = [];
    try {
      const rr = g.chatRoomList ?? g.m_mapRooms ?? g.m_mapChatRooms ?? g.rooms;
      roomsRaw = Array.isArray(rr) ? (rr as Any[]) : mapValues(rr);
    } catch { roomsRaw = []; }
    const rooms = roomsRaw.map(readRoom);
    return {
      id: String(g.GetGroupID ? call(g, "GetGroupID") : g.m_ulGroupID ?? g.unique_id ?? g.chat_group_id ?? gi),
      name: str(call(g, "GetName")) ?? str(g.name) ?? str(g.m_strName) ?? "Grupo",
      avatar: str(g.avatar_url) ?? str(call(g, "GetAvatarURL")) ?? str(g.m_strAvatarURL) ?? null,
      online: Number(call<number>(g, "GetOnlineMemberCount") ?? g.online_member_count ?? (g.m_setOnlineMembers as Set<unknown> | undefined)?.size ?? 0) || 0,
      unread: Number(call<number>(g, "GetUnreadChatMessageCount") ?? g.unread_message_count ?? rooms.reduce((n, r) => n + r.unread, 0)) || 0,
      rooms, voiceChannels: rooms.filter((r) => r.voice), raw: g,
    };
  });
}

const roomHistory = new WeakSet<object>();
/** Mensajes de una sala (con nombre del autor). Pide el historial la primera vez. */
export function roomMessages(room: Room, friends: Friend[], limit = 40): Array<Message & { author_name: string }> {
  const r = room.raw;
  if (!roomHistory.has(r)) { roomHistory.add(r); try { void (r.LoadChatLogs as (() => Promise<unknown>) | undefined)?.call(r); } catch { /* sin historial */ } }
  const me_ = myAccountId();
  const list = ((r.m_rgChatMessages ?? r.chat_messages) as Any[] | undefined) ?? [];
  const names = new Map(friends.map((f) => [f.accountId, f.name]));
  return list.slice(-limit).map((m, i) => {
    const id = Number(m.unAccountID ?? 0);
    const member = call<Any>(r, "GetMember", id);
    const per = ((member?.persona as Any) ?? member) as Any | undefined;
    return {
      key: String(call(m, "UniqueKey") ?? `${m.rtTimestamp}-${i}`), author: id, mine: me_ !== null && id === me_,
      text: msgText(m), raw: String(m.strMessage ?? m.strMessageInternal ?? ""), at: Number(m.rtTimestamp ?? 0),
      author_name: names.get(id) ?? str(member?.display_name) ?? str(per?.m_strPlayerName) ?? "Miembro",
    };
  }).filter((m) => m.text || m.raw);
}
export async function sendRoom(room: Room, text: string): Promise<boolean> {
  const t = text.trim();
  if (!t) return false;
  const f = pick(room.raw, ["SendChatMessage"]);
  if (!f) return false;
  try { await f.f(t); return true; } catch { return false; }
}
export const activateRoom = (room: Room) => { call(room.raw, "OnActivate"); };
export const deactivateRoom = (room: Room) => { call(room.raw, "OnDeactivate"); };

export function joinVoice(g: Group, channelId: string): boolean {
  const r = g.rooms.find((x) => x.id === channelId);
  return !!r && !!pick(r.raw, ["StartVoiceChat", "JoinVoiceChat", "ToggleVoiceChat", "InitiateVoiceChat"])?.f();
}

// ---------- Remote Play Together ----------
type RP = { CreateInviteAndSession?: (s: string, g: string) => Promise<unknown>; CancelInviteAndSession?: (s: string, n: number) => Promise<unknown>;
  RegisterForRemoteClientStarted?: (cb: (s: string, a: string) => void) => { unregister?: () => void };
  RegisterForRemoteClientStopped?: (cb: (s: string, a: string) => void) => { unregister?: () => void } };
const rp = () => ((w().SteamClient as Any | undefined)?.RemotePlay as RP | undefined);

export const together = {
  available: () => typeof rp()?.CreateInviteAndSession === "function",
  invite: async (steam64: string, gameid: string): Promise<boolean> => {
    try { await rp()?.CreateInviteAndSession?.(steam64, gameid); return true; } catch { return false; }
  },
  cancel: async (steam64: string): Promise<boolean> => { try { await rp()?.CancelInviteAndSession?.(steam64, 0); return true; } catch { return false; } },
  /** Invitados conectados (se siguen por eventos mientras el plugin esta cargado). */
  watch: (cb: (guests: string[]) => void): (() => void) => {
    const guests = new Set<string>();
    const a = rp()?.RegisterForRemoteClientStarted?.((s) => { guests.add(s); cb([...guests]); });
    const b = rp()?.RegisterForRemoteClientStopped?.((s) => { guests.delete(s); cb([...guests]); });
    return () => { a?.unregister?.(); b?.unregister?.(); };
  },
};

export const QUICK_REPLIES = ["👍", "¡Voy!", "Un momento", "¿Jugamos?", "gg"];

// ---------- Efectos del chat (sondeo) ----------
// El teclado de chat de Steam trae tres cosas: emoticonos, stickers y EFECTOS (animaciones a pantalla completa tipo
// fuegos artificiales). Emoticonos y stickers se saben pintar; el formato del mensaje de un efecto aún no se conoce.
// Este sondeo lo descubre: lista las etiquetas BBCode que llegan en los últimos mensajes (manda un efecto a un
// amigo, o pídeselo que lo mande) y los nombres de métodos/propiedades del chat de Steam que mencionan efectos.
const KNOWN_TAGS = new Set(["emoticon", "sticker", "img", "gameinvite", "lobbyinvite", "tradeoffer", "spoiler", "b", "i", "u", "s", "strike", "code", "quote", "url", "h1", "h2", "h3", "hr", "list", "noparse", "br", "p", "center", "right", "left", "color", "size"]);
/** Puro (probado): etiquetas BBCode del mensaje que no se conocen (candidatas a ser efectos o pegatinas nuevas). */
export function unknownTags(raw: string): string[] {
  const out: string[] = [];
  for (const m of String(raw ?? "").matchAll(/\[\/?([a-z][\w-]*)/gi)) {
    const t = m[1].toLowerCase();
    if (!KNOWN_TAGS.has(t) && !out.includes(t)) out.push(t);
  }
  return out;
}
const propNames = (o: unknown, re: RegExp): string[] => {
  const names: string[] = [];
  try { for (let p: object | null = o as object, n = 0; p && p !== Object.prototype && n < 4; p = Object.getPrototypeOf(p), n++) names.push(...Object.getOwnPropertyNames(p)); } catch { /* nada */ }
  return [...new Set(names)].filter((x) => re.test(x)).slice(0, 40);
};
export interface ChatProbe { efectos?: unknown; amigos: number; mensajes: number; etiquetas: Array<{ tag: string; veces: number; muestra: string }>; nombres: Record<string, string[]> }
export function chatProbe(): ChatProbe {
  const found = new Map<string, { veces: number; muestra: string }>();
  let msgs = 0, friends = 0;
  try {
    for (const f of recentChats(readFriends()).slice(0, 20)) {
      friends++;
      for (const m of messages(f.accountId, 60)) {
        msgs++;
        for (const t of unknownTags(m.raw ?? "")) {
          const cur = found.get(t) ?? { veces: 0, muestra: (m.raw ?? "").slice(0, 160) };
          cur.veces++; found.set(t, cur);
        }
      }
    }
  } catch { /* nada */ }
  const re = /effect|efecto|sticker|emoticon|animat|fx|firework|confetti/i;
  const cs = chatStore();
  const nombres: Record<string, string[]> = {
    ChatStore: propNames(cs, re), App: propNames(app(), re), Chat: propNames(friendChat(readFriends()[0]?.accountId ?? 0, false), re),
  };
  // Ajustes de efectos de sala (visto en 0.37: App.GetChatRoomEffectSettings / ChatStore.ChatRoomEffectSettings).
  let efectos: unknown = null;
  try {
    const a = app() as { GetChatRoomEffectSettings?: () => unknown; m_ChatRoomEffectSettings?: unknown } | null;
    const e = a?.GetChatRoomEffectSettings?.() ?? a?.m_ChatRoomEffectSettings ?? (cs as { ChatRoomEffectSettings?: unknown } | null)?.ChatRoomEffectSettings;
    efectos = e ? { claves: propNames(e, /./), texto: (JSON.stringify(e, (_k, v) => (typeof v === "function" ? undefined : v)) ?? "").slice(0, 4000) } : null;
  } catch (err) { efectos = { error: String(err).slice(0, 120) }; }
  return { efectos, amigos: friends, mensajes: msgs, etiquetas: [...found].map(([tag, v]) => ({ tag, ...v })), nombres };
}
