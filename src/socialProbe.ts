// Sonda de lo que Steam expone para amigos, chat, voz y Remote Play Together. No cambia nada: solo lista metodos,
// para diseñar la seccion social sobre funciones reales. Uso: JSON.stringify(__qamRail.social())
const methods = (o: unknown, max = 80): string[] => {
  if (!o || typeof o !== "object") return [];
  const out = new Set<string>();
  let p: object | null = o as object;
  for (let i = 0; p && p !== Object.prototype && i < 4; i++, p = Object.getPrototypeOf(p)) {
    for (const k of Object.getOwnPropertyNames(p)) {
      try { if (typeof (o as Record<string, unknown>)[k] === "function") out.add(k); } catch { /* getter que falla */ }
    }
  }
  return [...out].slice(0, max);
};
const keys = (o: unknown, max = 60): string[] => (o && typeof o === "object" ? Object.keys(o).slice(0, max) : []);

export function probeSocial(): Record<string, unknown> {
  const w = window as unknown as Record<string, unknown>;
  const app = w.g_FriendsUIApp as Record<string, unknown> | undefined;
  const fs = w.friendStore as Record<string, unknown> | undefined;
  const sc = w.SteamClient as Record<string, unknown> | undefined;
  const out: Record<string, unknown> = { hasFriendsUIApp: !!app, hasFriendStore: !!fs };
  try {
    out.appKeys = keys(app);
    for (const k of ["ChatStore", "VoiceStore", "FriendStore", "GroupStore", "UIStore", "NotificationStore"]) {
      const v = app?.[k];
      if (v) { out[`${k}.methods`] = methods(v); out[`${k}.keys`] = keys(v, 40); }
    }
    const ui = fs?.m_FriendsUIFriendStore;
    out["friendsUI.methods"] = methods(ui, 120);
    out["RemotePlay.methods"] = methods(sc?.RemotePlay);
    out["Friends.methods"] = methods(sc?.Friends);
    out["WebChat.methods"] = methods(sc?.WebChat);
  } catch (e) { out.error = String(e); }
  return out;
}
