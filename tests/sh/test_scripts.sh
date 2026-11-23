#!/usr/bin/env bash
# Pruebas de scripts/install.sh y scripts/limpiar.sh sin red ni sudo: bash tests/sh/test_scripts.sh
set -euo pipefail
S="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../scripts" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
ok() { echo "ok $1"; }
# ---- limpiar ----
mkdir -p "$T/c/qam-rail" "$T/c/backups" && cd "$T/c" && echo x > qam-rail/QAM-RAIL-ARQUITECTURA.md
for v in 0.9.0 0.10.0 0.49.6 0.50.1 0.51.1; do touch qam-rail-$v.zip qam-rail-src-$v.zip; done
touch qam-rail-friends-0.1.0.zip install.sh qam-app.ytmini.json QAM-RAIL-ARQUITECTURA.md
CARPETA=$PWD bash "$S/limpiar.sh" >/dev/null; [[ -f qam-rail-0.9.0.zip ]] && ok "limpiar solo muestra"
CARPETA=$PWD bash "$S/limpiar.sh" --aplicar >/dev/null
[[ ! -f qam-rail-0.9.0.zip && -f _archivo/qam-rail-0.9.0.zip && -f qam-rail-0.51.1.zip && -f qam-rail-0.50.1.zip && -f qam-rail-0.49.6.zip ]] && ok "conserva las 3 últimas"
[[ -f install.sh && -f qam-app.ytmini.json && -d qam-rail && -d backups && ! -f QAM-RAIL-ARQUITECTURA.md && -f qam-rail/QAM-RAIL-ARQUITECTURA.md ]] && ok "no toca lo protegido"
# ---- install desde «GitHub» simulado ----
mkdir -p "$T/rel" "$T/plug/qam-rail/dist" && cd "$T/rel"
echo '{"version":"0.50.0"}' > "$T/plug/qam-rail/package.json"
mk() { mkdir -p qam-rail/dist; echo "{\"version\":\"$1\"}" > qam-rail/package.json; echo '{}' > qam-rail/plugin.json; echo js > qam-rail/dist/index.js; zip -qr "qam-rail-$1.zip" qam-rail; rm -rf qam-rail; }
mk 0.51.0; mk 0.52.0; mk 0.53.0
sha256sum qam-rail-0.51.0.zip qam-rail-0.52.0.zip > SHA256SUMS; sha256sum qam-rail-0.53.0.zip > SHA256SUMS.beta
python3 - <<'PY'
import json, os
b = "file://" + os.getcwd() + "/"
a = lambda n, f=None: {"name": n, "browser_download_url": b + (f or n)}
json.dump([{"tag_name": "v0.53.0", "prerelease": True, "draft": False, "assets": [a("qam-rail-0.53.0.zip"), a("SHA256SUMS", "SHA256SUMS.beta")]},
           {"tag_name": "v0.52.0", "prerelease": False, "draft": False, "assets": [a("qam-rail-0.52.0.zip"), a("SHA256SUMS")]},
           {"tag_name": "v0.51.0", "prerelease": False, "draft": False, "assets": [a("qam-rail-0.51.0.zip"), a("SHA256SUMS")]}], open("releases.json", "w"))
