import { HELP } from "./help";
import { Focusable, Navigation } from "@decky/ui";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FC, type ReactNode } from "react";

import { appearanceVersion, outlineShadow, scheduleAppearanceRefresh, subscribeAppearance, surfaceStyle, themeFont } from "./appearance";

import { activatePlugin, DECKY_TAB } from "./colores";
import { findPlugin, hostablePlugins } from "./decky";
import { useConn } from "./hooks";
import { useMode } from "./mode";
import { BTN, itemOf, listTarget, neighbor, rowOf, takeFocus, visualRows } from "./nav";
import { PluginColumn } from "./PluginColumn";
import { lowPower } from "./tdpControl";
import { VisibleContext } from "./visible";
import { DiagView, FluencyBanner } from "./QamDiag";
import { AppearanceCard } from "./QamAppearance";
import { toggleKeyboard } from "./keyboard";
import { QamAppOptions, QamStore } from "./QamAppsCard";
import { QamDesktopApps } from "./QamDesktopApps";
import { OpenAppsStrip } from "./QamOpenApps";
import { QamChannelCard } from "./QamChannel";
import { NavTraceCard, SelfTestCard } from "./QamNavTrace";
import { QamSelfUpdateCard } from "./QamSelfUpdate";
import { BluetoothCard, WifiCard } from "./QamNetwork";
import { DeckyCard, StoreColumn } from "./QamDecky";
import { NoticesSection, useUnviewed } from "./QamNotices";
import { markOpenPainted, measurePaint, noteInputFocus, observeLongTasks } from "./perfLog";
import { readFriends } from "./social";
import { DECKY_ROUTES } from "./decky";
import { bump, loadUsage, rank } from "./pluginUsage";
import { activeHomeMode, homePlugins, loadHomeModes, modeDef, onHomeModesChange, saveHomeModes, togglePin, type HomeModeId } from "./homeModes";
import { HomeModeBar, PinEditor } from "./QamHomeModes";
import { situation } from "./situation";
import { crumb } from "./crumbs";
import { DIR, ctrlRef, focusBegin, focusFlush, focusMove, focusSection, focusTap } from "./focusLog";
import { checkTvAudio } from "./audioTv";
import { liteCss, menuClosed, menuOpened } from "./menuEfficiency";
import { BenchView } from "./QamBench";
import { Fade, HomeGame, HomeNormal } from "./QamHome";
import {
  AppGrid, AppRow, Card, DisplaySection, Fold, SteamExtras, setHelpSink, GameKindAuto, GameKindCard, GameProfileCard, EnergyExtras, PanelSaver, PowerModes, Label, MusicCard, PluginIcons, QuickDisplay, QuickToggles, Shortcut, useApps, useNight,
} from "./QamSections";
import { FriendColumn, GroupColumn, SocialSection, VoiceBar, useUnread } from "./QamSocial";
import { once, useTap } from "./tap";
import { EnergyTdp } from "./QamTdp";
import { getRegistry, type SectionId } from "./registry";
import { clamp01, sc, type Unreg } from "./steam";
import * as UI from "./ui";
import { COLORS, Chip, FONT, ICONS, ICONS2, Icon, Row, ToggleRow, XSlider, setBodyDir, colorFor, useThrottled, paneGap } from "./ui";

// Riel fijo: mismo orden y sitio en ambos modos (solo cambia el contenido de Inicio).
const SECTIONS: Array<{ id: SectionId; label: string; icon: string }> = [
  { id: "home", label: "Inicio", icon: ICONS2.home },
  { id: "energy", label: "Rendimiento", icon: ICONS.bolt },
  { id: "display", label: "Imagen y sonido", icon: "M3 4h14v10H3zM7 18h6M10 14v4M19.5 8.5a3.5 3.5 0 0 1 0 5M21.5 6.5a6.5 6.5 0 0 1 0 9" },
  { id: "connect", label: "Conexiones", icon: ICONS2.wifi },
  { id: "apps", label: "Apps", icon: ICONS.grid },
  { id: "social", label: "Social", icon: ICONS2.users },
  { id: "more", label: "Más", icon: ICONS2.more },
];
const GAME_ICON = "M6 12h4M8 10v4M15 11h.01M18 13h.01M7 6h10a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4h-1l-2-2h-4l-2 2H7a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4z";

// Pestañas del QAM de Steam (QuickAccessTab) y la de Panel de Control. [H] el id de Panel (5260355) viene de su codigo; sin verificar.
const TAB = { notifications: 0, remotePlay: 1, voice: 2, friends: 3, settings: 4, perf: 5, help: 6, soundtrack: 7, decky: 999, panel: 5260355 };
const PANEL_PLUGIN = "Panel de Control";

type Side = { kind: "plugin"; name: string } | { kind: "friend"; id: number } | { kind: "group"; id: string } | { kind: "store" };

const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
const items = (root: Element | null) => (root ? [...root.querySelectorAll<HTMLElement>('[data-qr="item"]')].filter((e) => e.getClientRects().length > 0) : []);

