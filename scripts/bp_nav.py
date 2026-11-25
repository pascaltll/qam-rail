#!/usr/bin/env python3
"""Navegar y probar Steam Big Picture por la depuración CEF (127.0.0.1:8080), sin tocar la pantalla. Solo biblioteca estándar.
Uso:  python3 scripts/bp_nav.py <orden>
  paginas            páginas CEF y si Steam ofrece el endpoint de navegador completo (/json/version): dice si Playwright/DevTools MCP pueden conectarse.
  foco               qué elemento tiene el foco del mando (clase .gpfocus de Steam), en CUALQUIER página CEF que lo marque: etiqueta, tamaño, posición,
                     si una persona lo vería (cuadrícula 3×3 con elementFromPoint: visible/parcial/tapado/fuera) y si `document.activeElement` coincide.
  qam estado|abrir|cerrar   abre o cierra el panel de QAM Rail por código y comprueba el resultado (sin confirmar que abra igual que el botón físico).
  teclas [--variantes]  comprueba si las flechas del teclado, enviadas por CDP, mueven el foco (de ello depende `grafo`). Con --variantes prueba
                     varias formas de enviarlas (base, keydown, js, y cada una con +emu = foco emulado) y dice cuál mueve el foco. Por defecto se usa keydown+emu,
                     la única que movió el foco en la Ally; sin +emu, Steam ignoraba las teclas.
  grafo [--pasos=60] [--max-seg=120] [--variante=…]  (por defecto keydown+emu)  explora el foco con las flechas, construye el grafo (nodo = elemento enfocado, arista = flecha → destino,
                     con su retraso en ms), y avisa de: nodos sin salida, aristas sin vuelta y retrasos grandes. Guarda JSON en ~/qam-grafo/.
  parar [--motivo=…] | parada | armar   interruptor de parada: `parar` crea ~/.qam-nav-stop y ninguna pulsación ni apertura/cierre sale mientras exista
                     (un archivo ilegible también cuenta como parado). `armar` lo quita: solo lo ejecuta una persona, nunca un agente.
No cambia ajustes de Steam. `grafo` mueve el foco de la interfaz: déjala quieta mientras corre. Las etiquetas pueden contener texto de la pantalla
(nombres de amigos, apps): el JSON queda en tu equipo; no lo envíes fuera sin mirarlo. Cada orden se anota en ~/qam-grafo/ledger/<sesión>.ndjson
(«ok» = la orden terminó sin excepción, NO que la prueba pasara). Nada de esto está probado aún en la Ally: cada orden dice qué comprobó."""
import importlib.util, json, os, sys, time, urllib.request
from collections import deque
from pathlib import Path

HOST, PORT = "127.0.0.1", 8080
SALIDA = Path.home() / "qam-grafo"
PARADA = Path.home() / ".qam-nav-stop"
LEDGER = SALIDA / "ledger"
PULSACIONES = [0]  # cuántas teclas ha enviado este proceso (lo lee el registro)
INICIO = time.time()  # una sesión = un proceso = un archivo del registro
DIRS = ("Up", "Right", "Down", "Left")
OPUESTA = {"Up": "Down", "Down": "Up", "Left": "Right", "Right": "Left"}
TECLA = {"Up": ("ArrowUp", 38), "Down": ("ArrowDown", 40), "Left": ("ArrowLeft", 37), "Right": ("ArrowRight", 39),
         "Enter": ("Enter", 13), "Escape": ("Escape", 27)}
LAG_ALTO_MS = 300

