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
DIST="dist"
if [[ $DEV == 1 ]]; then
  # El nombre del plugin va DENTRO del bundle (@decky/api conecta con el backend por ese nombre): hay que compilar de nuevo con el de dev.
  python3 - "$OUT/manifest-dev" <<'PY'
import json, os, sys
os.makedirs(sys.argv[1]); j = json.load(open("plugin.json", encoding="utf-8")); j["name"] = "QAM Rail Dev"
json.dump(j, open(os.path.join(sys.argv[1], "plugin.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
PY
  # rollup escribe siempre en dist/: se aparta el de la estable, se compila el de dev y se restaura (también si algo falla)
  mv dist "$OUT/dist-stable"; trap 'rm -rf dist; mv "$OUT/dist-stable" dist 2>/dev/null; rm -rf "$OUT"' EXIT
  QAM_MANIFEST_DIR="$OUT/manifest-dev" npx rollup -c >"$OUT/rollup.log" 2>&1 || { cat "$OUT/rollup.log" >&2; echo "No se pudo compilar la versión dev." >&2; exit 1; }
  mkdir -p "$OUT/dist-dev" && cp -r dist/. "$OUT/dist-dev/"
  DIST="$OUT/dist-dev"
fi
cp -r main.py py_modules README.md LICENSE package.json plugin.json "$OUT/$DIR/"; cp scripts/informe.sh "$OUT/$DIR/informe.sh"; cp -r "$DIST" "$OUT/$DIR/dist"
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
  grep -q '"name":"QAM Rail Dev"' "$OUT/$DIR/dist/index.js" || { echo "El bundle dev no lleva el nombre «QAM Rail Dev»: no se empaqueta." >&2; exit 1; }
else
  ZIP="qam-rail-$VER.zip"
  if grep -q 'QAM Rail Dev' "$OUT/$DIR/dist/index.js"; then echo "El bundle estable lleva el nombre de dev: haz «pnpm build» de nuevo." >&2; exit 1; fi
fi
(cd "$OUT" && zip -qr "$ZIP" "$DIR")
mv "$OUT/$ZIP" .
if [[ $DEV == 0 ]]; then sha256sum "$ZIP" > SHA256SUMS; fi
echo "OK $ZIP"
