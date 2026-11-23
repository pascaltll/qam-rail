// Apps › «Steam»: apps de escritorio del equipo (navegadores, Discord, emuladores…). «Abrir» las lanza; «En Steam» crea o quita su atajo.
// Navegación con mando: dos filas por app (nombre + acciones), sin barras dentro de una fila de chips.
import { Focusable } from "@decky/ui";
import { useEffect, useMemo, useRef, useState, type FC, type ReactNode } from "react";

import { buildSections, pushRecent } from "./deskOrg";
import {
  desktopRunning, desktopScan, filterApps, isRunning, isPinned, loadPins, noteFor, openDesktopApp, setPinned, sourceLabel,
  type DesktopApp, type Pin,
} from "./qamDesktop";
import { DeskMenu } from "./QamDeskMenu";
import { Card, Label, small } from "./QamSections";
import { useTap } from "./tap";
import { tickEvery } from "./ticker";
import { useDeskIcons } from "./deskIcons";
import { AppGlyph, COLORS, Chip, ICONS2, Keep, Row, Segments, focusRing } from "./ui";

type Src = "all" | "flatpak" | "appimage" | "system";

// Recientes y grupos plegados: preferencias ligeras de este equipo (si el almacenamiento falla, simplemente no se recuerdan).
const lsGet = <T,>(k: string, d: T): T => { try { const v = window.localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const lsSet = (k: string, v: unknown) => { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

export const QamDesktopApps: FC<{ notify: (t: string) => void; after?: () => void }> = ({ notify, after }) => {
  const [apps, setApps] = useState<DesktopApp[] | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [running, setRunning] = useState<string[]>([]);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const refreshRunning = () => void desktopRunning().then((r) => setRunning(Array.isArray(r?.keys) ? r.keys : []), () => null);
  const [src, setSrc] = useState<Src>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(() => lsGet<string[]>("qr.deskRecent", []));
  const [folds, setFolds] = useState<Record<string, boolean>>(() => lsGet<Record<string, boolean>>("qr.deskFolds", {}));

  const load = (force = false) => {
    void desktopScan(force).then((d) => { setApps(Array.isArray(d?.apps) ? d.apps : []); setErr(d?.ok === false ? d.error ?? "no se pudo leer" : null); }, () => { setApps([]); setErr("no se pudo leer"); });
    void loadPins(true).then(setPins, () => null);
  };
  useEffect(() => { load(false); refreshRunning(); return tickEvery(refreshRunning, 6000, { name: "desktop-running" }); }, []);

  const shown = useMemo(() => filterApps((apps ?? []).filter((a) => src === "all" || a.source === src), ""), [apps, src]);

  const act = async (a: DesktopApp, fn: () => Promise<string | void>) => {
    if (busy) return;
    setBusy(a.key);
    try { const m = await fn(); if (m) notify(m); } catch (e) { notify(`Error: ${String(e).slice(0, 80)}`); }
    setBusy(null);
    void loadPins().then(setPins, () => null);
    window.setTimeout(refreshRunning, 1200);
  };
  const open = (a: DesktopApp) => act(a, async () => {
    const r = await openDesktopApp(a.key, a.name);
    if (!r.ok) return `No se pudo abrir ${a.name}: ${r.error ?? "?"}`;
    const nr = pushRecent(recent, a.key); setRecent(nr); lsSet("qr.deskRecent", nr);
    after?.();
    return `Abriendo ${a.name}`;
  });
  const toggle = (a: DesktopApp) => act(a, async () => {
    const on = !isPinned(a.key, pins);
    const r = await setPinned(a, on);
    return r.ok ? (on ? `${a.name} agregada a QAM (Apps)` : `${a.name} quitada de QAM`) : `No se pudo: ${r.error}`;
  });

  const counts = useMemo(() => { const c: Record<string, number> = { all: apps?.length ?? 0 }; for (const a of apps ?? []) c[a.source] = (c[a.source] ?? 0) + 1; return c; }, [apps]);
  const opts = (["all", "flatpak", "appimage", "system"] as Src[]).filter((k) => k === "all" || counts[k]).map((k) => ({ value: k, label: `${k === "all" ? "Todas" : sourceLabel(k)} ${counts[k] ?? 0}` }));

  const rowOf = (a: DesktopApp, showGroup = false) => (
    <DeskRow key={a.key} app={a} icon={iconOf(a.key)} showGroup={showGroup} running={isRunning(a.key, running)} pinned={isPinned(a.key, pins)} busy={busy === a.key}
      onTap={() => void open(a)} onMenu={() => setMenuKey(menuKey === a.key ? null : a.key)}>
      {menuKey === a.key && <DeskMenu app={a} notify={notify} after={after} onClose={() => { setMenuKey(null); refreshRunning(); }} pinned={isPinned(a.key, pins)} onPin={() => void toggle(a)} />}
    </DeskRow>
  );
  const sections = useMemo(() => buildSections(shown, running, pins.map((p) => p.key), recent, folds), [shown, running, pins, recent, folds]);
  // Iconos solo de lo que se ve: abiertas, favoritas, recientes y grupos desplegados (los plegados no cuestan nada).
  const visible = useMemo(() => [...sections.open, ...sections.favs, ...sections.recent, ...sections.groups.filter((g) => !g.collapsed).flatMap((g) => g.apps)].map((a) => a.key), [sections]);
  const iconOf = useDeskIcons(visible);
  const fold = (g: string, now: boolean) => { const nf = { ...folds, [g]: !now }; setFolds(nf); lsSet("qr.deskFolds", nf); };
  const top = (title: string, list: DesktopApp[]) => list.length > 0 && (
    <div key={title} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Label>{title} · {list.length}</Label>
      {list.map((a) => rowOf(a, true))}
    </div>
  );

  return (
    <Keep id="qam-desktop-apps" loading={apps === null}>
      <Card title="Apps del equipo" help="steam" right={<span style={small}>{apps?.length ? `${apps.length}` : ""}</span>}>
        {opts.length > 2 && <Segments opts={opts} value={src} onPick={(v: Src) => setSrc(v)} perRow={3} />}
        {err && <div style={small}>{err}</div>}
        {apps !== null && !apps.length && !err && <div style={small}>No se encontraron apps de escritorio.</div>}
        {apps !== null && !!apps.length && <div style={{ ...small, fontSize: 11 }}>A abre · X (o mantener pulsado) opciones: cerrar, agregar a QAM, tamaño…</div>}
        {top("Abiertas", sections.open)}
        {top("Favoritas", sections.favs)}
        {top("Recientes", sections.recent)}
        {sections.groups.map((g) => (
          <div key={g.group} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Focusable data-qr="item" noFocusRing onActivate={() => fold(g.group, g.collapsed)} onClick={() => fold(g.group, g.collapsed)}
              style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 32, padding: "2px 6px", borderRadius: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, flex: 1 }}>{g.group} · {g.apps.length}</span>
              <span style={{ fontSize: 12, color: COLORS.muted }}>{g.collapsed ? "▸ ver" : "▾ ocultar"}</span>
            </Focusable>
            {!g.collapsed && g.apps.map((a) => rowOf(a))}
          </div>
        ))}
        <Row gap={6}><Chip compact icon={ICONS2.refresh} onClick={() => { load(true); notify("Buscando apps…"); }}>Buscar de nuevo</Chip></Row>
      </Card>
    </Keep>
  );
};

const LONG_MS = 650;

/** Una app = una sola parada del mando: A abre o muestra, X (o mantener pulsado) abre el menú con todo lo demás. */
const DeskRow: FC<{ app: DesktopApp; icon?: string | null; showGroup?: boolean; running: boolean; pinned: boolean; busy: boolean; onTap: () => void; onMenu: () => void; children?: ReactNode }> = ({ app, icon, showGroup, running, pinned, busy, onTap, onMenu, children }) => {
  const long = useRef(false);
  const timer = useRef<number | null>(null);
  const tap = useTap(() => { if (long.current) { long.current = false; return; } onTap(); });
  const [f, setF] = useState(false);
  const stop = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  const start = () => { long.current = false; stop(); timer.current = window.setTimeout(() => { long.current = true; timer.current = null; onMenu(); }, LONG_MS); };
  return (
    <>
      <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
        onSecondaryButton={onMenu} onSecondaryActionDescription="Opciones" onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
        style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, padding: "4px 6px", borderRadius: 12, background: f ? COLORS.track : "transparent", ...focusRing(f) }}>
        <AppGlyph name={app.name} src={icon} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{running ? "● " : ""}{app.name}</div>
          <div style={{ ...small, fontSize: 11 }}>{noteFor(app, pinned) + (showGroup && app.group ? ` · ${app.group}` : "") + (running ? " · abierta" : "")}</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: running ? COLORS.accent : COLORS.muted, whiteSpace: "nowrap" }}>{busy ? "…" : running ? "Mostrar" : "Abrir"}</span>
      </Focusable>
      {children}
    </>
  );
};
