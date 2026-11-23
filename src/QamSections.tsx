import { DialogButton, Focusable } from "@decky/ui";
import { useContext, useEffect, useRef, useState, type CSSProperties, type FC, type ReactNode } from "react";

import { readApps, curate, type AppEntry } from "./apps";
import { appsRun, appsRunning, drawerCached, loadDrawerApps, shortcutOf, type QamApp } from "./qamApps";
import { crumb } from "./crumbs";
import { boostActive, boostEnabled, setBoostEnabled } from "./menuEfficiency";
import type { HostedPlugin } from "./decky";
import { usePanel, usePerf, type Conn } from "./hooks";
import {
  FAN_PRESETS, UP_STATUS, audioLabel, batteryLine, buildLabel, colorTarget, looks, mergeColor, panel, upscalerFacts,
  type UpscalerGame, type UpscalerLive, type AudioState, type BatteryState, type ColorState, type FanCurve, type FanState, type HdrState, type NightState, type EcoState,
} from "./panelExtra";
import { rpc } from "./panelBridge";
import { lowPower, currentWatts, refreshTdpNow, useTdp } from "./tdpControl";
import { MAX_ECO_W, MIN_ECO_W, onTiersChange, setTierChoice, tierChoice, tierOf, tiers } from "./powerTiers";
import { learned } from "./menuStats";
import { STEAM } from "./displayProfiles";
import { KINDS, MODES, kindAuto, kindOf, modeOf, planFor, savingFor, setKind, setKindAuto, setMode, type GameKind, type PresetMode } from "./gameKind";
import { onHomeModesChange } from "./homeModes";
import { saveSection } from "./diagStore";
import type { UseTdp } from "./tdpControl";
import { PAUSED, PLAYING, albumArt, albumById, music, musicState, musicOutputLost, musicStopped, musicSubscribe, readAlbums, soundtrackName, type Album } from "./music";
import { currentPalette, dockSurface } from "./appearance";
import { AudioControls } from "./QamAudio";
import { perfStore, readExtras, readPerf, setExtra, step, type PerfView } from "./steamPerf";
import { useTap } from "./tap";
import { DeskMenu } from "./QamDeskMenu";
import { loadPins, loadRunning, openDesktopApp, pinsCached, runningAppsCached, runningCached, type Pin } from "./qamDesktop";
import { tickEvery } from "./ticker";
import { CardDepth, COLORS, Chip, ICONS, ICONS2, Icon, Keep, Row, Segments, ToggleRow, XSlider, cardStyle, nestedRadius, colorFor, focusRing } from "./ui";

export const small = { fontSize: 12, get color() { return COLORS.muted; }, lineHeight: "16px" };

export const Label: FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 13, color: COLORS.muted, margin: "4px 2px 0" }}>{children}</div>
);

/** Tarjeta con titulo pequeño. */
/**
 * Tarjeta. Con `help` (clave de help.ts): Y sobre cualquier control de dentro, o tocar el «?», explica qué hace.
 */
export const Card: FC<{ title?: string; right?: ReactNode; children: ReactNode; help?: string }> = ({ title, right, children, help }) => {
  const depth = useContext(CardDepth);
  return (
  <CardDepth.Provider value={depth + 1}>
  <div style={{ ...cardStyle, ...(depth > 0 ? { borderRadius: nestedRadius(currentPalette().cardRadius) } : {}) }} {...(help ? { "data-qr-help": help } : {})}>
    {title && (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 20 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: COLORS.muted, flexGrow: 1, textTransform: "uppercase" }}>{title}</span>
        {right}
        {help && <HelpDot id={help} />}
      </div>
    )}
    {children}
  </div>
  </CardDepth.Provider>
  );
};
/** El «?» del título (para el dedo; con mando es Y). No es parada de la cruceta. */
const HelpDot: FC<{ id: string }> = ({ id }) => (
  <span role="button" title="Ayuda" onClick={(e) => { e.stopPropagation(); showHelp(id); }}
    style={{ width: 22, height: 22, margin: "-6px -4px -6px 0", borderRadius: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: COLORS.muted, background: COLORS.track, flexShrink: 0 }}>?</span>
);
// Quien pinta la ayuda (Qam) se apunta aquí.
let helpSink: ((id: string) => void) | null = null;
export const setHelpSink = (f: ((id: string) => void) | null) => { helpSink = f; };
export const showHelp = (id: string) => helpSink?.(id);

/** Ficha cuadrada con icono arriba (ajustes rapidos de 4 en fila). */
export const Tile: FC<{ icon: string; label: string; on: boolean; onTap: () => void; disabled?: boolean }> = ({ icon, label, on, onTap, disabled }) => {
  const [f, setF] = useState(false);
  return (
    <DialogButton data-qr="item" onClick={onTap} disabled={disabled}
      onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      style={{
        flex: 1, minWidth: 0, height: 62, padding: "6px 2px", borderRadius: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
        background: on ? COLORS.accent : COLORS.card, color: on ? COLORS.onAccent : COLORS.text, opacity: disabled ? 0.45 : 1, ...focusRing(f),
      }}>
      <Icon d={icon} size={20} color={on ? COLORS.onAccent : COLORS.text} />
      <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{label}</span>
    </DialogButton>
  );
};

/** Fila de opciones; la activa en acento. */
export const Options: FC<{ opts: Array<{ value: number | string; label: string; icon?: string }>; value: number | string | null; onPick: (v: never) => void; max?: number; compact?: boolean; perRow?: number }> = ({ opts, value, onPick, max = 5, perRow }) => (
  // Desde 0.47 es una barra de posiciones (una parada del mando). `perRow` = todas las opciones en filas de ese ancho.
  <Segments opts={perRow ? opts : opts.slice(0, max)} value={value} onPick={onPick} perRow={perRow && opts.length > perRow ? perRow : undefined} />
);

/** Cambia el VRR y COMPRUEBA que Steam lo aceptó: si a los 0,8 s el valor no cambió, lo dice (antes volvía solo, sin aviso). */
function toggleVrr(view: PerfView | null, write: ReturnType<typeof usePerf>["write"], notify?: (t: string) => void) {
  if (!view?.vrr) return;
  const want = !view.vrr.on;
  const st = perfStore() as unknown as { nCurrentGameID?: unknown; nActiveProfileGameID?: unknown } | null;
  const ok = write.vrr(want);
  window.setTimeout(() => {
    const now = readPerf(perfStore())?.vrr?.on;
    crumb(`vrr: pedido ${want ? "sí" : "no"} → ${ok ? "enviado" : "sin setter"} · ahora ${String(now)} · juego ${String(st?.nCurrentGameID)} perfil ${String(st?.nActiveProfileGameID)}`);
    if (now !== want) notify?.(ok ? "Steam no aplicó el VRR en este juego. Se puede cambiar en «Más opciones de Steam»." : "Steam no deja cambiar el VRR desde aquí");
  }, 800);
}

