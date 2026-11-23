// Conexiones de verdad. Bluetooth con BlueZ (bluetoothctl) desde el backend: la version de Steam de Carlos ya no
// expone SteamClient.System.Bluetooth (prueba «Redes», 0.27.0). Wi‑Fi con NetworkManager (nmcli).
import { pauseMusic } from "./music";
import { callable } from "@decky/api";

import type { Unreg } from "./steam";

export interface BtDevice { nId: number; nAdapterId: number; eType: number; sMAC: string; sName: string; bConnected: boolean; bPaired: boolean; nStrengthRaw: number }
export interface BtAdapter { nId: number; sName: string; bEnabled: boolean; bDiscovering: boolean }
export interface BtState { bEnabled: boolean; vecAdapters: BtAdapter[]; vecDevices: BtDevice[] }

type Resp = { result?: number } | unknown;
interface BtApi {
  RegisterForStateChanges?: (cb: (s: BtState) => void) => Unreg;
  Connect?: (a: number, d: number) => Promise<Resp>; Disconnect?: (a: number, d: number) => Promise<Resp>;
  Pair?: (a: number, d: number) => Promise<Resp>; UnPair?: (a: number, d: number) => Promise<Resp>;
  SetAdapterDiscovering?: (a: number, on: boolean) => Promise<Resp>; SetEnabled?: (on: boolean) => Promise<Resp>;
}
export const btApi = (): BtApi | null => (window as unknown as { SteamClient?: { System?: { Bluetooth?: BtApi } } }).SteamClient?.System?.Bluetooth ?? null;

// Tipos de EBluetoothDeviceType
export const BT_KIND: Record<number, { label: string; icon: string; audio?: boolean }> = {
  2: { label: "Teléfono", icon: "phone" }, 3: { label: "Ordenador", icon: "laptop" }, 4: { label: "Auriculares con micro", icon: "🎧", audio: true },
  5: { label: "Auriculares", icon: "🎧", audio: true }, 6: { label: "Altavoz", icon: "speaker", audio: true }, 7: { label: "Audio", icon: "speaker", audio: true },
  8: { label: "Ratón", icon: "mouse" }, 9: { label: "Joystick", icon: "🕹️" }, 10: { label: "Mando", icon: "gamepad" }, 11: { label: "Teclado", icon: "keyboard" },
};
export const btKind = (t: number) => BT_KIND[t] ?? { label: "Dispositivo", icon: "bluetooth" };

/** Puro (probado): orden de la lista: conectados, emparejados (audio primero), cerca con nombre por señal. */
export function sortBt(devs: BtDevice[]): { connected: BtDevice[]; paired: BtDevice[]; nearby: BtDevice[] } {
  const named = devs.filter((d) => d.sName && d.sName.trim() && d.sName !== d.sMAC);
  const audioFirst = (a: BtDevice, b: BtDevice) => Number(!!btKind(b.eType).audio) - Number(!!btKind(a.eType).audio) || a.sName.localeCompare(b.sName);
  return {
    connected: named.filter((d) => d.bConnected).sort(audioFirst),
    paired: named.filter((d) => d.bPaired && !d.bConnected).sort(audioFirst),
    nearby: named.filter((d) => !d.bPaired && !d.bConnected).sort((a, b) => b.nStrengthRaw - a.nStrengthRaw).slice(0, 8),
  };
}

export interface WifiNet { ssid: string; active: boolean; signal: number; security: string; channel: string; saved: boolean }
export interface WifiState { ok: boolean; radio?: boolean; networks?: WifiNet[]; saved?: string[]; error?: string }
export const wifiState = callable<[rescan: boolean], WifiState>("wifi_state");
export const wifiConnect = callable<[ssid: string], { ok: boolean; detail: string }>("wifi_connect");
export const wifiRadio = callable<[on: boolean], { ok: boolean; detail: string }>("wifi_radio");

/** Puro (probado): nivel de señal 1–4 (para el icono de abanico del Wi‑Fi). */
export const wifiLevel = (signal: number) => (signal >= 75 ? 4 : signal >= 50 ? 3 : signal >= 25 ? 2 : 1);

// ---- Bluetooth por BlueZ (backend) ----
export interface BzDevice { mac: string; name: string; icon: string; connected: boolean; paired: boolean; rssi: number | null }
export interface BzState { ok: boolean; powered?: boolean; discovering?: boolean; devices?: BzDevice[]; error?: string }
export const btState = callable<[], BzState>("bt_state");
export const btAction = callable<[action: string, mac: string], { ok: boolean; detail: string }>("bt_action");