export const QamApp: FC<{ log: (m: string) => void; onNative: (tab?: number) => void; onClose: () => void }> = ({ log, onNative, onClose }) => {
  const [section, setSectionRaw] = useState<SectionId>("home");
  // Registro de rendimiento: hora de cada cambio de seccion / apertura de columna, medida hasta el pintado.
  const switchT0 = useRef<number | null>(null);
  const columnT0 = useRef<number | null>(null);
  // Cada seccion recuerda donde estaba el desplazamiento (comparten el mismo contenedor).
  const scrollPos = useRef<Partial<Record<SectionId, number>>>({});
  const setSection = useCallback((id: SectionId) => {
    switchT0.current = performance.now();
    focusSection(sectionRef.current, id);
    const b = bodyEl.current;
    if (b) scrollPos.current[sectionRef.current] = b.scrollTop;
    setSectionRaw(id);
  }, []);
  const [appsTab, setAppsTab] = useState<"apps" | "steam" | "plugins">("apps");
  const [store, setStore] = useState(false);
  const [appOpt, setAppOpt] = useState<string | null>(null);
  const [bright, setBright] = useState(0.5);
  const [vol, setVol] = useState(0.5);
  const [toast, setToast] = useState("");
  const [bench, setBench] = useState(false);
  const visited = useRef<SectionId[]>([]);
  const [diag, setDiag] = useState(false);
  const [look, setLook] = useState(false);
  const [usage, setUsage] = useState(loadUsage);
  // Plugin de Decky abierto en la columna de la izquierda (null = ninguno) y quien la abrio (para devolverle el foco).
  // Columna lateral abierta: un plugin, la conversacion con un amigo o un grupo (null = ninguna).
  const [side, setSideRaw] = useState<Side | null>(null);
  const setSide = useCallback((v: Side | null) => {
    if (v) columnT0.current = performance.now();
    crumb(v ? `columna: ${v.kind}${"name" in v ? ` ${v.name}` : ""}` : "columna cerrada");
    setSideRaw(v);
  }, []);
  const hosted = side;
  const opener = useRef<HTMLElement | null>(null);

  // Navegacion con mando: "rail" = columna de iconos, "body" = contenido de la seccion.
  const zone = useRef<"rail" | "body">("rail");
  const railEls = useRef<Record<string, HTMLElement | null>>({});
  const bodyEl = useRef<HTMLDivElement | null>(null);
  // Ultimo toque en pantalla: el foco que Steam mueve justo despues de un toque no debe cambiar de seccion
  // (era el «vuelve a la seccion anterior» al tocar un icono).
  const lastPointer = useRef(0);
  const touchedRecently = () => Date.now() - lastPointer.current < 800;
  // Entrar en la seccion. Se comprueba que el foco llego (en Inicio a veces se quedaba en el riel): si no, se reintenta
  // con el siguiente elemento. Al entrar por arriba, la seccion se ve desde el principio.
  const focusBody = (where: "first" | "last" = "first", attempt = 0) => {
    const root = bodyEl.current;
    const list = items(root);
    const idx = where === "first" ? Math.min(attempt, list.length - 1) : list.length - 1 - Math.min(attempt, list.length - 1);
    const el = list[idx];
    if (!el || !root) return;
    zone.current = "body";
    if (where === "first" && attempt === 0) root.scrollTop = 0;
    takeFocus(el);
    window.setTimeout(() => {
      const act = root.ownerDocument.activeElement;
      if (attempt < 2 && !(act && root.contains(act))) { try { el.focus(); } catch { /* nada */ } focusBody(where, attempt + 1); }
    }, 90);
  };
  const focusRail = (id: string) => { const el = railEls.current[id]; if (el) { zone.current = "rail"; takeFocus(el); } };

  // Red de seguridad: si el control enfocado desaparece (la tarjeta se redibuja y se pierde el nodo), el mando se queda
  // sin foco y la cruceta no hace nada. Se recupera el foco en el control que ocupa su sitio (mismo indice) en la seccion.
  const lastIdx = useRef(0);
  useEffect(() => {
    const root = bodyEl.current;
    const win = root?.ownerDocument.defaultView;
    if (!root || !win || typeof win.MutationObserver === "undefined") return undefined;
    let t = 0;
    const check = () => {
      if (zone.current !== "body" || hostedRef.current || Date.now() - lastInput.current > 8000) return;
      const act = root.ownerDocument.activeElement;
      if (act && act !== root.ownerDocument.body && act !== root.ownerDocument.documentElement) return; // el foco esta en algun sitio
      const list = items(root);
      const el = list[Math.min(lastIdx.current, list.length - 1)];
      if (el) { crumb("foco: el control enfocado desaparecio; se recupera"); takeFocus(el); }
    };
    const mo = new win.MutationObserver(() => { win.clearTimeout(t); t = win.setTimeout(check, 120); });
    mo.observe(root, { childList: true, subtree: true });
    return () => { mo.disconnect(); win.clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [, bumpR] = useState(0);
  const reg = getRegistry();
  reg.kit = reg.kit ?? { ...UI, Focusable };
  useEffect(() => { const f = () => bumpR((n) => n + 1); reg.subs.add(f); return () => { reg.subs.delete(f); }; }, [reg]);
  const mods = [...reg.cards.values()];
  const toastTimer = useRef(0);
  const notify = useCallback((t: string) => { setToast(t); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(""), 2200); }, []);
  const cardProps = { log, tap: notify, openNative: onNative, kit: reg.kit };
  const replaced = (id: SectionId) => mods.find((m) => m.section === id && m.mode === "replace");
  const appended = (id: SectionId) => mods.filter((m) => m.section === id && m.mode === "append");
  const out = useRef<number | null>(null);
  const echoUntil = useRef(0);

  // Modo: solo recompone Inicio. Si el foco estaba en el contenido de Inicio (que se vuelve a montar), va al primer elemento.
  const { mode, game, toggleNormal } = useMode((t) => {
    notify(t);
    if (zone.current === "body") window.setTimeout(() => focusBody(), 220);
  });
  const conn = useConn(notify);
  const night = useNight(notify);
  // Apariencia: se relee el tema de Panel ya con el panel pintado; si cambio, las secciones se vuelven a montar.
  const apv = useSyncExternalStore(subscribeAppearance, appearanceVersion);
  useEffect(() => scheduleAppearanceRefresh(), []);
  // Eficiencia del menu: aviso a Panel (menu abierto), impulso opcional de potencia y modo ligero a ≤ 8 W.
  useEffect(() => {
    void menuOpened();
    const offLite = liteCss(rootEl.current?.ownerDocument);
    return () => { offLite(); menuClosed(); };
  }, []);
  // (0.25–0.28 preparaban todas las secciones en segundo plano: el zip de 0.28 mostro el doble de lento al cambiar y
  // abrir, asi que se quito. Cada seccion se monta al visitarla, como antes.)
  const lastInput = useRef(Date.now());
  const apps = useApps([]);

  useEffect(() => {
    const regs: Unreg[] = [];
    try {
      const b = sc().System?.Display?.RegisterForBrightnessChanges?.((st) => { if (Date.now() > echoUntil.current) setBright(clamp01(st.flBrightness)); });
      if (b) regs.push(b);
      void sc().System?.Audio?.GetDevices?.().then((i) => {
        const d = i.vecDevices.find((x) => x.bIsDefaultOutputDevice);
        if (d) { out.current = d.id; setVol(clamp01(d.flOutputVolume)); }
      });
    } catch (e) { log(`estado: ${String(e)}`); }
    return () => regs.forEach((r) => r.unregister?.());
  }, [log]);

  const sendBright = useThrottled((v) => sc().System?.Display?.SetBrightness?.(v), 60);
  // La salida por defecto CAMBIA (auriculares, HDMI…): el id guardado al abrir quedaba viejo y el volumen iba al
  // dispositivo equivocado. Se vuelve a resolver antes de enviar (con caché de 1,5 s).
  const outAt = useRef(0);
  const sendVol = useThrottled((v) => {
    const send = () => { if (out.current !== null) sc().System?.Audio?.SetDeviceVolume?.(out.current, 1, v); };
    if (Date.now() - outAt.current < 1500) { send(); return; }
    outAt.current = Date.now();
    void Promise.resolve(sc().System?.Audio?.GetDevices?.()).then((i) => {
      const d = i?.vecDevices.find((x) => x.bIsDefaultOutputDevice);
      if (d) { if (d.id !== out.current) crumb(`volumen: salida ${out.current} → ${d.id}`); out.current = d.id; }
      send();
    }, send);
  }, 60);

  // ---- Plugins de Decky en la columna ----
  const plugins = hostablePlugins();
  const openPlugin = (n: string) => {
    setUsage((u) => bump(u, modeDef(homeMode).usage, n));
    if (findPlugin(n)) {
      opener.current = itemOf(document.activeElement, null);
      setSide({ kind: "plugin", name: n });
    } else if (activatePlugin(n)) onNative(DECKY_TAB);
    else notify(`${n} no está disponible`);
  };
  const openFriend = (id: number) => { opener.current = itemOf(document.activeElement, null); setSide({ kind: "friend", id }); };
  const openStore = () => { opener.current = itemOf(document.activeElement, null); setSide({ kind: "store" }); };
  const openGroup = (id: string) => { opener.current = itemOf(document.activeElement, null); setSide({ kind: "group", id }); };
  const closePlugin = () => {
    setSide(null);
    window.setTimeout(() => {
      const el = opener.current;
      if (el?.isConnected) { zone.current = "body"; takeFocus(el); } else focusRail(section);
    }, 60);
  };
  const fallbackPlugin = useCallback((n: string) => { setSide(null); if (activatePlugin(n)) onNative(DECKY_TAB); }, [onNative]);
  // Paginas de Steam/Decky: el panel se cierra solo al navegar (navGuard en pilot.tsx).
  const go = (path: string) => { try { Navigation.Navigate(path); } catch { notify("No se pudo abrir"); } };
  // Album de musica: su pagina en la biblioteca de Big Picture (lista de pistas y «Reproducir»). [H] ruta de Steam.
  const openAlbum = (appid: number) => { crumb(`abrir álbum ${appid}`); go(`/library/app/${appid}`); };
  const unread = useUnread();
  const unseen = useUnviewed();
  const openPanel = () => (findPlugin(PANEL_PLUGIN) ? openPlugin(PANEL_PLUGIN) : onNative(TAB.panel));
  // Modos de Inicio: el tipo de juego (cada juego recuerda el suyo) o, sin juego, escritorio/pelicula/amigos/TV.
  const [hm, setHm] = useState(loadHomeModes);
  // El tipo de juego se elige en su tarjeta (misma elección): Inicio se entera para cambiar el kit de plugins.
  useEffect(() => onHomeModesChange(() => { queueMicrotask(() => setHm(loadHomeModes())); }), []);
  const [editPins, setEditPins] = useState(false);
  const inGame = mode === "game" && !!game;
  const homeMode = activeHomeMode(hm, inGame && game ? { key: game.key, name: game.name } : null, situation().tv);
  const pluginNames = plugins.map((p) => p.name);
  const hp = homePlugins(pluginNames, hm, homeMode, (lim) => rank(pluginNames, usage, modeDef(homeMode).usage, lim));
  const frequent = hp.list.map((n) => plugins.find((p) => p.name === n)!).filter(Boolean);
  const pickHomeMode = (id: HomeModeId) => setHm((s) => saveHomeModes(inGame && game ? { ...s, perGame: { ...s.perGame, [game.key]: id } } : { ...s, manual: id }));

  // ---- Mando ----
  // La cruceta es SOLO para moverse dentro de la seccion: en los bordes no sale (ni al riel ni a otra seccion).
  // Las secciones se cambian con LB/RB (desde cualquier sitio) o en el riel (al que se vuelve con B).
  // Cruceta dentro de la seccion: modelo de filas (Android TV / tvOS). Arriba/abajo = fila anterior/siguiente,
  // recuperando el elemento donde estabas en esa fila; izquierda/derecha = dentro de la fila; en los bordes no sale.
  // Todo lo decide esta funcion (no la cercania de Steam), asi el movimiento es siempre el mismo.
  const rowMemory = useRef(new Map<string, HTMLElement>());
  const rowKey = (els: HTMLElement[]) => els.map((x) => x.dataset.qrKey ?? x.textContent?.slice(0, 12) ?? "").join("|").slice(0, 120);
  const onBodyDir = (e: { detail?: { button?: number }; stopPropagation?: () => void; preventDefault?: () => void }) => {
    lastInput.current = Date.now();
    const b = e.detail?.button;
    const root = bodyEl.current;
    const act = itemOf(root?.ownerDocument.activeElement ?? null, root);
    if (!root || !act || b === undefined) return;
    // Los deslizadores usan izquierda/derecha para su valor.
    if ((b === BTN.LEFT || b === BTN.RIGHT) && act.dataset.qrH) return;
    const all = items(root);
    const from = all.indexOf(act);
    if (from < 0) return;
    // El reproductor anclado (sticky) es siempre la ultima fila, aunque se dibuje encima de lo que tapa.
    const extra = all.map((x, i) => (x.closest("[data-qr-dock]") ? i : -1)).filter((i) => i >= 0);
    const rects = all.map(rect);
    const to = listTarget(rects, from, b, {
      extra,
      remembered: (row) => { const m = rowMemory.current.get(rowKey(row.map((i) => all[i]))); const k = m ? all.indexOf(m) : -1; return k >= 0 ? k : null; },
    });
    e.stopPropagation?.(); e.preventDefault?.();
    // Red de seguridad: si el modelo de filas no da destino en vertical pero hay elementos más abajo/arriba, se va al más próximo en el orden de la página.
    if ((to < 0 || to === from) && (b === BTN.UP || b === BTN.DOWN)) {
      const rowOfFrom = visualRows(rects).find((r) => r.includes(from)) ?? [from];
      const cand = b === BTN.DOWN
        ? all.map((_x, i) => i).filter((i) => !rowOfFrom.includes(i) && rects[i].top >= rects[from].bottom - 2)
        : all.map((_x, i) => i).filter((i) => !rowOfFrom.includes(i) && rects[i].bottom <= rects[from].top + 2);
      if (cand.length) {
        const best = cand.reduce((a, c) => (Math.abs((b === BTN.DOWN ? rects[c].top - rects[from].bottom : rects[from].top - rects[c].bottom)) < Math.abs((b === BTN.DOWN ? rects[a].top - rects[from].bottom : rects[from].top - rects[a].bottom)) ? c : a), cand[0]);
        crumb(`mando: ${b === BTN.DOWN ? "abajo" : "arriba"} sin destino desde «${(act.textContent ?? "").slice(0, 24)}»: voy a «${(all[best].textContent ?? "").slice(0, 24)}»`);
        if (DIR[b]) focusMove(sectionRef.current, ctrlRef(act, root, sectionRef.current), DIR[b], ctrlRef(all[best], root, sectionRef.current));
        takeFocus(all[best]);
        return;
      }
      crumb(`mando: ${b === BTN.DOWN ? "abajo" : "arriba"} sin destino desde «${(act.textContent ?? "").slice(0, 24)}» (${all.length} elementos, ${visualRows(rects).length} filas)`);
    }
    // Registro de foco (solo etiquetas y posiciones): destino, o «sin destino» si la cruceta no tiene a dónde ir.
    if (DIR[b]) focusMove(sectionRef.current, ctrlRef(act, root, sectionRef.current), DIR[b], to >= 0 && to !== from ? ctrlRef(all[to], root, sectionRef.current) : null);
    if (to < 0 || to === from) return;
    // Recordar donde estabas en la fila que dejas.
    if (b === BTN.UP || b === BTN.DOWN) {
      const rows = visualRows(rects);
      const mine = rows.find((r) => r.includes(from));
      if (mine && mine.length > 1) rowMemory.current.set(rowKey(mine.map((i) => all[i])), act);
    }
    takeFocus(all[to]);
  };
  const bodyDirRef = useRef(onBodyDir);
  bodyDirRef.current = onBodyDir;
  useEffect(() => { setBodyDir((e) => bodyDirRef.current(e)); return () => setBodyDir(null); }, []);
  const sectionRef = useRef(section);
  sectionRef.current = section;
  const hostedRef = useRef(hosted);
  hostedRef.current = hosted;
  const bumper = useRef(once((b: number) => {
    if (hostedRef.current) return;
    const i = SECTIONS.findIndex((x) => x.id === sectionRef.current);
    const n = neighbor(i, SECTIONS.length, b === BTN.R1 ? 1 : -1);
    if (n === null) return;
    const id = SECTIONS[n].id;
    setBench(false);
    setSection(id);
    // Se queda en la misma zona: si estabas en el contenido, al primer elemento de la nueva seccion.
    window.setTimeout(() => (zone.current === "body" ? focusBody() : focusRail(id)), 90);
  }, 150)).current;
  // Ayuda: Y (botón 4) sobre cualquier control explica su tarjeta; el «?» del título hace lo mismo con el dedo.
  const [help, setHelp] = useState<string | null>(null);
  const helpRef = useRef<string | null>(null);
  helpRef.current = help;
  useEffect(() => { setHelpSink((id) => setHelp(id)); return () => setHelpSink(null); }, []);
  // Registro de foco con el mando: una sesión por apertura; se manda al cerrar, al ocultarse la ventana y cada minuto.
  useEffect(() => {
    focusBegin();
    const doc = rootEl.current?.ownerDocument ?? document;
    const hide = () => { if (doc.visibilityState === "hidden") void focusFlush(); };
    doc.addEventListener("visibilitychange", hide);
    const id = window.setInterval(() => void focusFlush(), 60000);
    return () => { window.clearInterval(id); doc.removeEventListener("visibilitychange", hide); void focusFlush(); };
  }, []);
  // Al abrir (1,5 s después, para no competir con el primer pintado): si se acaba de conectar una TV, el sonido pasa a ella.
  useEffect(() => {
    const id = window.setTimeout(() => { void checkTvAudio().then((n) => { if (n) notify(`Sonido por ${n}`); }); }, 1500);
    return () => window.clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const lastY = useRef(0);
  const onButtonDown = (e: { detail?: { button?: number } }) => {
    const b = e.detail?.button;
    if (b === 4) {
      if (Date.now() - lastY.current < 200) return; // llega por dos vías (prop y evento DOM)
      lastY.current = Date.now();
      if (helpRef.current) { setHelp(null); return; }
      const doc = rootEl.current?.ownerDocument ?? document;
      const el = (doc.querySelector(".gpfocus") ?? doc.activeElement) as HTMLElement | null;
      const id = el?.closest?.("[data-qr-help]")?.getAttribute("data-qr-help");
      if (id && HELP[id]) { crumb(`ayuda: ${id}`); setHelp(id); } else notify("Aquí no hay ayuda todavía");
      return;
    }
    if (b === BTN.L1 || b === BTN.R1) bumper(b);
  };
  // Respaldo: el evento de botones de Steam llega al DOM como «vgp_onbuttondown» aunque el prop no exista.
  const rootEl = useRef<HTMLDivElement | null>(null);
  const win = () => rootEl.current?.ownerDocument?.defaultView ?? window;
  // Apertura (boton → primer fotograma) y tareas largas mientras el panel esta abierto.
  useEffect(() => {
    markOpenPainted(win());
    return observeLongTasks(win(), () => sectionRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (bodyEl.current) bodyEl.current.scrollTop = scrollPos.current[section] ?? 0;
    const t0 = switchT0.current;
    switchT0.current = null;
    if (t0 !== null) void measurePaint("switch", t0, win(), { sec: section });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);
  useEffect(() => {
    const t0 = columnT0.current;
    columnT0.current = null;
    if (t0 !== null && side) void measurePaint("column", t0, win(), { sec: side.kind, d: side.kind === "plugin" ? side.name : undefined });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side]);
  // Control para la prueba de fluidez (perfBench.ts): la prueba mueve el panel como lo haria el usuario.
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__qamRailUI = {
      sections: SECTIONS.map((x) => x.id),
      go: (id: SectionId) => { setBench(false); setSection(id); },
      current: () => sectionRef.current,
      body: () => bodyEl.current,
      win: () => win(),
      openColumn: (): string | null => {
        const p = hostablePlugins()[0];
        if (p) { setSide({ kind: "plugin", name: p.name }); return `plugin:${p.name}`; }
        const f = readFriends()[0];
        if (f) { setSide({ kind: "friend", id: f.accountId }); return "amigo"; }
        return null;
      },
      closeColumn: () => setSide(null),
    };
    return () => { delete (window as unknown as Record<string, unknown>).__qamRailUI; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const el = rootEl.current;
    if (!el) return;
    const h = (ev: Event) => onButtonDown(ev as unknown as { detail?: { button?: number } });
    el.addEventListener("vgp_onbuttondown", h);
    return () => el.removeEventListener("vgp_onbuttondown", h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brightCard = (
    <XSlider label="Brillo" icon={ICONS.sun} value={bright * 100} min={0} max={100} step={5} suffix="%"
      onChange={(v) => { echoUntil.current = Date.now() + 400; setBright(v / 100); sendBright(v / 100); }} />
  );
  const volCard = (
    <XSlider label="Volumen" icon={ICONS.volume} value={vol * 100} min={0} max={100} step={5} suffix="%"
      onChange={(v) => { setVol(v / 100); sendVol(v / 100); }} />
  );
  const freqRow = (title: string) => (editPins ? (
    <PinEditor mode={homeMode} all={pluginNames} pinned={hm.pins[homeMode] ?? hp.list}
      onToggle={(n) => setHm((s) => saveHomeModes(togglePin(s, homeMode, n, hp.list)))}
      onReset={() => { setHm((s) => { const pins = { ...s.pins }; delete pins[homeMode]; return saveHomeModes({ ...s, pins }); }); setEditPins(false); }}
      onDone={() => setEditPins(false)} />
  ) : (
    <>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ flexGrow: 1 }}><Label>{hp.pinned ? `${title} · elegidos` : title}</Label></div>
        <Chip grow={false} onClick={() => setEditPins(true)}>Editar</Chip>
      </div>
      {frequent.length ? <PluginIcons plugins={frequent} onOpen={openPlugin} onAll={() => { setAppsTab("plugins"); setSection("apps"); }} /> : null}
    </>
  ));

  const renderSection = (sec: SectionId): ReactNode => {
  let body: ReactNode;
  switch (sec) {
    case "home":
      body = (
        <Fade k={mode}>
          {/* Con un juego abierto pero viendo el Inicio normal (A sobre Inicio): que se note y se pueda volver. */}
          {game && mode === "normal" && <Chip icon={ICONS2.play} active onClick={toggleNormal}>{`Volver al Inicio de ${game.name}`}</Chip>}
          <OpenAppsStrip notify={notify} after={onClose} />
          {!inGame && <HomeModeBar active={homeMode} game={false} onPick={pickHomeMode} />}
          {mode === "game" && game && homeMode !== "pelicula" ? (
            <HomeGame log={log} game={game} bright={brightCard} vol={volCard}
              kind={(t) => <GameKindCard gameKey={game.key} name={game.name} t={t} notify={notify} compact />}
              display={<QuickDisplay gameKey={game.key} notify={notify} onMore={() => { setSection("display"); window.setTimeout(() => focusBody(), 90); }} />}
              plugins={freqRow("Plugins para jugar")}
              music={<MusicCard dock onlyActive onOpen={() => onNative(TAB.soundtrack)} onAlbum={openAlbum} />} />
          ) : (
            <HomeNormal log={log} bright={brightCard} vol={volCard}
              kind={inGame && game ? <GameKindAuto gameKey={game.key} name={game.name} log={log} notify={notify} /> : undefined}
              toggles={<QuickToggles c={conn} night={{ on: night.on, toggle: night.toggle }} />}
              plugins={freqRow("Plugins frecuentes")}
              apps={<AppRow apps={apps.pinned.length ? apps.pinned : apps.more} notify={notify} onAll={() => { setAppsTab("apps"); setSection("apps"); }} after={onClose} />}
              music={<MusicCard dock onOpen={() => onNative(TAB.soundtrack)} onAlbum={openAlbum} />} />
          )}
        </Fade>
      );
      break;
    case "energy":
      // RENDIMIENTO: todo lo que da o quita FPS y batería, junto. Con juego: preset → potencia → FPS → escalado →
      // reescalador → batería → avanzado. Lo poco usado (ventiladores, overlay, latencia) va plegado.
      body = bench ? <BenchView log={log} onBack={() => setBench(false)} /> : (
        <>
          <EnergyTdp log={log}
            kind={game ? (t) => <GameKindCard gameKey={game.key} name={game.name} t={t} notify={notify} /> : undefined}
            modes={<PowerModes notify={notify} brightPct={bright * 100} inGame={!!game} />} />
          <DisplaySection part="perf" gameKey={game ? game.key : null} notify={notify} night={night} onNativePerf={() => onNative(TAB.perf)} onPanel={openPanel} />
          <EnergyExtras notify={notify} part="battery" />
          {game && <GameProfileCard gameKey={game.key} notify={notify} />}
          <Fold label="Avanzado" hint="ventiladores, overlay, latencia" icon={ICONS2.sliders} help="avanzado">
            <EnergyExtras notify={notify} part="fans" />
            <Card title="Rendimiento de Steam" help="avanzado"><SteamExtras notify={notify} onNative={() => onNative(TAB.perf)} /></Card>
            <Shortcut label="Panel de Control" hint="CPU, GPU, curvas, perfiles" onOpen={openPanel} />
          </Fold>
        </>
      );
      break;
    case "display":
      // IMAGEN Y SONIDO: cómo se ve y se oye. Brillo y volumen también aquí (quien entra, los busca).
      body = (
        <>
          {brightCard}
          {volCard}
          <DisplaySection part="image" gameKey={game ? game.key : null} notify={notify} night={night} onNativePerf={() => onNative(TAB.perf)} onPanel={openPanel} />
        </>
      );
      break;
    case "connect":
      // CONEXIONES: lo de cada día (encender, y conectar lo ya conocido). Lo nuevo se añade en Ajustes de Steam.
      body = (
        <>
          <WifiCard notify={notify} />
          <BluetoothCard notify={notify} />
          <Card><ToggleRow icon={ICONS2.plane} label="Modo avión" on={conn.plane} note="Apaga Wi‑Fi y Bluetooth" onToggle={() => conn.setPlane(!conn.plane)} /></Card>
        </>
      );
      break;
    case "apps":
      body = (
        <>
          <Row>
            <Chip icon={ICONS.grid} active={appsTab === "apps"} onClick={() => setAppsTab("apps")}>Apps</Chip>
            <Chip icon={ICONS2.plug} active={appsTab === "plugins"} onClick={() => setAppsTab("plugins")}>Plugins</Chip>
            <Chip icon={ICONS2.globe} active={appsTab === "steam"} onClick={() => setAppsTab("steam")}>Steam</Chip>
          </Row>
          {appsTab === "apps" ? (
            <>
              {store ? <QamStore notify={notify} onBack={() => setStore(false)} /> : (
                <>
                  {appOpt && <QamAppOptions id={appOpt} notify={notify} onClose={() => setAppOpt(null)} />}
                  <AppGrid apps={[...apps.pinned, ...apps.more]} notify={notify} after={onClose} onOptions={setAppOpt} onStore={() => setStore(true)} />
                </>
              )}
            </>
          ) : appsTab === "steam" ? (
            <QamDesktopApps notify={notify} after={onClose} />
          ) : (
            <>
              {plugins.length ? <PluginIcons plugins={plugins} onOpen={openPlugin} /> : <div style={{ fontSize: 12, color: COLORS.muted, padding: "4px 6px" }}>Decky no tiene plugins cargados.</div>}
              <DeckyCard notify={notify} onStore={openStore} onSettings={() => go(DECKY_ROUTES.settings)} onLoaderUpdate={() => go(DECKY_ROUTES.general)} />
            </>
          )}
        </>
      );
      break;
    case "social":
      body = <SocialSection game={game} notify={notify} onOpenFriend={openFriend} onOpenGroup={openGroup} onNative={() => onNative(TAB.friends)}
        unseen={unseen} notices={<NoticesSection notify={notify} onNative={() => onNative(TAB.notifications)} />} />;
      break;
    default:
      body = diag ? <DiagView onBack={() => setDiag(false)} notify={notify} log={log} /> : look ? (
        <>
          <Chip onClick={() => { setLook(false); window.setTimeout(() => focusBody(), 90); }}>← Más</Chip>
          <AppearanceCard />
          <Card title="Fluidez del panel" help="panel"><PanelSaver /></Card>
        </>
      ) : (
        <>
          <Shortcut icon={<ShortIcon d={MORE_ICON.look} />} label="Apariencia" hint="colores, acento, fluidez del panel" onOpen={() => { setLook(true); window.setTimeout(() => focusBody(), 90); }} />
          <Shortcut icon={<ShortIcon d={MORE_ICON.panel} />} label="Panel de Control" hint="CPU, GPU, mandos" onOpen={openPanel} />
          <QamChannelCard notify={notify} />
          <QamSelfUpdateCard notify={notify} />
          <Label>Sistema</Label>
          <Shortcut icon={<ShortIcon d={ICONS2.sliders} />} label="Ajustes de Steam" onOpen={() => onNative(TAB.settings)} />
          <Shortcut icon={<ShortIcon d={MORE_ICON.keyboard} />} label="Teclado en pantalla" hint="o Steam + X" onOpen={() => {
            crumb("teclado en pantalla");
            onClose();
            window.setTimeout(() => { void toggleKeyboard().then((m) => { if (!m) notify("Steam no deja abrir el teclado desde aquí: usa Steam + X"); else crumb(`teclado: ${m}`); }); }, 350);
          }} />
          <Shortcut icon={<ShortIcon d={MORE_ICON.help} />} label="Ayuda de Steam" onOpen={() => onNative(TAB.help)} />
          <Shortcut icon={<ShortIcon d={ICONS.grid} />} label="QAM de Steam" hint="el menú original" onOpen={() => onNative()} />
          {/* Lo que se usa poco, plegado: una sola parada de mando en vez de dos. */}
          <Fold label="Pruebas y herramientas" hint={mods.length ? `módulos: ${mods.map((m) => m.name).join(", ")}` : "diagnóstico, prueba de CPU"} icon={MORE_ICON.tests}>
            <Shortcut icon={<ShortIcon d={MORE_ICON.tests} />} label="Pruebas y diagnóstico" hint="probar, aislar, informe" onOpen={() => setDiag(true)} />
            <SelfTestCard notify={notify} />
            <NavTraceCard notify={notify} />
            <Shortcut icon={<ShortIcon d={ICONS.bolt} />} label="Prueba de CPU por vatios" onOpen={() => { setBench(true); setSection("energy"); window.setTimeout(() => focusBody(), 90); }} />
          </Fold>
        </>
      );
  }

  const rep = replaced(sec);
  // La seccion Social es del nucleo desde 0.15: el antiguo modulo Amigos (qam-rail-friends) ya no la sustituye.
  if (rep && sec !== "home" && sec !== "social") body = <rep.Component {...cardProps} />;
  const extra = appended(sec).map((m) => <m.Component key={m.id} {...cardProps} />);
  return <>{body}{extra}</>;
  };
  // Secciones ya visitadas: siguen montadas (ocultas) para que volver a ellas sea instantaneo.
  if (!visited.current.includes(section)) visited.current = [...visited.current, section];
  const rail = SECTIONS.map((s) => (s.id === "home" && mode === "game" ? { ...s, icon: GAME_ICON } : s));

  return (
    <Focusable
      ref={rootEl}
      data-qrail-root="1"
      // Leyenda inferior de Steam (antes «A Seleccionar · B Atrás» genérico): lo que hace cada botón en el panel.
      onOKActionDescription="Elegir"
      onCancelActionDescription={side ? "Cerrar columna" : "Cerrar panel"}
      actionDescriptionMap={{ 4: "¿Qué es esto?", 5: "Sección anterior", 6: "Sección siguiente" } as never}
      // LB/RB: seccion anterior/siguiente desde cualquier sitio. [H] onButtonDown no esta en los tipos de @decky/ui.
      {...({ onButtonDown } as Record<string, unknown>)}
      onPointerDownCapture={(e: { target: EventTarget | null }) => {
        lastPointer.current = Date.now(); lastInput.current = Date.now();
        const c = (e.target as HTMLElement | null)?.closest?.('[data-qr="item"],.qr-chip,[role=button]');
        if (c && rootEl.current) focusTap(sectionRef.current, ctrlRef(c, rootEl.current, sectionRef.current));
      }}
      onFocusCapture={(e: { target: EventTarget | null }) => { const t = e.target as HTMLElement | null; if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) noteInputFocus(); }}
      // B con una columna abierta (este donde este el foco): cierra la columna, no el panel.
      onCancel={(e: CustomEvent) => { if (helpRef.current) { e.stopPropagation(); setHelp(null); return; } if (hostedRef.current) { e.stopPropagation(); closePlugin(); } }}
      style={{ position: "relative", width: 486, height: 404, fontFamily: themeFont() ? `${themeFont()}, ${FONT}` : FONT, color: COLORS.text }}>
      {side?.kind === "plugin" && <PluginColumn name={side.name} onClose={closePlugin} onFallback={fallbackPlugin} />}
      {side?.kind === "friend" && (
        <FriendColumn accountId={side.id} game={game} notify={notify} onClose={closePlugin}
          onProfile={(s64) => { try { Navigation.NavigateToSteamWeb(`https://steamcommunity.com/profiles/${s64}`); } catch { notify("No se pudo abrir el perfil"); } }} />
      )}
      {side?.kind === "store" && <StoreColumn onClose={closePlugin} notify={notify} onOpenDeckyStore={() => go(DECKY_ROUTES.store)} />}
      {side?.kind === "group" && <GroupColumn groupId={side.id} notify={notify} onClose={closePlugin} onOpenInSteam={() => { try { Navigation.NavigateToChat(); } catch { onNative(TAB.friends); } }} />}
      {/* Con una columna abierta, el panel queda fuera del mando (childFocusDisabled + inert) y atenuado. */}
      <Focusable {...((hosted ? { inert: "", childFocusDisabled: true } : {}) as Record<string, unknown>)}
        style={{ display: "flex", gap: 10, height: 404, width: 486, opacity: hosted ? 0.5 : 1, transition: lowPower() ? "none" : "opacity 120ms" }}>
        <Focusable
          ref={bodyEl}
          onFocusCapture={(e: { target: EventTarget | null }) => {
            zone.current = "body";
            // En la primera fila, la seccion se ve entera desde arriba (antes la barra de potencia quedaba medio oculta al volver).
            const root = bodyEl.current;
            const act = itemOf(e.target as Element | null, root);
            if (!root || !act) return;
            lastIdx.current = Math.max(0, items(root).indexOf(act));
            const row = rowOf(rect(act), items(root).map(rect));
            if (row === "first" || row === "only") {
              const win = root.ownerDocument.defaultView ?? window;
              win.requestAnimationFrame(() => { root.scrollTop = 0; });
            }
          }}
          onGamepadDirection={onBodyDir}
          // B dentro de la seccion: vuelve al icono del riel (no cierra el panel).
          onCancel={(e: CustomEvent) => { e.stopPropagation(); if (hostedRef.current) closePlugin(); else focusRail(section); }}
          style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: 14, borderRadius: 28, ...surfaceStyle(lowPower()), boxShadow: outlineShadow(), overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, position: "relative", scrollPaddingBlock: 14 }}>
          <FluencyBanner />
          <VoiceBar notify={notify} />
          {SECTIONS.filter((x) => visited.current.includes(x.id)).map((x) => (
            <Pane key={`${x.id}:${apv}`} active={x.id === section}>{renderSection(x.id)}</Pane>
          ))}
          {help && HELP[help] && (
            <div onClick={() => setHelp(null)} style={{ position: "sticky", bottom: 0, marginTop: "auto", zIndex: 5, padding: "12px 14px", borderRadius: 16, background: COLORS.card, backgroundColor: COLORS.panel, backgroundImage: `linear-gradient(${COLORS.card}, ${COLORS.card})`, boxShadow: `0 0 0 1.5px ${COLORS.accent}, 0 -8px 24px rgba(0,0,0,0.45)`, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 20, height: 20, borderRadius: 10, background: COLORS.accent, color: COLORS.onAccent, fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>?</span>
                <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{HELP[help].title}</span>
                <span style={{ fontSize: 11, color: COLORS.muted }}>Y o B para cerrar</span>
              </div>
              {HELP[help].text.map((line, i) => <div key={i} style={{ fontSize: 12, lineHeight: 1.35, color: i === 0 ? COLORS.text : COLORS.muted }}>{line}</div>)}
            </div>
          )}
          {toast && (
            <div style={{ position: "sticky", bottom: 0, marginTop: "auto", alignSelf: "center", padding: "6px 14px", borderRadius: 16, background: "#fff", color: COLORS.onAccent, fontSize: 12, fontWeight: 600, textAlign: "center" }}>{toast}</div>
          )}
        </Focusable>
        <Focusable
          // Izquierda = entrar en la seccion abierta.
          onGamepadDirection={(e: { detail?: { button?: number }; stopPropagation?: () => void }) => { if (e.detail?.button === BTN.LEFT) { e.stopPropagation?.(); focusBody(); } }}
          style={{ width: 64, boxSizing: "border-box", padding: "6px 0", borderRadius: 28, ...surfaceStyle(lowPower()), boxShadow: outlineShadow(), display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}
          flow-children="column"
        >
          {rail.map((s) => (
            <RailButton key={s.id} s={s} active={section === s.id} first={s.id === "home"} badge={s.id === "social" ? unread + unseen : 0}
              setRef={(el) => { railEls.current[s.id] = el; }}
              onSelect={() => { if (s.id !== section) setBench(false); setSection(s.id); }}
              // A en Inicio estando ya en Inicio con un juego abierto: alterna entre Inicio de juego e Inicio normal.
              onTap={() => { if (s.id === "home" && section === "home") toggleNormal(); }}
              onEnter={() => window.setTimeout(() => focusBody(), 30)}
              // Si el foco llega desde el contenido a un icono que no es el activo, se redirige al activo.
              guard={() => {
                // Tras un toque, el foco lo mueve Steam: no se cambia de seccion por el (lo hace el propio toque).
                if (touchedRecently()) return false;
                if (zone.current === "body" && s.id !== section) { window.setTimeout(() => focusRail(section), 0); return false; }
                zone.current = "rail"; return true;
              }}
            />
          ))}
        </Focusable>
      </Focusable>
      {/* Con la columna abierta, tocar el panel atenuado la cierra (el mando usa B). */}
      {hosted && <div onPointerDown={(e) => { e.stopPropagation(); closePlugin(); }} style={{ position: "absolute", inset: 0, zIndex: 3 }} />}
    </Focusable>
  );
};

/**
 * Seccion montada. Oculta: display none, fuera del mando (childFocusDisabled) y SIN volver a pintarse: reutiliza el
 * ultimo elemento renderizado, asi React no recorre su arbol cuando el panel se actualiza por otra cosa.
 */
const Pane: FC<{ active: boolean; children: ReactNode }> = ({ active, children }) => {
  const last = useRef<ReactNode>(children);
  if (active) last.current = children;
  return (
    <VisibleContext.Provider value={active}>
      <Focusable {...((active ? {} : { childFocusDisabled: true }) as Record<string, unknown>)}
        style={{ display: active ? "flex" : "none", flexDirection: "column", gap: paneGap() }}>
        {last.current}
      </Focusable>
    </VisibleContext.Provider>
  );
};

const RailButton: FC<{
  s: (typeof SECTIONS)[number]; active: boolean; first: boolean;
  setRef: (el: HTMLDivElement | null) => void; onSelect: () => void; onTap: () => void; onEnter: () => void; guard: () => boolean; badge?: number;
}> = ({ s, active, first, setRef, onSelect, onTap, onEnter, guard, badge = 0 }) => {
  const [focused, setFocused] = useState(false);
  // A del mando (onActivate) y toque (onClick) comparten un solo disparo.
  const tap = useTap(() => { onTap(); onSelect(); onEnter(); });
  return (
    <Focusable
      ref={setRef}
      preferredFocus={first}
      noFocusRing
      aria-label={s.label}
      onGamepadFocus={() => { setFocused(true); if (guard()) onSelect(); }}
      onGamepadBlur={() => setFocused(false)}
      onActivate={tap}
      onClick={tap}
      style={{ position: "relative", width: 42, height: 42, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: active ? COLORS.accent : "transparent", transition: "background 180ms ease", outline: focused ? `2px solid ${COLORS.focus}` : "2px solid transparent", outlineOffset: 1 }}
    >
      <Icon d={s.icon} size={24} color={active ? COLORS.onAccent : COLORS.muted} />
      {badge > 0 && <span style={{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, padding: "0 4px", boxSizing: "border-box", borderRadius: 8, background: COLORS.danger, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{badge > 9 ? "9+" : badge}</span>}
    </Focusable>
  );
};
export { colorFor };

// Iconos de los atajos de «Más» (antes solo texto).
const MORE_ICON = {
  look: "M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-7.8-9-7.8zM7.5 11h.01M10 7.5h.01M14 7.5h.01M16.5 11h.01",
  panel: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
  tests: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7.5 15h9",
  keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01",
};
const ShortIcon: FC<{ d: string }> = ({ d }) => (
  <span style={{ width: 28, height: 28, borderRadius: 9, background: COLORS.track, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
    <Icon d={d} size={16} color={COLORS.text} />
  </span>
);
