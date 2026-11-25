#!/usr/bin/env python3
"""Navegar y probar Steam Big Picture por la depuración CEF (127.0.0.1:8080), sin tocar la pantalla. Solo biblioteca estándar.
Uso:  python3 scripts/bp_nav.py <orden>
  paginas            páginas CEF y si Steam ofrece el endpoint de navegador completo (/json/version): dice si Playwright/DevTools MCP pueden conectarse.
  foco               qué elemento tiene ahora el foco del mando (clase .gpfocus de Steam): etiqueta, tamaño y posición.
  qam estado|abrir|cerrar   abre o cierra el panel de QAM Rail por código y comprueba el resultado (sin confirmar que abra igual que el botón físico).
  teclas             comprueba si las flechas del teclado, enviadas por CDP, mueven el foco (de ello depende `grafo`).
  grafo [--pasos=60] explora el foco con las flechas, construye el grafo (nodo = elemento enfocado, arista = flecha → destino, con su retraso en ms),
                     y avisa de: nodos sin salida, aristas sin vuelta y retrasos grandes. Guarda JSON en ~/qam-grafo/.
No cambia ajustes de Steam. `grafo` mueve el foco de la interfaz: déjala quieta mientras corre. Las etiquetas pueden contener texto de la pantalla
(nombres de amigos, apps): el JSON queda en tu equipo; no lo envíes fuera sin mirarlo. Nada de esto está probado aún en la Ally: cada orden dice qué comprobó."""
import importlib.util, json, sys, time, urllib.request
from collections import deque
from pathlib import Path

HOST, PORT = "127.0.0.1", 8080
SALIDA = Path.home() / "qam-grafo"
DIRS = ("Up", "Right", "Down", "Left")
OPUESTA = {"Up": "Down", "Down": "Up", "Left": "Right", "Right": "Left"}
TECLA = {"Up": ("ArrowUp", 38), "Down": ("ArrowDown", 40), "Left": ("ArrowLeft", 37), "Right": ("ArrowRight", 39),
         "Enter": ("Enter", 13), "Escape": ("Escape", 27)}
LAG_ALTO_MS = 300

JS_FOCO = """(()=>{const l=[...document.querySelectorAll('.gpfocus')];const e=l[l.length-1];if(!e)return null;
const r=e.getBoundingClientRect();const t=(e.innerText||e.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ').slice(0,40);
const c=[...e.classList].filter(x=>!/^gp/.test(x)).slice(0,3).join('.');
return JSON.stringify({tag:e.tagName,cls:c,t:t,x:Math.round(r.x/10),y:Math.round(r.y/10),w:Math.round(r.width/10),h:Math.round(r.height/10)})})()"""
JS_QAM_ABRIR = """(()=>{const w=window.SteamUIStore&&window.SteamUIStore.GetFocusedWindowInstance&&window.SteamUIStore.GetFocusedWindowInstance();
const ms=w&&w.MenuStore;if(!ms)return JSON.stringify({ok:false,motivo:'sin MenuStore'});
try{ms.OpenQuickAccessMenu();return JSON.stringify({ok:true,via:'OpenQuickAccessMenu'})}catch(e){return JSON.stringify({ok:false,motivo:String(e)})}})()"""
JS_QAM_CERRAR = """(()=>{try{if(window.__qamRailCloseModal){window.__qamRailCloseModal();return JSON.stringify({ok:true,via:'__qamRailCloseModal'})}
const n=window.DFL&&window.DFL.Navigation;if(n&&n.CloseSideMenus){n.CloseSideMenus();return JSON.stringify({ok:true,via:'CloseSideMenus'})}
return JSON.stringify({ok:false,motivo:'sin funcion para cerrar'})}catch(e){return JSON.stringify({ok:false,motivo:String(e)})}})()"""
JS_QAM_ESTADO = "typeof window.__qamRailUI==='object'?JSON.stringify({abierto:true,seccion:window.__qamRailUI.current()}):null"


# ───────────── lógica pura (con pruebas en tests/py/test_bp_nav.py) ─────────────
def firma(d: dict | None) -> str | None:
    """Identificador estable del elemento enfocado."""
    if not d:
        return None
    return f"{d.get('tag', '?')}|{d.get('cls', '')}|{d.get('t', '')}|{d.get('x')},{d.get('y')},{d.get('w')},{d.get('h')}"


class Grafo:
    def __init__(self) -> None:
        self.nodos: dict[str, dict] = {}
        self.aristas: dict[tuple[str, str], tuple[str | None, int]] = {}  # (nodo, flecha) -> (destino|None si no se mueve, ms)

    def probada(self, nodo: str, flecha: str) -> bool:
        return (nodo, flecha) in self.aristas


