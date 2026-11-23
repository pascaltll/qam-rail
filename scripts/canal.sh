#!/usr/bin/env bash
# Elige qué QAM Rail dibuja el panel: la ESTABLE (qam-rail, se actualiza por GitHub) o la de DESARROLLO (qam-rail-dev).
#   ./canal.sh            dice cuál está activa y qué hay instalado
#   ./canal.sh estable    pasa a la estable        ./canal.sh dev    pasa a la de desarrollo
# Reinicia Decky (3 s) para aplicarlo. Variables: PLUGINS_DIR · CANAL_DIR · NO_RESTART=1
set -euo pipefail
PLUGINS_DIR="${PLUGINS_DIR:-$HOME/homebrew/plugins}"
CANAL_DIR="${CANAL_DIR:-$(dirname "$PLUGINS_DIR")/settings/qam-rail-canal}"
has() { [[ -f "$PLUGINS_DIR/$1/plugin.json" ]]; }
ver() { grep -m1 '"version"' "$PLUGINS_DIR/$1/package.json" 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || true; }
flag() { tr -d '[:space:]' < "$CANAL_DIR/activo" 2>/dev/null || true; }
cur() { # misma regla que el plugin: la bandera, y si apunta a algo no instalado, la otra
  local w; w="$(flag)"; [[ "$w" == dev || "$w" == estable ]] || { has qam-rail-dev && w=dev || w=estable; }
  if [[ "$w" == dev ]] && ! has qam-rail-dev; then w=estable; fi
  if [[ "$w" == estable ]] && ! has qam-rail && has qam-rail-dev; then w=dev; fi
  echo "$w"
}
estado() {
  echo "Activa: $(cur)"
  has qam-rail && echo "  estable   qam-rail      v$(ver qam-rail)" || echo "  estable   (no instalada)"
  has qam-rail-dev && echo "  dev       qam-rail-dev  v$(ver qam-rail-dev)" || echo "  dev       (no instalada)"
}
case "${1:-estado}" in
  estado|status) estado; exit 0 ;;
  estable|stable) T=estable; D=qam-rail ;;
  dev) T=dev; D=qam-rail-dev ;;
  -h|--help) sed -n '2,5p' "${BASH_SOURCE[0]}"; exit 0 ;;
  *) echo "Uso: $0 [estado|estable|dev]" >&2; exit 1 ;;
esac
has "$D" || { echo "La versión «$T» no está instalada en $PLUGINS_DIR." >&2; exit 1; }
W=""; [[ -w "$CANAL_DIR" || ! -d "$CANAL_DIR" && -w "$(dirname "$CANAL_DIR")" ]] || W="sudo"
$W mkdir -p "$CANAL_DIR"; printf '%s' "$T" | $W tee "$CANAL_DIR/activo" >/dev/null; $W chmod 666 "$CANAL_DIR/activo"; $W chmod 777 "$CANAL_DIR" 2>/dev/null || true
echo "Canal activo: $T"
if [[ "${NO_RESTART:-0}" == "1" ]]; then echo "NO_RESTART=1: no se reinicia Decky."; else echo "Reiniciando Decky…"; sudo systemctl restart plugin_loader; fi