export const Shortcut: FC<{ label: string; hint?: string; onOpen: () => void; icon?: ReactNode }> = ({ label, hint, onOpen, icon }) => {
  const tap = useTap(onOpen);
  const [f, setF] = useState(false);
  return (
    <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      style={{ ...cardStyle, flexDirection: "row", alignItems: "center", gap: 10, height: 46, padding: "0 14px", ...focusRing(f) }}>
      {icon}
      <span style={{ flexGrow: 1, flexShrink: 0, fontSize: 14, whiteSpace: "nowrap" }}>{label}</span>
      {hint && <span style={{ fontSize: 12, color: COLORS.muted, whiteSpace: "nowrap", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{hint}</span>}
      <Icon d="M9 6l6 6-6 6" size={18} color={COLORS.muted} />
    </Focusable>
  );
};

// ---------------- Conexiones ----------------
export const QuickToggles: FC<{ c: Conn; night?: { on: boolean; toggle: () => void } | null; full?: boolean }> = ({ c, night, full }) => (
  <Row gap={8}>
    <Tile icon={ICONS2.wifi} label="Wi‑Fi" on={c.wifi && !c.plane} onTap={() => c.setWifi(!c.wifi)} />
    <Tile icon={ICONS.bluetooth} label="Bluetooth" on={c.bt} onTap={() => c.setBt(!c.bt)} />
    <Tile icon={ICONS2.moon} label="No molestar" on={c.dnd} onTap={() => c.setDnd(!c.dnd)} />
    {full ? <Tile icon={ICONS2.plane} label="Avión" on={c.plane} onTap={() => c.setPlane(!c.plane)} />
      : night && <Tile icon={ICONS.sun} label="Noche" on={night.on} onTap={night.toggle} />}
  </Row>
);

// ---------------- Modo noche (compartido entre Inicio y Pantalla) ----------------
export function useNight(notify: (t: string) => void) {
  const n = usePanel<NightState>("night", panel.night);
  const supported = !!n.data?.supported;
  const on = !!n.data?.enabled;
  const toggle = () => {
    if (!supported) { notify(n.missing ? "Modo noche: Panel de Control no responde" : "Modo noche no disponible en este equipo"); return; }
    n.set({ ...n.data, enabled: !on });
    panel.setNight({ enabled: !on }).then(n.set, () => { notify("No se pudo cambiar el modo noche"); n.refresh(); });
  };
  const warmth = (w: number) => { n.set({ ...n.data, warmth: w }); void panel.setNight({ warmth: Math.round(w) }).then(n.set, () => n.refresh()); };
  return { supported, on, warmth: n.data?.warmth ?? 50, toggle, setWarmth: warmth };
}

// ---------------- Pantalla: ajustes de Steam ----------------

/** Con juego, todo lo que se cambia queda guardado en ese juego (no hay «como en Steam» que elegir). */
const ScopeBadge: FC = () => <span style={small}>Este juego</span>;

/** Antes de escribir algo «por juego» en Panel: si el juego aun sigue al global, se crea su perfil (copia del global). */
async function ensureOwn(follows: boolean | undefined, appid: string | null, makeOwn: (appid: string) => Promise<unknown>) {
  if (appid && follows !== false) await makeOwn(appid);
}

/** Último look que se pidió para cada juego (Panel devuelve «sin coincidencia» si el juego tiene un ajuste propio de saturación, etc.). */
const lastLook = new Map<string, string>();
const lookKey = (c: ColorState | null) => c?.appid ?? "global";
function applyLook(key: string, c: ColorState | null, set: (v: ColorState) => void, notify: (t: string) => void) {
  const t = colorTarget(c);
  lastLook.set(lookKey(c), key); // la marca se queda en lo elegido aunque Panel tarde o lo vea «personalizado»
  ensureOwn(c?.follows_global, t.appid, (a) => panel.colorFollow(false, a, t.ctx))
    .then(() => (key === "oled" ? panel.applyOled(t.scope, t.appid, t.ctx) : panel.applyLook(key, t.scope, t.appid, t.ctx)))
    .then((raw) => {
      const s = mergeColor(c, raw) ?? (raw as ColorState);
      set(s);
      const hit = looks(s).find((l) => l.active);
      if (hit) lastLook.set(lookKey(c), hit.key); else lastLook.set(lookKey(c), key);
      crumb(`color: pedido ${key} (${t.scope}) → Panel ve ${hit?.key ?? "personalizado"}`);
      const want = looks(s).find((l) => l.key === key)?.label ?? key;
      notify(hit ? `Color: ${hit.label}${t.scope === "game" ? " · este juego" : ""}` : `Color: ${want} pedido; Panel lo ve «personalizado» (este juego tiene un ajuste propio de color)`);
    },
      () => notify("No se pudo aplicar el color"));
}

/** Controles compactos para Inicio de juego: FPS, VRR, escalado y look de color, como fichas que rotan con A. */
export const QuickDisplay: FC<{ gameKey: string; notify: (t: string) => void; onMore: () => void }> = ({ gameKey, notify, onMore }) => {
  const { view, write } = usePerf(gameKey);
  const color = usePanel<ColorState>("color", panel.color);
  const ls = looks(color.data);
  const activeLook = ls.find((l) => l.active) ?? null;
  const asked = ls.find((l) => l.key === lastLook.get(lookKey(color.data))) ?? null;
  const shown = activeLook ?? asked;
  const nextLook = () => {
    if (!ls.length) { notify("Color: Panel de Control no lo ofrece aquí"); return; }
    applyLook(step(ls.map((l) => l.key), shown?.key ?? ls[0].key, 1), color.data, color.set, notify);
  };
  const scalerLabel = view?.scaler?.options.find((o) => o.value === view.scaler!.value)?.label ?? "Auto";
  return (
    <Card title="Pantalla de este juego" right={<SmallLink onOpen={onMore}>Más ›</SmallLink>} help="fluidez">
      {view ? (
        <Row gap={6}>
          {view.fps && <Chip icon={ICONS2.chart} onClick={() => write.fps(step(view.fps!.options.map((o) => o.value), view.fps!.value, 1))}>{view.fps.value === 0 ? "Sin límite" : `${view.fps.value} FPS`}</Chip>}
          {view.vrr && <Chip icon={ICONS2.refresh} active={view.vrr.on} onClick={() => toggleVrr(view, write, notify)}>{view.vrr.on ? "VRR sí" : "VRR no"}</Chip>}
          {view.scaler && <Chip icon={ICONS2.sliders} onClick={() => write.scaler(step(view.scaler!.options.map((o) => o.value), view.scaler!.value, 1))}>{scalerLabel}</Chip>}
        </Row>
      ) : <div style={small}>Ajustes de Steam no disponibles aquí.</div>}
      {ls.length > 0 && <Row gap={6}><Chip icon={ICONS.sun} onClick={nextLook}>Color: {shown?.label ?? "Personalizado"}</Chip></Row>}
    </Card>
  );
};

const SmallLink: FC<{ onOpen: () => void; children: ReactNode }> = ({ onOpen, children }) => {
  const tap = useTap(onOpen);
  const [f, setF] = useState(false);
  return (
    <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      style={{ fontSize: 12, color: COLORS.muted, padding: "2px 6px", borderRadius: 10, ...focusRing(f) }}>{children}</Focusable>
  );
};

/** Opciones apagadas (sin juego): se ven pero no se pueden enfocar ni tocar. */
const GreyOptions: FC<{ labels: string[]; active: string | null }> = ({ labels, active }) => (
  <div style={{ display: "flex", gap: 6, opacity: 0.4 }}>
    {labels.map((l) => (
      <div key={l} style={{ flex: 1, height: 40, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, background: l === active ? COLORS.track : COLORS.card }}>{l}</div>
    ))}
  </div>
);

/**
 * Seccion «Pantalla y sonido». Con juego todo es de ESE juego (fluidez, escalado, color, HDR, sonido); sin juego, lo de
 * Steam. El escalado solo tiene sentido con juego: sin juego se muestra apagado.
 */
/**
 * `part`: «perf» = lo que da o quita FPS (límite de FPS, escalado, reescalador) → sección Rendimiento;
 * «image» = cómo se ve y se oye (color, noche, HDR, sonido) → sección Imagen y sonido.
 */
export const DisplaySection: FC<{ gameKey: string | null; notify: (t: string) => void; onNativePerf: () => void; onPanel: () => void; night: ReturnType<typeof useNight>; part: "perf" | "image" }> = ({ gameKey, notify, onNativePerf, onPanel, night, part }) => {
  const perf = usePerf(gameKey ?? STEAM);
  const { view, write } = perf;
  const color = usePanel<ColorState>("color", panel.color);
  const hdr = usePanel<HdrState>("hdr", panel.hdr);
  const ls = looks(color.data);
  const inGame = !!gameKey;
  if (part === "perf") return (
    <>
      <SteamPerfCard view={view} write={write} onNative={onNativePerf} notify={notify}
        right={inGame ? <ScopeBadge /> : undefined} />
      {(view?.scaler || view?.filter) && (inGame ? (
        <Card title="Escalado" help="escalado">
          {view.scaler && <Options opts={view.scaler.options} value={view.scaler.value} onPick={(v: number) => write.scaler(v)} />}
          {view.filter && <Options opts={view.filter.options} value={view.filter.value} onPick={(v: number) => write.filter(v)} />}
          {view.sharp && (
            <XSlider label={view.sharp.kind === "fsr" ? "Nitidez FSR" : "Nitidez NIS"} icon={ICONS.sun} value={view.sharp.value} min={view.sharp.min} max={view.sharp.max} step={1} suffix=""
              onChange={(v) => write.sharp(view.sharp!.kind, v)} />
          )}
        </Card>
      ) : (
        <Card title="Escalado" right={<span style={small}>por juego</span>}>
          {view.scaler && <GreyOptions labels={view.scaler.options.map((o) => o.label)} active={null} />}
          <div style={small}>Se ajusta para cada juego. Ábrelo y cámbialo aquí o en Inicio.</div>
        </Card>
      ))}
      {inGame && color.data?.appid && <UpscalerCard appid={color.data.appid} onPanel={onPanel} />}
    </>
  );
  return (
    <>
      <Card title="Color" right={inGame ? <ScopeBadge /> : undefined} help="color">
        {ls.length ? <Options opts={ls.map((l) => ({ value: l.key, label: l.label }))} value={ls.find((l) => l.active)?.key ?? lastLook.get(lookKey(color.data)) ?? null} onPick={(k: string) => applyLook(k, color.data, color.set, notify)} />
          : <div style={small}>{color.missing ? "Panel de Control no responde." : color.data && !color.data.supported ? "Este equipo no permite ajustar el color." : "Leyendo…"}</div>}
        {color.data?.perf_cost && <div style={small}>Este look consume un poco más de energía en este equipo.</div>}
        <Row gap={6}>
          <Chip icon={ICONS2.moon} active={night.on} onClick={night.toggle}>Modo noche</Chip>
          {hdr.data?.supported && (
            <Chip active={!!hdr.data.enabled} onClick={() => {
              const t = colorTarget(color.data);
              const v = !hdr.data?.enabled;
              hdr.set({ ...hdr.data, enabled: v });
              ensureOwn(color.data?.follows_global, t.appid, (a) => panel.colorFollow(false, a, t.ctx))
                .then(() => panel.setHdr(v, t.scope, t.appid)).then(hdr.set, () => { notify("No se pudo cambiar HDR"); hdr.refresh(); });
            }}>HDR</Chip>
          )}
        </Row>
        {night.on && night.supported && (
          <XSlider label="Calidez" icon={ICONS2.moon} value={night.warmth} min={0} max={100} step={5} suffix="%" onChange={night.setWarmth} />
        )}
      </Card>
      <SoundCard notify={notify} onPanel={onPanel} />
    </>
  );
};

/**
 * Reescalador de Panel para este juego (FSR / XeSS por OptiScaler, Panel 0.88+). El «Escalado» de arriba es el de
 * Steam (estira la imagen al final); este cambia a qué resolución RENDERIZA el juego, que es lo que da FPS.
 * SOLO INFORMA: el reescalador se configura en Panel ANTES de iniciar el juego (con el juego abierto Panel rechaza
 * los cambios, probado en 0.40). Aquí se ve qué tiene este juego y cómo está funcionando ahora.
 * Si esta versión de Panel no trae reescaladores, la tarjeta no aparece.
 */
const UpscalerCard: FC<{ appid: string; onPanel: () => void }> = ({ appid, onPanel }) => {
  const g = usePanel<UpscalerGame>(`upscaler:${appid}`, () => panel.upscalerGame(appid));
  const inst = g.data?.install ?? null;
  const live = usePanel<UpscalerLive>(`upscaler-live:${appid}`, () => (inst ? panel.upscalerLive(appid) : Promise.resolve({})), inst ? 5000 : 0);
  if (g.missing || !g.data) return null;
  const d = g.data;
  if (!inst) {
    return (
      <Card title="Reescalador del juego" right={<span style={small}>Panel</span>} help="reescalador">
        <div style={small}>{d.solution?.blocked_reason ? "Este juego no admite reescalador de Panel." : "Este juego no tiene reescalador. Se instala en Panel de Control antes de iniciar el juego."}</div>
      </Card>
    );
  }
  const opt = inst.options ?? {};
  const res = live.data?.resolution;
  const rows = upscalerFacts(d, live.data ?? null);
  return (
    <Card help="reescalador" title={`Reescalador · ${buildLabel(inst.build)}`} right={<span style={small}>{UP_STATUS[inst.status ?? ""] ?? inst.status ?? ""}</span>}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {rows.map(([k, v2, on]) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 10px", borderRadius: 14, background: COLORS.track }}>
            <span style={{ color: COLORS.muted }}>{k}</span><b style={{ color: on ? COLORS.text : COLORS.muted }}>{v2}</b>
          </span>
        ))}
      </div>
      {res?.render?.length === 2 && res.output?.length === 2 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
          <Icon d={ICONS2.sliders} size={15} color={COLORS.accent} />
          {res.render[0]}×{res.render[1]} → {res.output[0]}×{res.output[1]}
          {live.data?.provider_name && <span style={{ ...small, fontWeight: 600 }}>· {live.data.provider_name}{live.data.provider_version ? ` ${live.data.provider_version}` : ""}</span>}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ ...small, flex: 1, fontSize: 11 }}>Se cambia en Panel de Control con el juego cerrado{opt.quality === null || d.solution?.quality?.owner === "game" ? "; la calidad, en los ajustes del juego" : ""}.</div>
        <Chip compact grow={false} onClick={onPanel}>Abrir Panel ›</Chip>
      </div>
    </Card>
  );
};

