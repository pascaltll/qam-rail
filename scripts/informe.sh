#!/usr/bin/env bash
# Junta en UN archivo (~/qam-informe.txt) lo necesario para revisar un fallo: versión, avisos de la grabadora, últimas líneas de cada registro.
# Uso:  bash ~/homebrew/plugins/qam-rail-dev/informe.sh      (o  bash informe.sh  desde la carpeta del plugin)
D="$HOME/homebrew/settings/qam-rail-dev"
[ -d "$D" ] || D="$HOME/homebrew/settings/qam-rail"
OUT="$HOME/qam-informe.txt"
sec() { printf '\n===== %s =====\n' "$1" >> "$OUT"; }
: > "$OUT"
sec "fecha y versión"; { date; cat "$D/ultima-version" 2>/dev/null; } >> "$OUT"
sec "vigilante: apps sin ventana, fallos, paneles fantasma, paradas"
grep -hE "ui\.js|app\.sin_ventana|app\.abrir_fallo|app\.ventana|vigilante|panel fantasma|parón|MARCA" "$D/timeline.log" "$D/pad.log" "$D/nav-trace.log" "$D/nav-trace.log.old" 2>/dev/null | tail -n 80 >> "$OUT"
for f in timeline.log pad.log desktop-tag.log desktop-run.log keyboard.log; do sec "$f (últimas 80)"; tail -n 80 "$D/$f" 2>/dev/null >> "$OUT"; done
sec "apps abiertas (línea de tiempo: abrió / ventana en ms / sin ventana)"
grep -hE "app\.(abrir|ventana|sin_ventana|abrir_fallo|mostrar)" "$D/timeline.log.1" "$D/timeline.log" 2>/dev/null | tail -n 120 >> "$OUT"
sec "grabaciones guardadas (una por app, trazas/)"
ls -la --time-style=long-iso "$D/trazas" 2>/dev/null | tail -n 30 >> "$OUT"
for f in $(ls -t "$D"/trazas/*.log 2>/dev/null | head -n 5); do sec "traza $(basename "$f") (últimas 120)"; tail -n 120 "$f" >> "$OUT"; done
sec "nav-trace.log (últimas 250)"; tail -n 250 "$D/nav-trace.log" 2>/dev/null >> "$OUT"
for DSP in :0 :1; do
  sec "X $DSP: ventanas (clase, tamaño, posición)"
  DISPLAY=$DSP timeout 5 xwininfo -root -tree 2>&1 | grep -E '^ +0x' | head -n 60 >> "$OUT"
  sec "X $DSP: átomos de gamescope y de Steam en la raíz"
  DISPLAY=$DSP timeout 5 xprop -root 2>&1 | grep -E 'GAMESCOPE_FOCUSED|STEAM_|_NET_ACTIVE_WINDOW|_NET_SUPPORTING|GAMESCOPE_XWAYLAND' | cut -c1-200 | head -n 25 >> "$OUT"
done
sec "interfaz de Steam (CEF, puerto 8080): páginas abiertas"
timeout 5 curl -s http://127.0.0.1:8080/json/list 2>&1 | grep -E '"title"|"url"' | cut -c1-160 | head -n 30 >> "$OUT"
sec "CPU por página de la interfaz de Steam (6 s)"
P="$(dirname "$(readlink -f "$0")")/steam-cpu.py"; [ -f "$P" ] && timeout 20 python3 "$P" 6 >> "$OUT" 2>&1
sec "errores de la interfaz del plugin (ui.js.*)"
grep -h "ui.js" "$D/timeline.log" 2>/dev/null | tail -n 40 >> "$OUT"
sec "procesos que más CPU gastan ahora"
ps -eo pid,pcpu,pmem,etimes,comm --sort=-pcpu 2>/dev/null | head -n 12 >> "$OUT"
sec "selftest.json"; head -c 7000 "$D/selftest.json" 2>/dev/null >> "$OUT"
echo "Listo: $OUT ($(wc -c < "$OUT") bytes). Súbelo al chat."
