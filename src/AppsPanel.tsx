import { tickEvery } from "./ticker";
import { Focusable, Navigation, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { useCallback, useEffect, useState, type CSSProperties, type FC } from "react";

import { curate, readApps, toggleFavorite, type AppEntry } from "./apps";
import { saveSettings, type Settings } from "./backend";
import { COLORS, colorFor } from "./ui";

const tileStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
  width: 84,
  padding: 4,
  borderRadius: 18,
  boxSizing: "border-box",
};

const iconStyle: CSSProperties = {
  width: 54,
  height: 54,
  borderRadius: 18,
  background: "rgba(255,255,255,0.10)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 22,
  fontWeight: 700,
  overflow: "hidden",
  position: "relative",
};

function launch(app: AppEntry, after?: () => void): void {
  try {
    const apps = (window as unknown as { SteamClient?: { Apps?: { RunGame?: (g: string, o: string, l: number, s: number) => void } } })
      .SteamClient?.Apps;
    apps?.RunGame?.(app.gameid, "", -1, 100);
    Navigation.CloseSideMenus();
    after?.();
  } catch {
    /* sin SteamClient: no hay nada que lanzar */
  }
}

const Tile: FC<{ app: AppEntry; fav: boolean; onFav: () => void; after?: () => void }> = ({ app, fav, onFav, after }) => (
  <Focusable
    style={tileStyle}
    onActivate={() => launch(app, after)}
    onSecondaryButton={onFav}
    onSecondaryActionDescription={fav ? "Quitar favorito" : "Fijar favorito"}
  >
    <div style={{ ...iconStyle, background: app.capsule ? "rgba(255,255,255,0.10)" : colorFor(app.name), color: "#fff" }}>
      {app.capsule ? (
        <img src={app.capsule} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        app.name.slice(0, 1).toUpperCase()
      )}
      {fav && <span style={{ position: "absolute", top: 1, right: 4, fontSize: 11 }}>★</span>}
    </div>
    <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.15, textAlign: "center", maxHeight: 24, overflow: "hidden", width: "100%" }}>
      {app.name}
    </div>
  </Focusable>
);

const Grid: FC<{ apps: AppEntry[]; favorites: number[]; onFav: (id: number) => void; after?: () => void }> = ({ apps, favorites, onFav, after }) => (
  <Focusable style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
    {apps.map((a) => (
      <Tile key={a.appid} app={a} fav={favorites.includes(a.appid)} onFav={() => onFav(a.appid)} after={after} />
    ))}
  </Focusable>
);

export const AppsLauncher: FC<{ settings: Settings; onSettings: (s: Settings) => void; onLaunched?: () => void }> = ({
  settings, onSettings, onLaunched,
}) => {
  const [apps, setApps] = useState<AppEntry[]>(() => readApps(window as never));

  // La coleccion de Steam puede estar vacia justo al arrancar: se relee unos segundos.
  useEffect(() => {
    if (apps.length) return;
    const t = tickEvery(() => setApps(readApps(window as never)), 1500);
    return () => t();
  }, [apps.length]);

  const { pinned, more } = curate(apps, settings.favorites);

  const update = useCallback(
    (next: Settings) => {
      onSettings(next);
      void saveSettings(next);
    },
    [onSettings],
  );
  // Al anclar desde "Mas atajos" por primera vez se parte de lo que ya se ve anclado.
  const onFav = (id: number) => update({ ...settings, favorites: toggleFavorite(settings.favorites.length ? settings.favorites : pinned.map((a) => a.appid), id) });
  const pinnedIds = pinned.map((a) => a.appid);

  const label: CSSProperties = { fontSize: 13, color: COLORS.muted, margin: "6px 2px 2px" };
  return (
    <>
      <div style={label}>Apps</div>
      {pinned.length ? (
        <Grid apps={pinned} favorites={pinnedIds} onFav={onFav} after={onLaunched} />
      ) : (
        <div style={{ fontSize: 12, color: COLORS.muted }}>
          {apps.length ? "No hay atajos MiniTube / Recomp Hub. Ancla uno con Y." : "Cargando biblioteca…"}
        </div>
      )}
      {more.length > 0 && (
        <>
          <div style={label}>Más atajos (Y = anclar)</div>
          <Grid apps={more} favorites={pinnedIds} onFav={onFav} after={onLaunched} />
        </>
      )}
    </>
  );
};

export const AppsPanel: FC<{ settings: Settings; onSettings: (s: Settings) => void }> = ({ settings, onSettings }) => {
  const update = (next: Settings) => {
    onSettings(next);
    void saveSettings(next);
  };
  return (
    <>
      <AppsLauncher settings={settings} onSettings={onSettings} />
      <PanelSection title="Riel">
        <PanelSectionRow>
          <ToggleField
            label="Abrir al mover la cruceta"
            description="Si se apaga, la seccion se abre con A o Derecha."
            checked={settings.open_on === "focus"}
            onChange={(v) => update({ ...settings, open_on: v ? "focus" : "select" })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label="QAM propio (piloto)"
            description="Sustituye el QAM de Steam por un panel propio. Pulsa dos veces el botón del QAM para abrir el de Steam."
            checked={settings.own_qam}
            onChange={(v) => update({ ...settings, own_qam: v })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label="Riel activado"
            description="Apagalo para volver al QAM normal de Steam."
            checked={settings.enabled}
            onChange={(v) => update({ ...settings, enabled: v })}
          />
        </PanelSectionRow>
      </PanelSection>
    </>
  );
};
