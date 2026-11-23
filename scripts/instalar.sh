#!/usr/bin/env bash
# Primera instalación de QAM Rail en un dispositivo nuevo (Bazzite/Game Mode con Decky): revisa lo que hace falta e instala.
#   Una línea:  curl -fsSL https://github.com/pascaltll/qam-rail/releases/latest/download/instalar.sh | bash
#   ./instalar.sh              revisa y, si todo lo necesario está, instala la última versión estable
#   ./instalar.sh --doctor     solo revisa (no instala nada)
#   ./instalar.sh --beta       admite versiones beta
# Instala en ~/homebrew/plugins/qam-rail (ajustes en ~/homebrew/settings/qam-rail, apps en ~/homebrew/qam-apps).
set -uo pipefail

# Freno contra bucles: si «install.sh» fuera en realidad una copia de este mismo script, se llamaría a sí mismo sin fin.
if [[ -n "${QAM_INSTALAR_ACTIVO:-}" ]]; then
  echo "Error: el «install.sh» de esta carpeta es una copia de instalar.sh (no el instalador). Bórralo y vuelve a ejecutar." >&2; exit 1
fi
export QAM_INSTALAR_ACTIVO=1
REPO="${QAM_REPO:-pascaltll/qam-rail}"
HB="${HOMEBREW_DIR:-$HOME/homebrew}"
DOCTOR=0; BETA=""
for a in "$@"; do case "$a" in --doctor) DOCTOR=1 ;; --beta) BETA="--beta" ;; -h|--help) sed -n '2,8p' "${BASH_SOURCE[0]}"; exit 0 ;; esac; done

FALTA=0; AVISOS=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
mal()  { printf '  \033[31m✗\033[0m %s\n      → %s\n' "$1" "$2"; FALTA=$((FALTA + 1)); }
aviso(){ printf '  \033[33m!\033[0m %s\n      → %s\n' "$1" "$2"; AVISOS=$((AVISOS + 1)); }
tiene() { command -v "$1" >/dev/null 2>&1; }

echo "QAM Rail · revisión del dispositivo"
if [[ $EUID -eq 0 ]]; then mal "Estás como root" "ejecútalo con tu usuario normal (pedirá sudo solo para instalar)"; fi

echo "Imprescindible para instalar"
for t in curl unzip python3 sha256sum; do tiene "$t" && ok "$t" || mal "falta $t" "instálalo (en Bazzite: brew install $t, o está en el sistema base)"; done

echo "Decky Loader (el plugin vive dentro de él)"
if [[ -d "$HB/plugins" ]]; then ok "carpeta $HB/plugins"; else mal "no existe $HB/plugins: Decky Loader no está instalado" "en Bazzite: ujust setup-decky (o https://decky.xyz), reinicia el Modo Juego y vuelve a ejecutar esto"; fi
if tiene systemctl; then
  if systemctl is-active --quiet plugin_loader 2>/dev/null; then ok "servicio plugin_loader activo"; else aviso "plugin_loader no está activo" "se inicia en Modo Juego; si lo acabas de instalar, reinicia"; fi
fi

echo "Para que funcione todo (si falta, esa parte se oculta o avisa; no impide instalar)"
if ls "$HB"/plugins/*/plugin.json >/dev/null 2>&1 && grep -lq '"name": *"Panel de Control"' "$HB"/plugins/*/plugin.json 2>/dev/null; then ok "Panel de Control (Hooandee): potencia, color, sonido"
else aviso "no está «Panel de Control»" "instálalo desde la tienda de Decky: sin él no hay potencia (TDP), color, ecualizador ni Auto-TDP"; fi
tiene wpctl && ok "wpctl (sonido, PipeWire)" || aviso "falta wpctl" "el control de sonido del sistema no funcionará"
tiene bluetoothctl && ok "bluetoothctl (Bluetooth)" || aviso "falta bluetoothctl" "no habrá Bluetooth en Conexiones"
tiene nmcli && ok "nmcli (Wi‑Fi)" || aviso "falta nmcli" "no habrá Wi‑Fi en Conexiones"
tiene rfkill && ok "rfkill" || aviso "falta rfkill" "apagar Bluetooth/Wi‑Fi será menos fiable"
tiene flatpak && ok "flatpak (apps de escritorio)" || aviso "falta flatpak" "la pestaña Steam de Apps no verá apps Flatpak"
if pgrep -x steam >/dev/null 2>&1 || pgrep -x steamwebhelper >/dev/null 2>&1; then ok "Steam en marcha"; else aviso "Steam no está en marcha" "no hace falta para instalar; sí para usar el panel"; fi
[[ -n "${XDG_CURRENT_DESKTOP:-}" && "${XDG_CURRENT_DESKTOP}" != *KDE* && -z "${GAMESCOPE_WAYLAND_DISPLAY:-}" ]] && aviso "no parece Bazzite/KDE" "está pensado para Bazzite en Modo Juego; en otras distros puede variar"

echo
if [[ $FALTA -gt 0 ]]; then echo "Faltan $FALTA cosa(s) imprescindibles. Arréglalas y vuelve a ejecutar."; exit 1; fi
[[ $AVISOS -gt 0 ]] && echo "$AVISOS aviso(s): se puede instalar igual."
if [[ $DOCTOR -eq 1 ]]; then echo "Revisión terminada (--doctor: no se instaló nada)."; exit 0; fi

# ---- instalar: usa el install.sh de al lado o el de la misma release; él verifica el SHA-256 del zip ----
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo .)"
INST="$HERE/install.sh"
if [[ ! -f "$INST" ]] || ! grep -q 'pick_release' "$INST"; then   # no existe o no es el install.sh de QAM Rail (p. ej. uno antiguo)
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  echo "Bajando install.sh de la release…"
  curl -fsSL --proto '=https' -o "$TMP/install.sh" "https://github.com/$REPO/releases/latest/download/install.sh" || { echo "No se pudo bajar install.sh." >&2; exit 1; }
  INST="$TMP/install.sh"
fi
mkdir -p "$HB/qam-apps" 2>/dev/null || true
PLUGINS_DIR="$HB/plugins" BACKUP_DIR="$HB/settings/qam-rail/backups" bash "$INST" --latest $BETA || exit 1
echo
echo "Listo. Abre el Modo Juego, pulsa el botón de QAM (···) y verás el riel. Para actualizar: Más › Actualizaciones."
