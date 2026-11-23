"""Tuberia de instalacion de apps de QAM Rail (0.50): verificar, preparar aparte, cambiar de forma atomica.

Pasos de APPS-ESTANDAR.md §3 que son de archivos (los de procesos —install.sh, prueba de «status»— los hace main.py):
    1. verificar la descarga (SHA-256) · 2. descomprimir en un sitio aparte con limites · 3. comprobar el manifiesto ·
    4. cambiar la carpeta de la app (la anterior queda en .previous/ para volver atras).
Nada de lo descargado se ejecuta aqui. Sin dependencias de Decky.
"""
import hashlib
import json
import os
import re
import shutil
import stat
import tempfile
import zipfile

import qam_apps

MAX_FILES = 50_000
MAX_UNPACKED = 3 * 1024 ** 3        # 3 GiB descomprimido
MAX_RATIO = 200                     # cada archivo: descomprimido / comprimido (anti «bomba» zip)
STAGING = ".staging"


# ---------------------------------------------------------------- versiones

def parse_version(text: str | None) -> tuple:
    """«v3.12.1-beta2» → (3, 12, 1, 0) con la parte beta como marca; None/vacio → ()."""
    if not text:
        return ()
    m = re.match(r"^\s*[vV]?(\d+(?:\.\d+)*)(?:[-+._]?([A-Za-z]+)[.-]?(\d*))?", str(text))
    if not m:
        return ()
    nums = tuple(int(x) for x in m.group(1).split("."))
    while len(nums) > 1 and nums[-1] == 0:      # 3.12.0 == 3.12
        nums = nums[:-1]
    pre = m.group(2)
    # Una prerelease (beta, rc…) va ANTES de la estable del mismo numero.
    return nums + ((-1, pre.lower(), int(m.group(3) or 0)),) if pre else nums + ((0,),)


def compare_versions(a: str | None, b: str | None) -> int:
    """-1, 0 o 1. Version desconocida = mas antigua."""
    pa, pb = parse_version(a), parse_version(b)
    def norm(p):
        core = [x for x in p if isinstance(x, int)] if p else []
        tail = p[-1] if p and isinstance(p[-1], tuple) else (0,)
        return core, tail
    (ca, ta), (cb, tb) = norm(pa), norm(pb)
    n = max(len(ca), len(cb))
    ca, cb = ca + [0] * (n - len(ca)), cb + [0] * (n - len(cb))
    if ca != cb:
        return -1 if ca < cb else 1
    ta, tb = tuple(map(str, ta)), tuple(map(str, tb))
    # (0,) estable > (-1, 'beta', n) prerelease
    ra = (ta[0] == "0", ta[1:] if ta[0] != "0" else ())
    rb = (tb[0] == "0", tb[1:] if tb[0] != "0" else ())
    if ra == rb:
        return 0
    if ra[0] != rb[0]:
        return 1 if ra[0] else -1
    return -1 if ra[1] < rb[1] else 1


# ---------------------------------------------------------------- verificacion