# Foco de Steam (.gpfocus; NO document.activeElement, que en Steam suele discrepar). `vis` cuenta, en una cuadrícula 3×3 dentro de la caja, qué hay
# encima de cada punto según elementFromPoint: v = el propio elemento (o un hijo), c = otro elemento encima, k = un ancestro (recorte por overflow),
# f = fuera de la ventana o sin nada. `largo` = longitud del texto completo: si es enorme, el foco está en un contenedor y no en un control.
JS_FOCO = """(()=>{const l=[...document.querySelectorAll('.gpfocus')];const e=l[l.length-1];if(!e)return null;
const r=e.getBoundingClientRect();const tx=(e.innerText||e.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ');
const c=[...e.classList].filter(x=>!/^gp/.test(x)).slice(0,3).join('.');
const nom=n=>n.tagName+(n.classList&&n.classList[0]?'.'+n.classList[0]:'');
const p={v:0,c:0,k:0,f:0},tapa={},recorta={};
if(r.width>0&&r.height>0){const ins=Math.min(12,Math.max(2,Math.min(r.width,r.height)*0.25));
const ix=r.width>2*ins?ins:r.width/2,iy=r.height>2*ins?ins:r.height/2;
const xs=[r.left+ix,r.left+r.width/2,r.right-ix],ys=[r.top+iy,r.top+r.height/2,r.bottom-iy];
for(const y of ys)for(const x of xs){if(x<0||y<0||x>=innerWidth||y>=innerHeight){p.f++;continue}
const h=document.elementFromPoint(x,y);if(!h){p.f++;continue}
if(h===e||e.contains(h)){p.v++;continue}
const n=nom(h);if(h.contains(e)){p.k++;recorta[n]=(recorta[n]||0)+1}else{p.c++;tapa[n]=(tapa[n]||0)+1}}}else p.f=9;
const top=o=>Object.keys(o).sort((a,b)=>o[b]-o[a])[0]||null;
return JSON.stringify({tag:e.tagName,cls:c,t:tx.slice(0,40),largo:tx.length,x:Math.round(r.x/10),y:Math.round(r.y/10),w:Math.round(r.width/10),h:Math.round(r.height/10),
ae:document.activeElement===e||e.contains(document.activeElement),vis:{p:p,tapa:top(tapa),recorta:top(recorta)}})})()"""
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


class Parado(Exception):
    """El interruptor de parada está puesto: no sale ninguna pulsación ni apertura/cierre."""


def parada_activa(ruta: Path | None = None) -> dict | None:
    """None si se puede actuar; si no, el registro de la parada. Un archivo que existe pero no se lee cuenta como parado: la única razón de que
    exista es que alguien pidió parar, y dudar a favor de seguir pulsando es el error contrario."""
    ruta = ruta or PARADA
    try:
        if not ruta.exists():
            return None
    except OSError:
        return {"motivo": "no se puede comprobar el archivo de parada (cuenta como parado)"}
    try:
        d = json.loads(ruta.read_text())
        return d if isinstance(d, dict) else {"motivo": "contenido ilegible (cuenta como parado)"}
    except (OSError, ValueError):
        return {"motivo": "archivo ilegible (cuenta como parado)"}


def mensaje_parada(rec: dict, ruta: Path | None = None) -> str:
    return (f"PARADO: {(ruta or PARADA)} existe desde {rec.get('at', 'hora desconocida')}"
            + (f" ({rec['motivo']})" if rec.get("motivo") else "")
            + ". No se envía nada hasta que una persona ejecute `python3 scripts/bp_nav.py armar`. Un agente no debe quitarla.")


def exigir_activo(ruta: Path | None = None) -> None:
    """Se llama justo antes de cada acción que cambia la interfaz (la comprobación que de verdad vale; los bucles solo avisan antes)."""
    rec = parada_activa(ruta)
    if rec:
        raise Parado(mensaje_parada(rec, ruta))
    v = os.environ.get("QAM_NAV_SIN_TECLAS")
    if v and v != "0" and v.lower() != "false":
        raise Parado("QAM_NAV_SIN_TECLAS está puesto: este proceso no puede enviar teclas (guarda para pruebas automáticas).")


def veredicto_visibilidad(p: dict) -> dict:
    """p = {v, c, k, f} de JS_FOCO. visible: los 9 puntos; ninguno visible → tapado si algo estaba encima, si no fuera de pantalla/recortado."""
    v, c, k, f = (int(p.get(x, 0)) for x in "vckf")
    total = v + c + k + f
    if total == 0:
        return {"veredicto": "sin_datos", "porciento": 0, "puntos": 0}
    ver = "visible" if v == total else ("tapado" if c > 0 else "fuera") if v == 0 else "parcial"
    return {"veredicto": ver, "porciento": round(100 * v / total), "puntos": total}


