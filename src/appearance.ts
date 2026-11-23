// Apariencia del panel sincronizada con Panel de Control.
// Panel publica su contrato de temas como propiedades CSS en :root (las pone el tema activo de CSS Loader):
//   --pdc-theme-accent (r, g, b), --pdc-theme-surface, -surface-raised, -hairline, -outline, -text, -text-muted,
//   -on-accent, -selected-fill, -selected-text, -radius-sm/md/lg
// y guarda el acento elegido por el usuario en la preferencia "pdc:accent" (id de color o "default" = el del tema).
// Aqui solo LEEMOS esos valores (nada de su codigo). Un tema puede ademas dar valores propios para QAM Rail con
// --qrail-<mismo nombre>, que mandan sobre los de Panel.
import type { CSSProperties } from "react";

import { callPanel } from "./panelBridge";
import { findQamTree, qamDocumentOf } from "./qamDoc";

export type AppearanceMode = "panel" | "accent" | "rail" | `own:${string}`;

export interface Palette {
  panel: string; card: string; track: string; text: string; muted: string;
  accent: string; onAccent: string; focus: string; outline: string | null; cardRadius: number;
  /** Del tema (--pdc-theme-*): radio de las piezas dentro de una tarjeta, grosor del borde y mayusculas de los titulos. */
  radiusSm?: number; stroke?: number; labelTransform?: "none" | "uppercase" | "capitalize" | "lowercase";
  /** Tema «cristal»: superficies translúcidas con desenfoque de fondo (se apaga en modo ligero). */
  glass?: boolean;
}

export interface ThemeTokens {
  accent?: string; surface?: string; surfaceRaised?: string; hairline?: string; outline?: string;
  text?: string; textMuted?: string; onAccent?: string; selectedFill?: string; radiusMd?: number;
  radiusSm?: number; stroke?: number; labelTransform?: "none" | "uppercase" | "capitalize" | "lowercase";
}

/** Fondo del tema activo (la capa que cubre la pantalla de Big Picture), para continuarlo en el panel. */
export interface ThemeBg { image: string; size: string; position: string; repeat: string; base: string | null; where: string; attach?: "fixed" | "scroll" }
export interface AppearanceSource { accentPref: string | null; tokens: ThemeTokens; doc: string | null; bg?: ThemeBg | null; font?: string | null; adapter?: string | null }

/** El diseño propio de QAM Rail (el de siempre). */
export const RAIL: Palette = {
  panel: "#1b1d23", card: "#272a32", track: "#3a3e48", text: "#f2f3f5", muted: "#c4c8d0",
  accent: "#ff8a3d", onAccent: "#1b1d23", focus: "#ffffff", outline: null, cardRadius: 22,
};

// Colores de acento que ofrece Panel de Control (id -> hex), para traducir la preferencia "pdc:accent".
export const PDC_ACCENTS: Record<string, string> = {
  blue: "#4ea1ff", sky: "#38bdf8", cyan: "#22b8e0", teal: "#22c7c0", mint: "#34d399", green: "#3fbf6f",
  lime: "#a3d43f", yellow: "#f5c542", amber: "#e0952a", orange: "#f2683c", red: "#e5484d", rose: "#fb7185",
  pink: "#ec5c9d", fuchsia: "#d946ef", purple: "#9b7bf0", indigo: "#6366f1",
};
const PDC_DEFAULT_ACCENT = "#4ea1ff";
// El aspecto de Panel sin tema: casi negro, tarjetas con borde fino.
const PDC_BASE = { surface: "#060608", surfaceRaised: "#0c0c10", hairline: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.92)", textMuted: "rgba(255,255,255,0.5)", onAccent: "#06121f" };

// ---------------- Puro (probado en tests/appearance.test.ts) ----------------
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d+)\s*)?\)$/i;

export function parseColor(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return HEX.test(s) || RGB.test(s) ? s : null;
}

