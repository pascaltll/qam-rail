"""Autoprueba del navegador (dev.73): con Firefox (o Edge) delante, abre una página de prueba y comprueba, por el MISMO camino que usa el dedo y el
teclado de QAM, que lo importante sigue funcionando: tocar, volver a tocar el mismo botón, desplazar (y que lo haga bajo el dedo y no bajo el
puntero), la inercia, el sentido del desplazamiento, escribir con el teclado y abrir/cambiar/cerrar pestañas. La página avisa al servidor de
CADA evento que recibe, así que además de «funciona» se mide cuánto tarda. Sirve para ver de golpe qué rompió una actualización."""
from __future__ import annotations

import asyncio
import re
import json
import time
import urllib.parse

import qam_pad as q
import qam_selftest_page as pg
PAGE = pg.PAGE

class Probe:
    """Servidor mínimo en 127.0.0.1: sirve la página y apunta cada evento que ella le manda."""

    def __init__(self):
        self.events: list = []
        self.hits: list = []   # TODAS las peticiones (también la de la página): distingue «el navegador no pidió nada» de «la página no mandó eventos»
        self.cmd = {"n": 0, "scene": "base"}   # qué escena debe mostrar la página (la página lo consulta cada 150 ms)
        self._media = {"/v.webm": ("video/webm", None), "/a.wav": ("audio/wav", None)}
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

    def _body(self, path: str):
        if path == "/":
            return "text/html; charset=utf-8", pg.PAGE.encode("utf-8")
        if path == "/blank":
            return "text/html; charset=utf-8", pg.BLANK.encode("utf-8")
        if path in self._media:
            typ, data = self._media[path]
            if data is None:
                data = pg.video_bytes() if path == "/v.webm" else pg.audio_bytes()
                self._media[path] = (typ, data)
            return typ, data
        return None

    async def _handle(self, r, w) -> None:
        try:
            line = (await asyncio.wait_for(r.readline(), 5)).decode("latin-1")
            rng = None
            while True:   # cabeceras (el vídeo y el audio piden «Range»: sin él el navegador no deja saltar a otro punto)
                h = await asyncio.wait_for(r.readline(), 5)
                if h in (b"\r\n", b"\n", b""):
                    break
                if h.lower().startswith(b"range:"):
                    m = re.search(rb"bytes=(\d*)-(\d*)", h)
                    if m:
                        rng = (m.group(1), m.group(2))
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
            elif u.path == "/cmd":
                body = json.dumps(self.cmd).encode()
                w.write(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: " + str(len(body)).encode() + b"\r\nConnection: close\r\n\r\n" + body)
            else:
                got = self._body(u.path)
                if got is None:
                    w.write(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n")
                else:
                    typ, data = got
                    total = len(data)
                    status, extra = b"200 OK", b""
                    if rng and (rng[0] or rng[1]):
                        a0 = int(rng[0]) if rng[0] else max(0, total - int(rng[1]))
                        b0 = min(int(rng[1]), total - 1) if (rng[0] and rng[1]) else total - 1
                        if a0 <= b0:
                            data = data[a0:b0 + 1]
                            status, extra = b"206 Partial Content", f"Content-Range: bytes {a0}-{b0}/{total}\r\n".encode()
                    w.write(b"HTTP/1.1 " + status + b"\r\nContent-Type: " + typ.encode() + b"\r\nAccept-Ranges: bytes\r\nCache-Control: no-store\r\n" + extra
                            + b"Content-Length: " + str(len(data)).encode() + b"\r\nConnection: close\r\n\r\n" + data)
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
    def __init__(self, runner, keys, typ, log=None, title=None, opener=None, setmode=None):
        """`runner`: el PadRunner en marcha (con su X). `keys(key, mods)` y `typ(text)`: el teclado de QAM (async, devuelven bool)."""
        self.r, self.keys, self.typ = runner, keys, typ
        self.log = log or (lambda *_, **__: None)
        self.title = title or (lambda: "")   # título de la ventana del navegador (para el diagnóstico)
        self.setmode = setmode               # setmode(mod=None, ch=None, save=False): cambia/guarda cómo se aplican Ctrl/Mayús en el teclado de QAM
        self.opener = opener                 # abre una URL en el navegador por el sistema (xdg-open): no depende de la barra de direcciones
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

    def half(self, id_: str) -> int:
        """Medio recorrido (px de pantalla) que se puede arrastrar sin salirse del elemento: 80 % de su semialtura."""
        return max(30, round(self.rects[id_][3] * self.ay[0] / 2 * 0.8))

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
        self.W, self.H = W, H
        self.ts = q.TouchScroll((0, W), (0, H), (W, H))
        self.ts.full = self.ts.force_full = True
        self.ts.tr = self.r._tr
        self.r._ts["selftest"] = self.ts
        await self.probe.start()
        try:
            if await self.s_cargar(W, H) and await self.s_calibrar(W, H):
                for step in (self.s_clic, self.s_mismo_sitio, self.s_scroll, self.s_inercia, self.s_texto, self.s_select, self.s_popups, self.s_video, self.s_audio,
                             self.s_menus, self.s_pantalla_navegador, self.s_pestanas):
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
        tit0 = (self.title() or "").strip()
        if re.search(r"restore session|restaurar sesi|session restore", tit0, re.I):
            return self.res("cargar página", False, f"el navegador está en la pantalla de restaurar sesión («{tit0[:50]}»): toca «Start New Session» o «Restore Session» y repite")
        how, e, ok = "", None, True
        if self.opener:   # primero sin teclado: el sistema abre la dirección en el navegador (no depende de la barra de direcciones: barras reducidas, extensiones de pestaña nueva…)
            how = "xdg-open"
            try:
                await self.opener(url)
                self.opened = True
            except Exception as ex:  # noqa: BLE001
                self.log(f"xdg-open falló: {str(ex)[:60]}")
            e = await self.probe.wait(i, "ready", timeout=9.0)
        if not e:
            how = "teclado (Ctrl+T)"
            ok = await self.keys("t", ["ctrl"])
            self.opened = True
            await asyncio.sleep(0.8)
            ok = await self.typ(url) and ok
            await asyncio.sleep(0.2)
            ok = await self.keys("Return", []) and ok
            e = await self.probe.wait(i, "ready", timeout=6.0)
        if not e:   # último intento: por la barra de direcciones de la pestaña en la que estemos
            how = "teclado (Ctrl+L)"
            await self.keys("l", ["ctrl"])
            await asyncio.sleep(0.4)
            await self.typ(url)
            await asyncio.sleep(0.2)
            await self.keys("Return", [])
            e = await self.probe.wait(i, "ready", timeout=5.0)
        if not e:
            tit = (self.title() or "").strip()
            det = (f"la página de prueba no cargó en 20 s · el navegador pidió la página {len([h for h in self.probe.hits if h == '/'])} vez/veces y "
                   f"mandó {len(self.probe.events)} evento(s) · título de la ventana: «{tit[:60]}»")
            return self.res("cargar página", False, det if ok else "no se pudo escribir la dirección (el teclado no llegó)")
        self.rects = e["d"]["rects"]
        return self.res("cargar página", True, f"{int(e['d']['iw'])}x{int(e['d']['ih'])} px CSS, escala {e['d']['dpr']} · abierta con {how}", (e["t"] - t0) * 1000)

    async def _calib(self, pts: list):
        """Dos toques en puntos de pantalla conocidos → (escala, desplazamiento) pantalla ← cliente por eje, o un texto con el fallo."""
        got = []
        for (x, y) in pts:
            i = self.probe.mark()
            await self.tap(x, y)
            e = await self.probe.wait(i, "click", timeout=1.5)
            if not e:
                return f"el toque en {x},{y} no llegó a la página"
            got.append((x, y, e["d"]["cx"], e["d"]["cy"]))
            await asyncio.sleep(0.5)   # que no cuente como doble toque
        fx, fy = fit_axis(got[0][0], got[1][0], got[0][2], got[1][2]), fit_axis(got[0][1], got[1][1], got[0][3], got[1][3])
        if not fx or not fy:
            return f"los dos toques cayeron en el mismo punto de la página: {got}"
        return fx, fy

    async def s_calibrar(self, W: int, H: int) -> bool:
        r = await self._calib([(int(W * 0.30), int(H * 0.55)), (int(W * 0.62), int(H * 0.80))])
        if isinstance(r, str):
            return self.res("calibrar toques", False, r)
        self.ax, self.ay = r
        return self.res("calibrar toques", True, f"escala {r[0][0]:.2f}×{r[1][0]:.2f} px pantalla por px CSS")

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
            d = self.half(box)
            a0, b0 = await self.top(box), await self.top(otra)
            t = time.monotonic()
            await self.drag(x, y + d, x, y - d, 0.5)   # dedo hacia arriba: la lista baja
            await asyncio.sleep(1.2)
            a1, b1 = await self.top(box), await self.top(otra)
            self.res(f"desplazar {box} con el dedo", a1 > a0 + 20 and b1 == b0, f"{box}: {a0}→{a1} px; {otra}: {b0}→{b1} px" + ("" if a1 > a0 + 20 else " (no se movió bajo el dedo)") + ("" if b1 == b0 else " (se movió la otra caja)"), (time.monotonic() - t) * 1000)
        x, y = self.scr("box1")
        d = self.half("box1")
        a0 = await self.top("box1")
        await self.drag(x, y - d, x, y + d, 0.5)   # dedo hacia abajo: la lista sube
        await asyncio.sleep(1.2)
        a1 = await self.top("box1")
        self.res("sentido del desplazamiento", a1 < a0 - 20, f"dedo hacia abajo: {a0}→{a1} px" + ("" if a1 < a0 - 20 else " (el sentido está al revés o no se movió)"))

    async def s_inercia(self) -> None:
        x, y = self.scr("box2")
        d = self.half("box2")
        await self.drag(x, y - d, x, y + d, 0.4)   # hacia abajo: la lista vuelve arriba y hay recorrido para el latigazo
        await asyncio.sleep(1.5)
        await self.drag(x, y + d, x, y - d, 0.10)   # un latigazo rápido hacia arriba
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
        await self.s_modificadores()

    async def _vaciar(self) -> None:
        for _ in range(12):
            await self.keys("BackSpace", [])
        await asyncio.sleep(0.15)

    async def _espera_valor(self, want: str, timeout: float) -> bool:
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            got = next((ev["d"].get("v") for ev in reversed(self.probe.events) if ev["k"] == "input"), None)
            if got == want:
                return True
            await asyncio.sleep(0.05)
        return False

    async def _prueba_ctrl(self) -> bool:
        await self._vaciar()
        await self.typ("zz")
        await asyncio.sleep(0.1)
        await self.keys("a", ["ctrl"])
        await asyncio.sleep(0.1)
        await self.typ("q")
        return await self._espera_valor("q", 1.2)

    async def _prueba_simbolos(self) -> bool:
        await self._vaciar()
        await self.typ("Ab:/_9")
        return await self._espera_valor("Ab:/_9", 1.5)

    async def s_modificadores(self) -> None:
        """Ctrl y Mayús por el teclado de QAM: prueba varias formas de aplicarlos y se queda con la que funciona (queda guardada)."""
        if not self.setmode:
            ok = await self._prueba_ctrl()
            self.res("atajos con Ctrl", ok, "Ctrl+A seleccionó el texto" if ok else "Ctrl+A se escribió como letra: el navegador ignora Ctrl")
            ok2 = await self._prueba_simbolos()
            self.res("mayúsculas y símbolos", ok2, "escribió «Ab:/_9»" if ok2 else "no llegó Mayús/AltGr")
            return
        tried: list = []
        mod = None
        for m in ("keys", "slow", "lock"):
            self.setmode(mod=m)
            good = await self._prueba_ctrl()
            tried.append(f"{m}:{'sí' if good else 'no'}")
            if good:
                mod = m
                break
        if mod is None:
            self.setmode(mod="keys")
            self.res("atajos con Ctrl", False, "ninguna forma de aplicar Ctrl funcionó (" + ", ".join(tried) + ")")
            self.setmode(ch="levels")
        else:
            self.res("atajos con Ctrl", True, f"Ctrl llega con el modo «{mod}»" + (f" (probé: {', '.join(tried)})" if len(tried) > 1 else ""))
        chm = None
        for c in ("levels", "remap"):
            self.setmode(ch=c)
            good = await self._prueba_simbolos()
            if good:
                chm = c
                break
        if chm is None:
            self.setmode(ch="levels")
            self.res("mayúsculas y símbolos", False, "ni con Mayús ni prestando una tecla llegó «Ab:/_9»")
        else:
            self.res("mayúsculas y símbolos", True, f"escribió «Ab:/_9» con el modo «{chm}»")
        if mod is not None and chm is not None:
            self.setmode(save=True)   # se queda para el uso normal
        await self._vaciar()

    async def s_select(self) -> None:
        x, y = self.scr("sel")
        i = self.probe.mark()
        await self.tap(x, y)
        e = await self.probe.wait(i, "down", lambda d: d.get("id") == "sel", 1.0)   # el desplegable se traga el «click»; la pulsación sí llega
        await asyncio.sleep(0.5)
        await self.keys("Escape", [])
        self.res("tocar un desplegable", bool(e), "llegó la pulsación" if e else "no llegó la pulsación al desplegable")

    # ---- escenas (dev.78): pop-ups, vídeo, música, menús, pantalla completa
    async def scene(self, name: str) -> bool:
        i = self.probe.mark()
        self.probe.cmd = {"n": self.probe.cmd["n"] + 1, "scene": name}
        e = await self.probe.wait(i, "scene", lambda d: d.get("n") == name, 4.0)
        if e:
            self.rects = e["d"]["rects"]
            await asyncio.sleep(0.25)
        return bool(e)

    async def new_rects(self, i: int) -> None:
        e = await self.probe.wait(i, "rects", None, 2.0)
        if e:
            self.rects = e["d"]["rects"]

    def last_media(self, id_: str, s_: str = "time", field: str = "t"):
        for e in reversed(self.probe.events):
            if e["k"] == "media" and e["d"].get("id") == id_ and e["d"].get("s") == s_:
                return e["d"].get(field)
        return None

    async def _popup(self, label: str, abrir: str, pid: str, cerrar: str, espera: float) -> None:
        i = self.probe.mark()
        await self.tap(*self.scr(abrir))
        e = await self.probe.wait(i, "popup", lambda d: d.get("id") == pid and d.get("open") is True, 1.5)
        if not e:
            self.res(label, False, "no se abrió el pop-up al tocar su botón")
            return
        await asyncio.sleep(espera)
        j = self.probe.mark()
        t = await self.tap(*self.scr(cerrar))
        e2 = await self.probe.wait(j, "popup", lambda d: d.get("id") == pid and d.get("open") is False, 1.5)
        self.res(label, bool(e2), "se cerró" if e2 else f"el toque en «{cerrar}» no cerró el pop-up", None if not e2 else (e2["t"] - t) * 1000)
        await asyncio.sleep(0.5)

    async def s_popups(self) -> None:
        if not await self.scene("popups"):
            self.res("pop-ups", False, "la página no cambió de escena")
            return
        await self._popup("pop-up modal: cerrar con ✕", "pm1", "m1", "m1x", 0.3)
        await self._popup("aviso de cookies: Rechazar", "pm2", "m2", "m2no", 0.3)
        await self._popup("anuncio: cerrar con una ✕ pequeña", "pm3", "m3", "m3x", 1.4)
        i = self.probe.mark()
        await self.tap(*self.scr("pl"))
        e = await self.probe.wait(i, "vis", lambda d: d.get("s") == "hidden", 3.0)
        if not e:
            self.res("enlace a pestaña nueva y cerrarla", False, "el enlace no abrió una pestaña nueva (¿el navegador lo bloqueó?)")
            return
        await asyncio.sleep(0.8)
        j = self.probe.mark()
        await self.keys("w", ["ctrl"])
        e2 = await self.probe.wait(j, "vis", lambda d: d.get("s") == "visible", 2.5)
        self.res("enlace a pestaña nueva y cerrarla", bool(e2), "se abrió y se cerró con Ctrl+W" if e2 else "la pestaña nueva no se cerró con Ctrl+W")
        await asyncio.sleep(0.4)

    async def _seek_tap(self, p: str, fx: float) -> float | None:
        i = self.probe.mark()
        await self.tap(*self.scr(p + "seek", fx, 0.5))
        e = await self.probe.wait(i, "media", lambda d: d.get("id") == p and d.get("s") == "seeked", 2.0)
        if not e or not e["d"].get("d"):
            return None
        return e["d"]["t"] / e["d"]["d"]

    async def _player(self, p: str, nombre: str) -> None:
        """Reproducir, saltar tocando la barra, arrastrar la barra, pausar, volumen tocando y arrastrando."""
        await asyncio.sleep(0.6)
        i = self.probe.mark()
        await self.tap(*self.scr(p + "play"))
        e = await self.probe.wait(i, "media", lambda d: d.get("id") == p and d.get("s") == "play", 3.0)
        if not e:
            err = next((ev["d"] for ev in self.probe.events[i:] if ev["k"] == "media" and ev["d"].get("s") == "error"), None)
            self.res(f"{nombre}: reproducir", False, "no empezó a reproducirse" + (f" (error de medio {err.get('c')})" if err else ""))
            return
        await asyncio.sleep(1.5)
        t = self.last_media(p) or 0
        self.res(f"{nombre}: reproducir", t > 0.8, f"avanzó hasta {t:.1f} s" if t > 0.8 else f"no avanza (en {t:.1f} s)")
        f = await self._seek_tap(p, 0.75)
        self.res(f"{nombre}: saltar tocando la barra", f is not None and 0.6 <= f <= 0.9, f"fue al {f * 100:.0f} % (pedido: 75 %)" if f is not None else "no llegó el salto")
        await self._seek_tap(p, 0.10)
        j = self.probe.mark()
        await self.drag(*self.scr(p + "seek", 0.15, 0.5), *self.scr(p + "seek", 0.85, 0.5), 0.5)
        await asyncio.sleep(0.8)
        f2 = (self.last_media(p) or 0) / max(0.1, self.last_media(p, "time", "d") or 6)
        dr = next((ev["d"].get("n") for ev in self.probe.events[j:] if ev["k"] == "vdrag" and ev["d"].get("id") == p), None)
        self.res(f"{nombre}: arrastrar la barra de progreso", f2 > 0.6, f"llegó al {f2 * 100:.0f} %" if f2 > 0.6 else f"llegó solo al {f2 * 100:.0f} %" + (" (el dedo desplazó la página en vez de arrastrar la barra)" if dr is None else f" ({dr} movimientos)"))
        j = self.probe.mark()
        await self.tap(*self.scr(p + "play"))
        e = await self.probe.wait(j, "media", lambda d: d.get("id") == p and d.get("s") == "pause", 2.0)
        self.res(f"{nombre}: pausar", bool(e), "pausado" if e else "no se pausó")
        j = self.probe.mark()
        await self.tap(*self.scr(p + "vol", 0.35, 0.5))
        e = await self.probe.wait(j, "media", lambda d: d.get("id") == p and d.get("s") == "vol", 1.5)
        v = e["d"]["vol"] if e else None
        self.res(f"{nombre}: volumen tocando la barra", v is not None and abs(v - 0.35) < 0.15, f"volumen {v:.2f} (pedido: 0.35)" if v is not None else "no llegó el toque")
        await asyncio.sleep(0.5)
        j = self.probe.mark()
        await self.drag(*self.scr(p + "vol", 0.3, 0.5), *self.scr(p + "vol", 0.95, 0.5), 0.5)
        await asyncio.sleep(0.5)
        vols = [ev["d"]["vol"] for ev in self.probe.events[j:] if ev["k"] == "media" and ev["d"].get("id") == p and ev["d"].get("s") == "vol"]
        ult = vols[-1] if vols else None
        self.res(f"{nombre}: arrastrar el volumen", ult is not None and ult > 0.75, f"volumen {ult:.2f}" if ult is not None else "el dedo no movió el control (se interpretó como desplazamiento)")

    async def s_video(self) -> None:
        if not await self.scene("video"):
            self.res("vídeo", False, "la página no cambió de escena")
            return
        await self._player("v", "vídeo")
        # pantalla completa del vídeo (dos veces: se sale tocando ⛶ y con Esc)
        for salida in ("⛶", "Esc"):
            i = self.probe.mark()
            await self.tap(*self.scr("vfs"))
            e = await self.probe.wait(i, "fs", lambda d: d.get("on") is True, 3.0)
            if not e:
                err = next((ev["d"].get("err") for ev in self.probe.events[i:] if ev["k"] == "fs" and ev["d"].get("err")), None)
                self.res("vídeo: pantalla completa", False, "no entró en pantalla completa" + (f" ({err})" if err else ""))
                return
            if salida == "⛶":
                self.res("vídeo: pantalla completa", True, f"{int(e['d']['iw'])}x{int(e['d']['ih'])} px CSS")
            await self.new_rects(i)
            old = (self.ax, self.ay)
            cal = await self._calib([(int(self.W * 0.30), int(self.H * 0.35)), (int(self.W * 0.62), int(self.H * 0.60))])   # sobre el vídeo, lejos de los controles
            if isinstance(cal, str):
                self.res("vídeo: tocar en pantalla completa", False, cal)
                await self.keys("Escape", [])
                self.ax, self.ay = old
                return
            self.ax, self.ay = cal
            if salida == "⛶":
                j = self.probe.mark()
                await self.tap(*self.scr("vplay"))
                e2 = await self.probe.wait(j, "media", lambda d: d.get("id") == "v" and d.get("s") in ("play", "pause"), 1.5)
                self.res("vídeo: tocar los controles en pantalla completa", bool(e2), "el toque llegó al botón" if e2 else f"el toque no llegó al botón de reproducir (botón en {[round(v) for v in self.rects.get('vplay', [])]} px CSS, calibración {self.ax[0]:.2f}·{self.ax[1]:.0f} / {self.ay[0]:.2f}·{self.ay[1]:.0f})")
                await asyncio.sleep(0.4)
            j = self.probe.mark()
            if salida == "⛶":
                await self.tap(*self.scr("vfs"))
            else:
                await self.keys("Escape", [])
            e3 = await self.probe.wait(j, "fs", lambda d: d.get("on") is False, 3.0)
            if not e3:   # que no quede atascado: se prueba el otro camino
                await self.keys("Escape", [])
                e3 = await self.probe.wait(j, "fs", lambda d: d.get("on") is False, 2.0)
                self.res(f"vídeo: salir de pantalla completa con {salida}", False, "no salió" + (" (sí con Esc)" if e3 and salida != "Esc" else ""))
            else:
                self.res(f"vídeo: salir de pantalla completa con {salida}", True, "salió")
            self.ax, self.ay = old
            if not e3:
                return
            await self.new_rects(j)
            await asyncio.sleep(0.5)
        await asyncio.sleep(0.2)
        await self.tap(*self.scr("vplay"))   # deja el vídeo parado
        await asyncio.sleep(0.4)

    async def s_audio(self) -> None:
        if not await self.scene("audio"):
            self.res("música", False, "la página no cambió de escena")
            return
        await self._player("a", "música")
        await self.tap(*self.scr("aplay"))   # que no quede sonando
        await asyncio.sleep(0.3)

    async def s_menus(self) -> None:
        if not await self.scene("menu"):
            self.res("menús", False, "la página no cambió de escena")
            return
        # desplegable nativo largo (como los menús del navegador: es una ventana emergente aparte)
        x, y, w, h = self.rects["sel2"]
        sx, sy = self.scr("sel2")
        bottom = round(self.ay[1] + (y + h) * self.ay[0])
        i = self.probe.mark()
        await self.tap(sx, sy)
        e = await self.probe.wait(i, "down", lambda d: d.get("id") == "sel2", 1.5)
        await asyncio.sleep(0.8)
        await self.drag(sx, bottom + 220, sx, bottom + 40, 0.5)   # dedo hacia arriba dentro de la lista: baja
        await asyncio.sleep(1.2)
        j = self.probe.mark()
        await self.tap(sx, bottom + 28)   # primera fila visible
        e2 = await self.probe.wait(j, "change", lambda d: d.get("id") == "sel2", 1.5)
        if e2:
            k = e2["d"]["i"]
            self.res("desplegable largo: desplazar y elegir con el dedo", k >= 3, f"eligió «{e2['d']['v']}»" + ("" if k >= 3 else " (la lista no se desplazó: eligió una de las primeras)"))
        else:
            await self.keys("Escape", [])
            self.res("desplegable largo: desplazar y elegir con el dedo", False, "no se eligió nada" + ("" if e else " (ni siquiera se abrió)"))
        await asyncio.sleep(0.6)
        # menú de la página con scroll
        j = self.probe.mark()
        await self.tap(*self.scr("hmb"))
        e = await self.probe.wait(j, "menu", lambda d: d.get("open") is True, 1.5)
        if not e:
            self.res("menú de la página: abrir, desplazar y elegir", False, "no se abrió el menú")
            return
        await asyncio.sleep(0.4)
        mx, my = self.scr("hmenu")
        j = self.probe.mark()
        await self.drag(mx, my + 90, mx, my - 90, 0.5)
        await asyncio.sleep(1.0)
        tops = [ev["d"]["top"] for ev in self.probe.events[j:] if ev["k"] == "mscroll"]
        tp = max(tops) if tops else 0
        j = self.probe.mark()
        await self.tap(mx, my - 80 + 20)   # una fila de las de arriba (tras desplazar)
        e2 = await self.probe.wait(j, "mitem", None, 1.2)
        okm = tp > 40 and bool(e2)
        self.res("menú de la página: abrir, desplazar y elegir", okm, f"desplazó {tp} px y eligió «Elemento {e2['d']['i']}»" if e2 and tp > 40 else (f"desplazó {tp} px pero no llegó el toque a una fila" if tp > 40 else "el dedo no desplazó el menú"))
        await self.tap(*self.scr("hmb"))
        await asyncio.sleep(0.4)

    async def s_pantalla_navegador(self) -> None:
        if not await self.scene("base"):
            self.res("pantalla completa del navegador", False, "la página no volvió a la escena base")
            return
        i = self.probe.mark()
        await self.keys("F11", [])
        e = await self.probe.wait(i, "resize", lambda d: d.get("ih", 0) >= d.get("sh", 1e9) - 8 and d.get("iw", 0) >= d.get("sw", 1e9) - 8, 4.0)
        if not e:
            self.res("pantalla completa del navegador (F11)", False, "el navegador no pasó a pantalla completa con F11 ({})".format(self.title()[:40] if callable(self.title) else ""))
            return
        self.res("pantalla completa del navegador (F11)", True, f"{int(e['d']['iw'])}x{int(e['d']['ih'])} px CSS")
        await self.new_rects(i)
        old = (self.ax, self.ay)
        cal = await self._calib([(int(self.W * 0.30), int(self.H * 0.55)), (int(self.W * 0.62), int(self.H * 0.80))])
        if isinstance(cal, str):
            self.res("tocar en pantalla completa del navegador", False, cal)
        else:
            self.ax, self.ay = cal
        j = self.probe.mark()
        await self.tap(*self.scr("b1"))
        e2 = await self.probe.wait(j, "click", lambda d: d.get("id") == "b1", 1.2)
        self.res("tocar en pantalla completa del navegador", bool(e2), "llegó el clic" if e2 else f"el toque no llegó a la página (calibración {self.ax[0]:.2f}·{self.ax[1]:.0f} / {self.ay[0]:.2f}·{self.ay[1]:.0f})")
        j = self.probe.mark()
        await self.keys("F11", [])
        e3 = await self.probe.wait(j, "resize", lambda d: d.get("ih", 0) < d.get("sh", 0) - 40, 4.0)
        self.res("salir de pantalla completa del navegador (F11)", bool(e3), "salió" if e3 else "sigue en pantalla completa")
        self.ax, self.ay = old
        await self.new_rects(j)
        await asyncio.sleep(0.5)

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
