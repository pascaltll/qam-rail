// Decky dentro del panel: estado (version, actualizaciones) y tienda en la columna lateral.
import { DialogButton, Focusable } from "@decky/ui";
import { useEffect, useState, type FC } from "react";

import { SideColumn } from "./PluginColumn";
import { Card, small } from "./QamSections";
import {
  InstallType, deckyVersion, fetchStore, installedVersions, pendingUpdates, requestInstall, stateOf, type StorePlugin, type StoreVersion,
} from "./deckyStore";
import { COLORS, Chip, Row, cardStyle, colorFor, focusRing } from "./ui";
import { useTap } from "./tap";

/** Tarjeta en Apps › Plugins: version de Decky, actualizaciones (con boton) y accesos a tienda y ajustes. */
export const DeckyCard: FC<{ onStore: () => void; onSettings: () => void; onLoaderUpdate: () => void; notify: (t: string) => void }> = ({ onStore, onSettings, onLoaderUpdate, notify }) => {
  const [, t] = useState(0);
  const ver = deckyVersion();
  const ups = pendingUpdates();
  const update = async (name: string, v: StoreVersion | null) => {
    if (!v) { onStore(); return; }
    notify(await requestInstall(name, v, InstallType.UPDATE) ? `Decky pide confirmar la actualización de ${name}` : "No se pudo: abre la tienda");
    t((x) => x + 1);
  };
  return (
    <Card title={`Decky${ver.current ? ` · ${ver.current}` : ""}`}>
      {ver.loaderUpdate && <Chip active onClick={onLoaderUpdate}>Hay una versión nueva de Decky</Chip>}
      {[...ups.entries()].slice(0, 5).map(([name, v]) => (
        <Row key={name} gap={6}>
          <div style={{ flexGrow: 1, alignSelf: "center", fontSize: 13 }}>{name}{v?.name ? <span style={small}> → {v.name}</span> : null}</div>
          <Chip grow={false} onClick={() => void update(name, v)}>Actualizar</Chip>
        </Row>
      ))}
      {!ups.size && !ver.loaderUpdate && <div style={small}>Todo al día.</div>}
      <Row>
        <Chip onClick={onStore}>Tienda</Chip>
        <Chip onClick={onSettings}>Ajustes de Decky</Chip>
      </Row>
    </Card>
  );
};

const StoreRow: FC<{ p: StorePlugin; state: ReturnType<typeof stateOf>; ver: string; onAction: () => void }> = ({ p, state, ver, onAction }) => {
  const tap = useTap(onAction);
  const [f, setF] = useState(false);
  const label = state === "update" ? "Actualizar" : state === "installed" ? `Instalado${ver ? ` ${ver}` : ""}` : "Instalar";
  return (
    <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      style={{ ...cardStyle, flexDirection: "row", gap: 10, padding: "8px 10px", alignItems: "center", ...focusRing(f) }}>
      <div style={{ width: 54, height: 54, borderRadius: 12, overflow: "hidden", flexShrink: 0, background: colorFor(p.name), display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
        {p.image ? <img src={p.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : p.name.slice(0, 1)}
      </div>
      <div style={{ minWidth: 0, flexGrow: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
        <div style={{ ...small, fontSize: 11 }}>{p.author}</div>
        <div style={{ ...small, fontSize: 11, maxHeight: 30, overflow: "hidden" }}>{p.description}</div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 10, whiteSpace: "nowrap",
        background: state === "available" ? COLORS.accent : state === "update" ? "#3b82f6" : COLORS.track, color: state === "available" ? COLORS.onAccent : COLORS.text }}>{label}</span>
    </Focusable>
  );
};

type Filter = "all" | "installed" | "updates";

/** Tienda de Decky en la columna: catalogo, filtros y instalar/actualizar (Decky confirma con su propio dialogo). */
export const StoreColumn: FC<{ onClose: () => void; notify: (t: string) => void; onOpenDeckyStore: () => void }> = ({ onClose, notify, onOpenDeckyStore }) => {
  const [list, setList] = useState<StorePlugin[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [limit, setLimit] = useState(25);
  useEffect(() => { fetchStore().then(setList, (e) => setErr(String(e))); }, []);
  const installed = installedVersions();
  const updates = pendingUpdates();
  const tags = list ? [...new Set(list.flatMap((p) => p.tags))].slice(0, 8) : [];
  const shown = (list ?? []).filter((p) => {
    const st = stateOf(p, installed, updates);
    if (filter === "installed" && st === "available") return false;
    if (filter === "updates" && st !== "update") return false;
    return !tag || p.tags.includes(tag);
  });
  const act = async (p: StorePlugin) => {
    const st = stateOf(p, installed, updates);
    const v = p.versions[0];
    if (st === "installed") { notify(`${p.name} ya está instalado`); return; }
    if (!v) { notify("Sin versión disponible"); return; }
    const ok = await requestInstall(p.name, v, st === "update" ? InstallType.UPDATE : InstallType.INSTALL);
    if (ok) notify(`Decky pide confirmar ${st === "update" ? "la actualización" : "la instalación"} de ${p.name}`);
    else { notify("No se pudo desde aquí: se abre la tienda de Decky"); onOpenDeckyStore(); }
  };
  return (
    <SideColumn title="Tienda de Decky" subtitle={list ? `${list.length} plugins · ${updates.size} actualizaciones` : "Cargando…"} onClose={onClose} focusKey="store">
      <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <Focusable style={{ display: "flex", gap: 6 }} flow-children="row">
          {(["all", "installed", "updates"] as Filter[]).map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>{f === "all" ? "Todos" : f === "installed" ? "Instalados" : `Actualizar${updates.size ? ` · ${updates.size}` : ""}`}</Chip>
          ))}
        </Focusable>
        {tags.length > 0 && (
          <Focusable style={{ display: "flex", gap: 6, overflowX: "auto" }} flow-children="row">
            <DialogButton data-qr="item" onClick={() => setTag(null)} style={{ minWidth: 0, width: "auto", flexShrink: 0, height: 28, padding: "0 10px", borderRadius: 14, fontSize: 11, background: tag === null ? COLORS.accent : COLORS.card, color: tag === null ? COLORS.onAccent : COLORS.text }}>Todas</DialogButton>
            {tags.map((g) => (
              <DialogButton key={g} data-qr="item" onClick={() => setTag(g)} style={{ minWidth: 0, width: "auto", flexShrink: 0, height: 28, padding: "0 10px", borderRadius: 14, fontSize: 11, background: tag === g ? COLORS.accent : COLORS.card, color: tag === g ? COLORS.onAccent : COLORS.text }}>{g}</DialogButton>
            ))}
          </Focusable>
        )}
        {err && <div style={{ ...small, color: "#ff9a9a" }}>No se pudo cargar la tienda ({err}).</div>}
        {err && <Chip onClick={onOpenDeckyStore}>Abrir la tienda de Decky</Chip>}
        {shown.slice(0, limit).map((p) => (
          <StoreRow key={String(p.id)} p={p} state={stateOf(p, installed, updates)} ver={installed.get(p.name) ?? ""} onAction={() => void act(p)} />
        ))}
        {shown.length > limit && <Chip onClick={() => setLimit((l) => l + 25)}>Ver más ({shown.length - limit})</Chip>}
        {list && !shown.length && <div style={small}>Nada en este filtro.</div>}
      </div>
    </SideColumn>
  );
};
