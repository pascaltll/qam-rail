// Plugins cargados por Decky: se lee su contenido (ReactNode) para alojarlo en nuestra columna. No se copia codigo de nadie.
import type { ReactNode } from "react";

interface Loaded { name?: string; content?: ReactNode; titleView?: ReactNode; icon?: ReactNode }
interface DeckyHost {
  DeckyPluginLoader?: { deckyState?: { publicState?: () => { plugins?: Loaded[] }; setActivePlugin?: (n: string) => void } };
}
const OWN = new Set(["QAM Rail", "QAM Rail Friends"]);

export interface HostedPlugin { name: string; content: ReactNode; titleView?: ReactNode; icon?: ReactNode }

export function hostablePlugins(): HostedPlugin[] {
  try {
    const list = (window as unknown as DeckyHost).DeckyPluginLoader?.deckyState?.publicState?.()?.plugins ?? [];
    return list
      .filter((p): p is Loaded & { name: string } => typeof p?.name === "string" && !OWN.has(p.name) && p.content != null)
      .map((p) => ({ name: p.name, content: p.content as ReactNode, titleView: p.titleView, icon: p.icon }));
  } catch { return []; }
}

export const findPlugin = (name: string): HostedPlugin | null => hostablePlugins().find((p) => p.name === name) ?? null;

// ---- Decky: tienda, ajustes y actualizaciones ----
// [H] rutas de Decky Loader: /decky/store y /decky/settings (con subpaginas /plugins y /general).
export const DECKY_ROUTES = { store: "/decky/store", settings: "/decky/settings", plugins: "/decky/settings/plugins", general: "/decky/settings/general" } as const;

