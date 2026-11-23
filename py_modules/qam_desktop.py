"""Descubrimiento de apps de escritorio para la pestaña «Steam» de Apps (0.52 a; diseño en APPS-STEAM.md).
Solo LEE archivos .desktop y cabeceras de AppImage: nunca ejecuta nada. Sin dependencias de Decky."""
import hashlib
import os
import re
import shlex

GROUPS = [
    ("Navegadores", ("WebBrowser",)),
    ("Multimedia", ("AudioVideo", "Audio", "Video", "Player")),
    ("Juegos y emuladores", ("Game", "Emulator")),
    ("Oficina", ("Office",)),
    ("Desarrollo", ("Development",)),
    ("Herramientas", ("Utility", "System", "Settings", "Network")),
]
OTHER = "Otras"
# Cosas que no tienen sentido (o son peligrosas) lanzadas desde la pantalla de juego.
EXCLUDE_ID = re.compile(r"^(steam|valve\.steam|com\.valvesoftware\.steam|qam-?rail|decky|.*decky.*loader|return-?to-?gaming-?mode|steamos-.*|org\.kde\.discover.*)$", re.I)
EXCLUDE_NAME = re.compile(r"(volver al modo|return to gaming|instalar steamos|install steamos|decky|qam rail|^steam$)", re.I)
FLATPAK_DIRS = ("/var/lib/flatpak/exports/share/applications", "~/.local/share/flatpak/exports/share/applications")
SYSTEM_DIRS = ("/usr/share/applications", "~/.local/share/applications")
APPIMAGE_DIRS = ("~/AppImages", "~/Applications")   # [H] la de Gear Lever por defecto es ~/AppImages
BAD_EXEC = re.compile(r"[;&|<>`$()]")
MAX_DESKTOP_BYTES = 64 * 1024


def parse_desktop(text: str) -> dict:
    """Claves de [Desktop Entry] (sin traducciones: «Name[es]» se ignora)."""
    out, inside = {}, False
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("["):
            inside = line == "[Desktop Entry]"
            continue
        if inside and "=" in line:
            k, v = line.split("=", 1)
            k = k.strip()
            if "[" not in k and k not in out:
                out[k] = v.strip()
    return out


def clean_exec(exec_line: str):
    """Exec → lista de argumentos sin códigos %U %f… Devuelve None si trae operadores de shell (no se lanza)."""
    s = (exec_line or "").strip()
    if not s:
        return None
    try:
        parts = shlex.split(s.replace("%%", "\0"))
    except ValueError:
        return None
    argv = []
    for p in parts:
        if re.fullmatch(r"%[fFuUdDnNickvm]", p):
            continue
        p = re.sub(r"%[fFuUdDnNickvm]", "", p).replace("\0", "%")
        if p:
            argv.append(p)
    if not argv or any(BAD_EXEC.search(a) for a in argv):
        return None
    return argv


def group_of(categories: str) -> str:
    cats = {c for c in (categories or "").split(";") if c}
    for name, keys in GROUPS:
        if cats & set(keys):
            return name
    return OTHER


def is_appimage(path: str) -> bool:
    """ELF con la marca «AI\\x02» (tipo 2) o «AI\\x01» (tipo 1) en el offset 8."""
    try:
        with open(path, "rb") as fh:
            head = fh.read(12)
    except OSError:
        return False
    return len(head) >= 11 and head[:4] == b"\x7fELF" and head[8:10] == b"AI" and head[10] in (1, 2)


def _flatpak_id(argv):
    if len(argv) >= 3 and os.path.basename(argv[0]) == "flatpak" and argv[1] == "run":
        ids = [a for a in argv[2:] if not a.startswith("-") and "." in a]
        return ids[0] if ids else None
    return None


