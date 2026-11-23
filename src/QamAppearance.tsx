// Mas › Apariencia: el panel sigue el tema de Panel de Control (acento + colores del tema activo de CSS Loader).
import { useEffect, useState, useSyncExternalStore, type FC } from "react";

import {
  ACCENT_CHOICES, appearanceMode, appearanceSource, appearanceVersion, cssLoaderThemes, currentPalette, refreshAppearance,
  OWN_THEMES, setAppearanceMode, setThemeBgEnabled, setUiPrefs, themeBgEnabled, subscribeAppearance, uiPrefs,
  type AppearanceMode, type CssTheme, type Density, type Radius,
} from "./appearance";
import { fxStyle, setFxStyle, type FxStyle } from "./fx";
import { Card, Label, small } from "./QamSections";
import { useTap } from "./tap";
import { ecoThresholdW, ecoMode, ecoPatchOf, ecoStatus, setEcoMode, syncThemeEco } from "./themeEco";
import { COLORS, Chip, Row, ToggleRow, focusRing } from "./ui";
import { Focusable } from "@decky/ui";

/** Muestra de un tema propio: fondo, texto y acento del propio tema. */
const OwnChip: FC<{ on: boolean; name: string; note: string; accent: string; bg: string; fg: string; onTap: () => void }> = ({ on, name, note, accent, bg, fg, onTap }) => {
  const [f, setF] = useState(false);
  return (
    <Focusable data-qr="item" noFocusRing onActivate={onTap} onClick={onTap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      style={{ width: "100%", minWidth: 0, overflow: "hidden", boxSizing: "border-box", padding: "7px 9px", borderRadius: 14, background: bg, color: fg,
        boxShadow: `inset 0 0 0 ${on ? 2 : 1}px ${on ? accent : "rgba(255,255,255,0.14)"}`, ...focusRing(f) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: accent, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      </div>
      <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{note}</div>
    </Focusable>
  );
};

const MODES: Array<{ id: AppearanceMode; label: string; hint: string }> = [
  { id: "panel", label: "Como Panel", hint: "Colores, acento y bordes de Panel de Control y de su tema activo." },
  { id: "accent", label: "Solo su acento", hint: "El diseño de QAM Rail con el color de acento de Panel." },
  { id: "rail", label: "QAM Rail", hint: "El diseño propio, naranja, sin seguir a Panel." },
];

const Swatch: FC<{ c: string; label: string }> = ({ c, label }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flex: 1, minWidth: 0 }}>
    <div style={{ width: 26, height: 26, borderRadius: 9, background: c, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)" }} />
    <div style={{ ...small, fontSize: 10, whiteSpace: "nowrap" }}>{label}</div>
  </div>
);

export const AppearanceCard: FC = () => {
  useSyncExternalStore(subscribeAppearance, appearanceVersion);
  const [themes, setThemes] = useState<CssTheme[] | null | undefined>(undefined);
  useEffect(() => { let on = true; void cssLoaderThemes().then((t) => { if (on) setThemes(t); }); return () => { on = false; }; }, []);
  const mode = appearanceMode();
  const src = appearanceSource();
  const p = currentPalette();
  const active = themes?.filter((t) => t.enabled) ?? [];
  const tokenCount = Object.keys(src.tokens).length;
  const [fx, setFx] = useState<FxStyle>(fxStyle());

  const origin = mode === "rail" ? "Diseño propio." : [
    src.accentPref && src.accentPref !== "default" ? `Acento elegido en Panel: ${src.accentPref}.` : tokenCount && src.tokens.accent ? "Acento del tema activo." : "Acento por defecto de Panel.",
    mode === "panel" ? (tokenCount ? `El tema publica ${tokenCount} colores para Panel.` : "El tema activo no publica colores para Panel: se usa su aspecto base.") : "",
  ].filter(Boolean).join(" ");

  const u = uiPrefs();
  return (
    <>
      <Card title="Colores">
        <Row>
          {MODES.map((m) => <Chip key={m.id} active={mode === m.id} onClick={() => setAppearanceMode(m.id)}>{m.label}</Chip>)}
        </Row>
        <div style={small}>{MODES.find((m) => m.id === mode)?.hint ?? `Tema propio: ${OWN_THEMES.find((t) => `own:${t.id}` === mode)?.name ?? ""}.`}</div>
        <Label>Temas propios</Label>
        <Focusable style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: 6 }}>
          {OWN_THEMES.map((t) => (
            <OwnChip key={t.id} on={mode === `own:${t.id}`} name={t.name} note={t.note} accent={t.p.accent} bg={t.p.panel} fg={t.p.text}
              onTap={() => setAppearanceMode(`own:${t.id}`)} />
          ))}
        </Focusable>
        <div style={{ display: "flex", gap: 4 }}>
          <Swatch c={p.accent} label="acento" />
          <Swatch c={p.panel} label="fondo" />
          <Swatch c={p.card} label="tarjeta" />
          <Swatch c={p.track} label="pista" />
          <Swatch c={p.text} label="texto" />
        </div>
      </Card>

      <Card title="Personalizar">
        <Label>Acento</Label>
        <Focusable style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <ColorDot c={null} on={!u.accent} onTap={() => setUiPrefs({ accent: null })} />
          {ACCENT_CHOICES.map((c) => <ColorDot key={c} c={c} on={u.accent === c} onTap={() => setUiPrefs({ accent: c })} />)}
        </Focusable>
        <Label>Esquinas</Label>
        <Row gap={6}>
          {([["tema", "Del tema"], ["rectas", "Rectas"], ["redondas", "Redondas"]] as Array<[Radius, string]>).map(([id, l]) => (
            <Chip key={id} icon={RADIUS_ICON[id]} active={u.radius === id} onClick={() => setUiPrefs({ radius: id })}>{l}</Chip>
          ))}
        </Row>
        <Label>Espacio</Label>
        <Row gap={6}>
          {([["compacta", "Compacto"], ["normal", "Normal"], ["amplia", "Amplio"]] as Array<[Density, string]>).map(([id, l]) => (
            <Chip key={id} icon={DENSITY_ICON[id]} active={u.density === id} onClick={() => setUiPrefs({ density: id })}>{l}</Chip>
          ))}
        </Row>
        <Label>Al pulsar</Label>
        <Row gap={6}>
          {([["rebote", "Rebote"], ["suave", "Suave"], ["no", "Sin animación"]] as Array<[FxStyle, string]>).map(([id, l]) => (
            <Chip key={id} active={fx === id} onClick={() => { setFxStyle(id); setFx(id); }}>{l}</Chip>
          ))}
        </Row>
        <div style={{ ...small, fontSize: 11 }}>En modo ahorro no hay animaciones (gastan GPU).</div>
      </Card>

      <Card title="Tema de Panel de Control">
        <div style={small}>
          {themes === undefined ? "Buscando el tema activo…" : themes === null ? "CSS Loader no responde: se sigue solo el acento de Panel." :
            active.length ? `Tema activo: ${active.map((t) => t.displayName).join(", ")}.` : "Ningún tema de CSS Loader activo."}
          {" "}{origin}
          {mode === "panel" && (src.adapter ? ` Adaptado a ${src.adapter}: sus colores, su motivo y su tipografía.` : src.bg ? " Se continúa el fondo del tema con un velo para que se lea." : "")}
        </div>
        {mode === "panel" && (
          <ToggleRow label="Fondo del tema" note="continuar la imagen o el dibujo del tema detrás del panel" on={themeBgEnabled()} onToggle={() => setThemeBgEnabled(!themeBgEnabled())} />
        )}
        {(() => {
          const eco = active.map(ecoPatchOf).filter(Boolean);
          const st = ecoStatus();
          return (
            <ToggleRow label="Modo eficiencia del tema"
              note={`${themes === undefined ? "" : eco.length ? `Lo trae: ${eco.map((e) => active.find((t) => t.name === e!.theme)?.displayName).join(", ")}. ` : "Ningún tema activo lo trae. "}Se activa solo en modo ahorro (≤ ${ecoThresholdW()} W)${st.active ? " · ahora activado" : ""}.`}
              on={ecoMode() === "auto"} onToggle={() => { setEcoMode(ecoMode() === "auto" ? "off" : "auto"); void syncThemeEco().then(() => setThemes((t) => (t ? [...t] : t))); }} />
          );
        })()}
        <Chip grow={false} icon="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5" onClick={() => void refreshAppearance(true).then(() => cssLoaderThemes().then(setThemes))}>Volver a leer el tema</Chip>
      </Card>
    </>
  );
};

const RADIUS_ICON: Record<Radius, string> = { tema: "M4 4h16v16H4z", rectas: "M5 5h14v14H5z", redondas: "M9 4h6a5 5 0 0 1 5 5v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5z" };
const DENSITY_ICON: Record<Density, string> = { compacta: "M4 7h16M4 11h16M4 15h16", normal: "M4 6h16M4 12h16M4 18h16", amplia: "M4 5h16M4 19h16" };

/** Círculo de color para elegir el acento (sin color = el del tema, con una barra). */
const ColorDot: FC<{ c: string | null; on: boolean; onTap: () => void }> = ({ c, on, onTap }) => {
  const [f, setF] = useState(false);
  const tap = useTap(onTap);
  return (
    <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      style={{ width: 30, height: 30, borderRadius: 15, background: c ?? "transparent", display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `inset 0 0 0 ${c ? 0 : 2}px ${COLORS.muted}, 0 0 0 ${on ? 3 : 0}px ${COLORS.text}`, ...focusRing(f) }}>
      {!c && <span style={{ fontSize: 10, fontWeight: 800, color: COLORS.muted }}>tema</span>}
    </Focusable>
  );
};