/** Rendimiento avanzado: tearing, media resolución, sin límite y el overlay de rendimiento (solo lo que exista). */
export const SteamExtras: FC<{ notify: (t: string) => void; onNative: () => void }> = ({ notify, onNative }) => {
  const [, bump] = useState(0);
  const open = true;
  const ex = readExtras(perfStore());
  const OV = ["No", "FPS", "Básico", "Medio", "Todo"];
  // Todo lo de rendimiento de Steam en una tarjeta: lo que se pudo portar y el enlace al resto (reloj GPU, etc.).
  return (
    <>
      {open && ex.toggles.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {ex.toggles.map((t) => (
            <Chip key={t.id} grow={false} active={t.on} onClick={() => {
              crumb(`rendimiento: ${t.label} ${!t.on ? "sí" : "no"}`);
              void setExtra(t.setter, !t.on, () => ((t.global ? perfStore()?.msgSettingsGlobal : perfStore()?.msgSettingsPerApp) as Record<string, unknown> | undefined)?.[t.key]).then((ok) => {
                if (!ok) notify(`Steam no aceptó «${t.label}»`);
                bump((x) => x + 1);
              });
            }}>{t.label}</Chip>
          ))}
        </div>
      )}
      {open && ex.overlay && (
        <>
          <div style={{ ...small, fontSize: 11 }}>Overlay de rendimiento</div>
          <Options compact opts={OV.map((label, value) => ({ value, label }))} value={ex.overlay.value} onPick={(v: number) => {
            crumb(`rendimiento: overlay ${v}`);
            void setExtra(ex.overlay!.setter, v, () => (perfStore()?.msgSettingsGlobal as Record<string, unknown> | undefined)?.perf_overlay_level).then((ok) => {
              if (!ok) notify("Steam no aceptó el nivel del overlay");
              bump((x) => x + 1);
            });
          }} />
        </>
      )}
      {open && <Chip compact grow={false} onClick={onNative}>Más opciones de Steam (reloj GPU…) ›</Chip>}
    </>
  );
};

const SteamPerfCard: FC<{ view: PerfView | null; write: ReturnType<typeof usePerf>["write"]; onNative: () => void; right?: ReactNode; notify?: (t: string) => void }> = ({ view, write, onNative, right, notify }) => {
  if (!view || (!view.fps && !view.refresh && !view.vrr)) {
    return <Shortcut label="Rendimiento de Steam" hint={view ? "FPS y refresco" : "abrir el nativo"} onOpen={onNative} />;
  }
  const hz = view.refresh?.options ?? [];
  return (
    <Card title="Límite de FPS" right={right} help="fluidez">
      {view.fps && <Options perRow={8} opts={[...view.fps.options].sort((a, b) => (a.value || 1e9) - (b.value || 1e9)).map((o) => ({ value: o.value, label: o.value ? String(o.value) : "∞" }))} value={view.fps.value} onPick={(v: number) => write.fps(v)} />}
      {/* VRR y refresco: una fila pequeña (antes un botón «VRR activado» grande y un deslizador con tarjeta propia). */}
      {view.vrr && <Chip compact grow={false} icon={ICONS2.refresh} active={view.vrr.on} onClick={() => toggleVrr(view, write, notify)}>{view.vrr.on ? "VRR activado" : "VRR apagado"}</Chip>}
      {view.refresh && hz.length > 1 && hz.length <= 5 && (
        <Options opts={hz.map((h) => ({ value: h, label: `${h} Hz` }))} value={view.refresh.value} onPick={(v: number) => write.refresh(v)} />
      )}
      {view.refresh && hz.length > 5 && (
        <XSlider label="Refresco" icon={ICONS2.refresh} value={view.refresh.value} min={hz[0]} max={hz[hz.length - 1]} step={1} suffix=" Hz" onChange={(v) => write.refresh(v)} />
      )}
    </Card>
  );
};