def entry_from_desktop(path: str, text: str, home: str | None = None):
    """Un .desktop → ficha o (None, motivo). No hace E/S salvo comprobar si el destino es un AppImage."""
    d = parse_desktop(text)
    base = os.path.splitext(os.path.basename(path))[0]
    if d.get("Type", "Application") != "Application":
        return None, "no es una aplicación"
    if d.get("NoDisplay", "").lower() == "true" or d.get("Hidden", "").lower() == "true":
        return None, "oculta"
    if d.get("Terminal", "").lower() == "true":
        return None, "necesita terminal"
    only, notin = [x for x in d.get("OnlyShowIn", "").split(";") if x], [x for x in d.get("NotShowIn", "").split(";") if x]
    if only and "KDE" not in only:
        return None, "solo para otro escritorio"
    if "KDE" in notin:
        return None, "no para KDE"
    name = d.get("Name", "").strip()
    argv = clean_exec(d.get("Exec", ""))
    if not name or argv is None:
        return None, "sin nombre o con Exec no permitido"
    fid = _flatpak_id(argv)
    if EXCLUDE_ID.match(fid or base) or EXCLUDE_NAME.search(name):
        return None, "excluida"
    target = argv[0].replace("~", home, 1) if (home and argv[0].startswith("~")) else argv[0]
    if fid:
        source, key = "flatpak", fid
    elif os.path.isabs(target) and (target.lower().endswith(".appimage") or is_appimage(target)):
        source, key = "appimage", "ai-" + hashlib.sha1(target.encode()).hexdigest()[:12]
        argv = [target] + argv[1:]
    else:
        source, key = "system", base
    return {"key": key, "name": name, "source": source, "exec": argv, "icon": d.get("Icon") or None,
            "group": group_of(d.get("Categories", "")), "desktop": path}, None


def entry_from_appimage(path: str):
    """AppImage suelto (sin .desktop): nombre = archivo sin extensión ni versión."""
    name = re.sub(r"[-_.](x86_64|amd64|aarch64|linux)\b.*$", "", os.path.splitext(os.path.basename(path))[0], flags=re.I)
    name = re.sub(r"[-_]v?\d+(\.\d+)+.*$", "", name).replace("_", " ").replace("-", " ").strip() or os.path.basename(path)
    return {"key": "ai-" + hashlib.sha1(path.encode()).hexdigest()[:12], "name": name, "source": "appimage", "exec": [path],
            "icon": None, "group": OTHER, "desktop": None}


def scan(home: str, extra_appimage_dirs=(), read=None, listdir=None, isfile=None, dirs=None):
    """Recorre las carpetas y devuelve {"apps": [...], "omitidas": n, "motivos": {motivo: n}}.
    `read/listdir/isfile/dirs` se pueden inyectar (pruebas). Prioridad: Flatpak > carpeta del usuario > sistema."""
    read = read or _read
    listdir = listdir or (lambda p: sorted(os.listdir(p)) if os.path.isdir(p) else [])
    isfile = isfile or os.path.isfile
    ex = lambda p: p.replace("~", home, 1) if p.startswith("~") else p
    found, motivos, omitidas = {}, {}, 0

    def add(e):
        cur = found.get(e["key"])
        if cur is None or (e["source"] == "flatpak" and cur["source"] != "flatpak"):
            found[e["key"]] = e

    for folder in [ex(p) for p in (FLATPAK_DIRS + SYSTEM_DIRS if dirs is None else dirs)]:
        for fn in listdir(folder):
            if not fn.endswith(".desktop"):
                continue
            path = os.path.join(folder, fn)
            text = read(path)
            if text is None:
                omitidas += 1; motivos["ilegible"] = motivos.get("ilegible", 0) + 1
                continue
            e, why = entry_from_desktop(path, text, home)
            if e:
                add(e)
            elif why not in ("oculta", "excluida", "necesita terminal", "no es una aplicación", "solo para otro escritorio", "no para KDE"):
                omitidas += 1; motivos[why] = motivos.get(why, 0) + 1
    known = {tuple(e["exec"][:1]) for e in found.values() if e["source"] == "appimage"}
    for folder in [ex(p) for p in APPIMAGE_DIRS] + [ex(p) for p in extra_appimage_dirs]:
        for fn in listdir(folder):
            path = os.path.join(folder, fn)
            if isfile(path) and (fn.lower().endswith(".appimage") or is_appimage(path)) and (path,) not in known:
                add(entry_from_appimage(path)); known.add((path,))
    # Mismo nombre (p. ej. Firefox de Flatpak y el del sistema): se queda el de mayor prioridad.
    rank = {"flatpak": 0, "appimage": 1, "system": 2}
    best = {}
    for e in found.values():
        k = e["name"].strip().lower()
        if k not in best or rank[e["source"]] < rank[best[k]["source"]]:
            best[k] = e
    apps = sorted(best.values(), key=lambda e: (e["group"] == OTHER, e["group"], e["name"].lower()))
    return {"apps": apps, "omitidas": omitidas, "motivos": motivos}


def _read(path: str):
    try:
        with open(path, "rb") as fh:
            return fh.read(MAX_DESKTOP_BYTES).decode("utf-8")
    except (OSError, UnicodeDecodeError):
        return None
