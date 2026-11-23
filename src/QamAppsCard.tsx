// Apps › «Apps de QAM»: como la tienda de Decky pero para apps propias. Carpeta ~/homebrew/qam-apps/<id>,
// instalar/actualizar desde un .zip (Descargas, Games…), añadir a Steam con su arte, acciones rapidas y desinstalar.
import { openFilePicker } from "@decky/api";
import { Focusable } from "@decky/ui";
import { useEffect, useState, type FC } from "react";

import {
  addToSteam, appsAddFolder, appsFindZips, appsList, appsCheckUpdates, appsRollback, appsRun, appsUninstall, installAndWait, installMessage, updateAndWait, updateLabel, type GhUpdate, loadDrawerApps, removeFromSteam, shortcutOf,
  type FoundZip, type QamApp,
} from "./qamApps";
import { Card, Label, small } from "./QamSections";
import { COLORS, Chip, ICONS2, Keep, Row, colorFor } from "./ui";

const newer = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a || !b) return false;
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0), pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0); }
  return false;
};

export const QamAppsCard: FC<{ notify: (t: string) => void; onChanged?: () => void }> = ({ notify, onChanged }) => {
  const [data, setData] = useState<{ dir: string; apps: QamApp[] } | null>(null);
  const [zips, setZips] = useState<FoundZip[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState<string | null>(null);
  // Primera instalacion de una app con instalador propio: se pregunta antes de ejecutarlo.
  const [confirm, setConfirm] = useState<{ app: QamApp; answer: (yes: boolean) => void } | null>(null);
  // Instalar es ocasional: va plegado (antes ocupaba media sección).
  const [inst, setInst] = useState(false);
  const reload = () => {
    void appsList().then((d) => setData({ dir: d?.dir ?? "?", apps: Array.isArray(d?.apps) ? d.apps : [] }), () => setData({ dir: "?", apps: [] }));
    void appsFindZips().then((z) => setZips(Array.isArray(z) ? z : []), () => setZips([]));
  };
  const [gh, setGh] = useState<Record<string, GhUpdate>>({});
  const checkGh = (force = false) => void appsCheckUpdates(force).then((r) => setGh(r?.results ?? {}), () => null);
  useEffect(reload, []);
  useEffect(() => { checkGh(false); }, []); // solo con el panel abierto; el backend limita a 1 consulta cada 6 h

  const run = async (label: string, fn: () => Promise<string | void>) => {
    if (busy) return;
    setBusy(label);
    try { const m = await fn(); if (m) notify(m); } catch (e) { notify(`Error: ${String(e).slice(0, 80)}`); }
    setBusy(null); reload(); onChanged?.();
  };
  const install = (source: string) => run("Instalando…", async () => {
    const r = await installAndWait(source, (st) => setBusy(`Instalando: ${st}`),
      (app) => new Promise<boolean>((done) => setConfirm({ app, answer: (yes) => { setConfirm(null); done(yes); } })));
    setConfirm(null);
    if (r.state === "done") await loadDrawerApps(true);
    return installMessage(r);
  });
  const updateGh = (id: string) => run("Actualizando…", async () => {
    const r = await updateAndWait(id, (st) => setBusy(`Actualizando: ${st}`));
    if (r.state === "done") await loadDrawerApps(true);
    checkGh(false);
    return installMessage(r);
  });
  // "zip" = instalar un .zip · "copy" = instalar copiando una carpeta (tu repo, sin .git/.venv) · "link" = usarla donde esta
  const pick = (kind: "zip" | "copy" | "link") => {
    const folder = kind === "zip" ? false : kind;
    // 0 = archivo, 1 = carpeta (FileSelectionType es un const enum: se pone el numero).
    void openFilePicker((folder ? 1 : 0) as never, "/home", !folder, true, undefined, folder ? undefined : ["zip"])
      .then((r) => (folder === "link" ? run("Añadiendo carpeta…", async () => { const x = await appsAddFolder(r.realpath ?? r.path); await loadDrawerApps(true); return x.ok ? `${x.app?.name} añadida (se usa desde su carpeta)` : `No se pudo: ${x.error}`; }) : install(r.realpath ?? r.path)))
      .catch(() => null);
  };

  const apps = data?.apps ?? [];
  const pending = (zips ?? []).filter((z) => { const a = apps.find((x) => x.id === z.id); return !a || newer(z.version, a.version); });

  return (
    <Keep id="qam-apps-card" loading={data === null || zips === null}>
    <Card title="Apps de QAM" right={<span style={small}>{apps.length ? `${apps.length} instaladas` : ""}</span>}>
      {busy && <div style={{ ...small, color: COLORS.text }}>{busy}</div>}
      {confirm && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>¿Instalar {confirm.app.name}{confirm.app.version ? ` ${confirm.app.version}` : ""}?</div>
          <div style={{ ...small, fontSize: 11 }}>Esta app ejecuta su propio instalador ({confirm.app.install}). Instálala solo si confías en quien la publica.</div>
          <Row gap={6}>
            <Chip compact active icon={ICONS2.download} onClick={() => confirm.answer(true)}>Instalar</Chip>
            <Chip compact onClick={() => confirm.answer(false)}>Cancelar</Chip>
          </Row>
        </div>
      )}
      {apps.length === 0 && <div style={small}>Aún no hay apps de QAM instaladas.</div>}
      {apps.map((a) => {
        const sc = shortcutOf(a);
        const update = (zips ?? []).find((z) => z.id === a.id && newer(z.version, a.version));
        return (
          <Focusable key={a.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0 2px", borderTop: `1px solid ${COLORS.track}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: colorFor(a.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{a.name.slice(0, 1).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                <div style={{ ...small, fontSize: 11 }}>{a.version ? `v${a.version}` : "sin versión"}{a.external ? " · carpeta propia" : ""}{a.deducido ? " · deducida" : ""}{a.check?.errors?.length ? " · revisar" : ""}</div>
              </div>
              <Chip compact grow={false} active icon={ICONS2.play} onClick={() => void appsRun(a.id, "").then(() => notify(`Abriendo ${a.name}`))}>Abrir</Chip>
            </div>
            <Row gap={6}>
              {update && <Chip compact active icon={ICONS2.refresh} onClick={() => install(update.zip)}>Actualizar a {update.version}</Chip>}
              {!update && updateLabel(gh[a.id]) && <Chip compact active icon={ICONS2.download} onClick={() => updateGh(a.id)}>{updateLabel(gh[a.id])}</Chip>}
              {a.has_previous && <Chip compact icon={ICONS2.refresh} onClick={() => run("Volviendo…", async () => { const r = await appsRollback(a.id); await loadDrawerApps(true); return r.ok ? `${a.name}: ahora la ${r.app?.version ?? "anterior"}` : `No se pudo volver: ${r.error ?? "?"}`; })}>Volver a {a.previous_version ?? "la anterior"}</Chip>}
              {!sc && <Chip compact icon={ICONS2.plus} onClick={() => run("Añadiendo a Steam…", async () => { const s = await addToSteam(a); return s.appid ? `En Steam (${s.art} imágenes)` : `No se pudo: ${s.error}`; })}>A Steam</Chip>}
              {(a.actions ?? []).slice(0, 3).map((x) => <Chip compact key={x.label} onClick={() => void appsRun(a.id, x.args).then(() => notify(`${a.name}: ${x.label}`))}>{x.label}</Chip>)}
              <Chip compact grow={false} icon={ICONS2.trash} onClick={() => {
                if (ask !== a.id) { setAsk(a.id); window.setTimeout(() => setAsk(null), 4000); return; }
                setAsk(null);
                void run("Quitando…", async () => { const r = await appsUninstall(a.id); removeFromSteam(sc ?? r.appid); return r.removed ? `${a.name} desinstalada` : `${a.name} ya no se gestiona aquí (la carpeta sigue)`; });
              }}>{ask === a.id ? "¿Seguro?" : a.external ? "Olvidar" : ""}</Chip>
            </Row>
          </Focusable>
        );
      })}
      {inst && pending.length > 0 && (
        <>
          <Label>Encontradas en tus carpetas</Label>
          {pending.slice(0, 4).map((z) => (
            <Row key={z.zip} gap={6}>
              <Chip compact icon={ICONS2.download} onClick={() => install(z.zip)}>{apps.some((a) => a.id === z.id) ? "Actualizar" : "Instalar"} {z.name} {z.version ?? ""}</Chip>
            </Row>
          ))}
        </>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Chip compact grow={false} icon={ICONS2.download} active={inst} onClick={() => setInst(!inst)}>{inst ? "Cerrar" : pending.length ? `Instalar (${pending.length} encontradas)` : "Instalar app"}</Chip>
      </div>
      {inst && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Row gap={6}>
            <Chip compact icon={ICONS2.download} onClick={() => pick("zip")}>.zip</Chip>
            <Chip compact icon={ICONS2.folder} onClick={() => pick("copy")}>Carpeta</Chip>
            <Chip compact icon={ICONS2.link} onClick={() => pick("link")}>En su sitio</Chip>
            <Chip compact icon={ICONS2.refresh} onClick={() => { checkGh(true); notify("Buscando actualizaciones…"); }}>Buscar ahora</Chip>
          </Row>
          <div style={{ ...small, fontSize: 11 }}>Se guarda en {data?.dir ?? "…"}. «Carpeta» copia tu repositorio; «En su sitio» la usa desde donde está (para desarrollar).</div>
        </div>
      )}
    </Card>
    </Keep>
  );
};
