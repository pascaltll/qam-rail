// Avisos de Steam (la bandeja de notificaciones del QAM). [H] NotificationStore segun tipos de @decky/ui:
// m_rgNotificationTray (grupos por tipo, cada uno con sus avisos), m_nUnviewedNotifications, MarkNotificationRead(id)
// y m_cbkNotificationTray (aviso de cambios). Titulo, texto e icono son elementos de React de Steam: se pintan tal cual.
import type { ReactNode } from "react";

export interface Notice {
  id: number | null;
  type: number;
  group: string;
  title: ReactNode;
  body: ReactNode;
  logo: ReactNode;
  at: number;        // segundos (rtCreated); 0 si no se sabe
  isNew: boolean;
  onClick: (() => void) | null;
}

type Any = Record<string, unknown>;
const store = () => (window as unknown as { NotificationStore?: Any }).NotificationStore;

// Tipos (EClientNotificationType) → grupo en español.
const GROUP: Record<number, string> = {
  1: "Descargas", 2: "Amigos", 3: "Amigos", 4: "Amigos", 5: "Logros", 6: "Batería", 7: "Sistema", 8: "Mensajes", 9: "Mensajes",
  10: "Amigos", 11: "Familia", 12: "Familia", 13: "Familia", 14: "Capturas", 15: "Nube", 16: "Nube", 17: "Llamadas", 19: "Regalos",
  20: "Objetos", 22: "Sistema", 23: "Batería", 27: "Comentarios", 28: "Deseados", 29: "Intercambios", 31: "General", 37: "Ofertas",
  38: "Temporizador", 41: "Remote Play", 42: "Remote Play", 43: "Remote Play", 44: "Familia", 45: "Familia", 46: "Familia", 47: "Familia",
};
export const groupOf = (type: number) => GROUP[type] ?? "Otros";

/** Lista plana, lo mas reciente primero. Pura sobre los datos de la bandeja (probada). */
export function flatten(tray: unknown): Notice[] {
  const out: Notice[] = [];
  if (!Array.isArray(tray)) return out;
  for (const t of tray as Any[]) {
    const list = Array.isArray(t?.notifications) ? (t.notifications as Any[]) : [];
    for (const n of list) {
      const data = (n.data as Any | undefined) ?? {};
      const type = Number(n.eType ?? t.eType ?? 0) || 0;
      out.push({
        id: typeof n.notificationID === "number" ? n.notificationID : null,
        type, group: groupOf(type),
        title: (data.title as ReactNode) ?? null,
        body: (data.body as ReactNode) ?? null,
        logo: (data.logo as ReactNode) ?? null,
        at: Number(n.rtCreated ?? 0) || 0,
        isNew: n.bNewIndicator === true,
        onClick: typeof data.onClick === "function" ? (data.onClick as () => void) : null,
      });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

export function readNotices(): Notice[] {
  try { return flatten(store()?.m_rgNotificationTray); } catch { return []; }
}
export function unviewed(): number {
  try {
    const n = Number(store()?.m_nUnviewedNotifications ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch { return 0; }
}
export function markRead(id: number | null): void {
  if (id === null) return;
  try { (store()?.MarkNotificationRead as ((i: number) => void) | undefined)?.call(store(), id); } catch { /* nada */ }
}
export function markAllRead(list: Notice[]): void { for (const n of list) if (n.isNew) markRead(n.id); }

/** Aviso inmediato cuando cambia la bandeja. */
export function onTrayChange(cb: () => void): () => void {
  try {
    const cbk = store()?.m_cbkNotificationTray as { Register?: (f: () => void) => { Unregister?: () => void } } | undefined;
    const h = cbk?.Register?.(cb);
    return () => { try { h?.Unregister?.(); } catch { /* nada */ } };
  } catch { return () => {}; }
}

export function ago(at: number, now = Date.now() / 1000): string {
  if (!at) return "";
  const d = Math.max(0, now - at);
  if (d < 60) return "ahora";
  if (d < 3600) return `hace ${Math.round(d / 60)} min`;
  if (d < 86400) return `hace ${Math.round(d / 3600)} h`;
  return `hace ${Math.round(d / 86400)} d`;
}

/** Al abrir los avisos: Steam pone a cero el contador de no vistos (como su pestaña). */
export function viewed(): void { try { (store()?.Viewed as (() => void) | undefined)?.call(store()); } catch { /* nada */ } }
/** Quitar un aviso de la bandeja (o todos). */
export function dismiss(id: number | null): boolean {
  try {
    const f = store()?.RemoveFromTrayWhere as ((cb: (t: Any) => boolean) => void) | undefined;
    if (!f) return false;
    f.call(store(), (t) => (id === null ? true : t?.notificationID === id));
    return true;
  } catch { return false; }
}
