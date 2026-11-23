import { getGamepadNavigationTrees } from "@decky/ui";

// Idea (verificada en MiniTube): el QAM es otra ventana CEF; se llega a su documento por el arbol
// de navegacion del mando cuyo id empieza por "QuickAccess".
export interface NavTree {
  id?: unknown;
  m_ID?: unknown;
  m_Root?: { m_element?: Element | null };
  Root?: { Element?: Element | null };
  RegisterGlobalButtonHandler?: (button: number, handler: (event?: unknown) => boolean) => unknown;
}

export function findQamTree(): NavTree | null {
  try {
    const trees = getGamepadNavigationTrees() as NavTree[] | undefined;
    return trees?.find((t) => {
      const id = t.id ?? t.m_ID;
      return typeof id === "string" && id.startsWith("QuickAccess");
    }) ?? null;
  } catch {
    return null;
  }
}

export function qamDocumentOf(tree: NavTree | null): Document | null {
  const el = tree?.m_Root?.m_element ?? tree?.Root?.Element;
  return el?.ownerDocument ?? null;
}