/** Icono de BlueZ («audio-headset», «input-gaming»…) → tipo legible. Puro (probado). */
export function bzKind(icon: string): { label: string; icon: string; audio?: boolean } {
  if (/headset/.test(icon)) return { label: "Auriculares con micro", icon: "headset", audio: true };
  if (/headphone/.test(icon)) return { label: "Auriculares", icon: "headphones", audio: true };
  if (/audio|speaker/.test(icon)) return { label: "Altavoz", icon: "speaker", audio: true };
  if (/gaming|joystick/.test(icon)) return { label: "Mando", icon: "gamepad" };
  if (/keyboard/.test(icon)) return { label: "Teclado", icon: "keyboard" };
  if (/mouse/.test(icon)) return { label: "Ratón", icon: "mouse" };
  if (/phone/.test(icon)) return { label: "Teléfono", icon: "phone" };
  if (/computer/.test(icon)) return { label: "Ordenador", icon: "laptop" };
  return { label: "Dispositivo", icon: "bluetooth" };
}

/** Puro (probado): conectados, emparejados (audio primero) y cerca (con nombre). */
export function sortBz(devs: BzDevice[]): { connected: BzDevice[]; paired: BzDevice[]; nearby: BzDevice[] } {
  const audioFirst = (a: BzDevice, b: BzDevice) => Number(!!bzKind(b.icon).audio) - Number(!!bzKind(a.icon).audio) || a.name.localeCompare(b.name);
  return {
    connected: devs.filter((d) => d.connected).sort(audioFirst),
    paired: devs.filter((d) => d.paired && !d.connected).sort(audioFirst),
    nearby: devs.filter((d) => !d.paired && !d.connected).slice(0, 10),
  };
}

// ---- Estado de Bluetooth compartido (interruptor de Conexiones rápidas y tarjeta de dispositivos) ----
// Antes cada uno leia por su cuenta y la tarjeta solo cada 10 s: tras conectar/desconectar o encender, el estado
// tardaba en cambiar («dice desconectado», «no encendió»). Ahora: el cambio se ve al instante (optimista) y se
// confirma releyendo enseguida (0,6 s, 2 s y 5 s después).
let bz: BzState | null = null;
let bzBusy: Promise<BzState> | null = null;
const bzSubs = new Set<() => void>();
const bzEmit = () => bzSubs.forEach((f) => f());
export const bzSnapshot = () => bz;
export const bzSubscribe = (f: () => void) => { bzSubs.add(f); return () => { bzSubs.delete(f); }; };

export function bzRefresh(): Promise<BzState> {
  if (bzBusy) return bzBusy;
  bzBusy = btState().then((s) => { const prev = bz; bz = s; watchAudio(prev); bzEmit(); return s; }, (e) => { bz = { ok: false, error: String(e) }; bzEmit(); return bz; })
    .finally(() => { bzBusy = null; });
  return bzBusy;
}

/** Puro (probado): estado tras una accion que salio bien (antes de releer). */
export function bzApply(s: BzState | null, action: string, mac: string): BzState | null {
  if (!s || !s.ok) return s;
  if (action === "power-on" || action === "power-off") return { ...s, powered: action === "power-on" };
  const devices = (s.devices ?? []).map((d) => d.mac !== mac ? d
    : action === "connect" ? { ...d, connected: true }
    : action === "disconnect" ? { ...d, connected: false }
    : action === "pair" ? { ...d, paired: true, connected: true }
    : d);
  return { ...s, devices: action === "remove" ? devices.filter((d) => d.mac !== mac) : devices };
}

/** Puro (probado): auriculares/altavoces que estaban conectados y ya no. */
export function audioGone(prev: BzState | null, next: BzState | null): BzDevice[] {
  if (!prev?.ok || !next?.ok) return [];
  const now = new Set((next.powered ? next.devices ?? [] : []).filter((d) => d.connected).map((d) => d.mac));
  return (prev.powered ? prev.devices ?? [] : []).filter((d) => d.connected && bzKind(d.icon).audio && !now.has(d.mac));
}
// Se confirma en dos lecturas seguidas (una lectura de bluetoothctl a medias no debe pausar la musica).
let goneSeen = new Set<string>();
let lastWithAudio: BzState | null = null;
const watchAudio = (prev: BzState | null) => {
  if (prev?.ok && (prev.devices ?? []).some((d) => d.connected && bzKind(d.icon).audio)) lastWithAudio = prev;
  const g = audioGone(lastWithAudio, bz);
  const confirmed = g.filter((d) => goneSeen.has(d.mac));
  goneSeen = new Set(g.map((d) => d.mac));
  if (confirmed.length) { pauseMusic(`se desconectó ${confirmed[0].name}`); lastWithAudio = null; goneSeen.clear(); }
  if (!g.length) goneSeen.clear();
};

