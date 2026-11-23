import { setTickerSlow } from "./ticker";
import { lowPower } from "./tdpControl";
import { geomReport } from "./geom";
import { bridgeDiag, rpc } from "./panelBridge";
import { runningGame } from "./game";
import { probeMusic, startMusicWatch } from "./music";
import { startThemeEcoWatch, syncThemeEco } from "./themeEco";
import { featureOn, featuresOff, onFeaturesChange } from "./calm";
import { coloresInstalled } from "./colores";
import { buildView } from "./tdpModel";
import { perfStore, readPerf } from "./steamPerf";
import { hostablePlugins } from "./decky";
import { startDisplayWatcher } from "./displayWatch";
import { probeSocial } from "./socialProbe";
import { record, startPerfLog, summary as perfSummary } from "./perfLog";
import { bootInfo, whenSettled } from "./boot";
import { restoreBoost } from "./menuEfficiency";
import { startGameWatch } from "./gameWatch";
import { crumb, sessionBegin, sessionEnd } from "./crumbs";
import { load as loadDisplayProfiles } from "./displayProfiles";
import { setTierContext } from "./powerTiers";
import { learned } from "./menuStats";
import { currentPalette } from "./appearance";
import { situation } from "./situation";
import { definePlugin, toaster } from "@decky/api";
import { staticClasses } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaThLarge } from "react-icons/fa";

import { AppsPanel } from "./AppsPanel";
import { DEFAULT_SETTINGS, loadSettings, type Settings } from "./backend";
import { ChannelPaused } from "./ChannelPaused";
import { channelInfo, channelOk, isActive, kindName, type ChannelInfo } from "./qamChannel";
import { createRailManager } from "./manager";