// ---------------- Sonido (ecualizador de Panel de Control, version simple) ----------------
/** Lo esencial del ecualizador de Panel: encendido, preset y nivelar volumen, por juego. El detalle (bandas) se abre en Panel. */
export const SoundCard: FC<{ notify: (t: string) => void; onPanel: () => void }> = ({ notify, onPanel }) => {
  const a = usePanel<AudioState>("audio", panel.audio);
  const d = a.data;
  // Sin el ecualizador de Panel: la tarjeta solo con lo del sistema (micrófono, salida) y el atajo.
  if (a.missing || !d || !d.supported) {
    return (
      <Card title="Sonido">
        <AudioControls notify={notify} />
        {a.missing && <Chip grow={false} onClick={onPanel}>Ecualizador (Panel de Control) ›</Chip>}
      </Card>
    );
  }
  const t = colorTarget(d);
  const route = d.route === "headphone" ? "Auriculares" : "Altavoz";
  const write = (fn: () => Promise<AudioState>, ok: string) =>
    ensureOwn(d.follows_global, t.appid, (x) => panel.audioFollow(false, x)).then(fn).then((st) => { a.set(st); notify(ok); }, () => { notify("No se pudo cambiar el sonido"); a.refresh(); });
  const presets = (d.presets ?? []).map((p) => p.id).filter((id) => id !== "custom");
  return (
    <Card title="Sonido" right={<span style={small}>{route}{d.appid ? " · este juego" : ""}</span>} help="sonido">
      {/* Orden: por dónde suena, volumen de apps, ecualizador y, al final, el micrófono (AudioControls lo pone en su sitio). */}
      <AudioControls notify={notify} middle={(
        <>
          <div style={{ height: 1, background: COLORS.track, margin: "2px 0" }} />
          <ToggleRow icon={ICONS2.sliders} label="Ecualizador" on={!!d.enabled} note={d.enabled ? `Perfil: ${d.preset === "custom" ? "personalizado" : audioLabel(d.preset ?? "", d.device_name)}` : "Sonido sin retocar"}
            onToggle={() => { const v = !d.enabled; a.set({ ...d, enabled: v }); panel.setAudioEnabled(v).then(a.set, () => a.refresh()); }} />
          {d.enabled && presets.length > 0 && (
            <Options perRow={3} opts={presets.slice(0, 6).map((id) => ({ value: id, label: audioLabel(id, d.device_name) }))} value={d.preset ?? null}
              onPick={(id: string) => write(() => panel.applyAudio(id, t.scope, t.appid, d.route ?? null), `Sonido: ${audioLabel(id, d.device_name)}`)} />
          )}
          {d.enabled && d.preset === "custom" && <div style={small}>Curva personalizada (se edita en Panel de Control).</div>}
          {d.enabled && (
            <ToggleRow icon={ICONS.volume} label="Nivelar volumen" on={!!d.loudness} note="Iguala lo que suena muy bajo y muy alto"
              onToggle={() => write(() => panel.setAudioLoudness(!d.loudness, t.scope, t.appid, d.route ?? null), d.loudness ? "Nivelar volumen: no" : "Nivelar volumen: sí")} />
          )}
        </>
      )} />
    </Card>
  );
};

// ---------------- Perfil de este juego (resumen) ----------------
/** Cada juego guarda lo suyo: potencia, pantalla, color y sonido. Resumen de lo que ya tiene perfil propio. */
export const GameProfileCard: FC<{ gameKey: string; notify: (t: string) => void }> = ({ gameKey }) => {
  const tdp = usePanel("tdp", rpc.state);
  const color = usePanel<ColorState>("color", panel.color);
  const audio = usePanel<AudioState>("audio", panel.audio);
  const disp = usePerf(gameKey);
  const appid = (tdp.data as { appid?: string | null } | null)?.appid ?? null;
  const parts: Array<[string, boolean]> = [
    ["Potencia", !!tdp.data && (tdp.data as { follows_global?: boolean }).follows_global === false],
    ["Pantalla", disp.own], ["Color", color.data?.follows_global === false], ["Sonido", audio.data?.follows_global === false],
  ];
  if (!appid) return null;
  const own = parts.filter(([, on]) => on).map(([n]) => n.toLowerCase());
  return (
    <div style={{ ...small, fontSize: 11, padding: "0 6px" }}>
      Guardado en este juego: {own.length ? own.join(", ") : "nada todavía"}. Lo que cambies con el juego abierto se guarda solo para él.
    </div>
  );
};

// ---------------- Energia: Auto-TDP, Eco, bateria y ventiladores ----------------
export const EnergyExtras: FC<{ notify: (t: string) => void; part: "battery" | "fans" }> = ({ notify, part }) => {
  const st = usePanel("tdp", rpc.state);
  const bat = usePanel<BatteryState>("battery", panel.battery, 20000);
  const fanCurve = usePanel<FanCurve>("fanCurve", panel.fanCurve);
  const fans = usePanel<FanState>("fans", panel.fans, 3000);
  const line = batteryLine(bat.data);
  const lim = bat.data?.charge_limit;
  const fanLine = fans.data?.supported
    ? [
      ...(fans.data.fans ?? []).filter((f) => typeof f.rpm === "number").map((f) => `${f.rpm} rpm`),
      ...(fans.data.temps ?? []).slice(0, 2).map((t) => `${t.label ?? ""} ${Math.round(t.celsius ?? 0)} °C`.trim()),
    ].join(" · ")
    : null;
  // Mientras llegan los datos de Panel se reserva el alto de la ultima vez (antes «Modo Eco» y «Más» saltaban).
  const loading = st.data === null || bat.data === null || fanCurve.data === null;
  return (
    <Keep id={`energy-${part}`} loading={loading}>
      {part === "battery" && line && (
        <Card help="bateria" title="Batería" right={<span style={{ fontSize: 13, fontWeight: 700 }}>{typeof bat.data?.battery?.percent === "number" ? `${Math.round(bat.data.battery.percent)} %` : ""}</span>}>
          <div style={small}>{line}</div>
          {lim?.supported && (
            <Row gap={6}>
              <Chip active={!!lim.enabled} onClick={() => {
                const v = !lim.enabled;
                panel.setChargeLimit(v, lim.percent ?? 80).then((cl) => bat.set({ ...bat.data, charge_limit: cl }), () => notify("No se pudo cambiar el límite de carga"));
              }}>Limitar carga {lim.enabled && lim.percent ? `al ${lim.percent} %` : ""}</Chip>
            </Row>
          )}
          {lim?.supported && lim.enabled && lim.adjustable && typeof lim.min === "number" && typeof lim.max === "number" && (
            <XSlider label="Cargar hasta" icon={ICONS.bolt} value={lim.percent ?? 80} min={lim.min} max={lim.max} step={5} suffix="%"
              onChange={(v) => { bat.set({ ...bat.data, charge_limit: { ...lim, percent: v } }); void panel.setChargeLimit(true, v).catch(() => bat.refresh()); }} />
          )}
        </Card>
      )}
      {part === "fans" && fanCurve.data?.supported && (
        <Card title="Ventiladores" right={fanLine ? <span style={small}>{fanLine}</span> : undefined}>
          <Options opts={FAN_PRESETS.map((p) => ({ value: p.key, label: p.label }))} value={fanCurve.data.preset ?? "auto"} onPick={(k: string) => {
            const p = k === "auto" ? panel.setFanAuto("global", null) : panel.setFanPreset(k, "global", null);
            fanCurve.set({ ...fanCurve.data, preset: k });
            p.then(fanCurve.set, () => { notify("No se pudo cambiar los ventiladores"); fanCurve.refresh(); });
          }} />
        </Card>
      )}
    </Keep>
  );
};

/**
 * Modo de potencia (dentro de la tarjeta de potencia): Manual · Auto‑TDP · Descargas. Antes eran dos fichas sueltas
 * («Auto‑TDP» y «Modo Eco») que repetían el preset «Eco» de la barra. «Descargas» (Modo Eco de Panel: potencia
 * mínima para bajar cosas con la pantalla apagada) solo tiene sentido fuera de un juego.
 */
export const PowerModes: FC<{ notify: (t: string) => void; brightPct: number; inGame: boolean }> = ({ notify, brightPct, inGame }) => {
  const st = usePanel("tdp", rpc.state);
  const auto = usePanel("draw", panel.autoTdp, 3000);
  const eco = usePanel<EcoState>("eco", panel.eco);
  const raw = st.data as (Record<string, unknown> & { appid?: string | null; follows_global?: boolean }) | null;
  const autoSupported = raw?.supports_auto_tdp === true;
  const autoOn = !!auto.data?.auto_tdp;
  const ecoOn = !!eco.data?.enabled && !inGame;
  const target = colorTarget(raw);
  const setAuto = (v: boolean) => {
    auto.set({ ...auto.data, auto_tdp: v });
    panel.setAutoTdp(v, target.scope, target.appid, target.ctx).then((r) => auto.set({ ...auto.data, auto_tdp: !!r.auto_tdp }), () => { notify("No se pudo cambiar Auto‑TDP"); auto.refresh(); });
  };
  const setEco = (v: boolean) => {
    eco.set({ ...eco.data, enabled: v });
    panel.setEco(v, brightPct).then((x) => { eco.set(x); notify(v ? "Descargas: potencia mínima" : "Descargas desactivado"); }, () => { notify("No se pudo cambiar el modo"); eco.refresh(); });
  };
  const showAuto = autoSupported || raw === null;
  const showEco = !inGame && !eco.missing;
  if (!showAuto && !showEco) return null;
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <Chip compact icon="M4 12h4M16 12h4M10 5v14M14 8v8" active={!autoOn && !ecoOn} onClick={() => { if (autoOn) setAuto(false); if (ecoOn) setEco(false); }}>Manual</Chip>
      {showAuto && (
        <Chip compact icon={ICONS.bolt} active={autoOn} onClick={() => { if (ecoOn) setEco(false); setAuto(!autoOn); }}>
          {autoOn ? `Auto ${auto.data?.auto?.target_fps ?? ""}`.trim() : "Auto‑TDP"}
        </Chip>
      )}
      {showEco && <Chip compact icon={ICONS2.moon} active={ecoOn} onClick={() => { if (autoOn) setAuto(false); setEco(!ecoOn); }}>Descargas</Chip>}
    </div>
  );
};

