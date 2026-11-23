// Apps › «Steam»: apps de escritorio del equipo (navegadores, Discord, emuladores…). «Abrir» las lanza; «En Steam» crea o quita su atajo.
// Navegación con mando: dos filas por app (nombre + acciones), sin barras dentro de una fila de chips.
import { Focusable } from "@decky/ui";
import { useEffect, useMemo, useState, type FC } from "react";

import {
  desktopScan, filterApps, groupApps, isPinned, loadPins, noteFor, openDesktopApp, setPinned, sourceLabel,
  type DesktopApp, type Pin,
} from "./qamDesktop";
import { Card, Label, small } from "./QamSections";
import { COLORS, Chip, ICONS2, Keep, Row, Segments, colorFor } from "./ui";

type Src = "all" | "flatpak" | "appimage" | "system";

export const QamDesktopApps: FC<{ notify: (t: string) => void; after?: () => void }> = ({ notify, after }) => {
  const [apps, setApps] = useState<DesktopApp[] | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [src, setSrc] = useState<Src>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = (force = false) => {
    void desktopScan(force).then((d) => { setApps(Array.isArray(d?.apps) ? d.apps : []); setErr(d?.ok === false ? d.error ?? "no se pudo leer" : null); }, () => { setApps([]); setErr("no se pudo leer"); });
    void loadPins(true).then(setPins, () => null);
  };
  useEffect(() => { load(false); }, []);

  const shown = useMemo(() => filterApps((apps ?? []).filter((a) => src === "all" || a.source === src), ""), [apps, src]);
  const groups = useMemo(() => groupApps(shown), [shown]);

  const act = async (a: DesktopApp, fn: () => Promise<string | void>) => {
    if (busy) return;
    setBusy(a.key);
    try { const m = await fn(); if (m) notify(m); } catch (e) { notify(`Error: ${String(e).slice(0, 80)}`); }
    setBusy(null);
    void loadPins().then(setPins, () => null);
  };
  const open = (a: DesktopApp) => act(a, async () => {
    const r = await openDesktopApp(a.key, a.name);
    if (!r.ok) return `No se pudo abrir ${a.name}: ${r.error ?? "?"}`;
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

  return (
    <Keep id="qam-desktop-apps" loading={apps === null}>
      <Card title="Apps del equipo" help="steam" right={<span style={small}>{apps?.length ? `${apps.length}` : ""}</span>}>
        {opts.length > 2 && <Segments opts={opts} value={src} onPick={(v: Src) => setSrc(v)} perRow={3} />}
        {err && <div style={small}>{err}</div>}
        {apps !== null && !apps.length && !err && <div style={small}>No se encontraron apps de escritorio.</div>}
        {groups.map((g) => (
          <div key={g.group} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Label>{g.group}</Label>
            {g.apps.map((a) => {
              const pinned = isPinned(a.key, pins);
              return (
                <Focusable key={a.key} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "6px 0 2px", borderTop: `1px solid ${COLORS.track}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: colorFor(a.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{a.name.slice(0, 1).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                      <div style={{ ...small, fontSize: 11 }}>{noteFor(a, pinned)}</div>
                    </div>
                  </div>
                  <Row gap={6}>
                    <Chip compact active icon={ICONS2.play} onClick={() => void open(a)}>Abrir</Chip>
                    <Chip compact active={pinned} icon={pinned ? ICONS2.trash : ICONS2.plus} onClick={() => void toggle(a)}>{busy === a.key ? "…" : pinned ? "Quitar de QAM" : "Agregar a QAM"}</Chip>
                  </Row>
                </Focusable>
              );
            })}
          </div>
        ))}
        <Row gap={6}><Chip compact icon={ICONS2.refresh} onClick={() => { load(true); notify("Buscando apps…"); }}>Buscar de nuevo</Chip></Row>
      </Card>
    </Keep>
  );
};
