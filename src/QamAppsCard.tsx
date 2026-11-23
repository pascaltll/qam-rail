// Apps de QAM: opciones de cada app (menú largo › Opciones) y «Tienda» (por ahora, instalar desde archivo; luego una lista de apps pensadas para Big Picture). Carpeta ~/homebrew/qam-apps/<id>,
// instalar/actualizar desde un .zip (Descargas, Games…), añadir a Steam con su arte, acciones rapidas y desinstalar.
import { openFilePicker } from "@decky/api";
import { Focusable } from "@decky/ui";
import { useEffect, useState, type FC } from "react";

import {
  addToSteam, appsAddFolder, appsFindZips, appsList, appsCheckUpdates, checkMessage, appsRollback, appsRun, appsUninstall, installAndWait, installMessage, updateAndWait, updateLabel, type GhUpdate, loadDrawerApps, removeFromSteam, shortcutOf,
  type FoundZip, type QamApp,
} from "./qamApps";
import { Card, Label, small } from "./QamSections";
import { COLORS, Chip, ICONS2, Keep, Row } from "./ui";

const newer = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a || !b) return false;
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0), pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0); }
  return false;
};

/** Estado y acciones compartidas por las opciones de una app y la tienda. */
function useAppMgr(notify: (t: string) => void, onChanged?: () => void) {
  const [data, setData] = useState<{ dir: string; apps: QamApp[] } | null>(null);
  const [zips, setZips] = useState<FoundZip[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState<string | null>(null);
  // Primera instalacion de una app con instalador propio: se pregunta antes de ejecutarlo.
  const [confirm, setConfirm] = useState<{ app: QamApp; answer: (yes: boolean) => void } | null>(null);
  const reload = () => {
    void appsList().then((d) => setData({ dir: d?.dir ?? "?", apps: Array.isArray(d?.apps) ? d.apps : [] }), () => setData({ dir: "?", apps: [] }));
    void appsFindZips().then((z) => setZips(Array.isArray(z) ? z : []), () => setZips([]));
  };
  const [gh, setGh] = useState<Record<string, GhUpdate>>({});
  const checkGh = (force = false): Promise<Record<string, GhUpdate> | null> =>
    appsCheckUpdates(force).then((r) => { const res = r?.results ?? {}; setGh(res); return res; }, () => null);
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
  return { data, zips, busy, ask, setAsk, confirm, gh, checkGh, run, install, updateGh, pick, apps, pending };
}

const Status: FC<{ m: ReturnType<typeof useAppMgr> }> = ({ m }) => (
  <>
    {m.busy && <div style={{ ...small, color: COLORS.text }}>{m.busy}</div>}
    {m.confirm && (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>¿Instalar {m.confirm.app.name}{m.confirm.app.version ? ` ${m.confirm.app.version}` : ""}?</div>
        <div style={{ ...small, fontSize: 11 }}>Esta app ejecuta su propio instalador ({m.confirm.app.install}). Instálala solo si confías en quien la publica.</div>
        <Row gap={6}>
          <Chip compact active icon={ICONS2.download} onClick={() => m.confirm?.answer(true)}>Instalar</Chip>
          <Chip compact onClick={() => m.confirm?.answer(false)}>Cancelar</Chip>
        </Row>
      </div>
    )}
  </>
);

/** Opciones de UNA app de QAM: abrir, actualizar, volver a la anterior, añadir a Steam, acciones rápidas y desinstalar. */
export const QamAppOptions: FC<{ id: string; notify: (t: string) => void; onClose: () => void; onChanged?: () => void }> = ({ id, notify, onClose, onChanged }) => {
  const m = useAppMgr(notify, onChanged);
  const a = m.apps.find((x) => x.id === id);
  if (!a) return <Keep id={`qam-app-opt-${id}`} loading={m.data === null}><Card title="Opciones"><div style={small}>Esa app ya no está instalada.</div><Row gap={6}><Chip compact onClick={onClose}>Cerrar</Chip></Row></Card></Keep>;
  const sc = shortcutOf(a);
  const update = (m.zips ?? []).find((z) => z.id === a.id && newer(z.version, a.version));
  return (
    <Keep id={`qam-app-opt-${id}`} loading={m.data === null}>
    <Card title={`${a.name} · opciones`} right={<span style={small}>{a.version ? `v${a.version}` : "sin versión"}</span>}>
      <Status m={m} />
      <div style={{ ...small, fontSize: 11 }}>{a.external ? "Usa su carpeta propia. " : ""}{a.deducido ? "Datos deducidos (sin qam-app.json). " : ""}{a.check?.errors?.length ? "Revisar su manifiesto. " : ""}</div>
      {m.gh[a.id]?.state === "error" && <div style={{ ...small, fontSize: 11, color: COLORS.danger }}>No se pudo comprobar las actualizaciones: {m.gh[a.id]?.error ?? "?"}</div>}
      <Focusable style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Row gap={6}>
          {update && <Chip compact active icon={ICONS2.refresh} onClick={() => m.install(update.zip)}>Actualizar a {update.version}</Chip>}
          {!update && updateLabel(m.gh[a.id]) && <Chip compact active icon={ICONS2.download} onClick={() => m.updateGh(a.id)}>{updateLabel(m.gh[a.id])}</Chip>}
          {!update && !updateLabel(m.gh[a.id]) && <Chip compact icon={ICONS2.refresh} onClick={() => { notify("Buscando actualizaciones…"); void m.checkGh(true).then((res) => notify(checkMessage(res?.[a.id], a.name))); }}>Buscar actualización</Chip>}
          {a.has_previous && <Chip compact icon={ICONS2.refresh} onClick={() => m.run("Volviendo…", async () => { const r = await appsRollback(a.id); await loadDrawerApps(true); return r.ok ? `${a.name}: ahora la ${r.app?.version ?? "anterior"}` : `No se pudo volver: ${r.error ?? "?"}`; })}>Volver a {a.previous_version ?? "la anterior"}</Chip>}
        </Row>
        <Row gap={6}>
          {!sc && <Chip compact icon={ICONS2.plus} onClick={() => m.run("Añadiendo a Steam…", async () => { const s = await addToSteam(a); return s.appid ? `En Steam (${s.art} imágenes)` : `No se pudo: ${s.error}`; })}>Añadir a Steam</Chip>}
          {(a.actions ?? []).slice(0, 3).map((x) => <Chip compact key={x.label} onClick={() => void appsRun(a.id, x.args).then(() => notify(`${a.name}: ${x.label}`))}>{x.label}</Chip>)}
        </Row>
        <Row gap={6}>
          <Chip compact icon={ICONS2.trash} onClick={() => {
            if (m.ask !== a.id) { m.setAsk(a.id); window.setTimeout(() => m.setAsk(null), 4000); return; }
            m.setAsk(null);
            void m.run("Quitando…", async () => { const r = await appsUninstall(a.id); if (r.ok === false) return `No se pudo desinstalar ${a.name}: ${r.error ?? "?"} (queda en updates.log)`; removeFromSteam(sc ?? r.appid ?? null); onClose(); return r.removed ? `${a.name} desinstalada` : `${a.name} ya no se gestiona aquí (la carpeta sigue)`; });
          }}>{m.ask === a.id ? "¿Seguro?" : a.external ? "Olvidar" : "Desinstalar"}</Chip>
          <Chip compact onClick={onClose}>Cerrar</Chip>
        </Row>
      </Focusable>
    </Card>
    </Keep>
  );
};

/** «Tienda»: por ahora instalar desde archivo o carpeta; después, una lista de apps pensadas para Big Picture (Forgeinator, MiniTube…). */
export const QamStore: FC<{ notify: (t: string) => void; onBack: () => void; onChanged?: () => void }> = ({ notify, onBack, onChanged }) => {
  const m = useAppMgr(notify, onChanged);
  return (
    <Keep id="qam-store" loading={m.data === null || m.zips === null}>
    <Card title="Tienda de apps" right={<span style={small}>{m.apps.length ? `${m.apps.length} instaladas` : ""}</span>}>
      <Status m={m} />
      <div style={{ ...small, fontSize: 11 }}>Próximamente: una lista de apps pensadas para el modo Big Picture (Forgeinator, MiniTube…) para instalarlas con un toque. Mientras tanto se instalan desde un archivo.</div>
      {m.pending.length > 0 && (
        <>
          <Label>Encontradas en tus carpetas</Label>
          {m.pending.slice(0, 4).map((z) => (
            <Row key={z.zip} gap={6}>
              <Chip compact icon={ICONS2.download} onClick={() => m.install(z.zip)}>{m.apps.some((a) => a.id === z.id) ? "Actualizar" : "Instalar"} {z.name} {z.version ?? ""}</Chip>
            </Row>
          ))}
        </>
      )}
      <Label>Instalar desde…</Label>
      <Row gap={6}>
        <Chip compact icon={ICONS2.download} onClick={() => m.pick("zip")}>.zip</Chip>
        <Chip compact icon={ICONS2.folder} onClick={() => m.pick("copy")}>Carpeta</Chip>
        <Chip compact icon={ICONS2.link} onClick={() => m.pick("link")}>En su sitio</Chip>
      </Row>
      <div style={{ ...small, fontSize: 11 }}>Se guarda en {m.data?.dir ?? "…"}. «Carpeta» copia tu repositorio; «En su sitio» la usa desde donde está (para desarrollar).</div>
      <Row gap={6}><Chip compact onClick={onBack}>Volver</Chip></Row>
    </Card>
    </Keep>
  );
};
