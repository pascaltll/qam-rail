"""Apps de QAM Rail: como los plugins de Decky, pero para apps propias (MiniTube, Recomp Hub...).

Cada app vive en <carpeta de apps>/<id>/ y se describe con qam-app.json:
    {"id": "ytmini", "name": "MiniTube", "version": "0.51.1",
     "launch": "launcher.sh", "launch_options": "", "install": "install.sh",
     "keep": ["ytmini.json", ".venv", "*.log"],
     "art": {"capsule": "...600x900.png", "header": "...460x215.png", "hero": "...", "logo": "...", "icon": "..."},
     "actions": [{"label": "Mini", "args": "mini"}]}
Esquema 1 (0.50): ademas "schema", "group", "description", "uninstall", "data_dirs", "update" (GitHub), "status" y
"min_qam_rail"; ver APPS-ESTANDAR.md. Si el zip no lo trae, se deduce (lanzador .sh, version en __init__.py/CHANGELOG, arte por nombre de archivo).
Instalar/actualizar desde .zip conserva lo de «keep» (ajustes del usuario, entorno de Python, registros).
Sin dependencias de Decky: se prueba con pytest/scripts sueltos.
"""
import fnmatch
import json
import os
import re
import shutil
import stat
import tempfile
import zipfile

MANIFEST = "qam-app.json"
ART_PATTERNS = {
    "capsule": ("*portrait*", "*600x900*", "*capsule*vertical*", "*grid_p*"),
    "header": ("*header*", "*460x215*", "*capsule_wide*", "*920x430*"),
    "hero": ("*hero*", "*1920x620*"),
    "logo": ("*logo*",),
    "icon": ("icon*.png", "*icon_512*", "icon*"),
}
DEFAULT_KEEP = ["*.json", ".venv", "*.log"]
SCHEMA = 1                      # esquema de qam-app.json que entiende esta version
PREVIOUS = ".previous"          # <apps>/.previous/<id>/ = version anterior (para volver atras)
UPDATE_PROVIDERS = ("github-release",)
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


def slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")
    return s[:40] or "app"


def _read(path: str, limit: int = 200_000) -> str:
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read(limit)
    except OSError:
        return ""


def _guess_version(root: str) -> str | None:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and d not in ("node_modules", "tests")]
        if dirpath[len(root):].count(os.sep) > 2:
            continue
        for name in filenames:
            if name in ("__init__.py", "version.py", "package.json"):
                m = re.search(r'(?:__version__\s*=\s*|"version"\s*:\s*)["\']([0-9][^"\']*)["\']', _read(os.path.join(dirpath, name)))
                if m:
                    return m.group(1)
    m = re.search(r"\[?v?(\d+\.\d+(?:\.\d+)?)\]?", _read(os.path.join(root, "CHANGELOG.md"), 4000))
    return m.group(1) if m else None


def _guess_name(root: str, folder: str) -> str:
    for readme in ("README.es.md", "README.md"):
        m = re.search(r"^#\s+([^\n(—–-]+)", _read(os.path.join(root, readme), 4000), re.M)
        if m:
            return m.group(1).strip()
    return folder


def _files(root: str, depth: int = 2) -> list[str]:
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        rel = os.path.relpath(dirpath, root)
        if rel != "." and rel.count(os.sep) >= depth:
            dirnames[:] = []
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        out += [os.path.normpath(os.path.join(rel, f)) for f in filenames]
    return sorted(out)


def guess_manifest(root: str, folder: str | None = None) -> dict:
    """Manifiesto deducido de una carpeta sin qam-app.json."""
    folder = folder or os.path.basename(os.path.normpath(root))
    files = _files(root)
    top = [f for f in files if os.sep not in f]
    launch = next((f for f in ("launcher.sh", "run.sh", "start.sh") if f in top), None)
    launch = launch or next((f for f in top if f.endswith((".sh", ".AppImage")) and f not in ("install.sh",)), None)
    pngs = [f for f in files if f.lower().endswith((".png", ".jpg", ".jpeg"))]
    art = {}
    for kind, pats in ART_PATTERNS.items():
        hit = next((f for p in pats for f in pngs if fnmatch.fnmatch(os.path.basename(f).lower(), p)), None)
        if hit:
            art[kind] = hit
    name = _guess_name(root, folder)
    return {
        "id": slug(folder.replace("steam-", "")), "name": name, "version": _guess_version(root),
        "launch": launch, "launch_options": "", "install": "install.sh" if "install.sh" in top else None,
        "keep": DEFAULT_KEEP, "art": art, "actions": [], "deducido": True,
    }


