#!/usr/bin/env bash
# Genera qam-rail-<versión>.zip (instalable) y SHA256SUMS. Uso: scripts/package.sh
set -euo pipefail
cd "$(dirname "$0")/.."
VER=$(node -p "require('./package.json').version")
OUT=$(mktemp -d)
mkdir -p "$OUT/qam-rail"
cp -r main.py py_modules dist README.md LICENSE package.json plugin.json "$OUT/qam-rail/"
find "$OUT" \( -name '*.map' -o -name '__pycache__' \) -prune -exec rm -rf {} +
(cd "$OUT" && zip -qr "qam-rail-$VER.zip" qam-rail)
mv "$OUT/qam-rail-$VER.zip" .
sha256sum "qam-rail-$VER.zip" > SHA256SUMS
echo "OK qam-rail-$VER.zip"
