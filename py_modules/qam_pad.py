"""Mando como ratón y teclado para las apps de escritorio (0.54 dev.26).

En Game Mode una app de escritorio tiene un identificador de Steam inventado y el mando no hace nada en ella. Mientras una de esas apps
está en primer plano (y el menú de Steam no), se leen los eventos del mando (/dev/input/event*, nodos con «js») y se convierten en
ratón y teclado con XTest (libX11/libXtst por ctypes), como en un navegador de Xbox: stick izquierdo = cursor, A = clic, X = clic derecho,
B = atrás, derecho = desplazar, LB/RB = pestañas, cruceta = flechas.

Lo puro (analizador de dispositivos, mapeo, curva del stick) no toca el sistema y se prueba en tests/py/test_desktop.py.
Todo lo que toca hardware es [H] hasta probarlo en el equipo; `pad.log` anota dispositivos, errores y lo que se envía."""
from __future__ import annotations

import asyncio
import ctypes
import ctypes.util
import math
import os
import re
import struct
import time

EV_KEY, EV_ABS = 1, 3
ABS_X, ABS_Y, ABS_Z, ABS_RX, ABS_RY, ABS_RZ, ABS_HAT0X, ABS_HAT0Y = 0, 1, 2, 3, 4, 5, 16, 17
# Botones de mando de Linux (xpad / mando virtual de Steam).
BTN_MODE = 316  # botón Steam/Guía: con él se abre el QAM; sus combinaciones no son para la app
BTN_NAMES = {304: "A", 305: "B", 307: "X", 308: "Y", 310: "LB", 311: "RB", 314: "SELECT", 315: "START", 317: "L3", 318: "R3",
             544: "UP", 545: "DOWN", 546: "LEFT", 547: "RIGHT"}
DPAD_KEYS = {"UP": "Up", "DOWN": "Down", "LEFT": "Left", "RIGHT": "Right"}
# Qué hace cada botón al pulsarlo (clic = botón de ratón; el resto, combinación de teclas).
CLICKS = {"A": 1, "X": 3, "L3": 2}
KEYS = {"B": "alt+Left", "Y": "ctrl+l", "LB": "ctrl+shift+Tab", "RB": "ctrl+Tab", "START": "Return", "SELECT": "Escape", "R3": "ctrl+0"}
TRIGGER_KEYS = {"LT": "Prior", "RT": "Next"}  # Re Pág / Av Pág
DEAD = 0.18
REPEAT_DELAY, REPEAT_EVERY = 0.40, 0.07
EVENT_FMT = "llHHi"  # struct input_event en 64 bits: tv_sec, tv_usec, type, code, value
EVENT_SIZE = struct.calcsize(EVENT_FMT)


# ---------------------------------------------------------------- puro
def parse_devices(text: str) -> list:
    """`/proc/bus/input/devices` → [{name, event}] de los dispositivos con asa «jsN» (mandos). El de Steam y el físico tienen el mismo nombre."""
    out = []
    for blk in re.split(r"\n\s*\n", text or ""):
        name = re.search(r'^N: Name="(.*)"', blk, re.M)
        hand = re.search(r"^H: Handlers=(.*)$", blk, re.M)
        if not name or not hand:
            continue
        hs = hand.group(1).split()
        ev = next((h for h in hs if re.fullmatch(r"event\d+", h)), None)
        if ev and any(re.fullmatch(r"js\d+", h) for h in hs):
            out.append({"name": name.group(1), "event": ev})
    return out


def norm_axis(value: int, lo: int, hi: int, trigger: bool = False) -> float:
    """Valor crudo → -1..1 (sticks) o 0..1 (gatillos)."""
    span = (hi - lo) or 1
    t = (value - lo) / span
    return max(0.0, min(1.0, t)) if trigger else max(-1.0, min(1.0, t * 2 - 1))


