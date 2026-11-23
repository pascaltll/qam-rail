#!/usr/bin/env bash
# Firefox más cómodo con el dedo: barra de pestañas y botones grandes (modo táctil) y un desplazamiento de rueda más fino, que va con el scroll táctil de QAM Rail.
# Escribe user.js en los perfiles de Firefox (Flatpak y normal). Cierra Firefox antes. Quitar: ./firefox-touch.sh --quitar
set -u
MARK="// QAM Rail táctil"
PROFILES=()
for d in "$HOME"/.var/app/org.mozilla.firefox/.mozilla/firefox/*.default* "$HOME"/.mozilla/firefox/*.default*; do [ -d "$d" ] && PROFILES+=("$d"); done
[ ${#PROFILES[@]} -gt 0 ] || { echo "No encuentro ningún perfil de Firefox."; exit 1; }
for d in "${PROFILES[@]}"; do
  f="$d/user.js"
  [ -f "$f" ] && sed -i "/$MARK/d" "$f"
  if [ "${1:-}" != "--quitar" ]; then
    {
      echo "user_pref(\"browser.uidensity\", 2); $MARK"
      echo "user_pref(\"mousewheel.default.delta_multiplier_y\", 60); $MARK"
      echo "user_pref(\"general.smoothScroll\", true); $MARK"
    } >> "$f"
  fi
  echo "  $d"
done
if [ "${1:-}" = "--quitar" ]; then echo "Quitado. Reabre Firefox."; else echo "Listo (modo táctil + rueda al 60 %). Reabre Firefox."; fi
