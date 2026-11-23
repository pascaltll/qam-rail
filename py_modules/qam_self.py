"""Auto-actualización de QAM Rail (0.52): preparar la release descargada, copia de seguridad, cambio de carpeta y vuelta atrás.
Solo archivos (sin Decky ni red): la descarga y la verificación SHA-256 las hace qam_updates; el reinicio, main.py."""
import os
import shutil
import time
import zipfile

import qam_pipeline

PLUGIN_DIRNAME = "qam-rail"


def stage(zip_path: str, work: str, expected_version: str | None) -> str:
    """Descomprime en `work` (con los límites de la tubería) y comprueba que es QAM Rail. Devuelve la carpeta del plugin."""
    os.makedirs(work, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        qam_pipeline._safe_extract(zf, work)
    tops = [d for d in os.listdir(work) if os.path.isdir(os.path.join(work, d))]
    if tops != [PLUGIN_DIRNAME]:
        raise ValueError("el zip debe traer una sola carpeta «qam-rail»")
    root = os.path.join(work, PLUGIN_DIRNAME)
    for need in ("plugin.json", "package.json", "main.py", os.path.join("dist", "index.js")):
        if not os.path.isfile(os.path.join(root, need)):
            raise ValueError(f"falta {need} en la release")
    ver = read_version(root)
    if expected_version and qam_pipeline.compare_versions(ver, expected_version) != 0:
        raise ValueError(f"el zip trae la versión {ver}, no la {expected_version}")
    return root


def read_version(plugin_dir: str) -> str:
    import json
    try:
        with open(os.path.join(plugin_dir, "package.json"), encoding="utf-8") as fh:
            return str(json.load(fh).get("version") or "?")
    except (OSError, ValueError):
        return "?"


def backups(backup_root: str):
    """Copias de seguridad, la más nueva primero: [(ruta, versión, ts)]."""
    out = []
    if os.path.isdir(backup_root):
        for n in os.listdir(backup_root):
            p = os.path.join(backup_root, n)
            if os.path.isdir(p) and n.startswith(PLUGIN_DIRNAME + "-"):
                out.append((p, read_version(p), os.path.getmtime(p)))
    return sorted(out, key=lambda x: x[2], reverse=True)


def swap(plugin_dir: str, new_root: str, backup_root: str, keep: int = 3) -> dict:
    """Guarda la versión instalada en `backup_root` y pone `new_root` en su lugar (renombrados: el hueco es mínimo).
    Si algo falla al poner la nueva, se deja la anterior como estaba."""
    old_ver = read_version(plugin_dir)
    os.makedirs(backup_root, exist_ok=True)
    bak = os.path.join(backup_root, f"{PLUGIN_DIRNAME}-{old_ver}-{time.strftime('%Y%m%d-%H%M%S')}")
    shutil.copytree(plugin_dir, bak, symlinks=True)
    parent = os.path.dirname(plugin_dir.rstrip(os.sep))
    incoming = os.path.join(parent, ".qam-rail.nuevo")
    outgoing = os.path.join(parent, ".qam-rail.viejo")
    shutil.rmtree(incoming, ignore_errors=True)
    shutil.rmtree(outgoing, ignore_errors=True)
    shutil.copytree(new_root, incoming, symlinks=True)           # mismo sistema de archivos que plugin_dir → renombrado atómico
    os.rename(plugin_dir, outgoing)
    try:
        os.rename(incoming, plugin_dir)
    except OSError:
        os.rename(outgoing, plugin_dir)                          # vuelta atrás inmediata
        raise
    shutil.rmtree(outgoing, ignore_errors=True)
    for p, _, _ in backups(backup_root)[keep:]:
        shutil.rmtree(p, ignore_errors=True)
    return {"from": old_ver, "to": read_version(plugin_dir), "backup": bak}


def restore(plugin_dir: str, backup_root: str) -> dict:
    """Vuelve a la copia más reciente (la versión actual no se guarda: es la que falla)."""
    bl = backups(backup_root)
    if not bl:
        raise ValueError("no hay copias de seguridad")
    path, ver, _ = bl[0]
    cur = read_version(plugin_dir)
    parent = os.path.dirname(plugin_dir.rstrip(os.sep))
    incoming = os.path.join(parent, ".qam-rail.nuevo")
    outgoing = os.path.join(parent, ".qam-rail.viejo")
    shutil.rmtree(incoming, ignore_errors=True)
    shutil.rmtree(outgoing, ignore_errors=True)
    shutil.copytree(path, incoming, symlinks=True)
    os.rename(plugin_dir, outgoing)
    os.rename(incoming, plugin_dir)
    shutil.rmtree(outgoing, ignore_errors=True)
    shutil.rmtree(path, ignore_errors=True)                      # esa copia ya está puesta
    return {"from": cur, "to": ver}
