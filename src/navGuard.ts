// Mientras el panel propio esta abierto, si algo (un plugin en la columna, un atajo nuestro) navega a otra pagina de
// Steam o abre la web/navegador (p. ej. Decky Clash mostrando proxies, la tienda o los ajustes de Decky), el panel se
// cierra ANTES, para que la pagina quede a la vista. Se envuelven los metodos de navegacion y se restauran al cerrar.
const METHODS = [
  "Navigate", "NavigateToExternalWeb", "NavigateToSteamWeb", "NavigateToWebRoute", "NavigateToChat", "NavigateToInvites",
  "NavigateToAppProperties", "NavigateToLibraryTab", "NavigateToStorePage", "NavigateToLayoutPreview", "OpenMainMenu", "OpenPowerMenu",
];

type Obj = Record<string, unknown>;

export function guardNavigation(targets: Array<Obj | null | undefined>, onLeave: () => void): () => void {
  const undo: Array<() => void> = [];
  const seen = new Set<unknown>();
  for (const t of targets) {
    if (!t || typeof t !== "object" || seen.has(t)) continue;
    seen.add(t);
    for (const m of METHODS) {
      const orig = t[m];
      if (typeof orig !== "function") continue;
      const wrapped = function (this: unknown, ...args: unknown[]) {
        try { onLeave(); } catch { /* cerrar nunca debe impedir navegar */ }
        return (orig as (...a: unknown[]) => unknown).apply(this ?? t, args);
      };
      try {
        t[m] = wrapped;
        undo.push(() => { try { if (t[m] === wrapped) t[m] = orig; } catch { /* objeto sellado */ } });
      } catch { /* objeto sellado: no se envuelve */ }
    }
  }
  return () => undo.forEach((f) => f());
}
