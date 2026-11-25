#!/usr/bin/env python3
"""Canario: comprueba que siguen existiendo las piezas internas de Steam de las que depende QAM Rail (útil tras actualizar Steam/Decky).
Solo biblioteca estándar; no cambia nada (salvo con --abrir). Usa la CEF de Steam en 127.0.0.1:8080.
Uso:  python3 scripts/canario.py [--abrir]
Comprueba: páginas CEF («Steam Big Picture Mode», «SharedJSContext»), SteamUIStore/MenuStore y sus funciones de abrir menú, SteamClient,
que el plugin esté cargado (window.__qamRail), que haya foco de mando (.gpfocus), el tamaño de la ventana y la versión de Chromium (avisa si cambió
desde la última vez; el historial se guarda en ~/qam-canario.json).
--abrir  además abre y cierra el panel por código (bp_nav.py) y comprueba que respondió: mueve la interfaz, no lo uses con un juego en primer plano.
Código de salida 1 si algo FALLA (los AVISOS no). Sin confirmar en la Ally hasta ejecutarlo."""
import importlib.util, json, sys, urllib.request
from pathlib import Path

HOST, PORT = "127.0.0.1", 8080
HISTORIAL = Path.home() / "qam-canario.json"
OK, AVISO, FALLA = "OK", "AVISO", "FALLA"

JS_STEAM = """(()=>{const s=window.SteamUIStore;const w=s&&s.GetFocusedWindowInstance&&s.GetFocusedWindowInstance();const ms=w&&w.MenuStore;
return JSON.stringify({steamUIStore:typeof s,getFocused:typeof(s&&s.GetFocusedWindowInstance),menuStore:typeof ms,
open:typeof(ms&&ms.OpenQuickAccessMenu),side:typeof(ms&&ms.OpenSideMenu),toggle:typeof(ms&&ms.ToggleSideMenu),
steamClient:typeof window.SteamClient,qamRail:typeof window.__qamRail})})()"""
JS_PANTALLA = "JSON.stringify({gpfocus:document.querySelectorAll('.gpfocus').length,ancho:innerWidth,alto:innerHeight})"


def juzgar(h: dict, previo: dict | None = None) -> list[tuple[str, str, str]]:
    """Convierte los hechos recogidos en (comprobación, estado, detalle). Función pura (probada en tests/py/test_canario.py)."""
    r: list[tuple[str, str, str]] = []
    faltan = [t for t in ("Steam Big Picture Mode", "SharedJSContext") if t not in h.get("paginas", [])]
    r.append(("páginas CEF", FALLA if faltan else OK, f"faltan: {', '.join(faltan)}" if faltan else "Big Picture y SharedJSContext presentes"))
    s = h.get("steam") or {}
    r.append(("SteamUIStore", OK if s.get("steamUIStore") == "object" and s.get("getFocused") == "function" else FALLA,
              f"store={s.get('steamUIStore')} GetFocusedWindowInstance={s.get('getFocused')}"))
    ms = s.get("menuStore") == "object"
    fns = {n: s.get(k) == "function" for n, k in (("OpenQuickAccessMenu", "open"), ("OpenSideMenu", "side"), ("ToggleSideMenu", "toggle"))}
    estado = FALLA if not ms or not any(fns.values()) else (AVISO if not all(fns.values()) else OK)
    r.append(("MenuStore (abrir menú)", estado, ("sin MenuStore" if not ms else ", ".join(f"{n}={'sí' if v else 'NO'}" for n, v in fns.items()))))
    r.append(("SteamClient", OK if s.get("steamClient") == "object" else AVISO, f"typeof={s.get('steamClient')}"))
    r.append(("plugin cargado (__qamRail)", OK if s.get("qamRail") == "object" else AVISO,
              "sí" if s.get("qamRail") == "object" else "no visible: ¿plugin parado, otro canal o recién reiniciado?"))
    p = h.get("pantalla") or {}
    r.append(("foco de mando (.gpfocus)", OK if p.get("gpfocus", 0) >= 1 else AVISO,
              f"{p.get('gpfocus', 0)} elementos" + ("" if p.get("gpfocus", 0) >= 1 else " (puede ser normal si nada está enfocado)")))
    r.append(("tamaño de la ventana", OK if (p.get("ancho"), p.get("alto")) == (1920, 1080) else AVISO, f"{p.get('ancho')}x{p.get('alto')}"))
    nuevo, viejo = h.get("chromium"), (previo or {}).get("chromium")
    if viejo and nuevo and viejo != nuevo:
        r.append(("versión de Chromium", AVISO, f"cambió de {viejo} a {nuevo}: repite capturas y la autoprueba"))
    else:
        r.append(("versión de Chromium", OK, str(nuevo or "desconocida")))
    if "abrir" in h:
        r.append(("abrir/cerrar el panel", OK if h["abrir"] else FALLA, "respondió" if h["abrir"] else "no abrió o no cerró (ver bp_nav.py qam)"))
    return r


def _cargar(archivo: str):
    spec = importlib.util.spec_from_file_location(archivo.replace("-", "_"), Path(__file__).with_name(archivo + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def recoger(con_abrir: bool) -> dict:
    WS = _cargar("steam-cpu").WS
    paginas = json.load(urllib.request.urlopen(f"http://{HOST}:{PORT}/json/list", timeout=5))
    h: dict = {"paginas": [p.get("title") for p in paginas]}
    try:
        h["chromium"] = json.load(urllib.request.urlopen(f"http://{HOST}:{PORT}/json/version", timeout=5)).get("Browser")
    except (OSError, ValueError):
        h["chromium"] = None

    def evaluar(titulo: str, expr: str):
        for p in paginas:
            if p.get("webSocketDebuggerUrl") and titulo.lower() in (p.get("title") or "").lower():
                ws = WS(p["webSocketDebuggerUrl"])
                v = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True}).get("result", {}).get("value")
                ws.s.close()
                return json.loads(v) if v else None
        return None

    try:
        h["steam"] = evaluar("SharedJSContext", JS_STEAM)
        h["pantalla"] = evaluar("Big Picture", JS_PANTALLA)
    except OSError as e:
        print(f"(error CDP: {e})")
    if con_abrir:
        bp = _cargar("bp_nav")
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            bp.cmd_qam(WS, "abrir")
            abierto = "→ OK" in buf.getvalue()
            bp.cmd_qam(WS, "cerrar")
        h["abrir"] = abierto and buf.getvalue().count("→ OK") == 2
    return h


def main() -> int:
    try:
        h = recoger("--abrir" in sys.argv)
    except OSError as e:
        print(f"FALLA  no hay depuración CEF en {HOST}:{PORT}: {e}")
        return 1
    previo = json.loads(HISTORIAL.read_text()) if HISTORIAL.exists() else None
    res = juzgar(h, previo)
    for n, e, d in res:
        print(f"{e:5} {n:28} {d}")
    try:
        HISTORIAL.write_text(json.dumps({"chromium": h.get("chromium")}))
    except OSError:
        pass
    malas = [n for n, e, _ in res if e == FALLA]
    print("\n" + (f"{len(malas)} comprobación(es) FALLAN: {', '.join(malas)}" if malas else "Sin fallos (revisa los AVISOS)."))
    return 1 if malas else 0


if __name__ == "__main__":
    sys.exit(main())
