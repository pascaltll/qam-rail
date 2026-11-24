"""Autoprueba del navegador (dev.73): con Firefox (o Edge) delante, abre una página de prueba y comprueba, por el MISMO camino que usa el dedo y el
teclado de QAM, que lo importante sigue funcionando: tocar, volver a tocar el mismo botón, desplazar (y que lo haga bajo el dedo y no bajo el
puntero), la inercia, el sentido del desplazamiento, escribir con el teclado y abrir/cambiar/cerrar pestañas. La página avisa al servidor de
CADA evento que recibe, así que además de «funciona» se mide cuánto tarda. Sirve para ver de golpe qué rompió una actualización."""
from __future__ import annotations

import asyncio
import json
import time
import urllib.parse

import qam_pad as q

PAGE = """<!doctype html><meta charset=utf-8><title>QAM autoprueba</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#101418;color:#eee;font:22px sans-serif}
.row{display:flex;gap:24px;padding:18px 24px}button{width:230px;height:96px;font-size:26px}
.box{width:420px;height:260px;overflow:auto;background:#1b222b;border:2px solid #345}
.box div{height:70px;border-bottom:1px solid #456;padding:20px;box-sizing:border-box}
select,input{font-size:26px;height:64px;width:300px}</style>
<div class=row><button id=b1>B1</button><button id=b2>B2</button><button id=b3>B3</button></div>
<div class=row><div class=box id=box1></div><div class=box id=box2></div></div>
<div class=row><select id=sel><option>uno<option>dos<option>tres</select><input id=inp autocomplete=off></div>
<script>
const post=(k,d)=>{try{fetch('/ev?k='+k+'&d='+encodeURIComponent(JSON.stringify(d||{})),{keepalive:true,cache:'no-store'})}catch(e){}};
for(const id of ['box1','box2']){const b=document.getElementById(id);for(let i=0;i<60;i++){const d=document.createElement('div');d.textContent=id+' fila '+i;b.appendChild(d)}
 let t=0;b.addEventListener('scroll',()=>{const n=performance.now();if(n-t>40){t=n;post('scroll',{id:id,top:Math.round(b.scrollTop)})}});
 setTimeout(()=>{},0)}
setInterval(()=>{for(const id of ['box1','box2'])post('pos',{id:id,top:Math.round(document.getElementById(id).scrollTop)})},250);
document.addEventListener('mousedown',e=>post('down',{id:e.target.id||e.target.tagName}),true);
document.addEventListener('click',e=>post('click',{id:e.target.id||e.target.tagName,cx:e.clientX,cy:e.clientY}),true);
document.getElementById('inp').addEventListener('input',e=>post('input',{v:e.target.value}));
document.getElementById('inp').addEventListener('focus',()=>post('focus',{id:'inp'}));
document.addEventListener('visibilitychange',()=>post('vis',{s:document.visibilityState}));
const rects=()=>{const o={};for(const id of ['b1','b2','b3','box1','box2','sel','inp']){const r=document.getElementById(id).getBoundingClientRect();o[id]=[r.left,r.top,r.width,r.height]}return o};
post('ready',{rects:rects(),dpr:window.devicePixelRatio,w:innerWidth,h:innerHeight});
</script>"""