def decidir(g: Grafo, actual: str) -> tuple[str, str | None]:
    """('probar', flecha) si hay una flecha sin probar aquí; ('ir', flecha) para caminar hacia el nodo conocido más cercano con flechas
    sin probar; ('fin', None) si no queda nada por explorar."""
    for d in DIRS:
        if not g.probada(actual, d):
            return "probar", d
    visto = {actual: None}
    cola = deque([actual])
    while cola:
        n = cola.popleft()
        for d in DIRS:
            dest = g.aristas.get((n, d), (None, 0))[0]
            if dest is None or dest in visto:
                continue
            visto[dest] = (n, d)
            if any(not g.probada(dest, x) for x in DIRS):
                paso = (dest, visto[dest])
                while paso[1][0] != actual:  # retrocede hasta el primer paso desde `actual`
                    paso = (paso[1][0], visto[paso[1][0]])
                return "ir", paso[1][1]
            cola.append(dest)
    return "fin", None


def explorar(leer, mover, max_pasos: int, dormir=time.sleep) -> Grafo:
    """leer() -> id del nodo enfocado (o None). mover(flecha) -> (id nuevo, ms hasta que cambió el foco; 0 si no cambió)."""
    g = Grafo()
    actual = leer()
    for _ in range(max_pasos):
        if actual is None:
            break
        g.nodos.setdefault(actual, {})
        accion, d = decidir(g, actual)
        if accion == "fin":
            break
        nuevo, ms = mover(d)
        if accion == "probar":
            g.aristas[(actual, d)] = (None if nuevo in (None, actual) else nuevo, ms)
        if nuevo is not None:
            g.nodos.setdefault(nuevo, {})
        if nuevo is None:
            break
        actual = nuevo
    return g


def resumen(g: Grafo) -> dict:
    sin_salida, sin_vuelta, lentas = [], [], []
    for n in g.nodos:
        if all(g.probada(n, d) and g.aristas[(n, d)][0] is None for d in DIRS):
            sin_salida.append(n)
    for (n, d), (dest, ms) in g.aristas.items():
        if dest is None:
            continue
        if ms >= LAG_ALTO_MS:
            lentas.append((n, d, ms))
        vuelta = g.aristas.get((dest, OPUESTA[d]))
        if vuelta is not None and vuelta[0] != n:
            sin_vuelta.append((n, d, dest))
    return {"nodos": len(g.nodos), "aristas": sum(1 for v in g.aristas.values() if v[0] is not None),
            "sin_salida": sin_salida, "sin_vuelta": sin_vuelta, "lentas": lentas}


# ───────────── CDP ─────────────
def _ws_class():
    spec = importlib.util.spec_from_file_location("steam_cpu", Path(__file__).with_name("steam-cpu.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.WS


def paginas() -> list[dict]:
    return json.load(urllib.request.urlopen(f"http://{HOST}:{PORT}/json/list", timeout=5))


def conectar(WS, contiene: str):
    for p in paginas():
        if p.get("webSocketDebuggerUrl") and contiene.lower() in (p.get("title") or "").lower():
            return WS(p["webSocketDebuggerUrl"])
    return None


def evaluar(ws, expr: str):
    return ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True}).get("result", {}).get("value")


def foco(ws) -> dict | None:
    v = evaluar(ws, JS_FOCO)
    return json.loads(v) if v else None


def pulsar(ws, nombre: str) -> None:
    key, code = TECLA[nombre]
    base = {"key": key, "code": key, "windowsVirtualKeyCode": code, "nativeVirtualKeyCode": code}
    ws.call("Input.dispatchKeyEvent", {"type": "rawKeyDown", **base})
    ws.call("Input.dispatchKeyEvent", {"type": "keyUp", **base})


def mover_y_medir(ws, flecha: str, antes: str | None, limite: float = 1.0):
    t0 = time.monotonic()
    pulsar(ws, flecha)
    while time.monotonic() - t0 < limite:
        time.sleep(0.02)
        ahora = firma(foco(ws))
        if ahora != antes:
            return ahora, int((time.monotonic() - t0) * 1000)
    return antes, 0


# ───────────── órdenes ─────────────
def cmd_paginas() -> None:
    for p in paginas():
        print(f"{(p.get('title') or '?')[:44]:44} {p.get('type', '?'):14} ws={'sí' if p.get('webSocketDebuggerUrl') else 'no'}")
    try:
        v = json.load(urllib.request.urlopen(f"http://{HOST}:{PORT}/json/version", timeout=5))
        print("\n/json/version:", "tiene webSocketDebuggerUrl (endpoint de navegador: Playwright --cdp-endpoint podría conectar)"
              if v.get("webSocketDebuggerUrl") else "sin webSocketDebuggerUrl (solo páginas sueltas: usar nuestros scripts CDP)", "·", v.get("Browser", "?"))
    except (OSError, ValueError) as e:
        print("\n/json/version no disponible:", e)