def _inside(rel: str) -> bool:
    """Ruta relativa que se queda dentro de la carpeta de la app (sin «..», sin absoluta)."""
    if not isinstance(rel, str) or not rel or rel.startswith(("/", "~")) or "\\" in rel:
        return False
    return not any(part == ".." for part in rel.split("/"))


def expand_home(path: str, home: str | None = None) -> str:
    """«~/x» → <carpeta personal del usuario>/x. Decky corre como root: «~» del proceso NO es la del usuario."""
    home = home or os.path.expanduser("~")
    p = str(path)
    if p == "~":
        return home
    return os.path.normpath(os.path.join(home, p[2:])) if p.startswith("~/") else os.path.normpath(p)


def check_manifest(man: dict, qam_version: str | None = None, home: str | None = None) -> dict:
    """Problemas del manifiesto: «errors» impiden instalar; «warnings» solo se muestran."""
    errors, warnings = [], []
    schema = man.get("schema")
    if isinstance(schema, int) and schema > SCHEMA:
        errors.append(f"el manifiesto es de un esquema más nuevo ({schema}); actualiza QAM Rail")
    for key in ("launch", "install", "uninstall"):
        v = man.get(key)
        if v and not _inside(v):
            errors.append(f"«{key}» apunta fuera de la carpeta de la app")
    st = man.get("status")
    if st:
        first = str(st).split()[0] if str(st).split() else ""
        if not _inside(first):
            errors.append("«status» apunta fuera de la carpeta de la app")
    for kind, rel in (man.get("art") or {}).items():
        if not _inside(rel):
            errors.append(f"arte «{kind}» fuera de la carpeta")
    upd = man.get("update")
    if upd:
        if not isinstance(upd, dict) or upd.get("provider") not in UPDATE_PROVIDERS:
            errors.append("«update.provider» desconocido")
        elif not REPO_RE.match(str(upd.get("repo") or "")):
            errors.append("«update.repo» debe ser usuario/repositorio")
        elif upd.get("channel", "stable") not in ("stable", "beta"):
            warnings.append("«update.channel» desconocido: se usa stable")
    for d in man.get("data_dirs") or []:
        h = os.path.normpath(home or os.path.expanduser("~"))
        e = expand_home(str(d), h)
        if not os.path.isabs(e) or e in ("/", h) or not e.startswith(h + os.sep):
            errors.append(f"«data_dirs»: {d} debe estar dentro de tu carpeta personal")
    need = man.get("min_qam_rail")
    if need and qam_version:
        try:
            from qam_pipeline import compare_versions
            if compare_versions(qam_version, str(need)) < 0:
                errors.append(f"necesita QAM Rail {need} o más nueva (tienes {qam_version})")
        except ImportError:
            pass
    if not man.get("version"):
        warnings.append("sin versión: no se podrán comparar actualizaciones")
    if not man.get("launch"):
        warnings.append("sin lanzador: no se podrá abrir desde el QAM")
    return {"errors": errors, "warnings": warnings}


CONTROL_KEYS = ("show", "minimize", "close", "kill")
CONTROL_RE = re.compile(r"^[A-Za-z0-9 _.-]{1,24}$")


def controls_for(man: dict) -> dict:
    """Órdenes del lanzador para el menú de la app (mostrar, minimizar, cerrar, forzar cierre): del manifiesto (`controls`)
    o, para MiniTube, las suyas (`open`, `mini`, `close`, `kill`). Solo texto corto sin símbolos: se pasan como argumentos del lanzador."""
    raw = man.get("controls")
    out = {}
    if isinstance(raw, dict):
        out = {k: str(v) for k, v in raw.items() if k in CONTROL_KEYS and isinstance(v, str) and CONTROL_RE.match(v)}
    elif "ytmini" in str(man.get("id", "")).lower() or str(man.get("name", "")).strip().lower() == "minitube":
        out = {"show": "open", "minimize": "mini", "close": "close", "kill": "kill"}
    return out


def read_manifest(root: str) -> dict:
    man = _read_manifest(root)
    man["controls"] = controls_for(man)
    return man


