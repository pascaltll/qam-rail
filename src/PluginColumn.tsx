import { surfaceStyle } from "./appearance";
import { Focusable } from "@decky/ui";
import { Component, useEffect, useRef, type CSSProperties, type FC, type ReactNode } from "react";

import { findPlugin } from "./decky";
import { BTN, takeFocus } from "./nav";
import { COLORS } from "./ui";
import { lowPower } from "./tdpControl";

export const PLUGIN_COL_W = 380;

class Guard extends Component<{ onFail: () => void; children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { err: String(e) }; }
  componentDidCatch() { this.props.onFail(); }
  render() {
    return this.state.err
      ? <div style={{ padding: 14, fontSize: 12, color: COLORS.muted }}>Este contenido no se pudo mostrar aquí.</div>
      : this.props.children;
  }
}

/**
 * Columna lateral (a la izquierda del panel) para contenido grande: un plugin de Decky, el chat con un amigo, un grupo.
 * - Superpuesta: el panel no cambia de tamaño, asi que no se mueve al abrir/cerrar.
 * - Mando: al abrirse se lleva el foco (al primer control, o a `focusFirst` si se indica) y lo mantiene: derecha no sale.
 *   B la cierra y el foco vuelve a quien la abrio (lo hace el llamador en onClose).
 * - Tactil: boton ✕ o tocar el panel atenuado.
 */
export const SideColumn: FC<{
  title: ReactNode; subtitle?: ReactNode; onClose: () => void; onFail?: () => void; focusKey: string;
  focusSelector?: string; children: ReactNode; bodyStyle?: CSSProperties;
}> = ({ title, subtitle, onClose, onFail, focusKey, focusSelector, children, bodyStyle }) => {
  const root = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<{ TakeFocus?: () => void } | null>(null);
  useEffect(() => {
    // El foco del mando se pide al nodo de navegacion de Steam (element.focus() no lo mueve). Se reintenta hasta que
    // el foco de Steam (.gpfocus) este dentro de la columna: el contenido puede tardar en montar.
    const ids: number[] = [];
    const tryFocus = (left: number) => {
      const col = root.current;
      if (!col || col.querySelector(".gpfocus") || col.classList.contains("gpfocus")) return;
      const sel = focusSelector ?? ".Focusable, [tabindex], button, input, [role=button]";
      const first = [...col.querySelectorAll<HTMLElement>(sel)].find((e) => e !== col && e.getClientRects().length > 0 && !e.closest("[data-qr-close]"));
      if (!takeFocus(first ?? null)) { try { navRef.current?.TakeFocus?.(); } catch { /* sigue */ } }
      if (left > 0) ids.push(window.setTimeout(() => tryFocus(left - 1), 160));
    };
    ids.push(window.setTimeout(() => tryFocus(6), 40));
    return () => ids.forEach((x) => window.clearTimeout(x));
  }, [focusKey, focusSelector]);
  return (
    <Focusable
      ref={root}
      // [H] props de Steam no tipadas: navRef da el nodo; autoFocus lo enfoca al montar.
      {...({ navRef, autoFocus: true } as Record<string, unknown>)}
      onCancel={(e: CustomEvent) => { e.stopPropagation(); onClose(); }}
      onGamepadDirection={(e: { detail?: { button?: number }; stopPropagation?: () => void }) => { if (e.detail?.button === BTN.RIGHT) e.stopPropagation?.(); }}
      style={{
        position: "absolute", top: 0, right: "100%", marginRight: 10, width: PLUGIN_COL_W, height: 404, boxSizing: "border-box",
        borderRadius: 28, ...surfaceStyle(lowPower()), overflow: "hidden", boxShadow: lowPower() ? "none" : "0 6px 24px rgba(0,0,0,0.45)", display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px 6px", flexShrink: 0 }}>
        <div style={{ flexGrow: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: COLORS.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>}
        </div>
        <div style={{ fontSize: 11, color: COLORS.muted, whiteSpace: "nowrap" }}>B cierra</div>
        {/* zona de toque de 48 px (regla del skill diseno); el margen negativo deja el círculo de 30 px donde estaba */}
        <div role="button" data-qr-close="1" aria-label="Cerrar columna" onClick={onClose}
          style={{ width: 48, height: 48, margin: -9, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 15, background: COLORS.card, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={COLORS.text} strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </div>
        </div>
      </div>
      <div style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", ...bodyStyle }}>
        <Guard onFail={() => onFail?.()}>{children}</Guard>
      </div>
    </Focusable>
  );
};

/** Plugin de Decky con su contenido original. Si falla al pintarse, se abre en el QAM anterior (onFallback). */
export const PluginColumn: FC<{ name: string; onClose: () => void; onFallback: (name: string) => void }> = ({ name, onClose, onFallback }) => {
  const plugin = findPlugin(name);
  useEffect(() => {
    if (!plugin) { const id = window.setTimeout(() => onFallback(name), 0); return () => window.clearTimeout(id); }
    return undefined;
  }, [name, plugin, onFallback]);
  if (!plugin) return null;
  return (
    <SideColumn title={plugin.titleView ?? plugin.name} onClose={onClose} onFail={() => onFallback(name)} focusKey={`plugin:${name}`}>
      {plugin.content}
    </SideColumn>
  );
};
