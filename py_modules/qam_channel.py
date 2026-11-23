"""Canales de QAM Rail (0.53): dos plugins de Decky a la vez, «qam-rail» (estable, se actualiza por GitHub) y
«qam-rail-dev» (desarrollo, se actualiza con zips y install.sh --dev). Solo uno dibuja el QAM.
Aquí solo hay archivos (sin Decky): quién está activo, el interruptor y la red de seguridad de arranques fallidos.

Carpeta compartida: <homebrew>/settings/qam-rail-canal/
    activo     «estable» o «dev» (lo escriben canal.sh, install.sh --dev y el propio QAM)
    aviso      una línea para mostrar una vez (p. ej. «dev falló 2 veces: volví a estable»)
Contador de arranques sin confirmar: <settings de dev>/arranques-sin-confirmar
"""
import os

STABLE_DIR = "qam-rail"
DEV_DIR = "qam-rail-dev"
MAX_FAILS = 2  # arranques de dev sin confirmar seguidos que se toleran antes de volver a estable


def kind_of(plugin_dir: str) -> str:
    """«dev» si la carpeta del plugin es qam-rail-dev; cualquier otra cosa es la estable."""
    return "dev" if os.path.basename((plugin_dir or "").rstrip(os.sep)) == DEV_DIR else "stable"


def state_dir(settings_dir: str) -> str:
    """Carpeta compartida junto a las de ajustes de cada plugin (settings/qam-rail-canal)."""
    return os.path.join(os.path.dirname((settings_dir or "").rstrip(os.sep)), "qam-rail-canal")


def installed(plugins_dir: str, kind: str) -> bool:
    d = DEV_DIR if kind == "dev" else STABLE_DIR
    return os.path.isfile(os.path.join(plugins_dir, d, "plugin.json"))


def read_flag(sdir: str) -> str | None:
    try:
        with open(os.path.join(sdir, "activo"), encoding="utf-8") as fh:
            v = fh.read().strip().lower()
    except OSError:
        return None
    return {"estable": "stable", "stable": "stable", "dev": "dev"}.get(v)


def write_flag(sdir: str, target: str) -> None:
    os.makedirs(sdir, exist_ok=True)
    tmp = os.path.join(sdir, "activo.tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write("dev" if target == "dev" else "estable")
    os.replace(tmp, os.path.join(sdir, "activo"))
    try:
        os.chmod(os.path.join(sdir, "activo"), 0o666)  # el plugin corre como root; el usuario debe poder cambiarlo desde la terminal
        os.chmod(sdir, 0o777)
    except OSError:
        pass


def active(sdir: str, plugins_dir: str) -> str:
    """Quién dibuja el QAM. Con dev instalado manda dev (salvo que se haya pedido la estable); sin la pedida, la otra."""
    dev, stable = installed(plugins_dir, "dev"), installed(plugins_dir, "stable")
    want = read_flag(sdir) or ("dev" if dev else "stable")
    if want == "dev" and not dev:
        want = "stable"
    if want == "stable" and not stable and dev:
        want = "dev"
    return want


def _counter_path(dev_settings_dir: str) -> str:
    return os.path.join(dev_settings_dir, "arranques-sin-confirmar")


def _read_count(dev_settings_dir: str) -> int:
    try:
        with open(_counter_path(dev_settings_dir), encoding="utf-8") as fh:
            return max(0, int(fh.read().strip() or 0))
    except (OSError, ValueError):
        return 0


def _write_count(dev_settings_dir: str, n: int) -> None:
    os.makedirs(dev_settings_dir, exist_ok=True)
    with open(_counter_path(dev_settings_dir), "w", encoding="utf-8") as fh:
        fh.write(str(n))


def boot_guard(dev_settings_dir: str, sdir: str, plugins_dir: str, version: str | None = None) -> bool:
    """Se llama al arrancar el backend de dev SOLO si dev es el activo. Cuenta el arranque; si ya hubo MAX_FAILS sin confirmar,
    vuelve a la estable (si existe) y deja un aviso. Devuelve True si hizo la vuelta.
    Una versión distinta de la última vista empieza de cero: los fallos de la versión anterior no cuentan contra la nueva."""
    if version is not None:
        vp = os.path.join(dev_settings_dir, "ultima-version")
        try:
            with open(vp, encoding="utf-8") as fh:
                seen = fh.read().strip()
        except OSError:
            seen = None
        if seen != version:
            os.makedirs(dev_settings_dir, exist_ok=True)
            with open(vp, "w", encoding="utf-8") as fh:
                fh.write(version)
            _write_count(dev_settings_dir, 0)
    n = _read_count(dev_settings_dir)
    if n >= MAX_FAILS and installed(plugins_dir, "stable"):
        write_flag(sdir, "stable")
        _write_count(dev_settings_dir, 0)
        set_notice(sdir, f"La versión dev no llegó a arrancar bien {n} veces seguidas: volví a la estable.")
        return True
    _write_count(dev_settings_dir, n + 1)
    return False


def confirm(dev_settings_dir: str) -> None:
    """El panel de dev llegó a montarse y aguantó unos segundos: el arranque cuenta como bueno."""
    if _read_count(dev_settings_dir):
        _write_count(dev_settings_dir, 0)


def set_notice(sdir: str, text: str) -> None:
    try:
        os.makedirs(sdir, exist_ok=True)
        with open(os.path.join(sdir, "aviso"), "w", encoding="utf-8") as fh:
            fh.write(text.strip()[:200])
    except OSError:
        pass


def take_notice(sdir: str) -> str | None:
    """Lee el aviso y lo borra (se muestra una sola vez)."""
    p = os.path.join(sdir, "aviso")
    try:
        with open(p, encoding="utf-8") as fh:
            t = fh.read().strip()
        os.remove(p)
        return t or None
    except OSError:
        return None


def switch(sdir: str, plugins_dir: str, target: str) -> dict:
    """Pone el canal activo. Rechaza si ese canal no está instalado."""
    target = "dev" if target == "dev" else "stable"
    if not installed(plugins_dir, target):
        return {"ok": False, "error": "esa versión no está instalada en este equipo"}
    write_flag(sdir, target)
    return {"ok": True, "active": target}
