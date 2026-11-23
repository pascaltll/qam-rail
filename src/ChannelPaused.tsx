// Contenido del plugin cuando NO es la copia activa (0.53): no dibuja el QAM ni arranca nada; solo dice quién está activo y ofrece activarse.
import { ButtonItem, PanelSection, PanelSectionRow } from "@decky/ui";
import { useEffect, useState, type FC } from "react";

import { channelInfo, channelSwitch, kindName, type ChannelInfo } from "./qamChannel";

export const ChannelPaused: FC = () => {
  const [info, setInfo] = useState<ChannelInfo | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { void channelInfo().then(setInfo, () => null); }, []);
  if (!info) return null;
  return (
    <PanelSection title={`QAM Rail · ${kindName(info.me)} en pausa`}>
      <PanelSectionRow><div style={{ fontSize: 13 }}>Ahora dibuja el panel la versión {kindName(info.active)}. Esta ({info.version ?? "?"}) está instalada pero parada.</div></PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={!!msg} onClick={() => { setMsg("Reiniciando Decky…"); void channelSwitch(info.me).then((r) => setMsg(r.ok ? "Reiniciando Decky…" : (r.error ?? "No se pudo")), () => setMsg("No se pudo")); }}>
          {msg ?? `Activar la versión ${kindName(info.me)}`}
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
};