def describir_foco(d: dict) -> str:
    """Una línea legible del foco, con los avisos que importan (poco visible, activeElement discrepa, foco en un contenedor)."""
    partes = [f"{d.get('tag', '?')}.{d.get('cls', '')} «{d.get('t', '')}» en ({d.get('x', 0) * 10},{d.get('y', 0) * 10}) {d.get('w', 0) * 10}×{d.get('h', 0) * 10}"]
    vis = d.get("vis")
    if vis:
        v = veredicto_visibilidad(vis.get("p", {}))
        txt = f"{v['veredicto']} {v['porciento']}%"
        if vis.get("tapa"):
            txt += f", tapado por {vis['tapa']}"
        if vis.get("recorta"):
            txt += f", recortado por {vis['recorta']}"
        partes.append(("⚠ " if v["veredicto"] != "visible" else "") + txt)
    if d.get("ae") is False:
        partes.append("⚠ document.activeElement NO coincide (fíate de .gpfocus)")
    if d.get("largo", 0) > 80:
        partes.append(f"⚠ el foco está en un contenedor (texto de {d['largo']} caracteres), no en un control")
    return " · ".join(partes)


def primera_linea(txt: str, tope: int = 300) -> str:
    linea = next((x.strip() for x in str(txt).splitlines() if x.strip()), "")
    return linea if len(linea) <= tope else linea[: tope - 1] + "…"


def sesion_id(ahora: float, pid: int) -> str:
    return time.strftime("%Y%m%dT%H%M%S", time.gmtime(ahora)) + f"Z_pid{pid}"


SIN_REGISTRO = frozenset({"parada", "paginas"})  # consultas sin efecto: no tapan las pruebas reales


def registrar(orden: str, args: list[str], correr, dir_: Path | None = None, ahora=time.time, pid: int | None = None):
    """Corre `correr()` y anota UNA línea JSON en <dir>/<sesión>.ndjson cuando termina, sea como sea. Escribir el registro nunca hace fallar la
    orden: lo que devuelve o lanza `correr` llega intacto. `ok` = terminó sin excepción, no «la prueba pasó»; `nota` = lo que la orden dijo de sí misma."""
    if orden in SIN_REGISTRO:
        return correr()
    t0, p0, nota, error, ok = ahora(), PULSACIONES[0], None, None, True
    try:
        nota = correr()
        return nota
    except BaseException as e:
        ok, error = False, primera_linea(f"{type(e).__name__}: {e}")
        raise
    finally:
        try:
            d = dir_ or LEDGER
            d.mkdir(parents=True, exist_ok=True)
            linea = {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t0)), "orden": orden, "args": args, "ok": ok,
                     "ms": int((ahora() - t0) * 1000), "pulsaciones": PULSACIONES[0] - p0}
            if isinstance(nota, str) and nota:
                linea["nota"] = primera_linea(nota)
            if error:
                linea["error"] = error
            if isinstance(error, str) and error.startswith("Parado"):
                linea["parado"] = True
            with open(d / f"{sesion_id(INICIO, pid or os.getpid())}.ndjson", "a", encoding="utf-8") as f:
                f.write(json.dumps(linea, ensure_ascii=False) + "\n")
        except Exception as e:  # el registro jamás cambia el resultado de la orden
            print(f"[bp_nav] no pude escribir el registro ({e}); la orden no se ve afectada.", file=sys.stderr)


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


def explorar(leer, mover, max_pasos: int, dormir=time.sleep, plazo_s: float | None = None, reloj=time.monotonic, parar=None) -> Grafo:
    """leer() -> id del nodo enfocado (o None). mover(flecha) -> (id nuevo, ms hasta que cambió el foco; 0 si no cambió).
    Termina con lo explorado hasta entonces si pasa `plazo_s` segundos, si `parar()` dice True o si `mover` lanza Parado (no anota arista falsa)."""
    g = Grafo()
    t0 = reloj()
    actual = leer()
    for _ in range(max_pasos):
        if actual is None:
            break
        if (plazo_s is not None and reloj() - t0 >= plazo_s) or (parar and parar()):
            break
        g.nodos.setdefault(actual, {})
        accion, d = decidir(g, actual)
        if accion == "fin":
            break
        try:
            nuevo, ms = mover(d)
        except Parado:
            break
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


