// Más › «Versión instalada»: qué copia de QAM Rail dibuja el panel (estable por GitHub o desarrollo) y el paso de una a otra.
// Pasar de una a otra reinicia Decky (unos segundos), por eso pide confirmación.
import { useEffect, useState, type FC } from "react";

import { Card, small } from "./QamSections";
import { Chip, Row } from "./ui";
import { channelInfo, channelLine, channelSwitch, kindName, other, switchMessage, type ChannelInfo } from "./qamChannel";

export const QamChannelCard: FC<{ notify: (t: string) => void }> = ({ notify }) => {
  const [info, setInfo] = useState<ChannelInfo | null>(null);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void channelInfo().then(setInfo, () => null); }, []);
  if (!info) return null;
  const o = other(info);
  if (info.me === "stable" && !o.installed) return null; // solo hay estable: nada que elegir

  const go = async () => {
    setAsk(false); setBusy(true);
    try { notify(switchMessage(await channelSwitch(o.kind), o.kind)); } catch (e) { notify(`Error: ${String(e).slice(0, 80)}`); }
    setBusy(false);
  };
  return (
    <Card title="Versión instalada" help="canales">
      <div style={small}>{channelLine(info)}</div>
      {info.me === "dev" && !o.installed && <div style={{ ...small, fontSize: 11 }}>No hay versión estable instalada: sin ella no hay a dónde volver si dev falla. En la terminal: ./instalar.sh</div>}
      {ask && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>¿Pasar a la versión {kindName(o.kind)}?</div>
          <div style={{ ...small, fontSize: 11 }}>Decky se reinicia unos segundos y el panel se cierra. La otra versión queda instalada y en pausa.</div>
          <Row gap={6}>
            <Chip compact active onClick={() => void go()}>Sí, reiniciar</Chip>
            <Chip compact onClick={() => setAsk(false)}>Cancelar</Chip>
          </Row>
        </div>
      )}
      {!ask && o.installed && <Row gap={6}><Chip compact onClick={() => !busy && setAsk(true)}>Pasar a {kindName(o.kind)}</Chip></Row>}
    </Card>
  );
};
