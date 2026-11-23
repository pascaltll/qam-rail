import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { QamApp } from "../../src/Qam";
import { setPerfStoreReader } from "../../src/steamPerf";
import { BTN, listTarget, visualRows } from "../../src/nav";

const st: any = {
  msgLimits: { is_vrr_supported: true, disable_refresh_rate_management: false, is_manual_display_refresh_rate_available: true, display_refresh_manual_hz_min: 40, display_refresh_manual_hz_max: 120, fps_limit_options: [0, 15, 30, 60, 120],
    is_split_scaling_and_filtering_supported: true, split_scaling_scalers_available: [1, 2, 3, 4, 5], split_scaling_filters_available: [1, 2, 3, 4], fsr_sharpness_min: 0, fsr_sharpness_max: 20 },
  msgSettingsPerApp: { is_vrr_enabled: false, display_refresh_manual_hz: 60, fps_limit: 0, split_scaling_scaler: 1, split_scaling_filter: 1, fsr_sharpness: 5 },
};
for (const k of ["SetFPSLimit", "SetVRREnabled", "SetDisplayRefreshRateManualHz", "SetSplitScalingScaler", "SetSplitScalingFilter", "SetFSRSharpness"]) st[k] = () => {};
setPerfStoreReader(() => st);
(window as any).SteamClient = { System: {} };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
(window as any).run = async () => {
  const host = document.getElementById("root")!;
  createRoot(host).render(h(QamApp, { log() {}, onNative() {}, onClose() {} }));
  await sleep(600);
  const out: any = {};
  const labels = [...host.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label") as string).filter((l) => l && l !== "Cerrar columna");
  for (const l of labels) {
    (host.querySelector(`[aria-label="${l}"]`) as HTMLElement).click();
    await sleep(900);
    // cuerpo = contenedor con scroll que contiene items
    const all = [...host.querySelectorAll<HTMLElement>('[data-qr="item"]')].filter((e) => e.getClientRects().length > 0 && !e.hasAttribute("aria-label"));
    const rects = all.map(rect);
    const rows = visualRows(rects);
    const name = (i: number) => (all[i].textContent ?? "").replace(/\s+/g, " ").slice(0, 22) || all[i].getAttribute("data-qr-seg") || "?";
    // recorrido ABAJO desde el primero y ARRIBA desde el ultimo
    const walk = (start: number, dir: number) => { const p = [start]; let c = start; for (let k = 0; k < 60; k++) { const t = listTarget(rects, c, dir); if (t < 0 || t === c) break; p.push(t); c = t; } return p; };
    const down = walk(rows[0][0], BTN.DOWN); const up = walk(rows[rows.length - 1][0], BTN.UP);
    out[l] = { down: down.map(name), up: up.map(name), rows: rows.map((r) => r.map(name).join(" | ")), n: all.length, rects: rects.map((r, i) => `${name(i)} t${Math.round(r.top)} b${Math.round(r.bottom)} l${Math.round(r.left)} r${Math.round(r.right)}`) };
    (out[l] as any)._all = all.length;
  }
  return out;
};
(window as any).probeColor = async (_partial?: boolean) => {
  const host = document.getElementById("root")!;
  (host.querySelector('[aria-label="Imagen y sonido"]') as HTMLElement).click();
  await sleep(900);
  const seg = () => [...host.querySelectorAll<HTMLElement>('[data-qr-seg]')].filter((e) => e.getClientRects().length > 0 && /Nativo/.test(e.textContent ?? ""))[0];
  const before = seg();
  const bs = [...before.querySelectorAll<HTMLElement>("[role=button]")]; const btn = bs[2];
  btn.click();
  await sleep(1200);
  const after = seg();
  const sl = [...host.querySelectorAll<HTMLElement>('[data-qr-h]')].filter((e) => e.getClientRects().length > 0);
  const txt = [...host.querySelectorAll<HTMLElement>('[data-qr=item]')].filter((e) => e.getClientRects().length > 0).map((e) => (e.textContent ?? '').slice(0, 14));
  const card = host.querySelector<HTMLElement>('[data-qr-help="color"]');
  return { card: (card?.innerHTML ?? '').replace(/style="[^"]*"/g,'').slice(0, 700), txt, slCount: sl.length, same: before === after, connected: before.isConnected, text: (after?.textContent ?? "").slice(0, 60) };
};
(window as any).mountOnly = async () => { createRoot(document.getElementById("root")!).render(h(QamApp, { log() {}, onNative() {}, onClose() {} })); await sleep(700); };