let followUps: number[] = [];
export async function bzDo(action: string, mac = ""): Promise<{ ok: boolean; detail: string }> {
  // El encendido se ve al momento; conectar/desconectar muestra «Conectando…» en la fila mientras tanto.
  // Antes de quitar unos auriculares, la música se pausa (si no, Steam se queda «sonando» sin salida).
  const dev = bz?.devices?.find((d) => d.mac === mac);
  if ((action === "disconnect" && dev && bzKind(dev.icon).audio) || action === "power-off") pauseMusic(action === "power-off" ? "Bluetooth apagado" : `desconectar ${dev?.name}`);
  if (action === "power-on" || action === "power-off") { bz = bzApply(bz, action, mac); bzEmit(); }
  let r: { ok: boolean; detail: string };
  try { r = await btAction(action, mac); } catch (e) { r = { ok: false, detail: String(e) }; }
  if (r.ok) { bz = bzApply(bz, action, mac); bzEmit(); }
  followUps.forEach((id) => window.clearTimeout(id));
  followUps = [600, 2000, 5000].map((ms) => window.setTimeout(() => { void bzRefresh(); }, ms));
  if (!r.ok) void bzRefresh();
  return r;
}

// ---- Wi‑Fi: un solo estado para la ficha rápida y la tarjeta, con cambio al instante ----
// Antes el interruptor iba por Steam y la lista por nmcli: al tocar no se veía nada hasta la siguiente lectura
// (hasta 15 s). Ahora todo va por nmcli, el cambio se pinta al momento y se confirma a los 0,7 / 2 / 5 s.
let wf: WifiState | null = null;
let wfBusy: Promise<WifiState> | null = null;
let wfConnecting: string | null = null;
const wfSubs = new Set<() => void>();
const wfEmit = () => wfSubs.forEach((f) => f());
export const wfSnapshot = () => wf;
export const wfConnectingTo = () => wfConnecting;
export const wfSubscribe = (f: () => void) => { wfSubs.add(f); return () => { wfSubs.delete(f); }; };
export function wfRefresh(): Promise<WifiState> {
  if (wfBusy) return wfBusy;
  wfBusy = wifiState(false).then((s) => { wf = s; wfEmit(); return s; }, (e) => { wf = { ok: false, error: String(e) }; wfEmit(); return wf; })
    .finally(() => { wfBusy = null; });
  return wfBusy;
}
/** Puro (probado): cómo queda el estado justo al tocar (antes de que conteste el sistema). */
export function wfApply(s: WifiState | null, action: "on" | "off" | "connect", ssid = ""): WifiState | null {
  if (!s?.ok) return s;
  if (action === "off") return { ...s, radio: false, networks: (s.networks ?? []).map((n) => ({ ...n, active: false })) };
  if (action === "on") return { ...s, radio: true };
  return { ...s, networks: (s.networks ?? []).map((n) => ({ ...n, active: n.ssid === ssid })) };
}
/** Puro (probado): lo que se enseña: la red en uso y las GUARDADAS a la vista (las nuevas, en Ajustes de Steam). */
export function knownNets(s: WifiState | null, max = 4): WifiNet[] {
  return (s?.networks ?? []).filter((n) => n.active || n.saved).slice(0, max);
}
let wfFollow: number[] = [];
const wfConfirm = () => {
  wfFollow.forEach((id) => window.clearTimeout(id));
  wfFollow = [700, 2000, 5000].map((ms) => window.setTimeout(() => { void wfRefresh(); }, ms));
};
export async function wfRadio(on: boolean): Promise<boolean> {
  wf = wfApply(wf, on ? "on" : "off"); wfEmit();
  let ok = false;
  try { ok = !!(await wifiRadio(on)).ok; } catch { ok = false; }
  wfConfirm();
  if (!ok) void wfRefresh();
  return ok;
}
export async function wfConnect(ssid: string): Promise<{ ok: boolean; detail: string }> {
  wfConnecting = ssid; wfEmit();
  let r: { ok: boolean; detail: string };
  try { r = await wifiConnect(ssid); } catch (e) { r = { ok: false, detail: String(e) }; }
  wfConnecting = null;
  if (r.ok) wf = wfApply(wf, "connect", ssid);
  wfEmit(); wfConfirm();
  return r;
}