def foco_todas(WS) -> list[dict]:
    """[{pagina, foco}] de cada página CEF donde Steam marca un .gpfocus. No se asume en cuál vive: en un Steam Deck (SteamOS) el marcador estaba
    en la página del menú rápido y no en «Big Picture»; en Bazzite sin confirmar. Las páginas ocultas que no contestan se saltan."""
    out = []
    for p in paginas():
        if not p.get("webSocketDebuggerUrl"):
            continue
        try:
            d = foco(WS(p["webSocketDebuggerUrl"]))
        except Exception:
            continue
        if d:
            out.append({"pagina": p.get("title") or "?", "foco": d})
    return out


def conectar_foco(WS):
    """(ws, título) de la página que tiene el foco: «Big Picture» primero, luego las demás. Si ninguna lo tiene, la de Big Picture (o (None, None))."""
    primera = None
    for p in sorted(paginas(), key=lambda p: "big picture" not in (p.get("title") or "").lower()):
        if not p.get("webSocketDebuggerUrl"):
            continue
        try:
            ws = WS(p["webSocketDebuggerUrl"])
            if foco(ws):
                return ws, p.get("title") or "?"
            if primera is None and "big picture" in (p.get("title") or "").lower():
                primera = (ws, p.get("title") or "?")
        except Exception:
            continue
    return primera or (None, None)


VARIANTES = ("base", "keydown", "js")  # cómo se envía la tecla (ver pulsar); `teclas --variantes` busca cuál mueve el foco
DEFECTO = "keydown+emu"  # la única que movió el foco en la Ally (2026-11-25): keyDown completo + foco emulado; base, js y las demás sin emu no movieron nada
VARIANTE = {"v": "keydown", "emu": True}  # la que usan `teclas` y `grafo` (opción --variante=…)


def foco_emulado(ws, activar: bool) -> None:
    """Hace que la página crea tener el foco del sistema (Emulation.setFocusEmulationEnabled); Steam puede ignorar teclas si no."""
    ws.call("Emulation.setFocusEmulationEnabled", {"enabled": activar})


def pulsar(ws, nombre: str, variante: str | None = None) -> None:
    exigir_activo()  # justo antes de la tecla: nada sale con la parada puesta
    PULSACIONES[0] += 1
    v = variante or VARIANTE["v"]
    key, code = TECLA[nombre]
    if v == "js":  # evento DOM sintético, sin pasar por el sistema de entrada del navegador
        ev = "new KeyboardEvent('%s',{key:'%s',code:'%s',keyCode:%d,which:%d,bubbles:true,cancelable:true})"
        args = (key, key, code, code)
        evaluar(ws, "(()=>{const t=document.activeElement||document.body;t.dispatchEvent(" + ev % (("keydown",) + args) + ");t.dispatchEvent(" + ev % (("keyup",) + args) + ")})()")
        return
    base = {"key": key, "code": key, "windowsVirtualKeyCode": code, "nativeVirtualKeyCode": code}
    if v == "keydown":  # como lo envía Puppeteer: keyDown (no rawKeyDown) con todos los campos
        base = {**base, "modifiers": 0, "autoRepeat": False, "location": 0, "isKeypad": False}
        ws.call("Input.dispatchKeyEvent", {"type": "keyDown", **base})
    else:
        ws.call("Input.dispatchKeyEvent", {"type": "rawKeyDown", **base})
    ws.call("Input.dispatchKeyEvent", {"type": "keyUp", **base})


def primera_que_mueve(combos, intentar):
    """Prueba las combinaciones en orden y se detiene en la primera que mueve el foco. intentar(combo) -> [(flecha, movió, ms)].
    Devuelve (combo que funcionó o None, {combo: resultados})."""
    vistos = {}
    for c in combos:
        vistos[c] = intentar(c)
        if any(m for _, m, _ in vistos[c]):
            return c, vistos
    return None, vistos


def nombre_combo(variante: str, emu: bool) -> str:
    return variante + ("+emu" if emu else "")


def leer_combo(txt: str) -> tuple[str, bool]:
    v, _, emu = txt.partition("+")
    if v not in VARIANTES or emu not in ("", "emu"):
        raise ValueError(f"variante desconocida: {txt!r} (usa {', '.join(VARIANTES)}, y opcionalmente +emu)")
    return v, emu == "emu"


def mover_y_medir(ws, flecha: str, antes: str | None, limite: float = 1.0, variante: str | None = None):
    t0 = time.monotonic()
    pulsar(ws, flecha, variante)
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


