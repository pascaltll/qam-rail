// Acceso tipado (y tolerante) a SteamClient para brillo, volumen y Bluetooth. [H] sin verificar en todas las versiones.
export interface Unreg { unregister?: () => void }
export interface SC {
  System?: {
    Display?: { SetBrightness?: (v: number) => unknown; RegisterForBrightnessChanges?: (cb: (s: { flBrightness: number }) => void) => Unreg };
    Audio?: {
      GetDevices?: () => Promise<{ vecDevices: Array<{ id: number; bIsDefaultOutputDevice: boolean; flOutputVolume: number; bIsDefaultInputDevice?: boolean; flInputVolume?: number; bHasInput?: boolean }> }>;
      SetDeviceVolume?: (id: number, type: number, v: number) => unknown;
    };
    Bluetooth?: { SetEnabled?: (v: boolean) => unknown; RegisterForStateChanges?: (cb: (s: { bEnabled: boolean }) => void) => Unreg };
  };
}
export const sc = (): SC => ((window as unknown as { SteamClient?: SC }).SteamClient ?? {});
export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