def sha256_file(path: str, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while True:
            block = fh.read(chunk)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def parse_sums(text: str) -> dict:
    """Lineas de SHA256SUMS («<hex>  nombre» o «<hex> *nombre») → {nombre: hex minusculas}."""
    out = {}
    for line in (text or "").splitlines():
        m = re.match(r"^\s*([0-9a-fA-F]{64})\s+\*?(.+?)\s*$", line)
        if m:
            out[os.path.basename(m.group(2))] = m.group(1).lower()
    return out


def verify(path: str, expected: str | None = None, sums_text: str | None = None) -> dict:
    """Comprueba el SHA-256 del archivo. `expected` = suma conocida; `sums_text` = contenido de SHA256SUMS.
    Sin ninguna de las dos, solo se calcula (matched=None: «no verificada»)."""
    got = sha256_file(path)
    want = (expected or "").strip().lower() or None
    if want is None and sums_text:
        want = parse_sums(sums_text).get(os.path.basename(path))
        if want is None:
            return {"ok": False, "sha256": got, "matched": False, "error": f"{os.path.basename(path)} no figura en SHA256SUMS"}
    if want is None:
        return {"ok": True, "sha256": got, "matched": None}
    if got != want:
        return {"ok": False, "sha256": got, "matched": False, "error": "la descarga no coincide con su suma SHA-256"}
    return {"ok": True, "sha256": got, "matched": True}


# ---------------------------------------------------------------- preparar aparte

def _safe_extract(zf: zipfile.ZipFile, dest: str) -> None:
    infos = qam_apps.safe_members(zf)
    if len(infos) > MAX_FILES:
        raise ValueError("el zip trae demasiados archivos")
    total = 0
    for i in infos:
        mode = i.external_attr >> 16
        if stat.S_ISLNK(mode):
            raise ValueError(f"enlace simbólico no permitido en el zip: {i.filename}")
        total += i.file_size
        if i.compress_size and i.file_size / max(1, i.compress_size) > MAX_RATIO and i.file_size > 5_000_000:
            raise ValueError(f"archivo sospechosamente comprimido: {i.filename}")
    if total > MAX_UNPACKED:
        raise ValueError("el zip descomprimido es demasiado grande")
    zf.extractall(dest, infos)


def stage_zip(zip_path: str, apps_dir: str, expected_sha256: str | None = None, sums_text: str | None = None,
              qam_version: str | None = None, home: str | None = None) -> dict:
    """Verifica y descomprime un .zip en apps_dir/.staging/<n>/. No toca nada instalado.
    Devuelve {src, manifest, check, verify, staging}; el que llama decide con check/verify y llama a `commit` o `abort`."""
    os.makedirs(apps_dir, exist_ok=True)
    v = verify(zip_path, expected_sha256, sums_text)
    if not v["ok"]:
        raise ValueError(v.get("error") or "no se pudo verificar la descarga")
    base = os.path.join(apps_dir, STAGING)
    os.makedirs(base, exist_ok=True)
    staging = tempfile.mkdtemp(dir=base, prefix="s-")
    try:
        with zipfile.ZipFile(zip_path) as zf:
            names = [i.filename for i in zf.infolist()]
            root = qam_apps.zip_root(names)
            _safe_extract(zf, staging)
        src = os.path.join(staging, root) if root else staging
        if not root:
            inner = os.path.join(staging, "_app")
            os.makedirs(inner)
            for f in os.listdir(staging):
                if f != "_app":
                    shutil.move(os.path.join(staging, f), os.path.join(inner, f))
            src = inner
        man = qam_apps.read_manifest(src)
        if man.get("deducido") and os.path.basename(src) == "_app":
            man["id"] = qam_apps.slug(os.path.splitext(os.path.basename(zip_path))[0].split("-0")[0].replace("steam-", ""))
        return {"src": src, "manifest": man, "check": qam_apps.check_manifest(man, qam_version, home), "verify": v, "staging": staging}
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def stage_dir(folder: str, apps_dir: str, qam_version: str | None = None, home: str | None = None) -> dict:
    """Igual que stage_zip pero copiando una carpeta (tu repositorio, sin .git/.venv)."""
    os.makedirs(apps_dir, exist_ok=True)
    folder = os.path.normpath(folder)
    if os.path.normpath(apps_dir) in (folder, os.path.dirname(folder)):
        raise ValueError("esa carpeta ya es una app instalada")
    base = os.path.join(apps_dir, STAGING)
    os.makedirs(base, exist_ok=True)
    staging = tempfile.mkdtemp(dir=base, prefix="s-")
    try:
        src = os.path.join(staging, "_app")
        shutil.copytree(folder, src, ignore=qam_apps.DEV_IGNORE, symlinks=True)
        man = qam_apps.read_manifest(src)
        if man.get("deducido"):
            man["id"] = qam_apps.slug(os.path.basename(folder).replace("steam-", ""))
        return {"src": src, "manifest": man, "check": qam_apps.check_manifest(man, qam_version, home), "verify": {"ok": True, "matched": None}, "staging": staging}
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def commit(staged: dict, apps_dir: str) -> dict:
    """Cambia la carpeta de la app por la preparada (atomico; la anterior queda en .previous/). Limpia el staging."""
    try:
        man = qam_apps._install_from(staged["src"], apps_dir, staged["manifest"]["id"] if staged["manifest"].get("deducido") else None)
        return man
    finally:
        shutil.rmtree(staged["staging"], ignore_errors=True)


def abort(staged: dict) -> None:
    shutil.rmtree(staged["staging"], ignore_errors=True)


def clean_staging(apps_dir: str) -> int:
    """Al arrancar: restos de instalaciones interrumpidas."""
    base = os.path.join(apps_dir, STAGING)
    n = len(os.listdir(base)) if os.path.isdir(base) else 0
    shutil.rmtree(base, ignore_errors=True)
    return n


# ---------------------------------------------------------------- estado de «mala version»

def is_bad(reg: dict, app_id: str, version: str | None) -> bool:
    bad = (reg.get(app_id) or {}).get("bad_versions") or []
    return bool(version) and version in bad


def mark_bad(reg: dict, app_id: str, version: str | None, why: str = "") -> None:
    if not version:
        return
    r = reg.setdefault(app_id, {})
    bad = r.setdefault("bad_versions", [])
    if version not in bad:
        bad.append(version)
    r["last_error"] = why[:300]


def parse_status(text: str) -> dict | None:
    """Salida de `<lanzador> --qam-status`: debe haber una linea JSON (objeto). None si no."""
    for line in reversed((text or "").strip().splitlines()):
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if isinstance(d, dict):
                return d
    return None