def cmd_foco(WS) -> None:
    ws = conectar(WS, "Big Picture")
    print(json.dumps(foco(ws), ensure_ascii=False) if ws else "No encuentro «Steam Big Picture Mode».")


def _estado_panel(WS):
    for p in paginas():
        if not p.get("webSocketDebuggerUrl"):
            continue
        try:
            v = evaluar(WS(p["webSocketDebuggerUrl"]), JS_QAM_ESTADO)
        except OSError:
            continue
        if v:
            return json.loads(v)
    return None


def cmd_qam(WS, accion: str) -> None:
    if accion == "estado":
        print(json.dumps(_estado_panel(WS) or {"abierto": False}, ensure_ascii=False))
        return
    ws = conectar(WS, "SharedJSContext")
    if not ws:
        print("No encuentro SharedJSContext.")
        return
    r = json.loads(evaluar(ws, JS_QAM_ABRIR if accion == "abrir" else JS_QAM_CERRAR) or '{"ok":false,"motivo":"sin respuesta"}')
    time.sleep(1.5)
    est = _estado_panel(WS)
    abierto = bool(est)
    cumplido = abierto if accion == "abrir" else not abierto
    print(f"orden: {r} · panel {'abierto' if abierto else 'cerrado'} → {'OK' if cumplido else 'NO se cumplió (sin confirmar el camino correcto)'}")


def cmd_teclas(WS) -> None:
    ws = conectar(WS, "Big Picture")
    if not ws:
        print("No encuentro «Steam Big Picture Mode».")
        return
    f0 = firma(foco(ws))
    if f0 is None:
        print("No hay ningún elemento con foco (.gpfocus). Mueve el foco con el mando una vez y repite.")
        return
    movio = []
    for d in ("Right", "Left", "Down", "Up"):
        antes = firma(foco(ws))
        despues, ms = mover_y_medir(ws, d, antes)
        movio.append((d, despues != antes, ms))
    print("; ".join(f"{d}: {'movió' if m else 'sin cambio'}" + (f" ({ms} ms)" if m else "") for d, m, ms in movio))
    print("Las flechas del teclado SÍ mueven el foco: `grafo` es utilizable." if any(m for _, m, _ in movio)
          else "Las flechas por CDP no mueven el foco: habrá que usar un mando virtual (uinput). `grafo` no servirá todavía.")


def cmd_grafo(WS, pasos: int) -> None:
    ws = conectar(WS, "Big Picture")
    if not ws:
        print("No encuentro «Steam Big Picture Mode».")
        return
    etiquetas: dict[str, dict] = {}

    def leer():
        d = foco(ws)
        f = firma(d)
        if f:
            etiquetas[f] = d
        return f

    def mover(flecha):
        antes = leer()
        despues, ms = mover_y_medir(ws, flecha, antes)
        if despues != antes:
            leer()
        return despues, ms

    g = explorar(leer, mover, pasos)
    r = resumen(g)
    SALIDA.mkdir(parents=True, exist_ok=True)
    ruta = SALIDA / f"{time.strftime('%Y%m%d-%H%M%S')}-grafo.json"
    ruta.write_text(json.dumps({"nodos": {n: etiquetas.get(n, {}) for n in g.nodos},
                                "aristas": [{"de": n, "flecha": d, "a": dest, "ms": ms} for (n, d), (dest, ms) in g.aristas.items()],
                                "resumen": r}, ensure_ascii=False, indent=1))
    print(f"{r['nodos']} nodos, {r['aristas']} aristas → {ruta}")
    for n in r["sin_salida"]:
        print(f"  SIN SALIDA (ninguna flecha mueve el foco): {n}")
    for n, d, dest in r["sin_vuelta"][:10]:
        print(f"  sin vuelta: {n} —{d}→ {dest} (la flecha contraria no regresa)")
    for n, d, ms in r["lentas"][:10]:
        print(f"  lento ({ms} ms): {n} —{d}→")
    if not (r["sin_salida"] or r["sin_vuelta"] or r["lentas"]):
        print("  nada que avisar en lo explorado (no prueba que todo sea alcanzable: solo lo que se pudo recorrer).")


def main() -> None:
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        return
    if a[0] == "paginas":
        cmd_paginas()
        return
    WS = _ws_class()
    if a[0] == "foco":
        cmd_foco(WS)
    elif a[0] == "qam" and len(a) > 1 and a[1] in ("estado", "abrir", "cerrar"):
        cmd_qam(WS, a[1])
    elif a[0] == "teclas":
        cmd_teclas(WS)
    elif a[0] == "grafo":
        pasos = next((int(x.split("=", 1)[1]) for x in a if x.startswith("--pasos=")), 60)
        cmd_grafo(WS, pasos)
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