export default definePlugin(() => {
  let current: Settings = DEFAULT_SETTINGS;
  const listeners = new Set<(s: Settings) => void>();
  const manager = createRailManager({ getSettings: () => current, setSettings: (s) => publish(s) });

  // Canales (0.53): puede haber dos copias de QAM Rail (estable y dev) y solo una dibuja el QAM. La otra no toca nada ni arranca
  // lo de fondo; su panel solo ofrece activarse. Sin respuesta del backend se comporta como siempre (activa).
  let active = false, loaded = false, chan: ChannelInfo | null = null, confirmTimer = 0;
  const activeP: Promise<boolean> = channelInfo().then((i) => { chan = i; return isActive(i); }, () => true).then((a) => { active = a; return a; });
  const whenActive = (fn: () => void): void => { void activeP.then((a) => { if (a) fn(); }); };
  const applyRail = (): void => { if (active && loaded) manager.apply(current.enabled, current.open_on, current.own_qam); };

  const publish = (s: Settings): void => {
    current = s;
    loaded = true;
    applyRail();
    listeners.forEach((fn) => fn(s));
  };

  void loadSettings().then(publish);
  whenActive(() => {
    applyRail();
    if (chan?.notice) toaster.toast({ title: `QAM Rail (${kindName(chan.me)})`, body: chan.notice });
  });
  // Lo que pide el escritorio para ir fluido (umbrales de ahorro/fluido): tema Cristal y pantalla externa/4K.
  setTickerSlow(() => lowPower());
  setTierContext(() => {
    const sit = situation();
    const game = sit.key.startsWith("juego");
    const l = learned(game ? "juego" : "escritorio");
    return { glass: !!currentPalette().glass, tv: sit.tv, game, learnedFluidW: l?.fluidW ?? null, learnedSamples: l?.samples ?? 0 };
  });
  // Perfil de pantalla por juego: aplica el de cada juego al entrar y el de Steam al salir (con o sin el panel abierto).
  let stopPerf = (): void => {};
  whenActive(() => { stopPerf = startPerfLog(); });
  // Lo de fondo arranca cuando Steam ya cargo y se asento (no al encender ni al pasar desde Escritorio).
  let stopMusic = () => {}, stopThemeEco = () => {}, stopDisplay = () => {}, stopGame = () => {};
  const cancelBoot = whenSettled(() => whenActive(() => {
    confirmTimer = window.setTimeout(() => void channelOk().catch(() => null), 20000); // el arranque aguantó: cuenta como bueno
    const b = bootInfo();
    record("boot", { ms: (b.settledAt ?? Date.now()) - b.loadedAt, d: b.waitedFor.join(",") });
    void sessionBegin(b);
    void restoreBoost(); // si Steam se cayo con el impulso del menu puesto
    stopGame = startGameWatch();
    syncBackground();
    offFeatures = onFeaturesChange(syncBackground);
    const off = featuresOff();
    if (off.length) crumb(`aislado (apagado): ${off.join(", ")}`);
  }));
  // Cada funcion de fondo se puede apagar (Diagnóstico › Aislar fallos) sin reiniciar Steam.
  let offFeatures = () => {};
  const running = { musica: false, temaEco: false, pantalla: false };
  function syncBackground(): void {
    const want = { musica: featureOn("musica"), temaEco: featureOn("temaEco"), pantalla: featureOn("pantalla") };
    if (want.musica !== running.musica) { if (want.musica) stopMusic = startMusicWatch(); else { stopMusic(); stopMusic = () => {}; } running.musica = want.musica; }
    if (want.temaEco !== running.temaEco) {
      if (want.temaEco) stopThemeEco = startThemeEcoWatch(); else { stopThemeEco(); stopThemeEco = () => {}; void syncThemeEco(); }
      running.temaEco = want.temaEco;
    }
    if (want.pantalla !== running.pantalla) {
      if (want.pantalla) stopDisplay = startDisplayWatcher(undefined, 3000, (m) => { console.log(`[qam-rail] ${m}`); crumb(m); });
      else { stopDisplay(); stopDisplay = () => {}; }
      running.pantalla = want.pantalla;
    }
  }
  // Para depurar desde la consola del CEF: window.__qamRail.diag()
  const qamApi = {
    diag: () => manager.diag(),
    // Rendimiento: abre/cierra el QAM varias veces y luego JSON.stringify(__qamRail.runs())
    runs: () => manager.probe()?.runs() ?? [],
    // Resumen de las aperturas medidas; reset() las borra para empezar una serie nueva.
    summary: () => manager.probe()?.summary() ?? null,
    reset: () => manager.probe()?.reset(),
    mounted: () => manager.probe()?.mounted() ?? [],
    structure: () => manager.probe()?.structure() ?? [],
    // Prueba del puente con Panel de Control: await __qamRail.tdp()
    // Estructura de la ventana del panel propio (para ajustarlo al borde derecho): JSON.stringify(__qamRail.modalDom())
    modalDom: () => {
      const out: unknown[] = [];
      let el = (window as unknown as { __qamRailModalEl?: HTMLElement | null }).__qamRailModalEl ?? null;
      for (let i = 0; el && i < 12; i++, el = el.parentElement) {
        const r = el.getBoundingClientRect();
        const cs = (el.ownerDocument.defaultView ?? window).getComputedStyle(el);
        out.push({ tag: el.tagName, cls: String(el.className).slice(0, 80), rect: [r.left, r.top, r.width, r.height].map(Math.round), pos: cs.position, bg: cs.backgroundColor, tr: cs.transform, ov: cs.overflow, disp: cs.display });
      }
      return { iw: window.innerWidth, ih: window.innerHeight, chain: out };
    },
    // Que ve el lanzador: JSON.stringify(__qamRail.apps("tube|recomp"))
    apps: (re = ".") => {
      const w = window as unknown as { collectionStore?: { localGamesCollection?: { allApps?: Array<Record<string, unknown>> } }; appStore?: { allApps?: Array<Record<string, unknown>> } };
      const list = w.collectionStore?.localGamesCollection?.allApps ?? w.appStore?.allApps ?? [];
      const rx = new RegExp(re, "i");
      return { total: list.length, match: list.filter((a) => rx.test(String(a.display_name))).slice(0, 20).map((a) => ({ n: a.display_name, t: a.app_type, id: a.appid, g: a.gameid ?? a.m_gameid })) };
    },
    // Ver si el boton del QAM esta interceptado: JSON.stringify(__qamRail.patch())
    pilotError: () => (window as unknown as { __qamRailPilotError?: string }).__qamRailPilotError ?? null,
    // Informe completo de geometria (tambien se guarda solo al abrir): JSON.stringify(__qamRail.geom())
    geom: () => geomReport((window as unknown as { __qamRailModalEl?: HTMLElement | null }).__qamRailModalEl ?? null),
    // Que expone SteamClient sobre musica y si Colores esta instalado: JSON.stringify(__qamRail.music())
    music: () => ({ ...probeMusic(), coloresInstalled: coloresInstalled() }),
    // Ajustes de Steam que ve el lanzador (refresco, VRR, FPS, escalado): JSON.stringify(__qamRail.perf())
    perf: () => { const st = perfStore(); return { found: !!st, view: readPerf(st), limits: st?.msgLimits ?? null }; },
    // Plugins de Decky que se pueden abrir en la columna: __qamRail.plugins()
    plugins: () => hostablePlugins().map((p) => p.name),
    // Perfiles de pantalla guardados (Steam y por juego): JSON.stringify(__qamRail.profiles())
    profiles: () => loadDisplayProfiles(),
    // Que expone Steam para chat, voz y Remote Play Together: JSON.stringify(__qamRail.social())
    social: () => probeSocial(),
    // Rendimiento registrado por potencia: JSON.stringify(__qamRail.perf2())
    perf2: () => perfSummary(),
    dock: () => ({ dock: (window as unknown as { __qamRailDock?: unknown }).__qamRailDock ?? null }),
    patch: () => (window as unknown as { __qamRailPatch?: { info(): unknown } }).__qamRailPatch?.info() ?? null,
    // Potencia: estado crudo de Panel, vista que usa el lanzador y juego detectado. JSON.stringify(await __qamRail.tdp())
    tdp: async () => {
      try {
        const [raw, saved] = await Promise.all([rpc.state(), rpc.presets().catch(() => null)]);
        const game = runningGame();
        return { game, raw, view: buildView(raw, saved, game), via: bridgeDiag() };
      } catch (e) { return { error: String(e), via: bridgeDiag() }; }
    },
  };

  whenActive(() => { (window as unknown as Record<string, unknown>).__qamRail = qamApi; });

  const Content = () => {
    const [settings, setSettings] = useState<Settings>(current);
    const [paused, setPaused] = useState(false);
    useEffect(() => { void activeP.then((a) => setPaused(!a)); }, []);
    useEffect(() => {
      listeners.add(setSettings);
      return () => {
        listeners.delete(setSettings);
      };
    }, []);
    if (paused) return <ChannelPaused />;
    return <AppsPanel settings={settings} onSettings={publish} />;
  };

  const Title = () => {
    const [t, setT] = useState("Apps");
    useEffect(() => { void activeP.then(() => { if (chan?.me === "dev") setT("Apps · DEV"); }); }, []);
    return <div className={staticClasses.Title}>{t}</div>;
  };

  return {
    name: "QAM Rail",
    titleView: <Title />,
    content: <Content />,
    icon: <FaThLarge />,
    onDismount() {
      cancelBoot();
      window.clearTimeout(confirmTimer);
      if (active) {
        crumb("plugin descargado (cierre limpio)");
        void sessionEnd();
      }
      manager.dispose();
    stopDisplay();
    offFeatures();
    stopPerf();
    stopMusic();
    stopThemeEco();
    stopGame();
      if ((window as unknown as Record<string, unknown>).__qamRail === qamApi) delete (window as unknown as Record<string, unknown>).__qamRail; // no borrar la del otro canal
    },
  };
});