def cmd_foco(WS) -> str:
    hallados = foco_todas(WS)
    if not hallados:
        print("Ninguna página CEF marca un elemento con .gpfocus. Mueve el foco con el mando una vez y repite (al abrir un plugin nada tiene el foco todavía).")
        return "sin foco"
    for h in hallados:
        print(f"[{h['pagina']}] {describir_foco(h['foco'])}")
    return f"foco en {len(hallados)} página(s): " + "; ".join(h["pagina"] for h in hallados)


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


def cmd_qam(WS, accion: str) -> str:
    if accion == "estado":
        est = _estado_panel(WS) or {"abierto": False}
        print(json.dumps(est, ensure_ascii=False))
        return "abierto" if est.get("abierto") else "cerrado"
    exigir_activo()  # abrir/cerrar también cambian la interfaz
    ws = conectar(WS, "SharedJSContext")
    if not ws:
        print("No encuentro SharedJSContext.")
        return "sin SharedJSContext"
    r = json.loads(evaluar(ws, JS_QAM_ABRIR if accion == "abrir" else JS_QAM_CERRAR) or '{"ok":false,"motivo":"sin respuesta"}')
    time.sleep(1.5)
    est = _estado_panel(WS)
    abierto = bool(est)
    cumplido = abierto if accion == "abrir" else not abierto
    print(f"orden: {r} · panel {'abierto' if abierto else 'cerrado'} → {'OK' if cumplido else 'NO se cumplió (sin confirmar el camino correcto)'}")
    return f"{accion}: {'cumplido' if cumplido else 'no cumplido'}"


def cmd_teclas(WS, probar: bool = False) -> str:
    ws, titulo = conectar_foco(WS)
    if not ws:
        print("No encuentro «Steam Big Picture Mode».")
        return "sin página"
    if firma(foco(ws)) is None:
        print("No hay ningún elemento con foco (.gpfocus). Mueve el foco con el mando una vez y repite.")
        return "sin foco"

    def intentar(combo):
        v, emu = leer_combo(combo)
        if emu:
            foco_emulado(ws, True)
        try:
            out = []
            for d in ("Right", "Left", "Down", "Up"):
                antes = firma(foco(ws))
                despues, ms = mover_y_medir(ws, d, antes, variante=v)
                out.append((d, despues != antes, ms))
            return out
        finally:
            if emu:
                foco_emulado(ws, False)

    combos = [DEFECTO] + [c for c in (nombre_combo(v, e) for e in (False, True) for v in VARIANTES) if c != DEFECTO] if probar else [nombre_combo(VARIANTE["v"], VARIANTE["emu"])]
    ganadora, vistos = primera_que_mueve(combos, intentar)
    for c, res in vistos.items():
        print(f"[{titulo}] {c}: " + "; ".join(f"{d} {'movió (' + str(ms) + ' ms)' if m else 'sin cambio'}" for d, m, ms in res))
    if ganadora:
        print(f"Las flechas por CDP SÍ mueven el foco con «{ganadora}»: `grafo --variante={ganadora}` es utilizable.")
        return f"{ganadora} mueve el foco en {titulo}"
    print("Ninguna variante de teclado por CDP mueve el foco: habrá que usar un mando virtual (uinput). `grafo` no servirá todavía."
          if probar else "Las flechas por CDP no mueven el foco con esta variante. Prueba `teclas --variantes`.")
    return f"ninguna variante mueve el foco en {titulo}" if probar else f"«{combos[0]}» no mueve el foco en {titulo}"


