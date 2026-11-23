// Mensajes de Steam (BBCode) → React: emoticonos y stickers de Steam como imagen, imagenes, invitaciones a jugar,
// negrita/cursiva/subrayado, codigo, citas y spoilers. [H] URLs del CDN de la comunidad de Steam.
import type { ReactNode } from "react";

const CDN = "https://community.cloudflare.steamstatic.com/economy";
export const emoticonUrl = (name: string) => `${CDN}/emoticon/${encodeURIComponent(name.replace(/:/g, ""))}`;
export const stickerUrl = (name: string) => `${CDN}/sticker/${encodeURIComponent(name)}`;

const attr = (args: string, key: string): string | null => {
  const m = new RegExp(`${key}="?([^"\\s\\]]+)"?`, "i").exec(args);
  return m ? m[1] : null;
};
const KNOWN = new Set(["h1", "h2", "h3", "hr", "list", "noparse", "br", "p", "center", "right", "left", "color", "size", "s", "strike"]);
const TAG_SRC = /\[(\w+)((?:=|\s)[^\]]*)?\]([\s\S]*?)\[\/\1\]|\[(\w+)((?:=|\s)[^\]]*)?\/\]/.source;

/** Convierte el BBCode de un mensaje en nodos de React (puro, probado). `big` = mensaje que es solo un emoticono/sticker. */
export function renderBB(raw: string, keyPrefix = "b"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  const text = String(raw ?? "");
  const TAG = new RegExp(TAG_SRC, "g"); // una por llamada: la recursion no debe compartir lastIndex
  for (let m = TAG.exec(text); m; m = TAG.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tag = (m[1] ?? m[4] ?? "").toLowerCase();
    const args = m[2] ?? m[5] ?? "";
    const inner = m[3] ?? "";
    const k = `${keyPrefix}-${i++}`;
    switch (tag) {
      case "emoticon":
        out.push(<img key={k} src={emoticonUrl(inner)} alt={`:${inner}:`} style={{ width: 20, height: 20, verticalAlign: "middle" }} />);
        break;
      case "sticker": {
        const t = attr(args, "type") ?? inner;
        out.push(<img key={k} src={stickerUrl(t)} alt="sticker" style={{ width: 96, height: 96, display: "block" }} />);
        break;
      }
      case "img": {
        const src = attr(args, "src") ?? inner.trim();
        out.push(<img key={k} src={src} alt="" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 8, display: "block" }} />);
        break;
      }
      case "gameinvite": case "lobbyinvite":
        out.push(<span key={k} style={{ display: "inline-block", padding: "2px 8px", borderRadius: 8, background: "rgba(255,255,255,0.12)", fontWeight: 600 }}>🎮 Invitación a jugar</span>);
        break;
      case "b": out.push(<b key={k}>{renderBB(inner, k)}</b>); break;
      case "i": out.push(<i key={k}>{renderBB(inner, k)}</i>); break;
      case "u": out.push(<u key={k}>{renderBB(inner, k)}</u>); break;
      case "code": out.push(<code key={k} style={{ fontFamily: "monospace", background: "rgba(0,0,0,0.25)", padding: "0 4px", borderRadius: 4 }}>{inner}</code>); break;
      case "quote": out.push(<span key={k} style={{ display: "block", borderLeft: "3px solid rgba(255,255,255,0.3)", paddingLeft: 6, opacity: 0.8 }}>{renderBB(inner, k)}</span>); break;
      case "spoiler": out.push(<span key={k} style={{ background: "rgba(0,0,0,0.6)", color: "transparent", borderRadius: 4 }} title="Spoiler">{inner}</span>); break;
      case "url": out.push(<u key={k}>{renderBB(inner || (attr(args, "url") ?? args.replace(/^=/, "")), k)}</u>); break;
      default:
        // Etiqueta que no conocemos y sin texto dentro (p. ej. un EFECTO del chat de Steam): se avisa en vez de perderla.
        if (!inner.trim() && !KNOWN.has(tag)) out.push(<span key={k} style={{ display: "inline-block", padding: "2px 8px", borderRadius: 8, background: "rgba(255,255,255,0.12)", fontWeight: 600 }}>✨ Efecto</span>);
        else out.push(...renderBB(inner, k));
    }
    last = TAG.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Mensaje que es solo un sticker o un emoticono: se pinta sin burbuja (como Steam). */
export const isOnlyMedia = (raw: string) => /^\s*(\[sticker[^\]]*\][\s\S]*?\[\/sticker\]|\[emoticon\][^[]*\[\/emoticon\])\s*$/i.test(raw ?? "");