class Probe:
    """Servidor mínimo en 127.0.0.1: sirve la página y apunta cada evento que ella le manda."""

    def __init__(self):
        self.events: list = []
        self.hits: list = []   # TODAS las peticiones (también la de la página): distingue «el navegador no pidió nada» de «la página no mandó eventos»
        self.server = None
        self.port = 0

    async def start(self) -> None:
        self.server = await asyncio.start_server(self._handle, "127.0.0.1", 0)
        self.port = self.server.sockets[0].getsockname()[1]

    async def stop(self) -> None:
        if self.server:
            self.server.close()
            try:
                await self.server.wait_closed()
            except Exception:  # noqa: BLE001
                pass
            self.server = None

    async def _handle(self, r, w) -> None:
        try:
            line = (await asyncio.wait_for(r.readline(), 5)).decode("latin-1")
            while True:   # cabeceras
                h = await asyncio.wait_for(r.readline(), 5)
                if h in (b"\r\n", b"\n", b""):
                    break
            path = line.split(" ")[1] if line.count(" ") >= 2 else "/"
            u = urllib.parse.urlparse(path)
            self.hits.append(u.path)
            if u.path == "/ev":
                qs = urllib.parse.parse_qs(u.query)
                try:
                    d = json.loads((qs.get("d") or ["{}"])[0])
                except ValueError:
                    d = {}
                self.events.append({"t": time.monotonic(), "k": (qs.get("k") or [""])[0], "d": d})
                w.write(b"HTTP/1.1 204 No Content\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n")
            elif u.path == "/":
                body = PAGE.encode("utf-8")
                w.write(b"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: " + str(len(body)).encode() + b"\r\nConnection: close\r\n\r\n" + body)
            else:
                w.write(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n")
            await w.drain()
        except Exception:  # noqa: BLE001
            pass
        finally:
            try:
                w.close()
            except Exception:  # noqa: BLE001
                pass

    def mark(self) -> int:
        return len(self.events)

    def since(self, i: int, kind: str | None = None) -> list:
        return [e for e in self.events[i:] if kind is None or e["k"] == kind]

    async def wait(self, i: int, kind: str, pred=None, timeout: float = 1.0):
        """Primer evento de `kind` desde `i` que cumpla `pred`, o None al pasar `timeout`."""
        end = time.monotonic() + timeout
        while True:
            for e in self.events[i:]:
                if e["k"] == kind and (pred is None or pred(e["d"])):
                    return e
            if time.monotonic() >= end:
                return None
            await asyncio.sleep(0.02)


class Finger:
    """Lo que manda el núcleo para un dedo en la ranura 0: NO repite una coordenada igual a la última de la ranura (dev.71)."""

    def __init__(self):
        self.last = [None, None]
        self.tid = 100

    def _pos(self, x: int, y: int) -> list:
        ev = []
        if x != self.last[0]:
            ev.append((q.EV_ABS, q.ABS_MT_POSITION_X, int(x)))
        if y != self.last[1]:
            ev.append((q.EV_ABS, q.ABS_MT_POSITION_Y, int(y)))
        self.last = [int(x), int(y)]
        return ev

    def down(self, x: int, y: int) -> list:
        self.tid += 1
        return [(q.EV_ABS, q.ABS_MT_SLOT, 0), (q.EV_ABS, q.ABS_MT_TRACKING_ID, self.tid), *self._pos(x, y), (q.EV_SYN, 0, 0)]

    def move(self, x: int, y: int) -> list:
        return [*self._pos(x, y), (q.EV_SYN, 0, 0)]

    @staticmethod
    def up() -> list:
        return [(q.EV_ABS, q.ABS_MT_TRACKING_ID, -1), (q.EV_SYN, 0, 0)]


def fit_axis(p1: float, p2: float, c1: float, c2: float):
    """Correspondencia lineal pantalla → cliente de la página con dos puntos: (escala, desplazamiento) o None si no hay recorrido."""
    if abs(c2 - c1) < 1e-6 or abs(p2 - p1) < 1e-6:
        return None
    a = (p2 - p1) / (c2 - c1)   # px de pantalla por px CSS
    return a, p1 - c1 * a


class SelfTest:
    def __init__(self, runner, keys, typ, log=None, title=None):
        """`runner`: el PadRunner en marcha (con su X). `keys(key, mods)` y `typ(text)`: el teclado de QAM (async, devuelven bool)."""
        self.r, self.keys, self.typ = runner, keys, typ
        self.log = log or (lambda *_, **__: None)
        self.title = title or (lambda: "")   # título de la ventana del navegador (para el diagnóstico)
        self.opened = False                  # abrimos una pestaña para la prueba: al acabar se cierra
        self.probe = Probe()
        self.steps: list = []
        self.finger = Finger()
        self.ts = None
        self.ax = self.ay = None   # (escala, desplazamiento) pantalla ← cliente
        self.rects: dict = {}
        self.phase = ""

    # ---- ayudas
    def res(self, name: str, ok, detail: str = "", ms=None) -> bool:
        self.steps.append({"name": name, "ok": ok, "detail": detail, "ms": None if ms is None else round(ms)})
        self.log("autoprueba", name=name, ok=ok, detalle=detail, ms=ms)
        return bool(ok)

    def scr(self, id_: str, fx: float = 0.5, fy: float = 0.5) -> tuple:
        """Punto de pantalla (px) dentro del elemento `id_` de la página (fx, fy en 0..1)."""
        x, y, w, h = self.rects[id_]
        return (round(self.ax[1] + (x + w * fx) * self.ax[0]), round(self.ay[1] + (y + h * fy) * self.ay[0]))

    async def feed(self, evs: list) -> None:
        self.r._touch_feed(self.ts, evs, time.monotonic())

    async def tap(self, x: int, y: int, hold: float = 0.07) -> float:
        await self.feed(self.finger.down(x, y))
        await asyncio.sleep(hold)
        t = time.monotonic()
        await self.feed(self.finger.up())
        return t

    async def drag(self, x0: int, y0: int, x1: int, y1: int, dur: float = 0.35, release: bool = True) -> None:
        await self.feed(self.finger.down(x0, y0))
        n = max(4, int(dur / 0.016))
        for i in range(1, n + 1):
            await asyncio.sleep(dur / n)
            await self.feed(self.finger.move(round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n)))
        if release:
            await self.feed(self.finger.up())

    async def top(self, id_: str) -> int:
        """scrollTop actual de una caja (la página lo manda cada 250 ms y al desplazarse)."""
        await asyncio.sleep(0.3)
        for e in reversed(self.probe.events):
            if e["k"] in ("pos", "scroll") and e["d"].get("id") == id_:
                return int(e["d"].get("top", 0))
        return 0

    # ---- pasos
    async def run(self) -> dict:
        t_all = time.monotonic()
        W, H = self.r._x.screen_size()
        self.ts = q.TouchScroll((0, W), (0, H), (W, H))
        self.ts.full = self.ts.force_full = True
        self.ts.tr = self.r._tr
        self.r._ts["selftest"] = self.ts
        await self.probe.start()
        try:
            if await self.s_cargar(W, H) and await self.s_calibrar(W, H):
                for step in (self.s_clic, self.s_mismo_sitio, self.s_scroll, self.s_inercia, self.s_texto, self.s_select, self.s_pestanas):
                    try:
                        await step()
                    except Exception as e:  # noqa: BLE001 - un paso roto no debe parar los demás
                        self.res(step.__name__[2:], False, f"error: {e!r}"[:120])
        finally:
            try:
                if self.opened:
                    await self.keys("w", ["ctrl"])   # cierra la pestaña de la prueba: queda el navegador como estaba
                    await asyncio.sleep(0.3)
            except Exception:  # noqa: BLE001
                pass
            try:
                self.r._ts.pop("selftest", None)
                self.r._pend_run(time.monotonic(), force=True)
            except Exception:  # noqa: BLE001
                pass
            await self.probe.stop()
        bad = [s for s in self.steps if s["ok"] is False]
        return {"ok": not bad and bool(self.steps), "steps": self.steps, "secs": round(time.monotonic() - t_all), "eventos": len(self.probe.events)}

    async def s_cargar(self, W: int, H: int) -> bool:
        """Abre la página de prueba en una pestaña NUEVA (no toca la página que tuvieras) y espera a que avise."""
        t0 = time.monotonic()
        i = self.probe.mark()
        url = f"http://127.0.0.1:{self.probe.port}/"
        ok = await self.keys("t", ["ctrl"])
        self.opened = True
        await asyncio.sleep(0.8)
        ok = await self.typ(url) and ok
        await asyncio.sleep(0.2)
        ok = await self.keys("Return", []) and ok
        e = await self.probe.wait(i, "ready", timeout=7.0)
        if not e:   # segundo intento: por la barra de direcciones de la pestaña en la que estemos
            await self.keys("l", ["ctrl"])
            await asyncio.sleep(0.4)
            await self.typ(url)
            await asyncio.sleep(0.2)
            await self.keys("Return", [])
            e = await self.probe.wait(i, "ready", timeout=7.0)
        if not e:
            tit = (self.title() or "").strip()
            det = (f"la página de prueba no cargó en 14 s · el navegador pidió la página {len([h for h in self.probe.hits if h == '/'])} vez/veces y "
                   f"mandó {len(self.probe.events)} evento(s) · título de la ventana: «{tit[:60]}»")
            return self.res("cargar página", False, det if ok else "no se pudo escribir la dirección (el teclado no llegó)")
        self.rects = e["d"]["rects"]
        return self.res("cargar página", True, f"{int(e['d']['w'])}x{int(e['d']['h'])} px CSS, escala {e['d']['dpr']}", (e["t"] - t0) * 1000)

    async def s_calibrar(self, W: int, H: int) -> bool:
        pts = [(int(W * 0.30), int(H * 0.55)), (int(W * 0.62), int(H * 0.80))]
        got = []
        for (x, y) in pts:
            i = self.probe.mark()
            await self.tap(x, y)
            e = await self.probe.wait(i, "click", timeout=1.5)
            if not e:
                return self.res("calibrar toques", False, f"el toque en {x},{y} no llegó a la página")
            got.append((x, y, e["d"]["cx"], e["d"]["cy"]))
            await asyncio.sleep(0.5)   # que no cuente como doble toque
        fx, fy = fit_axis(got[0][0], got[1][0], got[0][2], got[1][2]), fit_axis(got[0][1], got[1][1], got[0][3], got[1][3])
        if not fx or not fy:
            return self.res("calibrar toques", False, f"los dos toques cayeron en el mismo punto de la página: {got}")
        self.ax, self.ay = fx, fy
        return self.res("calibrar toques", True, f"escala {fx[0]:.2f}×{fy[0]:.2f} px pantalla por px CSS")

    async def s_clic(self) -> None:
        x, y = self.scr("b1")
        i = self.probe.mark()
        t = await self.tap(x, y)
        e = await self.probe.wait(i, "click", lambda d: d.get("id") == "b1", 1.0)
        self.res("tocar un botón", bool(e), "llegó el clic" if e else f"no llegó ningún clic al botón (puntero en {x},{y})", None if not e else (e["t"] - t) * 1000)

    async def s_mismo_sitio(self) -> None:
        x, y = self.scr("b2")
        i = self.probe.mark()
        for _ in range(5):
            await self.tap(x, y)
            await asyncio.sleep(0.45)
        n = len([e for e in self.probe.since(i, "click") if e["d"].get("id") == "b2"])
        self.res("tocar 5 veces el mismo botón", n == 5, f"llegaron {n} de 5 clics" + ("" if n == 5 else " (se pierden toques al repetir el mismo sitio)"))

    async def s_scroll(self) -> None:
        for box, otra in (("box1", "box2"), ("box2", "box1")):
            x, y = self.scr(box)
            a0, b0 = await self.top(box), await self.top(otra)
            t = time.monotonic()
            await self.drag(x, y + 90, x, y - 90, 0.5)   # dedo hacia arriba: la lista baja
            await asyncio.sleep(1.2)
            a1, b1 = await self.top(box), await self.top(otra)
            self.res(f"desplazar {box} con el dedo", a1 > a0 + 20 and b1 == b0, f"{box}: {a0}→{a1} px; {otra}: {b0}→{b1} px" + ("" if a1 > a0 + 20 else " (no se movió bajo el dedo)") + ("" if b1 == b0 else " (se movió la otra caja)"), (time.monotonic() - t) * 1000)
        x, y = self.scr("box1")
        a0 = await self.top("box1")
        await self.drag(x, y - 90, x, y + 90, 0.5)   # dedo hacia abajo: la lista sube
        await asyncio.sleep(1.2)
        a1 = await self.top("box1")
        self.res("sentido del desplazamiento", a1 < a0 - 20, f"dedo hacia abajo: {a0}→{a1} px" + ("" if a1 < a0 - 20 else " (el sentido está al revés o no se movió)"))

    async def s_inercia(self) -> None:
        x, y = self.scr("box2")
        await self.drag(x, y - 110, x, y + 110, 0.4)   # hacia abajo: la lista vuelve arriba y hay recorrido para el latigazo
        await asyncio.sleep(1.5)
        await self.drag(x, y + 110, x, y - 110, 0.10)   # un latigazo rápido hacia arriba
        t_up = time.monotonic()
        await asyncio.sleep(0.15)
        a1 = await self.top("box2")
        await asyncio.sleep(1.0)
        a2 = await self.top("box2")
        self.res("inercia tras soltar", a2 > a1 + 15, f"al soltar {a1} px, 1 s después {a2} px" + ("" if a2 > a1 + 15 else " (no sigue deslizando)"), (time.monotonic() - t_up) * 1000)

    async def s_texto(self) -> None:
        x, y = self.scr("inp")
        i = self.probe.mark()
        await self.tap(x, y)
        f = await self.probe.wait(i, "focus", timeout=1.0)
        j = self.probe.mark()
        await self.typ("hola")
        e = await self.probe.wait(j, "input", lambda d: d.get("v") == "hola", 1.5)
        self.res("escribir con el teclado de QAM", bool(e), ("escribió «hola»" if e else "no llegó el texto al campo") + ("" if f else " (el toque no dio foco al campo)"))

    async def s_select(self) -> None:
        x, y = self.scr("sel")
        i = self.probe.mark()
        await self.tap(x, y)
        e = await self.probe.wait(i, "down", lambda d: d.get("id") == "sel", 1.0)   # el desplegable se traga el «click»; la pulsación sí llega
        await asyncio.sleep(0.5)
        await self.keys("Escape", [])
        self.res("tocar un desplegable", bool(e), "llegó la pulsación" if e else "no llegó la pulsación al desplegable")

    async def s_pestanas(self) -> None:
        async def vis(want: str, label: str, fn) -> bool:
            i = self.probe.mark()
            t = time.monotonic()
            await fn()
            e = await self.probe.wait(i, "vis", lambda d: d.get("s") == want, 2.0)
            return self.res(label, bool(e), "ok" if e else f"la página no pasó a «{want}»", None if not e else (e["t"] - t) * 1000)
        a = await vis("hidden", "pestaña nueva (Ctrl+T)", lambda: self.keys("t", ["ctrl"]))
        if not a:
            return
        await asyncio.sleep(0.8)
        b = await vis("visible", "pestaña anterior (LB: Ctrl+Re Pág)", lambda: self.keys("Prior", ["ctrl"]))
        await asyncio.sleep(0.5)
        c = False
        if b:
            c = await vis("hidden", "pestaña siguiente (RB: Ctrl+Av Pág)", lambda: self.keys("Next", ["ctrl"]))
            await asyncio.sleep(0.5)
            if not c:   # no pasó a la nueva: se va a ella por la fuerza para poder cerrarla
                await self.keys("Next", ["ctrl"])
                await asyncio.sleep(0.5)
        await vis("visible", "cerrar pestaña (Ctrl+W)", lambda: self.keys("w", ["ctrl"]))