def _read_manifest(root: str) -> dict:
    path = os.path.join(root, MANIFEST)
    base = guess_manifest(root)
    base.update({"schema": 0, "group": None, "description": None, "uninstall": None, "data_dirs": [], "update": None, "status": None, "min_qam_rail": None})
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            merged = {**base, **{k: v for k, v in data.items() if v is not None}, "deducido": False}
            merged["id"] = slug(merged.get("id") or base["id"])
            if not isinstance(merged.get("data_dirs"), list):
                merged["data_dirs"] = []
            return merged
    except (OSError, ValueError):
        pass
    return base


def safe_members(zf: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    """Rechaza rutas absolutas o con «..» (zip slip)."""
    out = []
    for info in zf.infolist():
        name = info.filename.replace("\\", "/")
        if name.startswith("/") or any(part == ".." for part in name.split("/")):
            raise ValueError(f"ruta peligrosa en el zip: {info.filename}")
        out.append(info)
    return out


def zip_root(names: list[str]) -> str:
    """Carpeta raiz unica del zip («steam-ytmini/») o «» si los archivos estan sueltos."""
    tops = {n.replace("\\", "/").split("/", 1)[0] for n in names if n.strip("/")}
    if len(tops) == 1:
        only = next(iter(tops))
        if any(n.replace("\\", "/").startswith(only + "/") for n in names):
            return only
    return ""


def peek_zip(path: str) -> dict | None:
    """Que app trae un zip (sin extraer todo). None si no parece una app."""
    try:
        with zipfile.ZipFile(path) as zf:
            names = [i.filename for i in safe_members(zf)]
            root = zip_root(names)
            pre = f"{root}/" if root else ""
            top = [n[len(pre):] for n in names if n.startswith(pre) and "/" not in n[len(pre):].rstrip("/")]
            if MANIFEST not in top and not any(t.endswith((".sh", ".AppImage")) for t in top):
                return None
            with tempfile.TemporaryDirectory() as tmp:
                small = [n for n in names if n.startswith(pre) and (n.endswith((MANIFEST, "README.md", "README.es.md", "CHANGELOG.md", "__init__.py", "package.json")) or n.lower().endswith((".png", ".sh")))]
                for n in small[:200]:
                    if not n.lower().endswith(".png"):
                        zf.extract(n, tmp)
                    else:
                        os.makedirs(os.path.join(tmp, os.path.dirname(n)), exist_ok=True)
                        open(os.path.join(tmp, n), "wb").close()
                return read_manifest(os.path.join(tmp, root) if root else tmp)
    except (OSError, zipfile.BadZipFile, ValueError):
        return None


def _keep_match(rel: str, keep: list[str]) -> bool:
    first = rel.split(os.sep, 1)[0]
    return any(fnmatch.fnmatch(rel, k) or fnmatch.fnmatch(first, k) for k in keep) and not rel.endswith(".example")


def _migrate_keep(src_dir: str, dst_dir: str, keep: list[str]) -> list[tuple[str, str]]:
    """Mueve de src_dir a dst_dir lo del usuario («keep») que dst_dir no trae. Devuelve los movimientos (para deshacerlos)."""
    moves: list[tuple[str, str]] = []
    for dirpath, dirnames, filenames in os.walk(src_dir):
        rel_dir = os.path.relpath(dirpath, src_dir)
        for d in list(dirnames):
            rel = os.path.normpath(os.path.join(rel_dir, d))
            if _keep_match(rel, keep) and not os.path.exists(os.path.join(dst_dir, rel)):
                os.makedirs(os.path.dirname(os.path.join(dst_dir, rel)), exist_ok=True)
                shutil.move(os.path.join(dirpath, d), os.path.join(dst_dir, rel))
                moves.append((os.path.join(dirpath, d), os.path.join(dst_dir, rel)))
                dirnames.remove(d)
        for f in filenames:
            rel = os.path.normpath(os.path.join(rel_dir, f))
            if _keep_match(rel, keep) and not os.path.exists(os.path.join(dst_dir, rel)):
                os.makedirs(os.path.dirname(os.path.join(dst_dir, rel)), exist_ok=True)
                shutil.move(os.path.join(dirpath, f), os.path.join(dst_dir, rel))
                moves.append((os.path.join(dirpath, f), os.path.join(dst_dir, rel)))
    return moves


def _undo_moves(moves: list[tuple[str, str]]) -> None:
    for origin, now in reversed(moves):
        try:
            os.makedirs(os.path.dirname(origin), exist_ok=True)
            shutil.move(now, origin)
        except OSError:
            pass


def _exec_bits(dest: str, man: dict) -> None:
    for name in [man.get("launch"), man.get("install"), man.get("uninstall")]:
        if name:
            p = os.path.join(dest, name)
            if os.path.isfile(p):
                os.chmod(p, os.stat(p).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _install_from(src: str, apps_dir: str, fallback_id: str | None = None) -> dict:
    """Mueve `src` (ya preparado) a apps_dir/<id>, conservando lo de «keep» de la version instalada.
    La version que estaba pasa a apps_dir/.previous/<id> (una sola) para poder volver a ella."""
    man = read_manifest(src)
    if fallback_id and man.get("deducido") and os.path.basename(os.path.normpath(src)) == "_app":
        man["id"] = slug(fallback_id.replace("steam-", ""))
    dest = os.path.join(apps_dir, man["id"])
    keep = man.get("keep") or DEFAULT_KEEP
    if os.path.isdir(dest):
        moves = _migrate_keep(dest, src, keep)
        prev_root = os.path.join(apps_dir, PREVIOUS)
        os.makedirs(prev_root, exist_ok=True)
        prev = os.path.join(prev_root, man["id"])
        older = prev + ".older"         # la «anterior» de antes: se borra al terminar bien (finish_install) o se recupera si falla
        shutil.rmtree(older, ignore_errors=True)
        if os.path.isdir(prev):
            os.replace(prev, older)
        os.replace(dest, prev)
        try:
            shutil.move(src, dest)
        except Exception:
            os.replace(prev, dest)      # no quedarse sin la app si algo falla a medias
            if os.path.isdir(older):
                os.replace(older, prev)
            _undo_moves(moves)
            raise
    else:
        shutil.move(src, dest)
    _exec_bits(dest, man)
    man = read_manifest(dest)
    man["path"] = dest
    return man


def previous_manifest(apps_dir: str, app_id: str) -> dict | None:
    """Manifiesto de la version guardada para volver atras (None si no hay)."""
    prev = os.path.join(apps_dir, PREVIOUS, app_id)
    if not os.path.isdir(prev):
        return None
    man = read_manifest(prev)
    man["path"] = prev
    return man


def rollback(apps_dir: str, app_id: str) -> dict:
    """Vuelve a la version anterior: la actual pasa a ser la «anterior» (se puede volver a ir y venir).
    Lo del usuario («keep») de la actual se lleva a la que vuelve."""
    dest = os.path.join(apps_dir, app_id)
    prev = os.path.join(apps_dir, PREVIOUS, app_id)
    if not os.path.isdir(prev):
        raise ValueError("no hay versión anterior")
    keep = read_manifest(prev).get("keep") or DEFAULT_KEEP
    moves = _migrate_keep(dest, prev, keep) if os.path.isdir(dest) else []
    tmp = os.path.join(apps_dir, PREVIOUS, f".swap-{app_id}")
    shutil.rmtree(tmp, ignore_errors=True)
    try:
        if os.path.isdir(dest):
            os.replace(dest, tmp)
        os.replace(prev, dest)
        if os.path.isdir(tmp):
            os.replace(tmp, prev)
    except Exception:
        # Dejarlo como estaba.
        if os.path.isdir(tmp) and not os.path.isdir(dest):
            os.replace(tmp, dest)
        _undo_moves(moves)
        raise
    man = read_manifest(dest)
    man["path"] = dest
    _exec_bits(dest, man)
    return man


def finish_install(apps_dir: str, app_id: str) -> None:
    """La instalacion salio bien: la «anterior» de antes ya no hace falta."""
    shutil.rmtree(os.path.join(apps_dir, PREVIOUS, app_id + ".older"), ignore_errors=True)


def discard_new(apps_dir: str, app_id: str, had_previous: bool) -> dict | None:
    """Una instalacion que fallo: si habia version anterior se vuelve a ella (y recupera la que ya era «anterior»);
    si era la primera, se quita sin dejar rastro."""
    dest = os.path.join(apps_dir, app_id)
    root = os.path.join(apps_dir, PREVIOUS)
    prev, older = os.path.join(root, app_id), os.path.join(root, app_id + ".older")
    if had_previous and os.path.isdir(prev):
        man = rollback(apps_dir, app_id)
        shutil.rmtree(prev, ignore_errors=True)               # ahora «anterior» seria la que fallo
        if os.path.isdir(older):
            os.replace(older, prev)
        return man
    shutil.rmtree(dest, ignore_errors=True)
    shutil.rmtree(older, ignore_errors=True)
    return None


def install_zip(path: str, apps_dir: str) -> dict:
    """Instala o actualiza desde un .zip. Devuelve el manifiesto final con «path»."""
    os.makedirs(apps_dir, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=apps_dir, prefix=".tmp-") as tmp:
        with zipfile.ZipFile(path) as zf:
            members = safe_members(zf)
            zf.extractall(tmp, members)
            root = zip_root([m.filename for m in members])
        src = os.path.join(tmp, root) if root else tmp
        if not root:
            # Archivos sueltos: se mueven a una subcarpeta para poder renombrarla.
            inner = os.path.join(tmp, "_app")
            os.makedirs(inner)
            for f in os.listdir(tmp):
                if f != "_app":
                    shutil.move(os.path.join(tmp, f), os.path.join(inner, f))
            src = inner
        return _install_from(src, apps_dir, os.path.splitext(os.path.basename(path))[0].split("-0")[0])


# Lo que NO se copia al instalar desde una carpeta de desarrollo (repositorio).
DEV_IGNORE = shutil.ignore_patterns(".git", ".venv", "venv", "__pycache__", "node_modules", "*.log", ".pytest_cache", "*.zip", "*_respaldo*")


def install_dir(folder: str, apps_dir: str) -> dict:
    """Instala o actualiza copiando una carpeta (p. ej. tu repositorio en ~/Games/steam-ytmini), sin .git ni .venv."""
    os.makedirs(apps_dir, exist_ok=True)
    folder = os.path.normpath(folder)
    if os.path.normpath(apps_dir) in (folder, os.path.dirname(folder)):
        raise ValueError("esa carpeta ya es una app instalada")
    with tempfile.TemporaryDirectory(dir=apps_dir, prefix=".tmp-") as tmp:
        src = os.path.join(tmp, "_app")
        shutil.copytree(folder, src, ignore=DEV_IGNORE, symlinks=True)
        return _install_from(src, apps_dir, os.path.basename(folder))


def list_apps(apps_dir: str, extra: list[str] | None = None) -> list[dict]:
    """Apps instaladas en la carpeta + carpetas añadidas a mano (extra)."""
    out = []
    dirs = []
    if os.path.isdir(apps_dir):
        dirs += [os.path.join(apps_dir, d) for d in sorted(os.listdir(apps_dir)) if not d.startswith(".") and os.path.isdir(os.path.join(apps_dir, d))]
    dirs += [d for d in (extra or []) if os.path.isdir(d) and d not in dirs]
    for d in dirs:
        man = read_manifest(d)
        man["path"] = d
        man["external"] = not os.path.normpath(d).startswith(os.path.normpath(apps_dir) + os.sep)
        out.append(man)
    return out


def find_zips(roots: list[str], depth: int = 2, limit: int = 40) -> list[dict]:
    """Zips que parecen apps en Descargas, Games... (los mas nuevos primero)."""
    found = []
    for root in roots:
        if not os.path.isdir(root):
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            if os.path.relpath(dirpath, root).count(os.sep) >= depth - 1:
                dirnames[:] = []
            dirnames[:] = [d for d in dirnames if not d.startswith(".") and d not in ("node_modules", ".venv")]
            for f in filenames:
                if f.lower().endswith(".zip") and not f.startswith("qam-rail-diagnostico"):
                    p = os.path.join(dirpath, f)
                    try:
                        found.append((os.path.getmtime(p), p))
                    except OSError:
                        pass
    out = []
    for mtime, p in sorted(found, reverse=True)[: limit * 2]:
        info = peek_zip(p)
        if info:
            out.append({"zip": p, "mtime": mtime, "size": os.path.getsize(p), "id": info["id"], "name": info["name"], "version": info.get("version")})
        if len(out) >= limit:
            break
    return out
