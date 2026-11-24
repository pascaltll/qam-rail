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
grep -hE "app\.sin_ventana|app\.abrir_fallo|app\.ventana|vigilante|panel fantasma|parón|MARCA" "$D/timeline.log" "$D/pad.log" "$D/nav-trace.log" "$D/nav-trace.log.old" 2>/dev/null | tail -n 80 >> "$OUT"
for f in timeline.log pad.log desktop-tag.log desktop-run.log keyboard.log; do sec "$f (últimas 80)"; tail -n 80 "$D/$f" 2>/dev/null >> "$OUT"; done
sec "nav-trace.log (últimas 250)"; tail -n 250 "$D/nav-trace.log" 2>/dev/null >> "$OUT"
sec "selftest.json"; head -c 7000 "$D/selftest.json" 2>/dev/null >> "$OUT"
echo "Listo: $OUT ($(wc -c < "$OUT") bytes). Súbelo al chat."
