#!/usr/bin/env bash
# Junta los registros de QAM Rail en UN archivo para enviarlos: bash logs.sh  →  ~/qam-logs-<fecha>.tgz
# No incluye lo que escribes con el teclado (no se registra) ni los títulos de las ventanas (podrían ser páginas que visitas).
set -u
OUT_DIR="${OUT_DIR:-$HOME}"
D="$(mktemp -d)"; trap 'rm -rf "$D"' EXIT
W="$D/qam-logs"; mkdir -p "$W"
for canal in qam-rail-dev qam-rail; do
  S="$HOME/homebrew/settings/$canal"; [ -d "$S" ] || continue
  mkdir -p "$W/$canal"
  ls -la "$S" > "$W/$canal/_archivos.txt" 2>&1
  for f in timeline.log timeline.log.1 pad.log keyboard.log keyboard.log.1 desktop-tag.log desktop-run.log updates.log perf-log.jsonl apps-steam.json updates.json pad-mouse.json desktop-anim.json; do
    [ -f "$S/$f" ] || continue
    if [ -r "$S/$f" ]; then tail -n 1500 "$S/$f" > "$W/$canal/$f" 2>&1; else echo "(sin permiso de lectura: prueba con sudo)" > "$W/$canal/$f"; fi
  done
  [ -f "$S/diag/sesion.json" ] && [ -r "$S/diag/sesion.json" ] && cp "$S/diag/sesion.json" "$W/$canal/sesion.json"
done
for p in "$HOME"/homebrew/plugins/qam-rail*/package.json; do [ -f "$p" ] && { echo "$p"; grep -m1 '"version"' "$p"; } >> "$W/versiones.txt"; done
{
  echo "fecha: $(date)"; echo "kernel: $(uname -r)"
  export DISPLAY="${DISPLAY:-:0}"
  echo "--- gamescope"; xprop -root GAMESCOPE_FOCUSED_APP GAMESCOPECTRL_BASELAYER_APPID 2>&1
  echo "--- ventanas (sin títulos)"; xwininfo -root -tree 2>&1 | sed -E 's/"[^"]*": \(/"…": (/' | head -n 60
  echo "--- flatpak"; flatpak ps --columns=application,pid 2>&1 | head -n 10
  echo "--- coredumps"; coredumpctl --no-pager 2>/dev/null | tail -n 5
  echo "--- diario reciente (Steam/gamescope)"; journalctl --user -b --since "-20min" --no-pager 2>/dev/null | grep -iE "segfault|abort|crash|steam.*(exit|restart)|gamescope.*(error|fail)" | tail -n 30
} > "$W/sistema.txt" 2>&1
OUT="$OUT_DIR/qam-logs-$(date +%Y%m%d-%H%M%S).tgz"
tar -czf "$OUT" -C "$D" qam-logs && echo "Listo: $OUT ($(du -h "$OUT" | cut -f1)). Envía ese archivo."