PY
export QAM_RELEASES_FILE="$T/rel/releases.json" PLUGINS_DIR="$T/plug" BACKUP_DIR="$T/bk" NO_RESTART=1 KEEP_BACKUPS=2
out="$(bash "$S/install.sh" --check)"; [[ "$out" == *"Última: 0.52.0"* ]] && ok "check: canal estable ignora la beta"
bash "$S/install.sh" --latest >/dev/null; grep -q 0.52.0 "$T/plug/qam-rail/package.json" && ok "latest instala la estable"
bash "$S/install.sh" --latest --beta >/dev/null; grep -q 0.53.0 "$T/plug/qam-rail/package.json" && ok "beta"
bash "$S/install.sh" --version 0.51.0 >/dev/null; grep -q 0.51.0 "$T/plug/qam-rail/package.json" && ok "versión concreta"
[[ $(ls "$T/bk" | wc -l) -eq 2 ]] && ok "solo se conservan KEEP_BACKUPS copias"
echo "0000000000000000000000000000000000000000000000000000000000000000  qam-rail-0.52.0.zip" > SHA256SUMS
if bash "$S/install.sh" --latest >/dev/null 2>&1; then echo "FALLO: instaló con suma falsa"; exit 1; fi
grep -q 0.51.0 "$T/plug/qam-rail/package.json" && ok "suma falsa: no instala"
# ---- canales: dev + estable lado a lado ----
cd "$T" && mkdir -p dv/plug dv/set dv/zips && cd dv/zips
mkd() { mkdir -p qam-rail-dev/dist; echo "{\"version\":\"$1\"}" > qam-rail-dev/package.json; echo '{}' > qam-rail-dev/plugin.json; echo js > qam-rail-dev/dist/index.js; zip -qr "qam-rail-dev-$1.zip" qam-rail-dev; rm -rf qam-rail-dev; }
mk 0.53.0; mkd 0.53.0-dev.1; mkd 0.53.0-dev.2
export PLUGINS_DIR="$T/dv/plug" CANAL_DIR="$T/dv/set/qam-rail-canal" BACKUP_DIR="$T/dv/bk" NO_RESTART=1; unset QAM_RELEASES_FILE
bash "$S/install.sh" qam-rail-0.53.0.zip >/dev/null; [[ -f "$PLUGINS_DIR/qam-rail/plugin.json" && ! -d "$PLUGINS_DIR/qam-rail-dev" ]] && ok "estable sola: no crea dev"
[[ ! -f "$CANAL_DIR/activo" ]] && ok "instalar la estable no toca el canal"
bash "$S/install.sh" qam-rail-dev-0.53.0-dev.1.zip >/dev/null
[[ -d "$PLUGINS_DIR/qam-rail" && -d "$PLUGINS_DIR/qam-rail-dev" && "$(cat "$CANAL_DIR/activo")" == dev ]] && ok "dev se instala al lado y queda activa"
touch -d '1 hour ago' qam-rail-dev-0.53.0-dev.1.zip; bash "$S/install.sh" --dev >/dev/null; grep -q dev.2 "$PLUGINS_DIR/qam-rail-dev/package.json" && ok "--dev elige el zip dev más nuevo"
bash "$S/install.sh" 0.53.0-dev.1 --dev >/dev/null 2>&1 || true
[[ "$(bash "$S/canal.sh")" == *"Activa: dev"* ]] && ok "canal.sh: estado"
bash "$S/canal.sh" estable >/dev/null; [[ "$(cat "$CANAL_DIR/activo")" == estable && "$(bash "$S/canal.sh")" == *"Activa: estable"* ]] && ok "canal.sh estable"
bash "$S/canal.sh" dev >/dev/null; [[ "$(cat "$CANAL_DIR/activo")" == dev ]] && ok "canal.sh dev"
rm -rf "$PLUGINS_DIR/qam-rail-dev"; if bash "$S/canal.sh" dev >/dev/null 2>&1; then echo "FALLO: activó dev sin instalar"; exit 1; fi; ok "canal.sh rechaza lo no instalado"
[[ "$(bash "$S/canal.sh")" == *"Activa: estable"* ]] && ok "bandera a algo no instalado: usa la otra"
# ---- logs.sh: junta los registros, no incluye lo escrito ni títulos de ventana ----
H="$T/home"; mkdir -p "$H/homebrew/settings/qam-rail-dev" "$H/homebrew/plugins/qam-rail-dev"
echo '{"version":"0.54.0-dev.37"}' > "$H/homebrew/plugins/qam-rail-dev/package.json"
echo "12:00:00   tecla 3 carácter(es) → ventana 0x1 ok=True" > "$H/homebrew/settings/qam-rail-dev/desktop-tag.log"
echo "12:00:01 teclado grande: abierto" > "$H/homebrew/settings/qam-rail-dev/keyboard.log"
echo '{"ev":"anomalia","nombre":"app_oculta_sin_ui"}' > "$H/homebrew/settings/qam-rail-dev/timeline.log"
mkdir -p "$T/out"
res="$(HOME="$H" OUT_DIR="$T/out" PATH="/usr/bin:/bin" bash "$S/logs.sh")"
[[ "$res" == Listo:* ]] && ok "logs.sh crea el archivo"
tar -tzf "$T/out"/qam-logs-*.tgz | grep -q "qam-rail-dev/keyboard.log" && tar -xzOf "$T/out"/qam-logs-*.tgz qam-logs/versiones.txt | grep -q "0.54.0-dev.37" && tar -xzOf "$T/out"/qam-logs-*.tgz qam-logs/qam-rail-dev/timeline.log | grep -q app_oculta_sin_ui && ok "logs.sh incluye registros, línea de tiempo y versión"
echo "TODO OK"
