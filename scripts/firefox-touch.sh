#!/usr/bin/env bash
# Firefox más cómodo con el dedo: barra de pestañas y botones grandes (modo táctil) y un desplazamiento de rueda más fino, que va con el scroll táctil de QAM Rail.
# Escribe user.js en los perfiles de Firefox (Flatpak y normal). Cierra Firefox antes. Quitar: ./firefox-touch.sh --quitar
set -u
MARK="// QAM Rail táctil"
PROFILES=()
for base in "$HOME/.var/app/org.mozilla.firefox/.mozilla/firefox" "$HOME/.mozilla/firefox"; do
  [ -f "$base/profiles.ini" ] || continue
  while IFS= read -r p; do   # los perfiles que declara Firefox (se llamen como se llamen: «xxx.default», «xxx.Profile 1»…)
    [ -d "$base/$p" ] && PROFILES+=("$base/$p")
  done < <(sed -n 's/^Path=//p' "$base/profiles.ini")
done
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
