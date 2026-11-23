"""Actualizaciones de apps de QAM desde GitHub Releases (0.51). Sin dependencias de Decky; la red se inyecta (`fetch`).

Reglas (APPS-ESTANDAR.md): solo consulta con el panel abierto y como mucho cada 6 h (ETag: un 304 no gasta cuota),
solo HTTPS a hosts de GitHub, el .zip se verifica con SHA256SUMS, nada se instala solo: se avisa y se instala al confirmar.
"""
import fnmatch
import json
import re
import time
from urllib.parse import urlparse

import qam_apps
import qam_pipeline

MIN_INTERVAL = 6 * 3600
MAX_DOWNLOAD = 600 * 1024 ** 2
API_HOST = "api.github.com"
DOWNLOAD_HOSTS = ("github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com")
SUMS_NAMES = ("SHA256SUMS", "SHA256SUMS.txt", "sha256sums.txt")


def https_ok(url: str, hosts=DOWNLOAD_HOSTS + (API_HOST,)) -> bool:
    try:
        u = urlparse(url)
    except ValueError:
        return False
    return u.scheme == "https" and (u.hostname or "") in hosts and not u.username


def releases_url(repo: str) -> str:
    if not qam_apps.REPO_RE.match(repo or ""):
        raise ValueError("repo no válido")
    return f"https://{API_HOST}/repos/{repo}/releases?per_page=15"


def pick_release(releases, channel: str = "stable"):
    """La release más nueva permitida por el canal (la API las da de más nueva a más vieja). Borradores nunca."""
    best = None
    for r in releases or []:
        if not isinstance(r, dict) or r.get("draft"):
            continue
        if channel != "beta" and r.get("prerelease"):
            continue
        v = release_version(r)
        if not v:
            continue
        if best is None or qam_pipeline.compare_versions(v, release_version(best)) > 0:
            best = r
    return best


def release_version(rel) -> str:
    return re.sub(r"^[vV]", "", str((rel or {}).get("tag_name") or "")).strip()


def pick_assets(rel, pattern: str = "*.zip"):
    """(zip, sumas): el primer asset que casa con el patrón (sin «src») y el archivo de sumas, si lo hay."""
    assets = [a for a in (rel or {}).get("assets") or [] if isinstance(a, dict) and a.get("name") and a.get("browser_download_url")]
    zips = [a for a in assets if fnmatch.fnmatch(a["name"], pattern or "*.zip") and "-src-" not in a["name"]]
    sums = next((a for a in assets if a["name"] in SUMS_NAMES), None)
    return (zips[0] if zips else None), sums


def check_app(app: dict, cache: dict, fetch, now: float | None = None, force: bool = False) -> dict:
    """Consulta una app. `cache` = {etag, releases, checked_at} (se actualiza). `fetch(url, etag)` → (status, etag, body_text).
    Devuelve {state: current|update|none|error, current, latest, url, sums_url, size, notes, channel}."""
    now = time.time() if now is None else now
    cfg = app.get("update") or {}
    channel = "beta" if cfg.get("channel") == "beta" else "stable"
    out = {"state": "none", "current": app.get("version"), "channel": channel}
    if cfg.get("provider") != "github-release":
        return out
    try:
        url = releases_url(str(cfg.get("repo")))
        fresh = cache.get("releases") is not None and now - float(cache.get("checked_at") or 0) < MIN_INTERVAL
        if force or not fresh:
            status, etag, body = fetch(url, cache.get("etag") if cache.get("releases") is not None else None)
            if status == 304 and cache.get("releases") is not None:
                cache["checked_at"] = now
            elif status == 200:
                data = json.loads(body)
                if not isinstance(data, list):
                    raise ValueError("respuesta inesperada de GitHub")
                cache.update({"etag": etag, "releases": data, "checked_at": now})
            else:
                raise ValueError(f"GitHub respondió {status}")
        rel = pick_release(cache.get("releases"), channel)
        if rel is None:
            return {**out, "state": "current", "latest": app.get("version")}
        latest = release_version(rel)
        zip_a, sums_a = pick_assets(rel, str(cfg.get("asset") or "*.zip"))
        out.update(latest=latest, notes=str(rel.get("body") or "")[:600], prerelease=bool(rel.get("prerelease")))
        if qam_pipeline.compare_versions(latest, app.get("version")) <= 0:
            return {**out, "state": "current"}
        if not zip_a or not https_ok(zip_a["browser_download_url"]):
            return {**out, "state": "error", "error": "la release no trae un .zip descargable"}
        out.update(state="update", url=zip_a["browser_download_url"], name=zip_a["name"], size=zip_a.get("size"),
                   sums_url=(sums_a or {}).get("browser_download_url") if sums_a and https_ok(sums_a["browser_download_url"]) else None)
        return out
    except Exception as e:  # noqa: BLE001
        return {**out, "state": "error", "error": str(e)[:160]}


def download(url: str, dest: str, opener, limit: int = MAX_DOWNLOAD) -> int:
    """Descarga a `dest` con tope de tamaño. `opener(url)` → objeto con .read(n) y .headers (inyectable). Devuelve bytes."""
    if not https_ok(url):
        raise ValueError("enlace no permitido")
    total = 0
    with opener(url) as r, open(dest, "wb") as fh:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            total += len(chunk)
            if total > limit:
                raise ValueError("la descarga supera el tamaño máximo")
            fh.write(chunk)
    return total