def cmd_grafo(WS, pasos: int, max_seg: float) -> str:
    ws, titulo = conectar_foco(WS)
    if not ws:
        print("No encuentro «Steam Big Picture Mode».")
        return "sin página"
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

    if VARIANTE["emu"]:
        foco_emulado(ws, True)
    try:
        g = explorar(leer, mover, pasos, plazo_s=max_seg, parar=lambda: parada_activa() is not None)
    finally:
        if VARIANTE["emu"]:
            foco_emulado(ws, False)
    r = resumen(g)
    SALIDA.mkdir(parents=True, exist_ok=True)
    ruta = SALIDA / f"{time.strftime('%Y%m%d-%H%M%S')}-grafo.json"
    ruta.write_text(json.dumps({"pagina": titulo, "nodos": {n: etiquetas.get(n, {}) for n in g.nodos},
                                "aristas": [{"de": n, "flecha": d, "a": dest, "ms": ms} for (n, d), (dest, ms) in g.aristas.items()],
                                "resumen": r}, ensure_ascii=False, indent=1))
    print(f"[{titulo}] {r['nodos']} nodos, {r['aristas']} aristas → {ruta}")
    rec = parada_activa()
    if rec:
        print("  " + mensaje_parada(rec) + " (lo explorado hasta ahí está guardado)")
    for n in r["sin_salida"]:
        print(f"  SIN SALIDA (ninguna flecha mueve el foco): {n}")
    for n, d, dest in r["sin_vuelta"][:10]:
        print(f"  sin vuelta: {n} —{d}→ {dest} (la flecha contraria no regresa)")
    for n, d, ms in r["lentas"][:10]:
        print(f"  lento ({ms} ms): {n} —{d}→")
    if not (r["sin_salida"] or r["sin_vuelta"] or r["lentas"]):
        print("  nada que avisar en lo explorado (no prueba que todo sea alcanzable: solo lo que se pudo recorrer).")
    return f"{r['nodos']} nodos, {r['aristas']} aristas, {len(r['sin_salida'])} sin salida, {len(r['sin_vuelta'])} sin vuelta, {len(r['lentas'])} lentas" + (" (PARADO)" if rec else "")


def cmd_parar(motivo: str) -> str:
    rec = {"at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "by": "cli", "motivo": motivo or "parado desde la terminal", "pid": os.getpid()}
    try:
        PARADA.write_text(json.dumps(rec, ensure_ascii=False))
    except OSError as e:
        print(f"*** NO SE PUDO ESCRIBIR {PARADA}: {e} — LA AUTOMATIZACIÓN NO ESTÁ PARADA ***", file=sys.stderr)
        sys.exit(2)
    print(f"PARADO. {PARADA} creado: ninguna pulsación ni apertura/cierre saldrá hasta que una persona ejecute `armar`.")
    return "parado"


def cmd_parada() -> None:
    rec = parada_activa()
    if rec:
        print(mensaje_parada(rec))
        sys.exit(1)  # distinto de 0 para poder ramificar en el shell
    print("armado: se puede pulsar.")


def cmd_armar() -> None:
    rec = parada_activa()
    if not rec:
        print("ya estaba armado.")
        return
    PARADA.unlink(missing_ok=True)
    print(f"armado de nuevo (había una parada de {rec.get('at', '?')}: {rec.get('motivo', '')}).")


def _opcion(a: list[str], nombre: str, defecto: str) -> str:
    return next((x.split("=", 1)[1] for x in a if x.startswith(f"--{nombre}=")), defecto)


def despachar(a: list[str]):
    if a[0] == "paginas":
        return cmd_paginas()
    if a[0] == "parada":
        return cmd_parada()
    if a[0] == "armar":
        return cmd_armar()
    if a[0] == "parar":
        return cmd_parar(_opcion(a, "motivo", ""))
    WS = _ws_class()
    if a[0] == "foco":
        return cmd_foco(WS)
    if a[0] == "qam" and len(a) > 1 and a[1] in ("estado", "abrir", "cerrar"):
        return cmd_qam(WS, a[1])
    VARIANTE["v"], VARIANTE["emu"] = leer_combo(_opcion(a, "variante", DEFECTO))
    if a[0] == "teclas":
        return cmd_teclas(WS, "--variantes" in a)
    if a[0] == "grafo":
        return cmd_grafo(WS, int(_opcion(a, "pasos", "60")), float(_opcion(a, "max-seg", "120")))
    print(__doc__)


def main() -> None:
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        return
    try:
        registrar(a[0], a[1:], lambda: despachar(a))
    except Parado as e:
        print(str(e), file=sys.stderr)
        sys.exit(3)
    except ValueError as e:  # opción mal escrita
        print(f"Opción no válida: {e}", file=sys.stderr)
        sys.exit(5)
    except OSError as e:  # Steam apagado, puerto distinto o página que no contesta
        print(f"No puedo hablar con la depuración de Steam ({HOST}:{PORT}): {e}", file=sys.stderr)
        sys.exit(4)


if __name__ == "__main__":
    main()