def stick_vector(x: float, y: float, dead: float = DEAD) -> tuple:
    """Zona muerta y curva cuadrática: movimientos finos con poco recorrido y rápidos al fondo. Devuelve (vx, vy) en -1..1."""
    m = math.hypot(x, y)
    if m <= dead:
        return 0.0, 0.0
    f = ((min(m, 1.0) - dead) / (1.0 - dead)) ** 2
    return x / m * f, y / m * f


class PadMapper:
    """Estado del mando → acciones. `feed_*` devuelve acciones de un evento; `tick` el movimiento continuo y las repeticiones de la cruceta.
    Acciones: ("button", n, pulsado) · ("key", "ctrl+Tab")."""

    def __init__(self, speed: float = 1100.0, wheel: float = 14.0):
        self.speed, self.wheel = speed, wheel
        self.ax = {ABS_X: 0.0, ABS_Y: 0.0, ABS_RX: 0.0, ABS_RY: 0.0}
        self.trig = {"LT": False, "RT": False}
        self.dpad: dict = {}     # tecla → instante de la próxima repetición
        self._rem = [0.0, 0.0, 0.0, 0.0]

    def reset(self) -> list:
        """Al perder el primer plano: suelta lo pulsado (si no, un clic o una flecha se quedarían colgados)."""
        out = [("button", n, False) for n in set(CLICKS.values())]
        self.ax = {k: 0.0 for k in self.ax}
        self.trig = {"LT": False, "RT": False}
        self.dpad.clear()
        self._rem = [0.0, 0.0, 0.0, 0.0]
        return out

    def feed_button(self, code: int, pressed: bool, now: float = 0.0) -> list:
        n = BTN_NAMES.get(code)
        if not n:
            return []
        if n in CLICKS:
            return [("button", CLICKS[n], pressed)]
        if n in DPAD_KEYS:
            return self._dpad(DPAD_KEYS[n], pressed, now)
        if pressed and n in KEYS:
            return [("key", KEYS[n])]
        return []

    def _dpad(self, key: str, pressed: bool, now: float) -> list:
        if pressed:
            self.dpad[key] = now + REPEAT_DELAY
            return [("key", key)]
        self.dpad.pop(key, None)
        return []

    def feed_axis(self, code: int, v: float, now: float = 0.0) -> list:
        """`v` ya normalizado: sticks -1..1, gatillos 0..1, cruceta (hat) -1/0/1."""
        if code in self.ax:
            self.ax[code] = v
            return []
        if code in (ABS_Z, ABS_RZ):
            name = "LT" if code == ABS_Z else "RT"
            on = v > 0.5
            was, self.trig[name] = self.trig[name], on
            return [("key", TRIGGER_KEYS[name])] if on and not was else []
        if code in (ABS_HAT0X, ABS_HAT0Y):
            neg, pos = ("Left", "Right") if code == ABS_HAT0X else ("Up", "Down")
            out = []
            for key, active in ((neg, v < -0.5), (pos, v > 0.5)):
                if active and key not in self.dpad:
                    out += self._dpad(key, True, now)
                elif not active and key in self.dpad:
                    self._dpad(key, False, now)
            return out
        return []

    def tick(self, dt: float, now: float) -> tuple:
        """(acciones, dx, dy, rueda_vertical, rueda_horizontal): píxeles y clics de rueda enteros (el resto se acumula)."""
        acts = []
        for key, at in list(self.dpad.items()):
            if now >= at:
                acts.append(("key", key))
                self.dpad[key] = now + REPEAT_EVERY
        vx, vy = stick_vector(self.ax[ABS_X], self.ax[ABS_Y])
        sx, sy = stick_vector(self.ax[ABS_RX], self.ax[ABS_RY])
        add = (vx * self.speed * dt, vy * self.speed * dt, sy * self.wheel * dt, sx * self.wheel * dt)
        out = []
        for i, a in enumerate(add):
            self._rem[i] += a
            n = int(self._rem[i])
            self._rem[i] -= n
            out.append(n)
        return acts, out[0], out[1], out[2], out[3]


# ---------------------------------------------------------------- salida a X (XTest)
_X_ERR_CB = None


