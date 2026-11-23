#!/usr/bin/env bash
# Instala/actualiza QAM Rail (o cualquier plugin de Decky en .zip), con copia de seguridad y un solo reinicio.
#   ./install.sh                     el qam-rail-N.zip más nuevo de esta carpeta (como siempre)
#   ./install.sh --latest            baja la última versión ESTABLE de GitHub, la verifica (SHA-256) e instala
#   ./install.sh --latest --beta     igual, pero admite versiones beta
#   ./install.sh --version 0.51.1    una versión concreta de GitHub
#   ./install.sh --check             solo dice si hay versión nueva (no instala)
#   ./install.sh 0.8.0 | zip...      zips locales (nombre, ruta o número de versión)
#   ./install.sh --dev               el qam-rail-dev-*.zip más nuevo de esta carpeta: instala la versión de DESARROLLO (otra carpeta,
#                                    qam-rail-dev) y la deja activa. La estable no se toca. Volver a la estable: ./canal.sh estable
# Variables: CANAL_DIR (~/homebrew/settings/qam-rail-canal) · PLUGINS_DIR (~/homebrew/plugins) · BACKUP_DIR (<carpeta>/backups) · KEEP_BACKUPS (5) · NO_RESTART=1 · QAM_REPO (pascaltll/qam-rail)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGINS_DIR="${PLUGINS_DIR:-$HOME/homebrew/plugins}"
BACKUP_DIR="${BACKUP_DIR:-$HERE/backups}"
KEEP_BACKUPS="${KEEP_BACKUPS:-5}"
REPO="${QAM_REPO:-pascaltll/qam-rail}"
command -v unzip >/dev/null || { echo "Falta 'unzip'." >&2; exit 1; }

MODE="local"; BETA=0; WANT=""; DEV=0
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --latest) MODE="latest" ;;
    --check) MODE="check" ;;
    --beta) BETA=1 ;;
    --dev) DEV=1 ;;
    --version) MODE="latest"; WANT="${2:?falta la versión}"; shift ;;
    -h|--help) sed -n '2,13p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) ARGS+=("$1") ;;
  esac
  shift
done

is_ver() { [[ "$1" =~ ^[0-9]+(\.[0-9]+)*(-dev\.[0-9]+)?$ ]]; }
version_of() { grep -m1 '"version"' "$1/package.json" 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || true; }
locate() {
  local c
  for c in "$1" "$PWD/$1" "$HERE/$1"; do [[ -f "$c" ]] && { echo "$c"; return 0; }; done
  echo "No encuentro $1 (busqué en $PWD y $HERE)." >&2; return 1
}

# ---------- GitHub: elegir release, bajar, verificar ----------
pick_release() { # imprime: tag<TAB>url del zip<TAB>url de SHA256SUMS<TAB>nombre del zip
  local json
  if [[ -n "${QAM_RELEASES_FILE:-}" ]]; then json="$(cat "$QAM_RELEASES_FILE")"        # pruebas sin red
  else json="$(curl -fsSL -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/$REPO/releases?per_page=15")"; fi
  BETA="$BETA" WANT="$WANT" python3 -c '
import json, os, re, sys
def ver(t): return tuple(int(x) for x in re.findall(r"\d+", re.sub(r"[-+].*$", "", t.lstrip("vV")))[:4])
rels = [r for r in json.load(sys.stdin) if not r.get("draft") and (os.environ["BETA"] == "1" or not r.get("prerelease"))]
want = os.environ["WANT"].lstrip("vV")
if want: rels = [r for r in rels if r["tag_name"].lstrip("vV") == want]
if not rels: sys.exit("No hay una versión que cumpla (canal/versión pedidos).")
r = max(rels, key=lambda r: ver(r["tag_name"]))
z = next((a for a in r["assets"] if re.fullmatch(r"qam-rail-\d.*\.zip", a["name"]) and "-src-" not in a["name"]), None)
s = next((a for a in r["assets"] if a["name"] in ("SHA256SUMS", "SHA256SUMS.txt")), None)
if not z or not s: sys.exit("La release " + r["tag_name"] + " no trae el .zip y SHA256SUMS: no se instala sin verificar.")
print("\t".join([r["tag_name"].lstrip("vV"), z["browser_download_url"], s["browser_download_url"], z["name"]]))
' <<<"$json"
}

fetch_verified() { # tag url sums name -> ruta del zip verificado
  local tag="$1" url="$2" sums="$3" name="$4" d
  case "$url$sums" in
    https://github.com/*https://github.com/*) ;;
    file://*file://*) [[ -n "${QAM_RELEASES_FILE:-}" ]] || { echo "Enlace no permitido." >&2; return 1; } ;;
    *) echo "Enlace no permitido (solo github.com por HTTPS)." >&2; return 1 ;;
  esac
  d="$(mktemp -d)"; TMPS+=("$d")
  echo "Descargando $name …" >&2
  curl -fsSL --proto '=https,file' -o "$d/$name" "$url"
  curl -fsSL --proto '=https,file' -o "$d/SHA256SUMS" "$sums"
  ( cd "$d" && grep -F " $name" SHA256SUMS | sed 's/ \*/  /' | sha256sum -c - >/dev/null ) \
    || { echo "¡La descarga NO coincide con su SHA-256! No se instala." >&2; return 1; }
  echo "SHA-256 verificado." >&2
  echo "$d/$name"
}

TMPS=(); INSTALLED_DEV=0
cleanup() { for t in "${TMPS[@]:-}"; do if [[ -n "$t" ]]; then rm -rf "$t"; fi; done; return 0; }
trap cleanup EXIT

