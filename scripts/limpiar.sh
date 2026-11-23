#!/usr/bin/env bash
# Ordena la carpeta de trabajo de QAM Rail. Por defecto SOLO MUESTRA qué haría (no toca nada).
#   ./limpiar.sh                 muestra el plan
#   ./limpiar.sh --aplicar       mueve lo viejo a _archivo/ (se puede deshacer a mano)
#   ./limpiar.sh --borrar        borra _archivo/ (pide confirmación)
# Variables: CARPETA (por defecto, la de este script) · KEEP_ZIPS=3 versiones de qam-rail-X.zip · KEEP_SRC=1 · KEEP_DIAG=3
# Nunca toca: install.sh, limpiar.sh, qam-rail/ (el repositorio), qam-app*.json, backups/, nuevo/.
set -euo pipefail
DIR="${CARPETA:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
KEEP_ZIPS="${KEEP_ZIPS:-3}"; KEEP_SRC="${KEEP_SRC:-1}"; KEEP_DIAG="${KEEP_DIAG:-3}"
ARCH="$DIR/_archivo"
cd "$DIR"

if [[ "${1:-}" == "--borrar" ]]; then
  [[ -d "$ARCH" ]] || { echo "No hay _archivo/."; exit 0; }
  du -sh "$ARCH"; read -r -p "¿Borrar _archivo/ para siempre? [s/N] " r
  [[ "$r" =~ ^[sS]$ ]] && rm -rf "$ARCH" && echo "Borrado." || echo "Cancelado."; exit 0
fi

vsort() { sort -V; }
# lista, en orden de versión, los archivos que casan con un patrón; imprime los que SOBRAN (todos menos los N últimos)
excess() { local pat="$1" keep="$2"; { ls -1 $pat 2>/dev/null || true; } | { grep -v -- "${3:-^$}" || true; } | vsort | head -n -"$keep" 2>/dev/null || true; }

PLAN=()
while IFS= read -r f; do [[ -n "$f" ]] && PLAN+=("$f"); done < <(excess 'qam-rail-[0-9]*.zip' "$KEEP_ZIPS" -- '-src-')
while IFS= read -r f; do [[ -n "$f" ]] && PLAN+=("$f"); done < <(excess 'qam-rail-src-[0-9]*.zip' "$KEEP_SRC")
while IFS= read -r f; do [[ -n "$f" ]] && PLAN+=("$f"); done < <(excess 'qam-rail-diagnostico-*.zip' "$KEEP_DIAG")
for f in qam-rail-friends-*.zip qam-rail-friends-src-*.zip qam-explorar-amigos*.js 'qam-rail-arquitectura(1).md' backup-0.2.0; do [[ -e "$f" ]] && PLAN+=("$f"); done
# la arquitectura vive en el repositorio (qam-rail/QAM-RAIL-ARQUITECTURA.md): las copias sueltas sobran
for f in qam-rail-arquitectura.md QAM-RAIL-ARQUITECTURA.md; do [[ -f "$f" && -f qam-rail/QAM-RAIL-ARQUITECTURA.md ]] && PLAN+=("$f"); done
mapfile -t PLAN < <(printf '%s\n' "${PLAN[@]:-}" | grep -v '^$' | sort -u)

if [[ ${#PLAN[@]} -eq 0 ]]; then echo "Nada que ordenar."; exit 0; fi
tot=0; for f in "${PLAN[@]}"; do s=$(du -sk "$f" | cut -f1); tot=$((tot + s)); done
echo "Se archivarían ${#PLAN[@]} elementos (~$((tot / 1024)) MiB) en $ARCH:"
printf '  %s\n' "${PLAN[@]}"
if [[ "${1:-}" != "--aplicar" ]]; then echo; echo "(Solo muestra. Para hacerlo: ./limpiar.sh --aplicar)"; exit 0; fi
mkdir -p "$ARCH"
for f in "${PLAN[@]}"; do mv -n -- "$f" "$ARCH/"; done
echo "Hecho. Revisa y, si todo está bien, ./limpiar.sh --borrar"