def _quiet_x_errors(x11) -> None:
    """Xlib, ante un error de petición (p. ej. una ventana que acaba de cerrarse), llama a exit() y mata TODO el proceso: el backend del plugin
    se caía al cerrar una app por fuera del QAM. Con un manejador que no hace nada, la petición falla sola (XGetGeometry devuelve 0)."""
    global _X_ERR_CB
    if _X_ERR_CB is None:
        _X_ERR_CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p)(lambda _d, _e: 0)
    x11.XSetErrorHandler.restype = ctypes.c_void_p
    x11.XSetErrorHandler.argtypes = [ctypes.c_void_p]
    x11.XSetErrorHandler(ctypes.cast(_X_ERR_CB, ctypes.c_void_p))



class XOut:
    """Ratón y teclado falsos con XTest sobre la pantalla del usuario. Lanza OSError si no puede abrirla o faltan las bibliotecas."""

    MODS = {"ctrl": "Control_L", "shift": "Shift_L", "alt": "Alt_L"}

    def __init__(self, display: str, xauth: str | None):
        if xauth:
            os.environ["XAUTHORITY"] = xauth
        x11 = ctypes.CDLL(ctypes.util.find_library("X11") or "libX11.so.6")
        xt = ctypes.CDLL(ctypes.util.find_library("Xtst") or "libXtst.so.6")
        vp, ci, cu, cl = ctypes.c_void_p, ctypes.c_int, ctypes.c_uint, ctypes.c_ulong
        x11.XOpenDisplay.restype, x11.XOpenDisplay.argtypes = vp, [ctypes.c_char_p]
        x11.XStringToKeysym.restype, x11.XStringToKeysym.argtypes = cl, [ctypes.c_char_p]
        x11.XKeysymToKeycode.restype, x11.XKeysymToKeycode.argtypes = ctypes.c_ubyte, [vp, cl]
        x11.XFlush.argtypes = [vp]
        x11.XCloseDisplay.argtypes = [vp]
        x11.XInternAtom.restype, x11.XInternAtom.argtypes = cl, [vp, ctypes.c_char_p, ci]
        x11.XDefaultRootWindow.restype, x11.XDefaultRootWindow.argtypes = cl, [vp]
        x11.XGetWindowProperty.restype = ci
        x11.XGetWindowProperty.argtypes = [vp, cl, cl, ctypes.c_long, ctypes.c_long, ci, cl, ctypes.POINTER(cl), ctypes.POINTER(ci),
                                           ctypes.POINTER(cl), ctypes.POINTER(cl), ctypes.POINTER(vp)]
        x11.XFree.argtypes = [vp]
        x11.XResizeWindow.argtypes = [vp, cl, cu, cu]
        x11.XSetInputFocus.argtypes = [vp, cl, ci, cl]
        x11.XGetGeometry.argtypes = [vp, cl, ctypes.POINTER(cl), ctypes.POINTER(ci), ctypes.POINTER(ci), ctypes.POINTER(cu), ctypes.POINTER(cu),
                                     ctypes.POINTER(cu), ctypes.POINTER(cu)]
        x11.XKeycodeToKeysym.restype, x11.XKeycodeToKeysym.argtypes = cl, [vp, ctypes.c_ubyte, ci]
        x11.XDefaultScreen.restype, x11.XDefaultScreen.argtypes = ci, [vp]
        x11.XDisplayWidth.restype, x11.XDisplayWidth.argtypes = ci, [vp, ci]
        x11.XDisplayHeight.restype, x11.XDisplayHeight.argtypes = ci, [vp, ci]
        xt.XTestFakeRelativeMotionEvent.argtypes = [vp, ci, ci, cl]
        xt.XTestFakeButtonEvent.argtypes = [vp, cu, ci, cl]
        xt.XTestFakeKeyEvent.argtypes = [vp, cu, ci, cl]
        self.x11, self.xt = x11, xt
        _quiet_x_errors(x11)
        self.dpy = x11.XOpenDisplay(display.encode())
        if not self.dpy:
            raise OSError(f"no se pudo abrir la pantalla {display}")
        self._codes: dict = {}

    def close(self) -> None:
        try:
            self.x11.XCloseDisplay(self.dpy)
        except Exception:  # noqa: BLE001
            pass

    def cardinals(self, name: str, wid: int | None = None) -> list:
        """Propiedad CARDINAL (32 bits) de la ventana raíz (o de `wid`), p. ej. GAMESCOPE_FOCUSED_APP; [] si no existe. Sin lanzar procesos."""
        atom = self.x11.XInternAtom(self.dpy, name.encode(), 1)
        if not atom:
            return []
        typ, fmt, n, after = ctypes.c_ulong(), ctypes.c_int(), ctypes.c_ulong(), ctypes.c_ulong()
        data = ctypes.c_void_p()
        root = int(wid) if wid else self.x11.XDefaultRootWindow(self.dpy)
        rc = self.x11.XGetWindowProperty(self.dpy, root, atom, 0, 64, 0, 6, ctypes.byref(typ), ctypes.byref(fmt), ctypes.byref(n),
                                         ctypes.byref(after), ctypes.byref(data))
        if rc != 0 or not data.value or fmt.value != 32:
            if data.value:
                self.x11.XFree(data)
            return []
        vals = [int(v) for v in (ctypes.c_ulong * n.value).from_address(data.value)]
        self.x11.XFree(data)
        return vals

    def screen_size(self) -> tuple:
        sc = self.x11.XDefaultScreen(self.dpy)
        return int(self.x11.XDisplayWidth(self.dpy, sc)), int(self.x11.XDisplayHeight(self.dpy, sc))

    def geometry(self, wid: int):
        """(ancho, alto) de una ventana, o None si ya no existe."""
        root, x, y = ctypes.c_ulong(), ctypes.c_int(), ctypes.c_int()
        w, h, bw, d = ctypes.c_uint(), ctypes.c_uint(), ctypes.c_uint(), ctypes.c_uint()
        ok = self.x11.XGetGeometry(self.dpy, int(wid), ctypes.byref(root), ctypes.byref(x), ctypes.byref(y), ctypes.byref(w), ctypes.byref(h),
                                   ctypes.byref(bw), ctypes.byref(d))
        return (int(w.value), int(h.value)) if ok else None

    def resize(self, wid: int, w: int, h: int) -> None:
        """Cambia el tamaño de una ventana (gamescope lo respeta y la centra)."""
        self.x11.XResizeWindow(self.dpy, int(wid), max(1, int(w)), max(1, int(h)))
        self.x11.XFlush(self.dpy)

    def focus(self, wid: int) -> None:
        """Pone el foco de teclado en una ventana (las teclas de XTest van a la que tiene el foco)."""
        self.x11.XSetInputFocus(self.dpy, int(wid), 1, 0)  # RevertToPointerRoot, CurrentTime
        self.x11.XFlush(self.dpy)

    def type_char(self, ch: str) -> bool:
        """Escribe un carácter con la distribución activa: busca su tecla y el nivel (Mayús, AltGr) y pulsa lo necesario. False si no existe."""
        if not ch or ch == "\n":
            return False
        ks = keysym_for_char(ch)
        code = self.x11.XKeysymToKeycode(self.dpy, ks)
        if not code:
            return False
        idx = next((i for i in range(4) if self.x11.XKeycodeToKeysym(self.dpy, code, i) == ks), None)
        if idx is None:
            return False
        mods = [self._code(n) for n in LEVEL_MODS[idx]]
        for m in mods:
            self.xt.XTestFakeKeyEvent(self.dpy, m, 1, 0)
        self.xt.XTestFakeKeyEvent(self.dpy, code, 1, 0)
        self.xt.XTestFakeKeyEvent(self.dpy, code, 0, 0)
        for m in reversed(mods):
            self.xt.XTestFakeKeyEvent(self.dpy, m, 0, 0)
        return True

    def move(self, dx: int, dy: int) -> None:
        self.xt.XTestFakeRelativeMotionEvent(self.dpy, int(dx), int(dy), 0)

    def button(self, n: int, down: bool) -> None:
        self.xt.XTestFakeButtonEvent(self.dpy, int(n), 1 if down else 0, 0)

    def _code(self, name: str) -> int:
        if name not in self._codes:
            ks = self.x11.XStringToKeysym(name.encode())
            self._codes[name] = self.x11.XKeysymToKeycode(self.dpy, ks) if ks else 0
        return self._codes[name]

    def key(self, combo: str) -> None:
        """«ctrl+shift+Tab»: modificadores, tecla, y se sueltan en orden inverso."""
        parts = combo.split("+")
        mods = [self._code(self.MODS[p.lower()]) for p in parts[:-1] if p.lower() in self.MODS]
        k = self._code(parts[-1])
        if not k:
            return
        for m in mods:
            self.xt.XTestFakeKeyEvent(self.dpy, m, 1, 0)
        self.xt.XTestFakeKeyEvent(self.dpy, k, 1, 0)
        self.xt.XTestFakeKeyEvent(self.dpy, k, 0, 0)
        for m in reversed(mods):
            self.xt.XTestFakeKeyEvent(self.dpy, m, 0, 0)

    def wheel(self, v: int, h: int) -> None:
        for n, b in ((v, 5 if v > 0 else 4), (h, 7 if h > 0 else 6)):
            for _ in range(abs(n)):
                self.xt.XTestFakeButtonEvent(self.dpy, b, 1, 0)
                self.xt.XTestFakeButtonEvent(self.dpy, b, 0, 0)

    def flush(self) -> None:
        self.x11.XFlush(self.dpy)


