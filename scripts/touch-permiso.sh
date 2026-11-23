#!/usr/bin/env bash
# Deja que QAM Rail lea la pantalla táctil (solo lectura) para el scroll con el dedo en las apps de escritorio.
# Regla de udev con «uaccess»: el usuario de la sesión recibe permiso de lectura en las pantallas táctiles, sin tocar grupos. Se aplica al momento y sobrevive a reinicios.
# Uso: ./touch-permiso.sh   (pide sudo) · Quitar: ./touch-permiso.sh --quitar
set -u
RULE=/etc/udev/rules.d/71-qam-rail-touch.rules
if [ "${1:-}" = "--quitar" ]; then
  sudo rm -f "$RULE" && sudo udevadm control --reload && sudo udevadm trigger --subsystem-match=input --action=change
  echo "Permiso del táctil quitado."; exit 0
fi
printf '%s\n' '# QAM Rail: lectura de la pantalla táctil para el scroll con el dedo' \
  'SUBSYSTEM=="input", KERNEL=="event*", ENV{ID_INPUT_TOUCHSCREEN}=="1", TAG+="uaccess"' | sudo tee "$RULE" >/dev/null || exit 1
sudo udevadm control --reload && sudo udevadm trigger --subsystem-match=input --action=change
sleep 1
for d in /dev/input/event*; do
  if udevadm info -q property "$d" 2>/dev/null | grep -q '^ID_INPUT_TOUCHSCREEN=1'; then
    if [ -r "$d" ]; then echo "OK: $d legible"; else echo "AVISO: $d sigue sin permiso (¿hace falta reiniciar la sesión?)"; fi
  fi
done
