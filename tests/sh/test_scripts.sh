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
echo "TODO OK"
