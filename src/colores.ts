// Integracion con el plugin "Colores" (iluminacion RGB, de Hooandee). Igual que Panel de Control, NO se reimplementa:
// se detecta en la lista de plugins de Decky y se abre como plugin activo de la pestaña Decky del QAM.
export const COLORES_PLUGIN_NAME = "Colores";
export const DECKY_TAB = 999;

interface DeckyHost {
  DeckyPluginLoader?: {
    deckyState?: {
      publicState?: () => { installedPlugins?: Array<string | { name?: string }> };
      setActivePlugin?: (name: string) => void;
    };
  };
}

const host = () => window as unknown as DeckyHost;

export function installedPluginNames(): string[] {
  try {
    const list = host().DeckyPluginLoader?.deckyState?.publicState?.()?.installedPlugins ?? [];
    return list.map((p) => (typeof p === "string" ? p : p?.name)).filter((n): n is string => typeof n === "string");
  } catch { return []; }
}

export const coloresInstalled = (): boolean => installedPluginNames().includes(COLORES_PLUGIN_NAME);

/** Deja un plugin cualquiera como activo en la pestaña Decky (respaldo si no se puede alojar en la columna). */
export function activatePlugin(name: string): boolean {
  try {
    const st = host().DeckyPluginLoader?.deckyState;
    if (!st?.setActivePlugin) return false;
    st.setActivePlugin(name);
    return true;
  } catch { return false; }
}