/**
 * Tipo de juego (Simple · Medio · Exigente). UNA sola elección por juego (la misma que el modo de Inicio): decide el
 * kit de plugins, el preset (FPS, vatios, reescalado) y la clave de las pruebas.
 *  - `compact` (Inicio de juego): el selector. Al tocar, aplica el preset.
 *  - completo (Energía): resumen del preset, «Ahorrar batería» y «Aplicar de nuevo». Sin selector repetido.
 */
export const GameKindCard: FC<{ gameKey: string; name?: string; t: UseTdp; notify: (t: string) => void; compact?: boolean }> = ({ gameKey, name = "", t, notify, compact }) => {
  const { view } = usePerf(gameKey);
  const [, bump] = useState(0);
  useEffect(() => onHomeModesChange(() => bump((n) => n + 1)), []);
  const [mode, setM] = useState<PresetMode>(modeOf(gameKey));
  useEffect(() => { setM(modeOf(gameKey)); }, [gameKey]);
  const kind = kindOf(gameKey, name);
  const [autoPref, setAutoPref] = useState(kindAuto);
  const pst = usePanel("tdp", rpc.state);
  const praw = pst.data as (Record<string, unknown> & { appid?: string | null }) | null;
  const canAuto = praw?.supports_auto_tdp === true;
  const v = t.view;
  if (!v || v.status !== "ok") return null;
  const saving = savingFor(mode, v.onAc);
  const learnedSeed = v.suggestion?.enough ? v.suggestion.seed : null;
  const hzOpts = view?.refresh?.options ?? [];
  const plan = (k: GameKind, sv: boolean, md: PresetMode = mode) => planFor(k, { mode: md, onAc: v.onAc, saveBattery: sv, min: v.min, max: v.max, learnedSeed, maxHz: hzOpts.length ? hzOpts[hzOpts.length - 1] : undefined });
  // Desde 0.48 el preset SOLO toca los vatios, y solo cuando se pide («Aplicar vatios» o el interruptor). Nunca el
  // límite de FPS, el refresco ni el escalado: cambiarlos solos daba parpadeo y bajadas de FPS por sorpresa (Carlos, 14‑11).
  // La meta del Auto‑TDP es TU límite de FPS; sin límite, la del tipo.
  const myFps = view?.fps?.value ? view.fps.value : null;
  const apply = (k: GameKind, sv: boolean, auto: boolean = autoPref, md: PresetMode = mode) => {
    const p = plan(k, sv, md);
    const target = myFps ?? p.fps;
    const useAuto = canAuto && auto && p.floor !== null && p.ceil !== null;
    const tg = colorTarget(praw);
    if (useAuto) {
      panel.setAutoTdpConfig(target, p.watts, tg.scope, tg.appid, tg.ctx, p.floor, p.ceil)
        .then(() => panel.setAutoTdp(true, tg.scope, tg.appid, tg.ctx))
        .then(() => refreshTdpNow(), () => { crumb("vatios del tipo: Auto‑TDP no aceptó la configuración; vatios fijos"); t.setWatts(p.watts); });
    } else {
      if (canAuto) void panel.setAutoTdp(false, tg.scope, tg.appid, tg.ctx).catch(() => null);
      t.setWatts(p.watts);
    }
    const wtxt = useAuto ? `vatios automáticos ${p.floor}–${p.ceil} W para ${target} FPS` : `${p.watts} W`;
    crumb(`vatios del tipo: ${k}/${md} → ${wtxt}`);
    notify(`${KINDS.find((x) => x.id === k)?.label}: ${wtxt}. El límite de FPS no se toca.`);
    void saveSection("preset", { fecha: new Date().toISOString(), tipo: k, modo: md, plan: p, vatiosAuto: useAuto, metaAuto: target, tocaFps: false }).catch(() => null);
  };
  const cur = plan(kind, saving);
  const def = KINDS.find((x) => x.id === kind)!;
  if (compact) {
    return (
      <Card help="tipo" title={kind === "app" ? "Esto es una app" : "Tipo de juego"} right={<span style={small}>{def.hint}</span>}>
        {/* Elegir el tipo solo ADAPTA EL PANEL (qué plugins y ajustes quedan a mano). No cambia FPS ni vatios. */}
        <Segments tall opts={KINDS.map((k) => ({ value: k.id, label: k.label, icon: k.icon }))} value={kind}
          onPick={(k: GameKind) => { setKind(gameKey, k); crumb(`tipo de juego: ${k} (solo adapta el panel)`); notify(`${KINDS.find((x) => x.id === k)?.label}: el panel se adapta. FPS y vatios no cambian.`); }} />
      </Card>
    );
  }
  if (kind === "app") return null;
  return (
    <Card help="preset" title={`Vatios sugeridos · ${def.label}`} right={<Chip compact grow={false} icon={ICONS.bolt} onClick={() => apply(kind, saving)}>Aplicar vatios</Chip>}>
      <div style={{ display: "flex", gap: 6 }}>
        {([
          ["Tu límite", myFps ? `${myFps} FPS` : "sin límite"],
          ["Vatios", canAuto && autoPref && cur.ceil !== null ? `${cur.floor}–${cur.ceil} W` : `${cur.watts} W`],
          ["Ahora", `${Math.round(v.watts)} W`],
        ] as Array<[string, string]>).map(([k, val]) => (
          <div key={k} style={{ flex: 1, minWidth: 0, padding: "6px 8px", borderRadius: 12, background: COLORS.track, textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: COLORS.muted }}>{k}</div>
            <div style={{ fontSize: 14, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{val}</div>
          </div>
        ))}
      </div>
      <Segments opts={MODES.map((m) => ({ value: m.id, label: m.label }))} value={mode} delay={0}
        onPick={(id: PresetMode) => { setMode(gameKey, id); setM(id); }} />
      <div style={{ ...small, fontSize: 11 }}>{MODES.find((m) => m.id === mode)?.note}. Es una sugerencia: no cambia nada hasta que pulses «Aplicar vatios». El límite de FPS lo pones tú, abajo.</div>
      {canAuto && (
        <ToggleRow icon={ICONS.bolt} label="Vatios automáticos" on={autoPref}
          note={autoPref ? `Panel busca los justos para ${myFps ?? cur.fps} FPS` : `Fijos en ${cur.watts} W`}
          onToggle={() => { const n = !autoPref; setKindAuto(n); setAutoPref(n); }} />
      )}
    </Card>
  );
};

/** El selector de tipo, para el Inicio de una app (ahí no hay tarjeta de potencia de juego que lo aloje). */
export const GameKindAuto: FC<{ gameKey: string; name: string; log: (m: string) => void; notify: (t: string) => void }> = ({ gameKey, name, log, notify }) => {
  const t = useTdp(log);
  return <GameKindCard gameKey={gameKey} name={name} t={t} notify={notify} compact />;
};

/**
 * Potencia del menú: dónde empieza el modo ahorro y desde dónde va fluido (powerTiers), aprendido de tu uso por
 * situación (menuStats). En ahorro el panel se aligera y los temas con modo eficiencia lo activan. El impulso sube a
 * «fluido» mientras el panel está abierto.
 */
export const PanelSaver: FC = () => {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(boostEnabled());
  const [, bump] = useState(0);
  useEffect(() => onTiersChange(() => bump((x) => x + 1)), []);
  const act = boostActive();
  const t = tiers();
  const w = currentWatts().applied ?? currentWatts().set;
  const now = tierOf(w, t);
  const choice = tierChoice();
  const NOW: Record<string, { label: string; color: string; icon: string }> = {
    ahorro: { label: "Modo ahorro", color: COLORS.warn, icon: "M12 3c4 4 6 7 6 10a6 6 0 0 1-12 0c0-3 2-6 6-10z" },
    normal: { label: "Normal", color: COLORS.muted, icon: "M5 12h14" },
    fluido: { label: "Fluido", color: COLORS.ok, icon: "M13 3L4 14h7l-1 7 9-11h-7z" },
  };
  const cur = now ? NOW[now] : null;
  const lg = learned("escritorio"), lj = learned("juego");
  const set = (x: number) => setTierChoice(Math.max(MIN_ECO_W, Math.min(MAX_ECO_W, x)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${COLORS.track}`, paddingTop: 6 }}>
      <SmallRow onOpen={() => setOpen(!open)} open={open}
        label="Fluidez del panel" value={cur ? cur.label : "—"} color={cur?.color} icon={cur?.icon} />
      {open && (<>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ flex: 1, fontSize: 13 }}>Ahorro hasta</div>
        <Chip grow={false} onClick={() => set(t.ecoW - 1)}>−</Chip>
        <div style={{ minWidth: 44, textAlign: "center", fontSize: 15, fontWeight: 800 }}>{t.ecoW} W</div>
        <Chip grow={false} onClick={() => set(t.ecoW + 1)}>+</Chip>
        <Chip grow={false} active={choice === "auto"} onClick={() => setTierChoice("auto")}>Sugerido</Chip>
      </div>
      <div style={{ ...small, fontSize: 11 }}>
        {t.auto ? (t.why[0] === "aprendido" ? `Aprendido de tu uso · ${t.why[1]}.` : `De fábrica: fluido desde 9 W${t.why.length > 1 ? ` (${t.why.slice(1).join(", ")})` : ""}.`) : `Elegido a mano (sugerido: ≤ ${t.suggested.ecoW} W).`}
        {" "}En la barra de potencia: ámbar = ahorro, verde = fluido. En ahorro el panel va sin animaciones ni desenfoque, lee menos en segundo plano y activa el modo eficiencia de tu tema.
      </div>
      <ToggleRow icon="M13 3L4 14h7l-1 7 9-11h-7z" label="Impulso al abrir" on={on}
        note={act ? `Ahora a ${act.to} W · al cerrar vuelve a ${act.from} W` : `En ahorro, mientras el panel está abierto sube a ${t.fluidW} W y al cerrarlo vuelve a la tuya`}
        onToggle={() => { setBoostEnabled(!on); setOn(!on); }} />
      <div style={{ ...small, fontSize: 11 }}>
        Lo aprendido · sin juego: {lg ? `fluido desde ${lg.fluidW} W (${lg.samples})` : "aún midiendo"} · con juego: {lj ? `fluido desde ${lj.fluidW} W (${lj.samples})` : "aún midiendo"}
      </div>
      </>)}
    </div>
  );
};

/** Grupo plegado: una fila (título · resumen · flecha) que al abrirse muestra lo de dentro. Lo poco usado va aquí. */
export const Fold: FC<{ label: string; hint: string; icon?: string; help?: string; children: ReactNode }> = ({ label, hint, icon, help, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div style={{ ...cardStyle, padding: "4px 12px" }} {...(help ? { "data-qr-help": help } : {})}>
        <SmallRow open={open} onOpen={() => setOpen(!open)} label={label} value={open ? "" : hint} icon={icon} />
      </div>
      {open && children}
    </>
  );
};

/** Fila de una línea que se despliega (etiqueta · estado · flecha). */
const SmallRow: FC<{ label: string; value: string; color?: string; icon?: string; open: boolean; onOpen: () => void }> = ({ label, value, color, icon, open, onOpen }) => {
  const tap = useTap(onOpen);
  const [f, setF] = useState(false);
  return (
    <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 32, borderRadius: 10, padding: "0 4px", ...focusRing(f) }}>
      {icon && <Icon d={icon} size={15} color={color ?? COLORS.muted} />}
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: color ?? COLORS.muted }}>{value}</span>
      <Icon d={open ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} size={16} color={COLORS.muted} />
    </Focusable>
  );
};

// ---------------- Apps reales y plugins ----------------
function launchApp(a: AppEntry, notify: (t: string) => void, after: () => void) {
  try {
    const run = (window as unknown as { SteamClient?: { Apps?: { RunGame?: (g: string, o: string, l: number, s: number) => void } } }).SteamClient?.Apps?.RunGame;
    if (!run) { notify("Steam no permite lanzar desde aquí"); return; }
    // Primero se cierra el panel y DESPUES se lanza: lanzar con el panel abierto (Steam navega al juego mientras el
    // modal se cierra) coincidia con cuelgues y reinicios de Steam.
    crumb(`lanzar app de Steam: ${a.name}`);
    after();
    window.setTimeout(() => { try { run(a.gameid, "", -1, 100); } catch { /* ya no se puede */ } }, 400);
  } catch { notify(`No se pudo abrir ${a.name}`); }
}

export function useApps(pinned: number[]) {
  const [apps] = useState(() => curate(readApps(window as never), pinned));
  return apps;
}

const LONG_PRESS_MS = 650;
const AppIcon: FC<{ name: string; capsule?: string | null; icon?: ReactNode; bg?: string; onTap: () => void; onMenu?: () => void; size?: number; running?: boolean }> = ({ name, capsule, icon, bg, onTap, onMenu, size = 54, running }) => {
  const long = useRef(false);
  const timer = useRef<number | null>(null);
  const tap = useTap(() => { if (long.current) { long.current = false; return; } onTap(); });
  const [f, setF] = useState(false);
  const stop = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  const start = () => { if (!onMenu) return; long.current = false; stop(); timer.current = window.setTimeout(() => { long.current = true; timer.current = null; onMenu(); }, LONG_PRESS_MS); };
  const menuProps = onMenu ? { onSecondaryButton: onMenu, onSecondaryActionDescription: "Opciones", onPointerDown: start, onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop } : {};
  return (
    <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)} {...(menuProps as object)}
      style={{ width: 84, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: 4, borderRadius: 18, boxSizing: "border-box", background: f ? COLORS.track : "transparent", ...focusRing(f) }}>
      <div style={{ width: size, height: size, borderRadius: 18, overflow: "hidden", background: bg ?? (capsule ? "rgba(255,255,255,0.1)" : colorFor(name)), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 22, fontWeight: 700,
        boxShadow: "0 2px 6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.18)", backgroundImage: capsule ? undefined : "linear-gradient(160deg, rgba(255,255,255,0.18), rgba(0,0,0,0.12))" }}>
        {capsule ? <img src={capsule} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : icon ?? name.slice(0, 1).toUpperCase()}
      </div>
      <div style={{ fontSize: 12, color: COLORS.text, textAlign: "center", lineHeight: 1.15, maxHeight: 28, overflow: "hidden", width: "100%" }}>{running ? "● " : ""}{name}</div>
    </Focusable>
  );
};

/** Rejilla de iconos. La cruceta la resuelve la seccion (modelo de filas con memoria, ver nav.listTarget). */
const GridNav: FC<{ children: ReactNode; row?: boolean }> = ({ children, row }) => (
  <Focusable style={{ display: "flex", flexWrap: row ? "nowrap" : "wrap", justifyContent: "flex-start", gap: 2 }}>
    {children}
  </Focusable>
);

/** Fila de Inicio: apps ancladas (MiniTube, Recomp Hub…) + «Más apps». */
/** Apps de QAM (carpeta ~/homebrew/qam-apps): se lanzan directamente con su lanzador, sin pasar por Steam. */
function useDrawerApps(): { apps: QamApp[]; icons: Record<string, string> } {
  const [d, setD] = useState<{ apps: QamApp[]; icons: Record<string, string> }>(() => drawerCached() ?? { apps: [], icons: {} });
  useEffect(() => { let on = true; void loadDrawerApps().then((x) => { if (on) setD(x); }); return () => { on = false; }; }, []);
  return d;
}
/**
 * Abrir una app de QAM. Con atajo en Steam se lanza por Steam (gamescope le da el foco y la trata como juego);
 * sin atajo, con su lanzador directamente. Siempre con el panel ya cerrado.
 */
function openQamApp(a: QamApp, notify: (t: string) => void, after: () => void): void {
  const sc = shortcutOf(a);
  const entry = sc ? readApps(window as never).find((x) => x.appid === sc) : undefined;
  crumb(`abrir app de QAM: ${a.name}${entry ? " (por Steam)" : " (lanzador)"}`);
  after();
  window.setTimeout(() => {
    if (entry) { try { (window as unknown as { SteamClient?: { Apps?: { RunGame?: (g: string, o: string, l: number, s: number) => void } } }).SteamClient?.Apps?.RunGame?.(entry.gameid, "", -1, 100); return; } catch { /* por lanzador */ } }
    void appsRun(a.id, "").then((r) => { if (!r?.ok) notify(`No se pudo abrir ${a.name}`); });
  }, 400);
}

const QamAppIcon: FC<{ a: QamApp; icon?: string; notify: (t: string) => void; after: () => void; onMenu?: (m: MenuTarget) => void; running?: boolean }> = ({ a, icon, notify, after, onMenu, running }) => {
  const ctl = Object.keys(a.controls ?? {});
  const native = Object.values(a.controls ?? {}).includes("@");
  return <AppIcon name={a.name} capsule={icon ?? null} running={native ? !!running : undefined} onTap={() => openQamApp(a, notify, after)}
    onMenu={ctl.length && onMenu ? () => onMenu({ key: `q:${a.id}`, name: a.name, qam: { id: a.id, controls: ctl, running: native ? !!running : undefined } }) : undefined} />;
};
type MenuTarget = { key: string; name: string; qam?: { id: string; controls: string[]; running?: boolean } };
/** Apps de escritorio agregadas a QAM desde Apps › Steam: se abren directamente, sin pasar por Steam. */
function useDesktopPins(): Pin[] {
  const [p, setP] = useState<Pin[]>(() => pinsCached());
  useEffect(() => { let on = true; void loadPins().then((x) => { if (on) setP(x); }); return () => { on = false; }; }, []);
  return p;
}
function openDesktop(p: Pin, notify: (t: string) => void, after: () => void): void {
  after();
  window.setTimeout(() => { void openDesktopApp(p.key, p.name).then((r) => { if (!r.ok) notify(`No se pudo abrir ${p.name}: ${r.error ?? "?"}`); }); }, 400);
}
const DeskIcon: FC<{ p: Pin; notify: (t: string) => void; after: () => void; onMenu: (m: MenuTarget) => void; running: boolean }> = ({ p, notify, after, onMenu, running }) => (
  <AppIcon name={p.name} capsule={p.icon} running={running} onTap={() => openDesktop(p, notify, after)} onMenu={() => onMenu({ key: p.key, name: p.name })} />
);
/** Apps de escritorio abiertas (se relee al montar y cada 6 s con el panel abierto) + menú de opciones de la que se mantiene pulsada. */
function useDeskMenu() {
  const [running, setRunning] = useState<string[]>(() => runningCached());
  const [extra, setExtra] = useState<Pin[]>(() => runningAppsCached());
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  useEffect(() => {
    let on = true;
    const read = () => void Promise.all([loadRunning(true), appsRunning().then((r) => r.ids.map((i) => `q:${i}`)).catch(() => [] as string[])])
      .then(([k, q]) => { if (on) { setRunning([...k, ...q]); setExtra(runningAppsCached()); } });
    read();
    const stop = tickEvery(read, 6000, { name: "desktop-running-drawer" });
    return () => { on = false; stop(); };
  }, []);
  return { running, extra, menu, setMenu };
}
/** Apps de escritorio abiertas que no están agregadas a QAM: aparecen mientras estén abiertas para poder gestionarlas. */
const tmp = (extra: Pin[], pins: Pin[]): Pin[] => extra.filter((e) => !pins.some((p) => p.key === e.key));
/** Las de Steam que ya son apps de QAM (mismo nombre) no se repiten. */
const notQam = (apps: AppEntry[], qam: QamApp[]) => apps.filter((x) => !qam.some((q) => q.name.trim().toLowerCase() === x.name.trim().toLowerCase()));

/** Fila de Inicio: apps de QAM + apps ancladas de Steam (MiniTube, Recomp Hub…) + «Más apps». */
export const AppRow: FC<{ apps: AppEntry[]; notify: (t: string) => void; onAll: () => void; after: () => void; limit?: number }> = ({ apps, notify, onAll, after, limit = 3 }) => {
  const q = useDrawerApps();
  const dp = useDesktopPins();
  const dm = useDeskMenu();
  const steam = notQam(apps, q.apps);
  const own = q.apps.slice(0, limit);
  return (
    <>
    {dm.menu && <DeskMenu app={dm.menu} notify={notify} after={after} onClose={() => dm.setMenu(null)} />}
    <GridNav row>
      {own.map((a) => <QamAppIcon key={`q:${a.id}`} a={a} icon={q.icons[a.id]} notify={notify} after={after} onMenu={dm.setMenu} running={dm.running.includes(`q:${a.id}`)} />)}
      {[...dp, ...tmp(dm.extra, dp)].slice(0, Math.max(0, limit - own.length)).map((p) => <DeskIcon key={`d:${p.key}`} p={p} notify={notify} after={after} onMenu={dm.setMenu} running={dm.running.includes(p.key)} />)}
      {steam.slice(0, Math.max(0, limit - own.length - dp.length - tmp(dm.extra, dp).length)).map((a) => <AppIcon key={a.appid} name={a.name} capsule={a.capsule} onTap={() => launchApp(a, notify, after)} />)}
      <AppIcon name={apps.length || own.length ? "Más apps" : "Apps"} icon={<Icon d={ICONS.grid} size={26} color="#fff" />} bg={COLORS.track} onTap={onAll} />
    </GridNav>
    </>
  );
};

export const AppGrid: FC<{ apps: AppEntry[]; notify: (t: string) => void; after: () => void; onOptions?: (id: string) => void; onStore?: () => void }> = ({ apps, notify, after, onOptions, onStore }) => {
  const q = useDrawerApps();
  const dp = useDesktopPins();
  const dm = useDeskMenu();
  const steam = notQam(apps, q.apps);
  return steam.length || q.apps.length || dp.length || dm.extra.length ? (
    <>
    {dm.menu && <DeskMenu app={dm.menu} notify={notify} after={after} onClose={() => dm.setMenu(null)} onOptions={onOptions} />}
    <GridNav>
      {q.apps.map((a) => <QamAppIcon key={`q:${a.id}`} a={a} icon={q.icons[a.id]} notify={notify} after={after} onMenu={dm.setMenu} running={dm.running.includes(`q:${a.id}`)} />)}
      {[...dp, ...tmp(dm.extra, dp)].map((p) => <DeskIcon key={`d:${p.key}`} p={p} notify={notify} after={after} onMenu={dm.setMenu} running={dm.running.includes(p.key)} />)}
      {steam.map((a) => <AppIcon key={a.appid} name={a.name} capsule={a.capsule} onTap={() => launchApp(a, notify, after)} />)}
      {onStore && <AppIcon name="Tienda" icon={<Icon d={ICONS2.plus} size={26} color="#fff" />} bg={COLORS.track} onTap={onStore} />}
    </GridNav>
    </>
  ) : <div style={{ ...small, padding: 4 }}>Aún no hay apps. Abre la «Tienda» para instalar una o añade un atajo no‑Steam.{onStore && <div style={{ marginTop: 8 }}><GridNav row><AppIcon name="Tienda" icon={<Icon d={ICONS2.plus} size={26} color="#fff" />} bg={COLORS.track} onTap={onStore} /></GridNav></div>}</div>;
};

/** Plugins de Decky como iconos (con el icono del propio plugin). Se abren en la columna. */
export const PluginIcons: FC<{ plugins: HostedPlugin[]; onOpen: (name: string) => void; onAll?: () => void }> = ({ plugins, onOpen, onAll }) => (
  // Rejilla en las cuatro direcciones, con navegacion propia (gridTarget).
  <GridNav>
    {plugins.map((p) => (
      <AppIcon key={p.name} name={p.name} bg={colorFor(p.name)} icon={p.icon ? <span style={{ fontSize: 24, display: "flex" }}>{p.icon}</span> : undefined} onTap={() => onOpen(p.name)} />
    ))}
    {onAll && <AppIcon name="Plugins" icon={<Icon d={ICONS.grid} size={26} color="#fff" />} bg={COLORS.track} onTap={onAll} />}
  </GridNav>
);

// ---------------- Musica (al final de Inicio normal) ----------------
/**
 * Banda sonora de Steam: con algo sonando (o en pausa) es un mini reproductor real (anterior, play/pausa, siguiente,
 * aleatorio, repetir, posicion); si no, un acceso al reproductor de Steam para elegir que escuchar.
 */
/**
 * `dock`: sonando (o en pausa) se queda anclado abajo de Inicio mientras te desplazas (solo en Inicio).
 * `onlyActive`: sin musica no se muestra nada (Inicio con juego).
 */
export const MusicCard: FC<{ onOpen: () => void; onAlbum?: (appid: number) => void; dock?: boolean; onlyActive?: boolean }> = ({ onOpen, onAlbum, dock = false, onlyActive = false }) => {
  const [, t] = useState(0);
  const dockRef = useRef<HTMLDivElement | null>(null);
  // Anclado: el contenedor que se desplaza deja hueco abajo para que lo enfocado no quede tapado por el reproductor.
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return undefined;
    let sc: HTMLElement | null = el.parentElement;
    while (sc && !/(auto|scroll)/.test(sc.style.overflowY)) sc = sc.parentElement;
    if (!sc) return undefined;
    const prev = sc.style.scrollPaddingBottom;
    sc.style.scrollPaddingBottom = `${Math.round(el.getBoundingClientRect().height) + 16}px`;
    return () => { sc!.style.scrollPaddingBottom = prev; };
  });
  // En modo ahorro no se repinta cada segundo por la posicion: solo al cambiar de pista/estado o cada 5 s.
  useEffect(() => {
    let sig = "", at = 0;
    return musicSubscribe(() => {
      const m = musicState();
      const k = m ? `${m.appid}:${m.track}:${m.status}:${m.shuffle}:${m.repeat}` : "";
      const now = Date.now();
      if (k === sig && lowPower() && now - at < 5000) return;
      sig = k; at = now;
      t((x) => x + 1);
    });
  }, []);
  const st = musicState();
  const tap = useTap(onOpen);
  const [f, setF] = useState(false);
  const active = st && (st.status === PLAYING || st.status === PAUSED) && music.available() && !musicStopped(st);
  const album = (id: number) => { crumb(`álbum elegido: ${id}`); (onAlbum ? onAlbum(id) : onOpen()); };
  if (!active) {
    if (onlyActive) return null;
    if (readAlbums().length) return <MusicLibrary onOpen={onOpen} onAlbum={album} />;
    return (
      <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
        style={{ ...cardStyle, flexDirection: "row", alignItems: "center", gap: 12, padding: "8px 12px", ...focusRing(f) }}>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: "#db2777", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon d={ICONS2.music} size={19} color="#fff" />
        </div>
        <div style={{ minWidth: 0, flexGrow: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Banda sonora de Steam</div>
          <div style={small}>Elegir qué escuchar</div>
        </div>
        <Icon d="M9 6l6 6-6 6" size={18} color={COLORS.muted} />
      </Focusable>
    );
  }
  const playing = st.status === PLAYING;
  const dur = st.lengthMs / 1000;
  const mmss = (x: number) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
  const al = albumById(st.appid);
  const lost = musicOutputLost() && !playing;
  // El reproductor es UNA fila de botones (facil con la cruceta: izquierda/derecha dentro, arriba/abajo fuera).
  // Los otros álbumes van aparte, en el contenido normal (fila de portadas), no dentro del reproductor anclado.
  const player = (
    <div ref={dock ? dockRef : undefined} {...(dock ? { "data-qr-dock": "1" } : {})} style={{ ...cardStyle, gap: 8, padding: "10px 12px",
      ...(dock ? { position: "sticky", bottom: 0, zIndex: 4, ...dockSurface(lowPower()), boxShadow: `0 -8px 18px rgba(0,0,0,0.45)${cardStyle.boxShadow ? `, ${cardStyle.boxShadow}` : ""}` } : {}) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <AlbumArt srcs={al ? albumArt(al) : []} size={44} />
        <div style={{ minWidth: 0, flexGrow: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{soundtrackName(st.appid)}</div>
          <div style={{ ...small, color: lost ? COLORS.accent : COLORS.muted }}>
            {lost ? "Pausada: cambió la salida de audio · ▶ para seguir" : `Pista ${st.track + 1}${dur ? ` · ${mmss(st.positionS)} / ${mmss(dur)}` : ""}`}
          </div>
        </div>
      </div>
      {dur > 0 && (
        <div style={{ height: 4, borderRadius: 2, background: COLORS.track }}>
          <div style={{ height: 4, borderRadius: 2, background: COLORS.accent, width: `${Math.min(100, (st.positionS / dur) * 100)}%` }} />
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px" }}>
        <PlayerBtn icon={ICONS2.shuffle} on={st.shuffle} label="Aleatorio" onTap={() => music.shuffle(!st.shuffle)} />
        <PlayerBtn icon={ICONS2.prev} label="Anterior" onTap={() => music.prev()} />
        <PlayerBtn icon={playing ? ICONS2.pause : ICONS2.play} big label={playing ? "Pausa" : "Reproducir"} onTap={() => music.toggle()} />
        <PlayerBtn icon={ICONS2.next} label="Siguiente" onTap={() => music.next()} />
        <PlayerBtn icon={st.repeat === 2 ? ICONS2.repeatOne : ICONS2.repeat} on={st.repeat !== 0} label="Repetir" onTap={() => music.repeat(st.repeat === 0 ? 1 : st.repeat === 1 ? 2 : 0)} />
        <PlayerBtn icon={ICONS2.stop} label="Detener" onTap={() => { crumb("música: detener"); music.stop(); }} />
      </div>
    </div>
  );
  if (onlyActive || !readAlbums().some((a) => a.appid !== st.appid)) return dock ? <div style={{ marginTop: "auto", position: "sticky", bottom: 0, zIndex: 4 }}>{player}</div> : player;
  return (
    <>
      <div style={{ marginTop: dock ? "auto" : 0 }}><MusicLibrary onOpen={onOpen} onAlbum={album} exclude={st.appid} title="Cambiar de álbum" /></div>
      {player}
    </>
  );
};

/** Imagen que prueba varias direcciones en orden y se queda con la primera que carga. */
const ChainImg: FC<{ srcs: string[]; fallback: ReactNode; style?: CSSProperties }> = ({ srcs, fallback, style }) => {
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [srcs.join("|")]);
  if (i >= srcs.length) return <>{fallback}</>;
  return <img key={srcs[i]} src={srcs[i]} loading="lazy" onError={() => setI((x) => x + 1)} style={{ width: "100%", height: "100%", objectFit: "cover", ...style }} />;
};

/** Carátula del álbum (o la nota musical si no hay imagen). */
const AlbumArt: FC<{ srcs: string[]; size: number }> = ({ srcs, size }) => (
  <div style={{ width: size, height: size, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: COLORS.track, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <ChainImg srcs={srcs} fallback={<Icon d={ICONS2.music} size={Math.round(size * 0.5)} color={COLORS.muted} />} />
  </div>
);

/** Boton redondo del reproductor: icono dibujado, foco como anillo interior. */
const PlayerBtn: FC<{ icon: string; label: string; onTap: () => void; on?: boolean; big?: boolean }> = ({ icon, label, onTap, on, big }) => {
  const [f, setF] = useState(false);
  const tap = useTap(onTap);
  const size = big ? 44 : 36;
  return (
    <Focusable data-qr="item" noFocusRing aria-label={label} onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      style={{ width: size, height: size, borderRadius: size / 2, display: "flex", alignItems: "center", justifyContent: "center",
        background: big ? COLORS.accent : on ? COLORS.track : "transparent",
        boxShadow: f ? `inset 0 0 0 2px ${big ? COLORS.onAccent : COLORS.focus}` : "none" }}>
      <Icon d={icon} size={big ? 22 : 18} color={big ? COLORS.onAccent : on ? COLORS.accent : COLORS.text} />
    </Focusable>
  );
};

/** Sin musica sonando: tus bandas sonoras para empezar una con un toque. */
const MusicLibrary: FC<{ onOpen: () => void; onAlbum?: (appid: number) => void; exclude?: number; title?: string }> = ({ onOpen, onAlbum, exclude, title = "Bandas sonoras" }) => {
  const albums = readAlbums().filter((a) => a.appid !== exclude);
  if (!albums.length) return null;
  return (
    <div style={{ ...cardStyle, gap: 8, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon d={ICONS2.music} size={16} color={COLORS.accent} />
        <div style={{ flexGrow: 1, fontSize: 13, fontWeight: 700 }}>{title}</div>
        <SmallLink onOpen={onOpen}>Todas ›</SmallLink>
      </div>
      <Focusable style={{ display: "flex", gap: 8 }}>
        {albums.slice(0, 4).map((a) => <AlbumTile key={a.appid} a={a} onTap={() => (onAlbum ? onAlbum(a.appid) : onOpen())} />)}
      </Focusable>
    </div>
  );
};

/** Portada cuadrada (como un álbum): la vertical recortada si existe; si no, la cabecera. */
const AlbumTile: FC<{ a: Album; onTap: () => void }> = ({ a, onTap }) => {
  const [f, setF] = useState(false);
  const tap = useTap(onTap);
  return (
    <Focusable data-qr="item" noFocusRing onActivate={tap} onClick={tap} onGamepadFocus={() => setF(true)} onGamepadBlur={() => setF(false)}
      style={{ flex: "1 1 0", minWidth: 0, maxWidth: "25%", display: "flex", flexDirection: "column", gap: 4, borderRadius: 10, padding: 2, boxShadow: f ? `inset 0 0 0 2px ${COLORS.focus}` : "none" }}>
      <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 8, overflow: "hidden", background: COLORS.track, opacity: a.installed === false ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ChainImg srcs={albumArt(a)} fallback={<Icon d={ICONS2.music} size={18} color={COLORS.muted} />} style={{ objectPosition: "center top" }} />
      </div>
      <div style={{ fontSize: 10, color: COLORS.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "center" }}>{a.name}</div>
    </Focusable>
  );
};