/** "r, g, b" (o "r g b") -> "#rrggbb"; null si no es valido. */
export function tripletToHex(v: string | null | undefined): string | null {
  const parts = (v ?? "").trim().split(/\s*,\s*|\s+/).filter(Boolean);
  if (parts.length !== 3 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null;
  return `#${parts.map((p) => Number(p).toString(16).padStart(2, "0")).join("")}`;
}

export function parseRadius(v: string | null | undefined): number | null {
  const m = /^(\d{1,2}(?:\.\d+)?)(?:px)?$/.exec((v ?? "").trim());
  return m ? Number(m[1]) : null;
}

/** [r, g, b] de un color (#hex o rgb/rgba); la transparencia se ignora. */
export function rgbOf(c: string): [number, number, number] | null {
  const s = c.trim();
  if (HEX.test(s)) {
    let h = s.slice(1);
    if (h.length <= 4) h = h.split("").map((x) => x + x).join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = RGB.exec(s);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Mezcla `a` con `b` en proporcion t (0 = a, 1 = b). Devuelve #hex; si no entiende un color devuelve `a`. */
export function mix(a: string, b: string, t: number): string {
  const x = rgbOf(a), y = rgbOf(b);
  if (!x || !y) return a;
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** Texto legible sobre un color: oscuro sobre claros, blanco sobre oscuros. */
export function onColor(c: string): string {
  const v = rgbOf(c);
  if (!v) return "#111318";
  const [r, g, b] = v.map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.32 ? "#111318" : "#ffffff";
}

/** El acento que muestra Panel: el elegido por el usuario o, con "default"/sin preferencia, el del tema. */
/** Acento de Panel: el que elegiste en Panel y si no, el que publica (--pdc-theme-accent). */
export function panelAccent(pref: string | null, tokens: ThemeTokens): string {
  if (pref && PDC_ACCENTS[pref]) return PDC_ACCENTS[pref];
  return tokens.accent ?? PDC_DEFAULT_ACCENT;
}

// ---------------- Temas propios (experimentales) ----------------
// Paletas de QAM Rail que no dependen de Panel ni de CSS Loader. Para probar ideas de diseño.
export const OWN_THEMES: Array<{ id: string; name: string; note: string; p: Palette }> = [
  { id: "medianoche", name: "Medianoche", note: "azul profundo", p: { panel: "#0f1626", card: "#18233a", track: "#2a3a5a", text: "#eef3ff", muted: "#a9b6d3", accent: "#5b9dff", onAccent: "#0b1220", focus: "#ffffff", outline: "rgba(120,160,255,0.14)", cardRadius: 20 } },
  { id: "oled", name: "OLED", note: "negro puro, ahorra en OLED", p: { panel: "#000000", card: "#0b0b0d", track: "#26262c", text: "#f5f5f7", muted: "#9a9aa3", accent: "#22d3ee", onAccent: "#001318", focus: "#ffffff", outline: "rgba(255,255,255,0.08)", cardRadius: 18 } },
  { id: "bosque", name: "Bosque", note: "verdes suaves", p: { panel: "#121a16", card: "#1b2720", track: "#2d4034", text: "#eef6f0", muted: "#a8c2b0", accent: "#4ade80", onAccent: "#06210f", focus: "#ffffff", outline: null, cardRadius: 22 } },
  { id: "sakura", name: "Sakura", note: "ciruela y rosa", p: { panel: "#1c1220", card: "#2a1b2f", track: "#45304b", text: "#fbeffa", muted: "#d4b4d2", accent: "#f472b6", onAccent: "#2a0a1c", focus: "#ffffff", outline: null, cardRadius: 24 } },
  { id: "retro", name: "Retro CRT", note: "ámbar de terminal", p: { panel: "#140f08", card: "#1f170c", track: "#3a2b14", text: "#ffd99a", muted: "#c9a46a", accent: "#ffb020", onAccent: "#1a1000", focus: "#fff1d0", outline: "rgba(255,176,32,0.18)", cardRadius: 10 } },
  { id: "cristal", name: "Cristal", note: "translúcido, estilo Apple", p: { panel: "rgba(24, 26, 34, 0.74)", card: "rgba(255, 255, 255, 0.13)", track: "rgba(255, 255, 255, 0.20)", text: "#f6f7fb", muted: "rgba(235, 238, 248, 0.68)", accent: "#64a8ff", onAccent: "#ffffff", focus: "#ffffff", outline: "rgba(255, 255, 255, 0.16)", cardRadius: 22, glass: true } },
  { id: "papel", name: "Papel (claro)", note: "experimento claro", p: { panel: "#f3f1ec", card: "#ffffff", track: "#dcd8cf", text: "#1d1b18", muted: "#5d5850", accent: "#d9480f", onAccent: "#ffffff", focus: "#1d1b18", outline: "rgba(0,0,0,0.08)", cardRadius: 20 } },
];

export function buildPalette(mode: AppearanceMode, src: AppearanceSource): Palette {
  if (mode === "rail") return RAIL;
  if (mode.startsWith("own:")) return OWN_THEMES.find((t) => `own:${t.id}` === mode)?.p ?? RAIL;
  // Con un tema que trae su propio color (adaptador, p. ej. el latón de Luminous Atlas), manda el del tema: antes las
  // tarjetas tomaban el tema pero el riel, las barras (potencia, brillo) y lo seleccionado seguían con el azul de Panel.
  const accent = src.adapter && src.tokens.accent ? src.tokens.accent : panelAccent(src.accentPref, src.tokens);
  if (mode === "accent") return { ...RAIL, accent, onAccent: onColor(accent) };
  const t = src.tokens;
  // Sin colores publicados (p. ej. Luminous Atlas) se toma el color base del fondo del tema.
  const base = src.bg?.base && rgbOf(src.bg.base) ? mix(src.bg.base, "#000000", 0.35) : null;
  const panel = t.surface ?? base ?? PDC_BASE.surface;
  const card = t.surfaceRaised ?? (base ? mix(base, "#ffffff", 0.07) : PDC_BASE.surfaceRaised);
  const text = t.text ?? PDC_BASE.text;
  return {
    panel, card, text,
    // Pistas y chips apagados: un poco mas claros que la tarjeta para que se vean sobre ella.
    track: mix(card, rgbOf(text) ? text : "#ffffff", 0.14),
    muted: t.textMuted ?? PDC_BASE.textMuted,
    accent,
    onAccent: t.onAccent ?? PDC_BASE.onAccent,
    focus: "#ffffff",
    outline: t.outline ?? t.hairline ?? PDC_BASE.hairline,
    cardRadius: t.radiusMd !== undefined ? Math.max(8, Math.min(28, t.radiusMd + 6)) : 20,
    ...(t.radiusSm !== undefined ? { radiusSm: Math.max(6, Math.min(24, t.radiusSm + 4)) } : {}),
    ...(t.stroke !== undefined ? { stroke: Math.max(0, Math.min(3, t.stroke)) } : {}),
    ...(t.labelTransform ? { labelTransform: t.labelTransform } : {}),
  };
}

const TOKEN_PROPS: Array<[keyof ThemeTokens, string, "color" | "triplet" | "radius" | "stroke" | "transform"]> = [
  ["accent", "accent", "triplet"], ["surface", "surface", "color"], ["surfaceRaised", "surface-raised", "color"],
  ["hairline", "hairline", "color"], ["outline", "outline", "color"], ["text", "text", "color"],
  ["textMuted", "text-muted", "color"], ["onAccent", "on-accent", "color"], ["selectedFill", "selected-fill", "color"],
  ["radiusMd", "radius-md", "radius"], ["radiusSm", "radius-sm", "radius"],
  ["stroke", "stroke", "stroke"], ["labelTransform", "label-transform", "transform"],
];

export function parseStroke(v: string | null | undefined): number | null {
  const m = /^(\d(?:\.\d+)?)(?:px)?$/.exec((v ?? "").trim());
  return m ? Number(m[1]) : null;
}
export function parseTransform(v: string | null | undefined): "none" | "uppercase" | "capitalize" | "lowercase" | null {
  const t = (v ?? "").trim().replace(/^["']|["']$/g, "").toLowerCase();
  return t === "none" || t === "uppercase" || t === "capitalize" || t === "lowercase" ? t : null;
}

/** Lee los tokens de un documento: primero --qrail-*, si no --pdc-theme-*. */
export function readTokens(get: (prop: string) => string): ThemeTokens {
  const out: ThemeTokens = {};
  for (const [key, name, kind] of TOKEN_PROPS) {
    for (const prefix of ["--qrail-", "--pdc-theme-"]) {
      const raw = get(prefix + name);
      const v = kind === "color" ? parseColor(raw) : kind === "triplet" ? tripletToHex(raw) ?? parseColor(raw) : kind === "stroke" ? parseStroke(raw) : kind === "transform" ? parseTransform(raw) : parseRadius(raw);
      if (v !== null && v !== undefined) { (out as Record<string, unknown>)[key] = v; break; }
    }
  }
  return out;
}

// ---------------- Estado vivo ----------------
const LS_MODE = "qam-rail:appearance";
const LS_CACHE = "qam-rail:appearance-cache";
const ls = {
  get: (k: string): string | null => { try { return window.localStorage?.getItem(k) ?? null; } catch { return null; } },
  set: (k: string, v: string) => { try { window.localStorage?.setItem(k, v); } catch { /* sin almacenamiento */ } },
};

function loadCache(): AppearanceSource {
  try {
    const c = JSON.parse(ls.get(LS_CACHE) ?? "null") as AppearanceSource | null;
    if (c && typeof c === "object" && c.tokens && typeof c.tokens === "object") return { accentPref: c.accentPref ?? null, tokens: c.tokens, doc: c.doc ?? null, bg: c.bg ?? null, font: c.font ?? null, adapter: c.adapter ?? null };
  } catch { /* cache roto */ }
  return { accentPref: ls.get("pdc:accent"), tokens: {}, doc: null };
}

const readMode = (): AppearanceMode => {
  const m = ls.get(LS_MODE);
  if (m && m.startsWith("own:") && OWN_THEMES.some((t) => `own:${t.id}` === m)) return m as AppearanceMode;
  return m === "accent" || m === "rail" ? m : "panel";
};

// ---- Personalización propia (encima de cualquier tema): acento, esquinas y densidad ----
export type Radius = "tema" | "rectas" | "redondas";
export type Density = "compacta" | "normal" | "amplia";
export interface UiPrefs { radius: Radius; density: Density; accent: string | null }
export const ACCENT_CHOICES = ["#ff8a3d", "#1a9fff", "#4ade80", "#f472b6", "#a78bfa", "#facc15", "#ef4444"];
export const DENSITY: Record<Density, { pad: string; gap: number; pane: number }> = {
  compacta: { pad: "9px 12px", gap: 7, pane: 8 },
  normal: { pad: "12px 14px", gap: 9, pane: 10 },
  amplia: { pad: "15px 16px", gap: 11, pane: 13 },
};
const LS_UI = "qam-rail:ui-prefs";
const DEF_UI: UiPrefs = { radius: "tema", density: "normal", accent: null };
let ui: UiPrefs = (() => { try { return { ...DEF_UI, ...JSON.parse(window.localStorage?.getItem(LS_UI) ?? "{}") }; } catch { return { ...DEF_UI }; } })();
export const uiPrefs = (): UiPrefs => ui;

/** Puro (probado): la paleta con lo que eligió el usuario encima. */
export function withPrefs(p: Palette, u: UiPrefs): Palette {
  if (!u.accent && u.radius === "tema") return p;
  const out = { ...p };
  if (u.accent) { out.accent = u.accent; out.onAccent = onColor(u.accent); }
  if (u.radius === "rectas") out.cardRadius = 10;
  if (u.radius === "redondas") out.cardRadius = 28;
  return out;
}

let mode: AppearanceMode = readMode();
let source: AppearanceSource = loadCache();
let palette: Palette = withPrefs(buildPalette(mode, source), ui);
let version = 0;
const subs = new Set<() => void>();

export const currentPalette = (): Palette => palette;
export const appearanceMode = (): AppearanceMode => mode;
export const appearanceSource = (): AppearanceSource => source;
export const appearanceVersion = (): number => version;
export const subscribeAppearance = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export function setUiPrefs(p: Partial<UiPrefs>): void {
  ui = { ...ui, ...p };
  try { window.localStorage?.setItem(LS_UI, JSON.stringify(ui)); } catch { /* nada */ }
  palette = withPrefs(buildPalette(mode, source), ui);
  version++; subs.forEach((f) => f());
}

function commit(nextMode: AppearanceMode, nextSource: AppearanceSource): void {
  const next = withPrefs(buildPalette(nextMode, nextSource), ui);
  const changed = JSON.stringify(next) !== JSON.stringify(palette);
  mode = nextMode;
  source = nextSource;
  palette = next;
  if (changed) { version++; subs.forEach((f) => f()); }
}

export function setAppearanceMode(m: AppearanceMode): void {
  ls.set(LS_MODE, m);
  commit(m, source);
}

/** Pruebas: fija la fuente sin leer documentos. */
export function setAppearanceSourceForTest(s: AppearanceSource, m: AppearanceMode = "panel"): void { commit(m, s); }

function candidateDocs(): Array<{ doc: Document; tag: string }> {
  const out: Array<{ doc: Document; tag: string }> = [];
  const add = (doc: Document | null | undefined, tag: string) => { if (doc && !out.some((d) => d.doc === doc)) out.push({ doc, tag }); };
  add((window as unknown as { __qamRailModalEl?: HTMLElement | null }).__qamRailModalEl?.ownerDocument, "panel");
  try { add(qamDocumentOf(findQamTree()), "qam"); } catch { /* sin arbol */ }
  add(document, "principal");
  return out;
}

/** Firma barata de los estilos de CSS Loader: si no cambia, no hace falta recalcular estilos (que cuesta a 7 W). */
function signature(docs: Array<{ doc: Document }>, pref: string | null): string {
  return docs.map(({ doc }) => {
    let n = 0, len = 0;
    try { doc.querySelectorAll("style.css-loader-style, style[id^='css-loader']").forEach((s) => { n++; len += s.textContent?.length ?? 0; }); } catch { /* doc cerrado */ }
    return `${n}:${len}:${doc.documentElement?.getAttribute("style")?.length ?? 0}`;
  }).join("|") + `|${pref ?? ""}`;
}

let lastSig: string | null = null;

/** Relee acento y tokens. `force` ignora la firma (diagnostico). Devuelve por documento lo leido. */
export async function refreshAppearance(force = false): Promise<Array<{ doc: string; tokens: ThemeTokens }>> {
  let pref = ls.get("pdc:accent");
  if (pref === null) {
    try { pref = (await callPanel<Record<string, string>>("get_ui_prefs", [], []))?.["pdc:accent"] ?? null; } catch { pref = null; }
  }
  const docs = candidateDocs();
  const sig = signature(docs, pref);
  const seen: Array<{ doc: string; tokens: ThemeTokens }> = [];
  if (!force && sig === lastSig) return seen;
  lastSig = sig;
  let chosen: { tokens: ThemeTokens; doc: string | null } = { tokens: {}, doc: null };
  for (const { doc, tag } of docs) {
    let tokens: ThemeTokens = {};
    try {
      const cs = doc.defaultView?.getComputedStyle(doc.documentElement);
      if (cs) tokens = readTokens((p) => cs.getPropertyValue(p));
    } catch { /* doc cerrado */ }
    seen.push({ doc: tag, tokens });
    if (!chosen.doc && Object.keys(tokens).length) chosen = { tokens, doc: tag };
  }
  // El fondo se busca en la ventana de Big Picture; si ahora no se ve (p. ej. con un juego delante) se conserva el ultimo.
  let bg: ThemeBg | null = source.bg ?? null;
  let font: string | null = null;
  let adapter: string | null = null;
  const main = docs.find((d) => d.tag === "panel")?.doc ?? document;
  try {
    // 1) Tema conocido con variables propias (p. ej. Luminous Atlas): sus colores y su motivo del QAM.
    const cs = main.defaultView?.getComputedStyle(main.documentElement);
    const ad = cs ? readAdapter((p) => cs.getPropertyValue(p), (v) => normalizeColor(main, v)) : null;
    if (ad) {
      chosen = { tokens: { ...ad.tokens, ...chosen.tokens }, doc: chosen.doc ?? "panel" };
      if (ad.bg) bg = ad.bg;
      font = ad.font;
      adapter = ad.adapter.name;
    }
  } catch { /* sin adaptador */ }
  // 2) Si no, la capa de fondo que se vea en Big Picture.
  if (!adapter) { try { const f = findThemeBackground(main); if (f.chosen) bg = f.chosen; } catch { /* sin fondo */ } }
  const next: AppearanceSource = { accentPref: pref, tokens: chosen.tokens, doc: chosen.doc, bg, font, adapter };
  ls.set(LS_CACHE, JSON.stringify(next));
  commit(mode, next);
  return seen;
}

// ---------------- Adaptadores por tema ----------------
// Algunos temas definen sus propias variables en la ventana de Big Picture (donde vive el panel). Si se conocen,
// el panel se viste con ELLAS: mismos colores, mismo motivo de fondo del QAM y misma tipografia.
export interface ThemeAdapter {
  id: string; name: string; probe: string;
  colors: Partial<Record<keyof ThemeTokens, string>>;
  motif?: string[]; base?: string; font?: string;
}
export const THEME_ADAPTERS: ThemeAdapter[] = [
  {
    // Hooandee · Luminous Atlas: pergamino, tinta verde y laton (tokens.css se inyecta en bigpicture y QuickAccess).
    id: "luminous-atlas", name: "Luminous Atlas", probe: "--hla-text",
    colors: { surface: "--hla-paper-deep", surfaceRaised: "--hla-folio-surface", text: "--hla-text", textMuted: "--hla-muted", outline: "--hla-line", accent: "--hla-brass", onAccent: "--hla-ink" },
    motif: ["--hla-motif-qam-1", "--hla-motif-qam-2", "--hla-motif-qam-3", "--hla-motif-qam-4"], base: "--hla-paper-deep", font: "--hla-serif",
  },
];

/** Normaliza cualquier color CSS (rgb con espacios, nombres, color-mix...) a rgb()/rgba() usando el propio navegador. */
export function normalizeColor(doc: Document, v: string): string | null {
  const raw = v.trim();
  if (!raw) return null;
  if (parseColor(raw)) return raw;
  try {
    const el = doc.createElement("span");
    el.style.color = "rgb(1, 2, 3)";
    el.style.color = raw;
    if (el.style.color === "rgb(1, 2, 3)") return null;
    el.style.display = "none";
    doc.body.appendChild(el);
    const out = doc.defaultView?.getComputedStyle(el).color ?? null;
    el.remove();
    return out && parseColor(out) ? out : null;
  } catch { return null; }
}

/** Puro con `get` (probado): aplica un adaptador si su variable de prueba existe. */
export function readAdapter(get: (prop: string) => string, norm: (v: string) => string | null): { adapter: ThemeAdapter; tokens: ThemeTokens; bg: ThemeBg | null; font: string | null } | null {
  for (const a of THEME_ADAPTERS) {
    if (!get(a.probe).trim()) continue;
    const tokens: ThemeTokens = {};
    for (const [k, prop] of Object.entries(a.colors) as Array<[keyof ThemeTokens, string]>) {
      const c = norm(get(prop));
      if (c) (tokens as Record<string, unknown>)[k] = k === "accent" ? (rgbOf(c) ? `#${rgbOf(c)!.map((x) => x.toString(16).padStart(2, "0")).join("")}` : c) : c;
    }
    const layers = (a.motif ?? []).map((p) => get(p).trim()).filter((x) => x && x !== "none");
    const base = a.base ? norm(get(a.base)) : null;
    const bg: ThemeBg | null = layers.length ? { image: layers.join(", "), size: "100% 100%", position: "right center", repeat: "no-repeat", base, where: `adaptador ${a.id}`, attach: "scroll" } : null;
    const font = a.font ? get(a.font).trim() || null : null;
    return { adapter: a, tokens, bg, font };
  }
  return null;
}

/** Tipografia del tema (si el adaptador la da y se sigue a Panel). */
export const themeFont = (): string | null => (mode === "panel" ? source.font ?? null : null);

/** Puro (probado): cuantas capas tiene un background-image (comas de primer nivel). */
export function layerCount(v: string): number {
  let depth = 0, n = 1;
  for (const ch of v) { if (ch === "(") depth++; else if (ch === ")") depth--; else if (ch === "," && depth === 0) n++; }
  return n;
}
const fill = (v: string, n: number, def: string) => { const parts = v.split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean); return Array.from({ length: n }, (_, i) => parts[i] ?? parts[parts.length - 1] ?? def).join(", "); };

/**
 * Busca la capa de fondo del tema: elementos (y ::before/::after) que cubren ≥ 70 % de la pantalla con imagen de
 * fondo. Recorre poco (profundidad 8, 600 elementos) y solo cuando cambia el tema. Prefiere imagenes (url) a
 * degradados; devuelve tambien los candidatos para el diagnostico.
 */
export function findThemeBackground(doc: Document): { chosen: ThemeBg | null; candidates: ThemeBg[] } {
  const win = doc.defaultView;
  const out: ThemeBg[] = [];
  if (!win || !doc.body) return { chosen: null, candidates: out };
  const vw = win.innerWidth, vh = win.innerHeight;
  let base: string | null = null;
  const queue: Array<{ el: Element; d: number }> = [{ el: doc.body, d: 0 }];
  let seen = 0;
  while (queue.length && seen < 600) {
    const { el, d } = queue.shift()!;
    seen++;
    if ((el as HTMLElement).dataset?.qrailRoot) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 0.7 * vw && r.height >= 0.7 * vh) {
      for (const pseudo of [null, "::before", "::after"]) {
        const cs = win.getComputedStyle(el, pseudo);
        if (!base && cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) base = cs.backgroundColor;
        const bi = cs.backgroundImage;
        if (bi && bi !== "none" && (pseudo === null || cs.content !== "none")) {
          const cls = typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 2).join(".") : "";
          out.push({ image: bi, size: cs.backgroundSize, position: cs.backgroundPosition, repeat: cs.backgroundRepeat, base: cs.backgroundColor || null, where: `${el.nodeName}.${cls}${pseudo ?? ""}` });
        }
      }
    }
    if (d < 8) for (const c of Array.from(el.children)) queue.push({ el: c, d: d + 1 });
  }
  const pick = out.find((c) => /url\(/.test(c.image)) ?? out.find((c) => /repeating|conic|radial/.test(c.image)) ?? out[0] ?? null;
  return { chosen: pick ? { ...pick, base: base ?? pick.base } : null, candidates: out.slice(0, 10) };
}

const LS_BG = "qam-rail:theme-bg";
export const themeBgEnabled = () => ls.get(LS_BG) !== "off";
export function setThemeBgEnabled(on: boolean): void { ls.set(LS_BG, on ? "on" : "off"); version++; subs.forEach((f) => f()); }

/**
 * Estilo de una superficie del panel (riel, cuerpo, columna) continuando el fondo del tema: la misma imagen,
 * fija a la pantalla (encaja con la de Big Picture), bajo un velo del color del panel para que se lea.
 * En el modo ligero (≤ 8 W) solo el velo: una imagen fija repinta al desplazar.
 */
export function surfaceStyle(lite: boolean): CSSProperties {
  const p = palette;
  // Cristal: translúcido con desenfoque y un brillo fino arriba. A potencia baja, sin desenfoque (es caro) y más opaco.
  if (p.glass) {
    return lite
      ? { background: "rgba(28, 30, 38, 0.94)" }
      : { background: `linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02) 40%), ${p.panel}`, backdropFilter: "blur(44px) saturate(180%)", WebkitBackdropFilter: "blur(44px) saturate(180%)" } as CSSProperties;
  }
  const bg = source.bg;
  if (mode !== "panel" || !bg || !themeBgEnabled()) return { background: p.panel };
  const n = layerCount(bg.image);
  // Motivo propio del tema (adaptador): va tal cual sobre su color, sin velo y pegado al panel (barato: no repinta).
  if (bg.attach === "scroll") {
    return {
      backgroundColor: p.panel, backgroundImage: bg.image,
      backgroundSize: fill(bg.size, n, "100% 100%"), backgroundPosition: fill(bg.position, n, "right center"), backgroundRepeat: fill(bg.repeat, n, "no-repeat"),
    };
  }
  if (lite) return { background: p.panel };
  return {
    backgroundColor: p.panel,
    backgroundImage: `linear-gradient(${alpha(p.panel, 0.72)}, ${alpha(p.panel, 0.86)}), ${bg.image}`,
    backgroundSize: `100% 100%, ${fill(bg.size, n, "auto")}`,
    backgroundPosition: `0 0, ${fill(bg.position, n, "0% 0%")}`,
    backgroundRepeat: `no-repeat, ${fill(bg.repeat, n, "repeat")}`,
    backgroundAttachment: `scroll, ${Array(n).fill("fixed").join(", ")}`,
  };
}

/**
 * Fondo de lo que flota encima del contenido que se desplaza (reproductor anclado). En Cristal el desenfoque del panel
 * no alcanza a sus propios hijos: el anclado necesita el suyo y ser mas opaco, si no se mezcla con lo de detras.
 * En el resto, el color del panel debajo de la tarjeta (las tarjetas translucidas dejaban ver el contenido).
 */
export function dockSurface(lite: boolean): CSSProperties {
  const p = palette;
  if (p.glass) {
    return lite
      ? { background: "rgba(30, 32, 42, 0.97)" }
      : { background: "rgba(30, 33, 44, 0.90)", backdropFilter: "blur(36px) saturate(170%)", WebkitBackdropFilter: "blur(36px) saturate(170%)" } as CSSProperties;
  }
  return { backgroundColor: p.panel, backgroundImage: `linear-gradient(${p.card}, ${p.card})` };
}

/** Tras abrir el panel, cuando ya esta pintado: no compite con la apertura. */
export function scheduleAppearanceRefresh(ms = 450): () => void {
  const id = window.setTimeout(() => { void refreshAppearance(); }, ms);
  return () => window.clearTimeout(id);
}

// ---------------- Temas de CSS Loader (los que instala y activa Panel de Control) ----------------
export interface CssPatch { name: string; value: string; options: string[]; type: string }
export interface CssTheme { name: string; displayName: string; version: string; author: string; enabled: boolean; patches: CssPatch[] }

export function parseCssThemes(raw: unknown): CssTheme[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t) => t && typeof t === "object" && typeof (t as { name?: unknown }).name === "string").map((t) => {
    const o = t as Record<string, unknown>;
    const patches = (Array.isArray(o.patches) ? o.patches : []).filter((p) => p && typeof p === "object" && typeof (p as { name?: unknown }).name === "string").map((p) => {
      const q = p as Record<string, unknown>;
      return { name: String(q.name), value: String(q.value ?? q.default ?? ""), options: Array.isArray(q.options) ? q.options.map(String) : [], type: String(q.type ?? "") };
    });
    return { name: String(o.name), displayName: String(o.display_name ?? o.displayName ?? o.name), version: String(o.version ?? ""), author: String(o.author ?? ""), enabled: o.enabled === true, patches };
  });
}

/** Cambia una opcion (patch) de un tema de CSS Loader. */
export async function setCssPatch(themeName: string, patchName: string, value: string): Promise<boolean> {
  const be = (window as unknown as { DeckyBackend?: { call?: (route: string, ...a: unknown[]) => Promise<unknown> } }).DeckyBackend;
  if (typeof be?.call !== "function") return false;
  try {
    const r = (await be.call("loader/call_legacy_plugin_method", "CSS Loader", "set_patch_of_theme", { themeName, patchName, value })) as { success?: boolean } | null;
    return !r || r.success !== false;
  } catch { return false; }
}

/** Temas instalados en CSS Loader (plugin "legacy" de Decky: se llama con kwargs). null si no esta. */
export async function cssLoaderThemes(): Promise<CssTheme[] | null> {
  const be = (window as unknown as { DeckyBackend?: { call?: (route: string, ...a: unknown[]) => Promise<unknown> } }).DeckyBackend;
  if (typeof be?.call !== "function") return null;
  try {
    const res = await be.call("loader/call_legacy_plugin_method", "CSS Loader", "get_themes", {});
    const r = res as { success?: boolean; result?: unknown } | null;
    if (!r || r.success === false) return null;
    return parseCssThemes("result" in (r as object) ? r.result : res);
  } catch { return null; }
}

/** El color con transparencia (para tintes del acento). */
export function alpha(c: string, a: number): string {
  const v = rgbOf(c);
  return v ? `rgba(${v[0]},${v[1]},${v[2]},${a})` : c;
}

/** Borde fino del contenedor con el aspecto de Panel (nada con el diseño propio). */
export const outlineShadow = (): string | undefined => { const o = palette.outline; return o ? `inset 0 0 0 1px ${o}` : undefined; };
