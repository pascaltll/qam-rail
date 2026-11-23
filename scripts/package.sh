#!/usr/bin/env bash
# Genera el zip instalable.
#   scripts/package.sh            qam-rail-<versión>.zip + SHA256SUMS         (la ESTABLE, la que sube la release)
#   scripts/package.sh --dev [N]  qam-rail-dev-<versión>-dev.N.zip            (la de DESARROLLO: otra carpeta, otro nombre, sin updater de GitHub)
# N por defecto: fecha y hora (aammddHHMM). La de dev no toca SHA256SUMS ni se publica.
set -euo pipefail
cd "$(dirname "$0")/.."
DEV=0; N=""
if [[ "${1:-}" == "--dev" ]]; then DEV=1; N="${2:-$(date +%y%m%d%H%M)}"; fi
VER=$(node -p "require('./package.json').version")
OUT=$(mktemp -d); trap 'rm -rf "$OUT"' EXIT
DIR="qam-rail"; [[ $DEV == 1 ]] && DIR="qam-rail-dev"
mkdir -p "$OUT/$DIR"
cp -r main.py py_modules dist README.md LICENSE package.json plugin.json "$OUT/$DIR/"
find "$OUT" \( -name '*.map' -o -name '__pycache__' \) -prune -exec rm -rf {} +
if [[ $DEV == 1 ]]; then
  VER="$VER-dev.$N"
  python3 - "$OUT/$DIR" "$VER" <<'PY'
import json, sys
d, ver = sys.argv[1], sys.argv[2]
for f, edit in (("package.json", lambda j: j.update(name="qam-rail-dev", version=ver)), ("plugin.json", lambda j: j.update(name="QAM Rail Dev"))):
    j = json.load(open(f"{d}/{f}", encoding="utf-8")); edit(j); json.dump(j, open(f"{d}/{f}", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
PY
  ZIP="qam-rail-dev-$VER.zip"
else
  ZIP="qam-rail-$VER.zip"
fi
(cd "$OUT" && zip -qr "$ZIP" "$DIR")
mv "$OUT/$ZIP" .
if [[ $DEV == 0 ]]; then sha256sum "$ZIP" > SHA256SUMS; fi
echo "OK $ZIP"