LEVEL_MODS = {0: [], 1: ["Shift_L"], 2: ["ISO_Level3_Shift"], 3: ["Shift_L", "ISO_Level3_Shift"]}
NAMED_KEYS = {"BackSpace": "BackSpace", "Return": "Return", "Tab": "Tab", "Escape": "Escape", "Left": "Left", "Right": "Right",
              "Up": "Up", "Down": "Down", "Home": "Home", "End": "End", "Prior": "Prior", "Next": "Next", "Delete": "Delete", "F11": "F11"}


def keysym_for_char(ch: str) -> int:
    """Símbolo de X para un carácter: Latin-1 es el propio código; el resto, 0x01000000 + código Unicode."""
    cp = ord(ch)
    return cp if 0x20 <= cp <= 0xFF else 0x1000000 + cp


def grow_steps(w: int, h: int, start: float = 0.78, n: int = 6) -> list:
    """Tamaños (ancho, alto) para ir de `start` a 1 con deceleración; el último es siempre el tamaño completo."""
    out = []
    for i in range(1, n + 1):
        t = i / n
        k = start + (1.0 - start) * (1 - (1 - t) ** 3)
        out.append((w, h) if i == n else (round(w * k), round(h * k)))
    return out


def apply_action(x: XOut, act: tuple) -> None:
    if act[0] == "button":
        x.button(act[1], act[2])
    elif act[0] == "key":
        x.key(act[1])


