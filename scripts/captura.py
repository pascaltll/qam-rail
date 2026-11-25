#!/usr/bin/env python3
"""Captura lo que se ve de la interfaz de Steam (y, si hay herramienta, de la pantalla X) para poder mirar el diseño de verdad.
Solo biblioteca estándar. Usa la depuración CEF de Steam (127.0.0.1:8080), igual que steam-cpu.py.
Uso:  python3 ~/homebrew/plugins/qam-rail-dev/captura.py [filtro] [--x]
  filtro  texto que debe aparecer en el título de la página (p. ej. QuickAccess). Sin filtro: las páginas con interfaz visible.
  --x     además intenta una captura de la pantalla X :0 (ImageMagick `import` o `xwd`, si están instalados; sin confirmar en gamescope).
Guarda PNG en ~/qam-capturas/ (se conservan las últimas 40) e imprime las rutas. Puede mostrar lo que hay en pantalla: no la envíes fuera sin mirarla.
No cambia nada en Steam."""
import base64, importlib.util, json, os, re, shutil, subprocess, sys, time, urllib.request
from pathlib import Path

HOST, PORT = "127.0.0.1", 8080
OUT = Path.home() / "qam-capturas"
KEEP = 40
SIN_INTERFAZ = ("SharedJSContext",)  # contexto sin pantalla: no tiene nada que mostrar


def _ws_class():
    spec = importlib.util.spec_from_file_location("steam_cpu", Path(__file__).with_name("steam-cpu.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.WS


def slug(texto: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", texto or "pagina").strip("-")
    return (s or "pagina")[:40]


def elegir(paginas: list[dict], filtro: str = "") -> list[dict]:
    """Páginas con websocket que valen la pena capturar; con filtro, solo las que lo contienen en el título."""
    out = []
    for p in paginas:
        titulo = p.get("title") or ""
        if not p.get("webSocketDebuggerUrl") or titulo in SIN_INTERFAZ:
            continue
        if filtro and filtro.lower() not in titulo.lower():
            continue
        out.append(p)
    return out


def podar(carpeta: Path, mantener: int = KEEP) -> None:
    archivos = sorted(carpeta.glob("*.png"), key=lambda f: f.stat().st_mtime)
    for f in archivos[:-mantener] if mantener else archivos:
        try:
            f.unlink()
        except OSError:
            pass


def captura_x(destino: Path) -> str | None:
    env = dict(os.environ, DISPLAY=os.environ.get("DISPLAY", ":0"))
    try:
        if shutil.which("import"):
            subprocess.run(["import", "-window", "root", str(destino)], env=env, check=True, timeout=15, capture_output=True)
            return str(destino)
        if shutil.which("xwd") and shutil.which("convert"):
            xwd = subprocess.run(["xwd", "-root", "-silent"], env=env, check=True, timeout=15, capture_output=True).stdout
            subprocess.run(["convert", "xwd:-", str(destino)], input=xwd, check=True, timeout=15, capture_output=True)
            return str(destino)
    except (subprocess.SubprocessError, OSError) as e:
        print(f"(captura de la pantalla X falló: {e})")
        return None
    print("(no hay `import` de ImageMagick ni `xwd`+`convert`: sin captura de la pantalla X)")
    return None


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    filtro = args[0] if args else ""
    OUT.mkdir(parents=True, exist_ok=True)
    marca = time.strftime("%Y%m%d-%H%M%S")
    paginas = json.load(urllib.request.urlopen(f"http://{HOST}:{PORT}/json/list", timeout=5))
    WS = _ws_class()
    hechas = []
    for p in elegir(paginas, filtro):
        titulo = p.get("title") or p.get("url", "")[:30]
        try:
            ws = WS(p["webSocketDebuggerUrl"])
            r = ws.call("Page.captureScreenshot", {"format": "png"})
            ws.s.close()
            datos = r.get("data")
            if not datos:
                print(f"(sin imagen de {titulo!r})")
                continue
            ruta = OUT / f"{marca}-{slug(titulo)}.png"
            ruta.write_bytes(base64.b64decode(datos))
            hechas.append(str(ruta))
        except OSError as e:
            print(f"(no se pudo capturar {titulo!r}: {e})")
    if "--x" in sys.argv:
        ruta = captura_x(OUT / f"{marca}-pantalla-X.png")
        if ruta:
            hechas.append(ruta)
    podar(OUT)
    print("\n".join(hechas) if hechas else "No se capturó nada (¿Steam está en marcha con la depuración en :8080?)")


if __name__ == "__main__":
    main()
