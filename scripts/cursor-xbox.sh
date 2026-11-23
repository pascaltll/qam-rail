#!/usr/bin/env bash
# Puntero redondo estilo Xbox para Firefox/Edge (Flatpak) y apps X11. Prueba: ./cursor-xbox.sh  · Quitar: --quitar · Ver qué ve cada app: --diag
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ICONS="${XDG_DATA_HOME:-$HOME/.local/share}/icons"
APPS=(org.mozilla.firefox com.microsoft.Edge com.google.Chrome)
TAM="${QAM_CURSOR_TAM:-32}"
have_flatpak() { command -v flatpak >/dev/null 2>&1; }
if [ "${1:-}" = "--quitar" ]; then
  rm -rf "$ICONS/qam-xbox"
  if have_flatpak; then for a in "${APPS[@]}"; do flatpak override --user --reset "$a" >/dev/null 2>&1 || true; done; fi
  echo "Puntero Xbox quitado. Reabre las apps."; exit 0
fi
if [ "${1:-}" = "--diag" ]; then   # qué ve la app Flatpak: variables y carpeta de iconos
  for a in "${APPS[@]}"; do
    flatpak info "$a" >/dev/null 2>&1 || continue
    echo "== $a"
    flatpak run --command=sh "$a" -c 'echo "XCURSOR_THEME=$XCURSOR_THEME XCURSOR_PATH=$XCURSOR_PATH"; for d in /run/host/user-share/icons "$HOME/.local/share/icons" /home/*/.local/share/icons; do [ -d "$d/qam-xbox" ] && echo "  visible: $d/qam-xbox"; done; echo "  (fin)"' 2>&1 | head -8
  done
  exit 0
fi
mkdir -p "$ICONS" || exit 1
python3 -I "$HERE/cursor_xbox.py" "$ICONS" || exit 1
if have_flatpak; then
  for a in "${APPS[@]}"; do
    flatpak info "$a" >/dev/null 2>&1 || continue
    flatpak override --user --filesystem=xdg-data/icons:ro --env=XCURSOR_THEME=qam-xbox --env=XCURSOR_SIZE="$TAM" --env=XCURSOR_PATH="/run/host/user-share/icons:$ICONS:/run/host/share/icons:/usr/share/icons" "$a" && echo "  override en $a"
  done
fi
echo "Listo. Cierra y vuelve a abrir Firefox desde el QAM para ver el puntero (tamaño $TAM; cámbialo con QAM_CURSOR_TAM=48)."