# ---------------------------------------------------------------- bucle
class PadRunner:
    """Con una app de escritorio delante, lee el mando y manda ratón/teclado. `ours()` da los identificadores de las apps de escritorio abiertas;
    `env()` (async) da (DISPLAY, XAUTHORITY). El primer plano se lee de la propiedad de X con una conexión propia: sin lanzar procesos."""

    def __init__(self, ours, env, log, enabled, event=None):
        self.ours_fn, self.env_fn, self.log, self.enabled_fn = ours, env, log, enabled
        self.event = event or (lambda ev, **d: None)   # caja negra: pad.activo, pad.inactivo, qam.combo
        self.mapper = PadMapper()
        self.is_active = False
        self.events = 0
        self.devices: list = []
        self._fds: dict = {}
        self._x: XOut | None = None
        self._stop = False
        self._xfail = 0.0
        self._warned: set = set()   # errores ya anotados (uno por dispositivo)
        self._logged = 0            # botones anotados desde que arrancó (tope: no llenar el log)
        self._axes_seen: set = set()
        self._last_key: dict = {}   # (código, valor) → (instante, dispositivo)
        self._dup_noted = False
        self._mode_down = False
        self._mode_until = 0.0

    def stop(self) -> None:
        self._stop = True

    def status(self) -> dict:
        return {"active": self.is_active, "devices": [d["name"] + " " + d["event"] for d in self.devices], "events": self.events, "x": self._x is not None}

    # lectura
    def _scan(self) -> None:
        try:
            with open("/proc/bus/input/devices", encoding="utf-8", errors="replace") as fh:
                devs = parse_devices(fh.read())
        except OSError:
            return
        have = {d["event"] for d in self.devices}
        if {d["event"] for d in devs} == have and all(d["event"] in self._fds for d in devs):
            return
        self.devices = devs
        loop = asyncio.get_event_loop()
        for d in devs:
            if d["event"] in self._fds:
                continue
            try:
                fd = os.open("/dev/input/" + d["event"], os.O_RDONLY | os.O_NONBLOCK)
            except OSError as e:
                if d["event"] not in self._warned:  # una sola vez: el escaneo se repite cada 2 s
                    self._warned.add(d["event"])
                    self.log(f"mando: no se pudo abrir {d['event']} ({d['name']}): {e} (se ignora este dispositivo)")
                continue
            ranges = {}
            try:
                import fcntl
                for code in (ABS_X, ABS_Y, ABS_Z, ABS_RX, ABS_RY, ABS_RZ):
                    buf = bytearray(24)
                    fcntl.ioctl(fd, 0x80184540 + code, buf)
                    _v, lo, hi, _f, _fl, _r = struct.unpack("6i", bytes(buf))
                    ranges[code] = (lo, hi)
            except OSError:
                pass
            self._fds[d["event"]] = (fd, ranges)
            loop.add_reader(fd, self._read, d["event"])
            self.log(f"mando: leyendo {d['event']} «{d['name']}» rangos {ranges}")

    def _close(self) -> None:
        self._mode_down, self._mode_until = False, 0.0
        loop = asyncio.get_event_loop()
        for ev, (fd, _r) in list(self._fds.items()):
            try:
                loop.remove_reader(fd)
                os.close(fd)
            except OSError:
                pass
        self._fds.clear()
        if self._x:
            for a in self.mapper.reset():
                try:
                    apply_action(self._x, a)
                except Exception:  # noqa: BLE001
                    pass
            self._x.flush()

    def _read(self, ev: str) -> None:
        fd, ranges = self._fds.get(ev, (None, {}))
        if fd is None:
            return
        try:
            data = os.read(fd, EVENT_SIZE * 64)
        except (BlockingIOError, OSError):
            return
        if not self.is_active or self._x is None:
            return
        now = time.monotonic()
        for i in range(0, len(data) - EVENT_SIZE + 1, EVENT_SIZE):
            _s, _u, typ, code, val = struct.unpack_from(EVENT_FMT, data, i)
            self.events += 1
            acts = []
            if typ == EV_KEY:
                if val in (0, 1):
                    prev = self._last_key.get((code, val))
                    self._last_key[(code, val)] = (now, ev)
                    if prev and prev[1] != ev and now - prev[0] < 0.025:
                        # el mismo botón llegó por otro dispositivo casi a la vez: es el mismo mando visto dos veces
                        if not self._dup_noted:
                            self._dup_noted = True
                            self.log(f"mando: doble entrada: el botón {code} llega por {prev[1]} y {ev}; se cuenta una vez")
                        continue
                    if code == BTN_MODE:
                        self._mode_down = val == 1
                        self._mode_until = now + 0.5 if val == 0 else 0.0
                    elif val == 1 and (self._mode_down or now < self._mode_until):
                        if code == 304 and self._mode_down:
                            self.event("qam.combo")  # Steam + A: el usuario pidió el QAM
                        elif code == 308 and self._mode_down:
                            self.event("kb.combo")   # Steam + Y: el usuario pidió el teclado grande
                        continue  # Steam + botón (abrir el QAM, capturas…): no es un clic para la app
                    if self._logged < 60:
                        self._logged += 1
                        self.log(f"mando: botón {code} {'pulsado' if val else 'soltado'} ({ev})")
                    acts = self.mapper.feed_button(code, val != 0, now)
            elif typ == EV_ABS:
                if (ev, code) not in self._axes_seen:
                    self._axes_seen.add((ev, code))
                    self.log(f"mando: primer movimiento del eje {code} en {ev}")
                if code in (ABS_HAT0X, ABS_HAT0Y):
                    v = float(val)
                else:
                    lo, hi = ranges.get(code, (-32768, 32767))
                    v = norm_axis(val, lo, hi, trigger=code in (ABS_Z, ABS_RZ))
                acts = self.mapper.feed_axis(code, v, now)
            for a in acts:
                try:
                    apply_action(self._x, a)
                except Exception as e:  # noqa: BLE001
                    self.log(f"mando: error al enviar {a}: {e}")
        try:
            self._x.flush()
        except Exception:  # noqa: BLE001
            pass

    @staticmethod
    def focused_is_ours(x: XOut, ours: set) -> bool:
        """gamescope muestra una de nuestras apps: `GAMESCOPE_FOCUSED_APP` y, si no existe, la primera de la capa base."""
        f = x.cardinals("GAMESCOPE_FOCUSED_APP")
        if f:
            return f[0] in ours
        first = x.cardinals("GAMESCOPECTRL_BASELAYER_APPID")
        return bool(first) and first[0] in ours

    async def _watch(self) -> None:
        """Cada 0,4 s (1,5 s sin apps abiertas) mira si una app nuestra está delante. Una sola conexión a X; cuesta microsegundos."""
        while not self._stop:
            on = False
            ours = set()
            try:
                ours = set(self.ours_fn()) if self.enabled_fn() else set()
                if ours:
                    if self._x is None and time.monotonic() >= self._xfail:
                        display, xauth = await self.env_fn()
                        self._x = XOut(display, xauth)
                        self.log(f"mando: conectado a X en {display}")
                    on = self._x is not None and self.focused_is_ours(self._x, ours)
            except Exception as e:  # noqa: BLE001
                self._xfail = time.monotonic() + 10
                if self._x:
                    self._x.close()
                    self._x = None
                self.log(f"mando: error al comprobar el primer plano: {e}")
            if on != self.is_active:
                self.log(f"mando: {'activo' if on else 'inactivo'}")
                self.event("pad.activo" if on else "pad.inactivo")
            self.is_active = on
            if not ours and self._x is not None and not on:
                self._x.close()
                self._x = None
            await asyncio.sleep(0.4 if ours else 1.5)

    async def run(self) -> None:
        asyncio.ensure_future(self._watch())
        last = time.monotonic()
        scan_at = 0.0
        while not self._stop:
            now = time.monotonic()
            if self.is_active:
                if now >= scan_at:
                    self._scan()
                    scan_at = now + 2.0
                if self._x is not None:
                    acts, dx, dy, wv, wh = self.mapper.tick(now - last, now)
                    try:
                        for a in acts:
                            apply_action(self._x, a)
                        if dx or dy:
                            self._x.move(dx, dy)
                        if wv or wh:
                            self._x.wheel(wv, wh)
                        if acts or dx or dy or wv or wh:
                            self._x.flush()
                    except Exception as e:  # noqa: BLE001
                        self.log(f"mando: error al mover: {e}")
                        self._x.close()
                        self._x = None
                last = now
                await asyncio.sleep(1 / 60)
            else:
                if self._fds:
                    self._close()
                last = time.monotonic()
                await asyncio.sleep(0.3)
        self._close()
        if self._x:
            self._x.close()
            self._x = None