ZIPS=()
case "$MODE" in
  check)
    IFS=$'\t' read -r tag _ _ _ < <(pick_release)
    cur="$(version_of "$PLUGINS_DIR/qam-rail")"; cur="${cur:-ninguna}"
    echo "Instalada: $cur · Última: $tag"
    [[ "$cur" == "$tag" ]] && echo "Estás al día." || echo "Hay versión nueva: ./install.sh --latest"
    exit 0 ;;
  latest)
    IFS=$'\t' read -r tag url sums name < <(pick_release)
    cur="$(version_of "$PLUGINS_DIR/qam-rail")"
    echo "Última: $tag (instalada: ${cur:-ninguna})"
    ZIPS+=("$(fetch_verified "$tag" "$url" "$sums" "$name")") ;;
  local)
    if [[ ${#ARGS[@]} -eq 0 ]]; then
      pat='qam-rail-[0-9]*.zip'; [[ $DEV == 1 ]] && pat='qam-rail-dev-[0-9]*.zip'
      newest="$(ls -t "$PWD"/$pat "$HERE"/$pat 2>/dev/null | grep -v -- '-src-' | head -n1 || true)"
      [[ -n "$newest" ]] || { echo "No hay $pat en esta carpeta.$([[ $DEV == 1 ]] || echo ' Usa --latest para bajarlo de GitHub.')" >&2; exit 1; }
      ZIPS+=("$newest")
    elif [[ ${#ARGS[@]} -eq 2 && "${ARGS[0]}" != *.zip ]] && ! is_ver "${ARGS[0]}" && is_ver "${ARGS[1]}"; then
      ZIPS+=("$(locate "${ARGS[0]}-${ARGS[1]}.zip")")
    else
      for a in "${ARGS[@]}"; do
        if is_ver "$a"; then ZIPS+=("$(locate "qam-rail$([[ $DEV == 1 || "$a" == *-dev.* ]] && echo -dev)-$a.zip")"); else ZIPS+=("$(locate "$a")"); fi
      done
    fi ;;
esac

SUDO=""; [[ -w "$PLUGINS_DIR" || ! -d "$PLUGINS_DIR" && -w "$(dirname "$PLUGINS_DIR")" ]] || SUDO="sudo"
for ZIP in "${ZIPS[@]}"; do
  TMP="$(mktemp -d)"; TMPS+=("$TMP")
  unzip -q "$ZIP" -d "$TMP"
  mapfile -t TOP < <(find "$TMP" -mindepth 1 -maxdepth 1 -type d -printf '%f\n')
  [[ ${#TOP[@]} -eq 1 ]] || { echo "$ZIP: debe tener una sola carpeta de plugin (tiene ${#TOP[@]})." >&2; exit 1; }
  NAME="${TOP[0]}"; SRC="$TMP/$NAME"
  [[ -f "$SRC/plugin.json" && -f "$SRC/dist/index.js" ]] || { echo "$ZIP: no parece un plugin de Decky (falta plugin.json o dist/index.js)." >&2; exit 1; }
  DEST="$PLUGINS_DIR/$NAME"
  echo "== $NAME v$(version_of "$SRC")  →  $DEST"
  if [[ -d "$DEST" ]]; then
    OLD="$(version_of "$DEST")"; OLD="${OLD:-?}"
    mkdir -p "$BACKUP_DIR"
    B="$BACKUP_DIR/$NAME-$OLD-$(date +%Y%m%d-%H%M%S)"
    $SUDO cp -r "$DEST" "$B"
    echo "   copia de seguridad (v$OLD): $B"
    # solo se conservan las últimas KEEP_BACKUPS copias de este plugin
    mapfile -t OLDB < <(ls -dt "$BACKUP_DIR/$NAME"-[0-9]* 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)))
    for o in "${OLDB[@]:-}"; do if [[ -n "$o" ]]; then $SUDO rm -rf "$o"; echo "   copia antigua quitada: $(basename "$o")"; fi; done
  else
    $SUDO mkdir -p "$DEST"
    echo "   instalación nueva"
  fi
  $SUDO mkdir -p "$DEST/dist"
  $SUDO cp -r "$SRC"/. "$DEST"/
  if [[ "$NAME" == "qam-rail-dev" ]]; then INSTALLED_DEV=1; fi
done

# Si se instaló la de desarrollo, queda activa (la estable se queda en pausa; ./canal.sh estable la devuelve).
if [[ "${INSTALLED_DEV:-0}" == "1" ]]; then
  CANAL_DIR="${CANAL_DIR:-$(dirname "$PLUGINS_DIR")/settings/qam-rail-canal}"
  W=""; [[ -w "$CANAL_DIR" || ! -d "$CANAL_DIR" && -w "$(dirname "$CANAL_DIR")" ]] || W="sudo"
  $W mkdir -p "$CANAL_DIR"; printf dev | $W tee "$CANAL_DIR/activo" >/dev/null; $W chmod 666 "$CANAL_DIR/activo"; $W chmod 777 "$CANAL_DIR" 2>/dev/null || true
  echo "Canal activo: dev  (para volver a la estable: ./canal.sh estable)"
fi

if [[ "${NO_RESTART:-0}" == "1" ]]; then
  echo "NO_RESTART=1: no se reinicia Decky."
else
  echo "Reiniciando Decky (plugin_loader)…"
  sudo systemctl restart plugin_loader
fi
echo "Listo. Para volver atrás: cp -r <copia>/. <carpeta del plugin>/ y reiniciar plugin_loader."
