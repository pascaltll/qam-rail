// Más › «Actualizaciones»: buscar, instalar y volver atrás QAM Rail desde GitHub Releases. Nada se instala solo:
// la comprobación avisa (como mucho cada 6 h, con el panel abierto) y instalar pide una confirmación que avisa del reinicio de Decky.
import { useEffect, useState, type FC } from "react";

import { Card, small } from "./QamSections";
import { COLORS, Chip, ICONS2, Row } from "./ui";
import { selfCheck, selfInfo, selfMessage, selfRollback, selfSetChannel, selfStatus, selfUpdate, type SelfInfo } from "./qamSelf";
import type { GhUpdate } from "./qamApps";

export const QamSelfUpdateCard: FC<{ notify: (t: string) => void }> = ({ notify }) => {
  const [info, setInfo] = useState<SelfInfo | null>(null);
  const [upd, setUpd] = useState<GhUpdate | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState<"update" | "rollback" | null>(null);

  const check = (force: boolean) => {
    setBusy("Buscando…");
    return selfCheck(force).then((r) => setUpd(r ?? null), () => setUpd({ state: "error" })).finally(() => setBusy(null));
  };
  useEffect(() => { void selfInfo().then(setInfo, () => null); void check(false); }, []); // el backend limita a 1 consulta cada 6 h

  const go = async (kind: "update" | "rollback") => {
    setAsk(null);
    setBusy(kind === "update" ? "Descargando e instalando…" : "Volviendo a la anterior…");
    try { notify(selfMessage(await (kind === "update" ? selfUpdate() : selfRollback()))); } catch (e) { notify(`Error: ${String(e).slice(0, 80)}`); }
    setBusy(null);
  };
  const channel = (c: "stable" | "beta") => void selfSetChannel(c).then((i) => { setInfo(i); void check(true); }, () => null);

  const available = upd?.state === "update";
  return (
    <Card title="Actualizaciones" help="actualizar">
      <div style={{ ...small, color: busy ? COLORS.text : undefined }}>{busy ?? selfStatus(info, upd, false)}</div>
      {available && upd?.notes && <div style={{ ...small, fontSize: 11 }}>{upd.notes.slice(0, 160)}</div>}
      {upd?.state === "error" && upd.error && <div style={{ ...small, fontSize: 11 }}>{upd.error}</div>}
      {ask && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{ask === "update" ? `¿Instalar ${upd?.latest}?` : `¿Volver a ${info?.backup_version}?`}</div>
          <div style={{ ...small, fontSize: 11 }}>Decky se reinicia unos segundos y el panel se cierra. Se guarda una copia por si hay que volver.</div>
          <Row gap={6}>
            <Chip compact active icon={ICONS2.download} onClick={() => void go(ask)}>Sí, reiniciar</Chip>
            <Chip compact onClick={() => setAsk(null)}>Cancelar</Chip>
          </Row>
        </div>
      )}
      {!ask && (
        <Row gap={6}>
          {available && <Chip compact active icon={ICONS2.download} onClick={() => !busy && setAsk("update")}>Actualizar a {upd?.latest}</Chip>}
          <Chip compact icon={ICONS2.refresh} onClick={() => !busy && void check(true).then(() => notify("Comprobado"))}>Buscar actualización</Chip>
          {info?.backup_version && <Chip compact onClick={() => !busy && setAsk("rollback")}>Volver a {info.backup_version}</Chip>}
        </Row>
      )}
      {!ask && info && (
        <Row gap={6}>
          <Chip compact active={info.channel === "stable"} onClick={() => channel("stable")}>Estable</Chip>
          <Chip compact active={info.channel === "beta"} onClick={() => channel("beta")}>Beta</Chip>
        </Row>
      )}
    </Card>
  );
};
