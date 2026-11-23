export const STYLE_ID = "qr-style";
export const CLS_ON = "qr-on";
export const CLS_COLLAPSED = "qr-collapsed";
export const CLS_PANEL = "qr-panel";
export const CLS_STRIP = "qr-strip";
export const VAR_SHIFT = "--qr-shift";
export const CLS_INVERT = "qr-invert";
export const CLS_CROOT = "qr-croot";
export const VAR_STRIP_SHIFT = "--qr-strip-shift";
export const VAR_CONTENT_SHIFT = "--qr-content-shift";

// El contenido NO se quita del DOM ni se pone display:none: asi el panel conserva su ancho y la
// medida (panel - tira) es estable. Se desplaza el panel entero hacia la derecha para que solo
// asome la tira de iconos, y el contenido queda invisible e intocable.
export function buildRailCss(): string {
  return `
html.${CLS_ON} .${CLS_PANEL} {
  transition: transform 190ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}
html.${CLS_ON}.${CLS_COLLAPSED} .${CLS_PANEL} {
  transform: translateX(var(${VAR_SHIFT}, 0px));
}
html.${CLS_ON}.${CLS_COLLAPSED} [id^="quickaccess_content_"] {
  visibility: hidden !important;
  pointer-events: none !important;
}
html.${CLS_ON}.${CLS_COLLAPSED} .${CLS_STRIP} {
  border-radius: 26px 0 0 26px;
  box-shadow: -6px 0 22px rgba(0, 0, 0, 0.35);
}
html.${CLS_ON} .${CLS_STRIP} {
  transition: box-shadow 190ms ease, border-radius 190ms ease;
}
/* Modo invertido (test): se intercambian de sitio la tira de iconos y el contenido, solo visualmente. */
html.${CLS_ON}.${CLS_INVERT} .${CLS_STRIP} {
  transform: translateX(var(${VAR_STRIP_SHIFT}, 0px)) !important;
}
html.${CLS_ON}.${CLS_INVERT} .${CLS_CROOT} {
  transform: translateX(var(${VAR_CONTENT_SHIFT}, 0px)) !important;
}
@media (prefers-reduced-motion: reduce) {
  html.${CLS_ON} .${CLS_PANEL}, html.${CLS_ON} .${CLS_STRIP} { transition: none !important; }
}
`;
}
