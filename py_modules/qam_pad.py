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

EV_SYN, EV_KEY, EV_ABS = 0, 1, 3
ABS_MT_SLOT, ABS_MT_POSITION_X, ABS_MT_POSITION_Y, ABS_MT_TRACKING_ID = 0x2F, 0x35, 0x36, 0x39
BTN_TOUCH = 330
ABS_X, ABS_Y, ABS_Z, ABS_RX, ABS_RY, ABS_RZ, ABS_HAT0X, ABS_HAT0Y = 0, 1, 2, 3, 4, 5, 16, 17
# Botones de mando de Linux (xpad / mando virtual de Steam).
BTN_MODE = 316  # botón Steam/Guía: con él se abre el QAM; sus combinaciones no son para la app
BTN_NAMES = {304: "A", 305: "B", 307: "X", 308: "Y", 310: "LB", 311: "RB", 314: "SELECT", 315: "START", 317: "L3", 318: "R3",
             544: "UP", 545: "DOWN", 546: "LEFT", 547: "RIGHT"}
DPAD_KEYS = {"UP": "Up", "DOWN": "Down", "LEFT": "Left", "RIGHT": "Right"}
# Qué hace cada botón al pulsarlo (clic = botón de ratón; el resto, combinación de teclas).
CLICKS = {"A": 1, "X": 3, "L3": 2}
KEYS = {"B": "alt+Left", "Y": "ctrl+l", "LB": "ctrl+Prior", "RB": "ctrl+Next", "START": "Return", "SELECT": "Escape", "R3": "ctrl+0"}
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



class _XWA(ctypes.Structure):
    """XWindowAttributes (solo para leer posición, tamaño y si la ventana se ve)."""
    _fields_ = [("x", ctypes.c_int), ("y", ctypes.c_int), ("width", ctypes.c_int), ("height", ctypes.c_int), ("border_width", ctypes.c_int),
                ("depth", ctypes.c_int), ("visual", ctypes.c_void_p), ("root", ctypes.c_ulong), ("klass", ctypes.c_int), ("bit_gravity", ctypes.c_int),
                ("win_gravity", ctypes.c_int), ("backing_store", ctypes.c_int), ("backing_planes", ctypes.c_ulong), ("backing_pixel", ctypes.c_ulong),
                ("save_under", ctypes.c_int), ("colormap", ctypes.c_ulong), ("map_installed", ctypes.c_int), ("map_state", ctypes.c_int),
                ("all_event_masks", ctypes.c_long), ("your_event_mask", ctypes.c_long), ("do_not_propagate_mask", ctypes.c_long),
                ("override_redirect", ctypes.c_int), ("screen", ctypes.c_void_p)]


class XOut:
    """Ratón y teclado falsos con XTest sobre la pantalla del usuario. Lanza OSError si no puede abrirla o faltan las bibliotecas."""

    MODS = {"ctrl": "Control_L", "shift": "Shift_L", "alt": "Alt_L"}
    MASKS = {"Shift_L": 0x01, "Control_L": 0x04, "Alt_L": 0x08, "ISO_Level3_Shift": 0x80}
    # Cómo aplicar Ctrl/Mayús/AltGr (la autoprueba elige el que funciona en el navegador de delante; con gamescope, Firefox ignoraba los
    # modificadores «falsos» de XTest): «keys» = pulsar la tecla del modificador (pausa corta), «slow» = igual con pausa larga,
    # «lock» = fijar el estado del modificador en el servidor (XKB) y pulsar la tecla suelta.
    mod_mode = "keys"
    # Cómo escribir un carácter que pide modificador: «levels» = con su modificador; «remap» = prestar una tecla libre al símbolo (sin modificadores).
    char_mode = "levels"
    GAPS = {"keys": 0.012, "slow": 0.08, "lock": 0.03}

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
        x11.XQueryTree.restype = ci
        x11.XQueryTree.argtypes = [vp, cl, ctypes.POINTER(cl), ctypes.POINTER(cl), ctypes.POINTER(vp), ctypes.POINTER(cu)]
        x11.XQueryPointer.restype = ci
        x11.XQueryPointer.argtypes = [vp, cl, ctypes.POINTER(cl), ctypes.POINTER(cl), ctypes.POINTER(ci), ctypes.POINTER(ci), ctypes.POINTER(ci), ctypes.POINTER(ci), ctypes.POINTER(cu)]
        x11.XDefaultScreen.restype, x11.XDefaultScreen.argtypes = ci, [vp]
        x11.XDisplayWidth.restype, x11.XDisplayWidth.argtypes = ci, [vp, ci]
        x11.XDisplayHeight.restype, x11.XDisplayHeight.argtypes = ci, [vp, ci]
        xt.XTestFakeRelativeMotionEvent.argtypes = [vp, ci, ci, cl]
        xt.XTestFakeMotionEvent.argtypes = [vp, ci, ci, ci, cl]
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

    def windows(self) -> list:
        """Ventanas hijas de la raíz que se ven ahora: [(id, x, y, ancho, alto, override_redirect)]. Las listas emergentes y menús de GTK son de ese tipo."""
        out = []
        try:
            x = self.x11
            root, par = ctypes.c_ulong(), ctypes.c_ulong()
            kids, n = ctypes.c_void_p(), ctypes.c_uint()
            if not x.XQueryTree(self.dpy, x.XDefaultRootWindow(self.dpy), ctypes.byref(root), ctypes.byref(par), ctypes.byref(kids), ctypes.byref(n)) or not kids.value:
                return out
            ids = [int(v) for v in (ctypes.c_ulong * n.value).from_address(kids.value)]
            x.XFree(kids)
            x.XGetWindowAttributes.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(_XWA)]
            for w in ids:
                a = _XWA()
                if x.XGetWindowAttributes(self.dpy, w, ctypes.byref(a)) and a.map_state == 2 and a.width > 1 and a.height > 1:
                    out.append((w, a.x, a.y, a.width, a.height, bool(a.override_redirect)))
        except Exception:  # noqa: BLE001
            pass
        return out

    def window_probe(self, wid: int, w: int, h: int) -> str:
        """Mira qué hay DENTRO de una ventana (lo que Firefox ha pintado, aunque gamescope no lo enseñe): colores distintos entre ~300 puntos
        y fracción del color más común. Una ventana de menú pintada tiene varios colores; una sin pintar, uno solo (negro o transparente)."""
        try:
            x = self.x11
            x.XGetImage.restype = ctypes.c_void_p
            x.XGetImage.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_ulong, ctypes.c_int]
            x.XGetPixel.restype = ctypes.c_ulong
            x.XGetPixel.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
            img = x.XGetImage(self.dpy, int(wid), 0, 0, w, h, 0xFFFFFFFF, 2)
            if not img:
                return "no se pudo leer"
            cols: dict = {}
            n = 0
            for iy in range(1, 21):
                for ix in range(1, 16):
                    c = int(x.XGetPixel(img, ix * w // 16, iy * h // 21))
                    cols[c] = cols.get(c, 0) + 1
                    n += 1
            x.XDestroyImage(ctypes.c_void_p(img)) if hasattr(x, "XDestroyImage") else None
            top = max(cols.items(), key=lambda kv: kv[1])
            return f"{len(cols)} colores, el más común {hex(top[0])} en {round(100 * top[1] / n)}%"
        except Exception as e:  # noqa: BLE001
            return f"error {e!r}"

    def pointer_child(self) -> tuple:
        """(x, y, ventana hija de la raíz bajo el puntero): para saber a qué ventana cree X que va un clic."""
        try:
            r, c = ctypes.c_ulong(), ctypes.c_ulong()
            rx, ry, wx, wy, m = ctypes.c_int(), ctypes.c_int(), ctypes.c_int(), ctypes.c_int(), ctypes.c_uint()
            self.x11.XQueryPointer(self.dpy, self.x11.XDefaultRootWindow(self.dpy), ctypes.byref(r), ctypes.byref(c), ctypes.byref(rx), ctypes.byref(ry),
                                   ctypes.byref(wx), ctypes.byref(wy), ctypes.byref(m))
            return int(rx.value), int(ry.value), int(c.value)
        except Exception:  # noqa: BLE001
            return 0, 0, 0

    def wm_state(self, wid: int) -> list:
        """Átomos de _NET_WM_STATE de la ventana (nombres), p. ej. ['_NET_WM_STATE_FULLSCREEN']; [] si no hay."""
        atom = self.x11.XInternAtom(self.dpy, b"_NET_WM_STATE", 1)
        if not atom:
            return []
        typ, fmt, n, after = ctypes.c_ulong(), ctypes.c_int(), ctypes.c_ulong(), ctypes.c_ulong()
        data = ctypes.c_void_p()
        rc = self.x11.XGetWindowProperty(self.dpy, int(wid), atom, 0, 64, 0, 4, ctypes.byref(typ), ctypes.byref(fmt), ctypes.byref(n),
                                         ctypes.byref(after), ctypes.byref(data))
        if rc != 0 or not data.value or fmt.value != 32:
            if data.value:
                self.x11.XFree(data)
            return []
        vals = [int(v) for v in (ctypes.c_ulong * n.value).from_address(data.value)]
        self.x11.XFree(data)
        out = []
        self.x11.XGetAtomName.restype = ctypes.c_void_p
        self.x11.XGetAtomName.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
        for a in vals:
            p = self.x11.XGetAtomName(self.dpy, a)
            if p:
                out.append(ctypes.string_at(p).decode("latin-1"))
                self.x11.XFree(p)
        return out

    def set_wm_fullscreen(self, wid: int, on: bool) -> bool:
        """Pone o quita _NET_WM_STATE_FULLSCREEN directamente en la ventana (lo que haría un gestor de ventanas). Experimento: con gamescope el
        navegador pide la pantalla completa y nadie le contesta, así que ni F11 ni el botón de los vídeos hacen nada."""
        st = self.x11.XInternAtom(self.dpy, b"_NET_WM_STATE", 0)
        fs = self.x11.XInternAtom(self.dpy, b"_NET_WM_STATE_FULLSCREEN", 0)
        if not st or not fs:
            return False
        cur = [a for a in self._atoms(wid, st) if a != fs]
        if on:
            cur.append(fs)
        self.x11.XChangeProperty.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_void_p, ctypes.c_int]
        arr = (ctypes.c_ulong * max(1, len(cur)))(*cur)
        self.x11.XChangeProperty(self.dpy, int(wid), st, 4, 32, 0, ctypes.cast(arr, ctypes.c_void_p), len(cur))   # 4 = XA_ATOM, 0 = PropModeReplace
        self.x11.XFlush(self.dpy)
        return True

    def _atoms(self, wid: int, prop: int) -> list:
        typ, fmt, n, after = ctypes.c_ulong(), ctypes.c_int(), ctypes.c_ulong(), ctypes.c_ulong()
        data = ctypes.c_void_p()
        rc = self.x11.XGetWindowProperty(self.dpy, int(wid), prop, 0, 64, 0, 4, ctypes.byref(typ), ctypes.byref(fmt), ctypes.byref(n),
                                         ctypes.byref(after), ctypes.byref(data))
        if rc != 0 or not data.value or fmt.value != 32:
            if data.value:
                self.x11.XFree(data)
            return []
        vals = [int(v) for v in (ctypes.c_ulong * n.value).from_address(data.value)]
        self.x11.XFree(data)
        return vals

    def window_title(self, wid: int) -> str:
        """Título de una ventana (_NET_WM_NAME, o WM_NAME): sirve para saber en qué página está un navegador sin mirar la pantalla. '' si no hay."""
        for name in ("_NET_WM_NAME", "WM_NAME"):
            atom = self.x11.XInternAtom(self.dpy, name.encode(), 1)
            if not atom:
                continue
            typ, fmt, n, after = ctypes.c_ulong(), ctypes.c_int(), ctypes.c_ulong(), ctypes.c_ulong()
            data = ctypes.c_void_p()
            rc = self.x11.XGetWindowProperty(self.dpy, int(wid), atom, 0, 256, 0, 0, ctypes.byref(typ), ctypes.byref(fmt), ctypes.byref(n),
                                             ctypes.byref(after), ctypes.byref(data))
            if rc == 0 and data.value and fmt.value == 8 and n.value:
                raw = ctypes.string_at(data.value, n.value)
                self.x11.XFree(data)
                return raw.decode("utf-8", "replace")
            if data.value:
                self.x11.XFree(data)
        return ""

    def pointer(self) -> tuple | None:
        """Posición (x, y) del puntero en pantalla, o None si no se pudo leer."""
        try:
            r, c = ctypes.c_ulong(), ctypes.c_ulong()
            rx, ry, wx, wy, m = ctypes.c_int(), ctypes.c_int(), ctypes.c_int(), ctypes.c_int(), ctypes.c_uint()
            ok = self.x11.XQueryPointer(self.dpy, self.x11.XDefaultRootWindow(self.dpy), ctypes.byref(r), ctypes.byref(c),
                                        ctypes.byref(rx), ctypes.byref(ry), ctypes.byref(wx), ctypes.byref(wy), ctypes.byref(m))
            return (int(rx.value), int(ry.value)) if ok else None
        except Exception:  # noqa: BLE001
            return None

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

    def focus_within(self, wid: int) -> bool:
        """¿El foco de teclado ya está en `wid` o en una ventana hija suya? Reponerlo cada tecla hace que la página vea «ventana enfocada» de nuevo
        y webs como Instagram o Facebook cierran o vacían su buscador."""
        w = self.focus_window()
        for _ in range(12):
            if not w:
                return False
            if w == int(wid):
                return True
            root, par, kids, n = ctypes.c_ulong(), ctypes.c_ulong(), ctypes.c_void_p(), ctypes.c_uint()
            if not self.x11.XQueryTree(self.dpy, w, ctypes.byref(root), ctypes.byref(par), ctypes.byref(kids), ctypes.byref(n)):
                return False
            if kids.value:
                self.x11.XFree(kids)
            if par.value == root.value:
                return False
            w = int(par.value)
        return False

    def focus_window(self) -> int:
        """Ventana de X que tiene ahora el foco de teclado (0 si no se pudo leer). Solo para el registro."""
        try:
            w, r = ctypes.c_ulong(), ctypes.c_int()
            self.x11.XGetInputFocus(self.dpy, ctypes.byref(w), ctypes.byref(r))
            return int(w.value)
        except Exception:  # noqa: BLE001
            return 0

    def _pausa(self, gap: float) -> None:
        """Vuelca lo pendiente y espera `gap` s (el modificador debe llegar ANTES que la tecla)."""
        if gap > 0:
            self.x11.XFlush(self.dpy)
            time.sleep(gap)

    def _xkb_lock(self, mask: int, value: int) -> None:
        f = self.x11.XkbLockModifiers
        f.restype, f.argtypes = ctypes.c_int, [ctypes.c_void_p, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint]
        f(self.dpy, 0x100, mask, value)   # 0x100 = XkbUseCoreKbd

    def _chord(self, names: list, code: int) -> None:
        """Pulsa y suelta `code` con los modificadores `names` (nombres de símbolo) según `mod_mode`."""
        if not names:
            self.xt.XTestFakeKeyEvent(self.dpy, code, 1, 0)
            self.xt.XTestFakeKeyEvent(self.dpy, code, 0, 0)
            return
        gap = self.GAPS.get(self.mod_mode, 0.012)
        if self.mod_mode == "lock":
            mask = 0
            for n in names:
                mask |= self.MASKS.get(n, 0)
            self._xkb_lock(mask, mask)
            self._pausa(gap)
            self.xt.XTestFakeKeyEvent(self.dpy, code, 1, 0)
            self.xt.XTestFakeKeyEvent(self.dpy, code, 0, 0)
            self._pausa(gap)
            self._xkb_lock(mask, 0)
            self.x11.XFlush(self.dpy)
            return
        mods = [self._code(n) for n in names]
        for m in mods:
            self.xt.XTestFakeKeyEvent(self.dpy, m, 1, 0)
        self._pausa(gap)
        self.xt.XTestFakeKeyEvent(self.dpy, code, 1, 0)
        self.xt.XTestFakeKeyEvent(self.dpy, code, 0, 0)
        self._pausa(gap)
        for m in reversed(mods):
            self.xt.XTestFakeKeyEvent(self.dpy, m, 0, 0)
        self.x11.XFlush(self.dpy)

    def _type_remap(self, ks: int) -> bool:
        """Escribe el símbolo `ks` prestándoselo a una tecla libre (sin modificadores), como hace xdotool. False si no hay tecla libre."""
        x = self.x11
        lo, hi = ctypes.c_int(), ctypes.c_int()
        x.XDisplayKeycodes.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int)]
        x.XDisplayKeycodes(self.dpy, ctypes.byref(lo), ctypes.byref(hi))
        per = ctypes.c_int()
        x.XGetKeyboardMapping.restype = ctypes.POINTER(ctypes.c_ulong)
        x.XGetKeyboardMapping.argtypes = [ctypes.c_void_p, ctypes.c_ubyte, ctypes.c_int, ctypes.POINTER(ctypes.c_int)]
        mp = x.XGetKeyboardMapping(self.dpy, lo.value, hi.value - lo.value + 1, ctypes.byref(per))
        if not mp:
            return False
        free = 0
        for kc in range(hi.value, lo.value - 1, -1):
            row = [mp[(kc - lo.value) * per.value + j] for j in range(per.value)]
            if not any(row):
                free = kc
                break
        x.XFree(mp)
        if not free:
            return False
        x.XChangeKeyboardMapping.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.POINTER(ctypes.c_ulong), ctypes.c_int]
        syms = (ctypes.c_ulong * per.value)(*([ks] * per.value))
        x.XChangeKeyboardMapping(self.dpy, free, per.value, syms, 1)
        self._pausa(0.03)   # que el navegador reciba el cambio de teclado antes de la tecla
        self.xt.XTestFakeKeyEvent(self.dpy, free, 1, 0)
        self.xt.XTestFakeKeyEvent(self.dpy, free, 0, 0)
        self._pausa(0.03)
        none = (ctypes.c_ulong * per.value)()
        x.XChangeKeyboardMapping(self.dpy, free, per.value, none, 1)
        self._pausa(0.01)
        return True

    def type_char(self, ch: str, gap: float | None = None) -> bool:
        """Escribe un carácter con la distribución activa: busca su tecla y el nivel (Mayús, AltGr) y pulsa lo necesario. False si no existe."""
        if not ch or ch == "\n":
            return False
        ks = keysym_for_char(ch)
        code = self.x11.XKeysymToKeycode(self.dpy, ks)
        idx = None
        if code:
            idx = next((i for i in range(4) if self.x11.XKeycodeToKeysym(self.dpy, code, i) == ks), None)
        if self.char_mode == "remap" and (idx is None or idx > 0):
            return self._type_remap(ks)
        if not code or idx is None:
            return False
        self._chord(list(LEVEL_MODS[idx]), code)
        self.x11.XFlush(self.dpy)
        return True

    def move(self, dx: int, dy: int) -> None:
        self.xt.XTestFakeRelativeMotionEvent(self.dpy, int(dx), int(dy), 0)

    def cursor_is_text(self) -> tuple:
        """(¿cursor de texto?, descripción para el registro). Primero por nombre; si el cursor no lo trae (Chromium/Edge), por la forma."""
        try:
            self.cursor_name()   # carga XFixes
            if not getattr(self, "_fx", None):
                return False, "sin XFixes"
            p = self._fx.XFixesGetCursorImage(self.dpy)
            if not p:
                return False, "sin imagen"
            try:
                c = p.contents
                nm = c.name.decode("utf-8", "replace") if c.name else ""
                w, h = int(c.width), int(c.height)
                if nm:
                    return (nm.endswith("text") or nm.endswith("xterm") or nm.endswith("ibeam")), f"nombre «{nm}» {w}x{h}"
                if not (0 < w <= 128 and 0 < h <= 128):
                    return False, f"sin nombre {w}x{h}"
                rows = [[1 if (c.pixels[y * w + x] >> 24) & 0xFF > 40 else 0 for x in range(w)] for y in range(h)]
                ok = looks_like_ibeam(w, h, rows)
                return ok, f"sin nombre {w}x{h} → {'forma de I' if ok else 'otra forma'}"
            finally:
                self.x11.XFree(ctypes.cast(p, ctypes.c_void_p))
        except Exception as e:  # noqa: BLE001
            return False, f"error {e}"

    def cursor_name(self) -> str | None:
        """Nombre del cursor que X muestra ahora («text» sobre un campo de texto…), o None. XFixes se carga la primera vez que se pide."""
        try:
            if not hasattr(self, "_fx"):
                lib = ctypes.util.find_library("Xfixes")
                self._fx = ctypes.CDLL(lib or "libXfixes.so.3") if lib else None
                if self._fx:
                    class _Img(ctypes.Structure):
                        _fields_ = [("x", ctypes.c_short), ("y", ctypes.c_short), ("width", ctypes.c_ushort), ("height", ctypes.c_ushort),
                                    ("xhot", ctypes.c_ushort), ("yhot", ctypes.c_ushort), ("serial", ctypes.c_ulong),
                                    ("pixels", ctypes.POINTER(ctypes.c_ulong)), ("atom", ctypes.c_ulong), ("name", ctypes.c_char_p)]
                    self._fx.XFixesGetCursorImage.restype = ctypes.POINTER(_Img)
                    self._fx.XFixesGetCursorImage.argtypes = [ctypes.c_void_p]
            if not self._fx:
                return None
            p = self._fx.XFixesGetCursorImage(self.dpy)
            if not p:
                return None
            try:
                n = p.contents.name
                return n.decode("utf-8", "replace") if n else None
            finally:
                self.x11.XFree(ctypes.cast(p, ctypes.c_void_p))
        except Exception:  # noqa: BLE001
            return None

    def move_abs(self, x: int, y: int) -> None:
        self.xt.XTestFakeMotionEvent(self.dpy, -1, int(x), int(y), 0)

    def button(self, n: int, down: bool) -> None:
        self.xt.XTestFakeButtonEvent(self.dpy, int(n), 1 if down else 0, 0)

    def _code(self, name: str) -> int:
        if name not in self._codes:
            ks = self.x11.XStringToKeysym(name.encode())
            self._codes[name] = self.x11.XKeysymToKeycode(self.dpy, ks) if ks else 0
        return self._codes[name]

    def key(self, combo: str, gap: float | None = None) -> None:
        """«ctrl+shift+Tab»: modificadores, tecla, y se sueltan en orden inverso."""
        parts = combo.split("+")
        names = [self.MODS[p.lower()] for p in parts[:-1] if p.lower() in self.MODS]
        k = self._code(parts[-1])
        if not k:
            return
        self._chord(names, k)

    def zoom(self, n: int) -> None:
        """Zoom del navegador: Ctrl + rueda (n > 0 acerca, n < 0 aleja). Con `mod_mode` «lock» el Ctrl se fija en el servidor (Firefox ignora la tecla Ctrl falsa)."""
        if not n:
            return
        btn = 4 if n > 0 else 5
        if self.mod_mode == "lock":
            m = self.MASKS["Control_L"]
            self._xkb_lock(m, m)
            self._pausa(self.GAPS["lock"])
            for _ in range(abs(n)):
                self.xt.XTestFakeButtonEvent(self.dpy, btn, 1, 0)
                self.xt.XTestFakeButtonEvent(self.dpy, btn, 0, 0)
            self._pausa(self.GAPS["lock"])
            self._xkb_lock(m, 0)
            self.x11.XFlush(self.dpy)
            return
        ctrl = self._code("Control_L")
        if not ctrl:
            return
        self.xt.XTestFakeKeyEvent(self.dpy, ctrl, 1, 0)
        self._pausa(self.GAPS.get(self.mod_mode, 0.012))
        for _ in range(abs(n)):
            self.xt.XTestFakeButtonEvent(self.dpy, btn, 1, 0)
            self.xt.XTestFakeButtonEvent(self.dpy, btn, 0, 0)
        self._pausa(self.GAPS.get(self.mod_mode, 0.012))
        self.xt.XTestFakeKeyEvent(self.dpy, ctrl, 0, 0)

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



# ---------------------------------------------------------------- scroll táctil
def _bits(line: str) -> set:
    """Líneas `B: ABS=…` de /proc/bus/input/devices: palabras hexadecimales de 64 bits, la más alta primero → conjunto de bits activos."""
    out = set()
    words = line.split()
    for i, w in enumerate(reversed(words)):
        try:
            v = int(w, 16)
        except ValueError:
            continue
        out.update(64 * i + n for n in range(64) if (v >> n) & 1)
    return out


def looks_like_ibeam(w: int, h: int, rows: list) -> bool:
    """¿Es la forma del cursor de texto (I)? `rows`: por fila, lista de 0/1 (pixel visible). Chromium/Edge crean sus cursores SIN nombre, así que
    el nombre «text» no llega nunca: se reconoce por la forma. La I es simétrica, más alta que ancha, con travesaños anchos arriba y abajo y un
    tallo fino en medio (la flecha empieza en punta y las de redimensionar tienen puntas de flecha, no travesaños)."""
    if w < 5 or h < 9 or h < w * 1.3 or len(rows) != h:
        return False
    widths = [sum(r) for r in rows]
    mx = max(widths)
    if mx < 3:
        return False
    vis = [i for i, x in enumerate(widths) if x]
    if not vis:
        return False
    top, bot = vis[0], vis[-1]
    mid = widths[(top + bot) // 2]
    if widths[top] < 3 or widths[bot] < 3 or widths[top] < mid + 2 or widths[bot] < mid + 2 or mid > max(4, mx // 2):
        return False
    sym = tot = 0
    for r in rows:
        for x in range(w // 2):
            a, b = r[x], r[w - 1 - x]
            if a or b:
                tot += 1
                sym += 1 if a == b else 0
    return tot > 0 and sym / tot >= 0.8


def parse_touch(text: str) -> list:
    """`/proc/bus/input/devices` → [{name, event}] de las pantallas táctiles (propiedad DIRECT y ejes X/Y). Los touchpads no cuentan."""
    out = []
    for blk in re.split(r"\n\s*\n", text or ""):
        name = re.search(r'^N: Name="(.*)"', blk, re.M)
        hand = re.search(r"^H: Handlers=(.*)$", blk, re.M)
        prop = re.search(r"^B: PROP=(.*)$", blk, re.M)
        ab = re.search(r"^B: ABS=(.*)$", blk, re.M)
        if not (name and hand and prop and ab):
            continue
        ev = next((h for h in hand.group(1).split() if re.fullmatch(r"event\d+", h)), None)
        a = _bits(ab.group(1))
        if ev and 1 in _bits(prop.group(1)) and (ABS_MT_POSITION_X in a or {0, 1} <= a):
            out.append({"name": name.group(1), "event": ev})
    return out


class TouchScroll:
    """Arrastrar con un dedo = rueda del ratón (con inercia). gamescope solo convierte el toque en clics del puntero, así que una app de escritorio
    no se desplazaba con el dedo. Puro (sin X): `feed` recibe los eventos del dispositivo y devuelve clics de rueda (v, h); `tick` da los de la inercia.
    La pantalla del Ally es vertical y gamescope la gira: la correspondencia ejes del táctil → pantalla se aprende comparando lo que se mueve el dedo
    con lo que se mueve el puntero (que gamescope mueve con el mismo toque); mientras no se aprende se supone según la forma de la pantalla."""

    CLICK_PX = 34.0   # recorrido del dedo por cada «clic» de rueda (ajustable: «px» en touch-scroll.json)
    DEAD_PX = 12.0    # por debajo es un toque, no un arrastre
    FLING_MIN = 380.0  # px/s al soltar para que haya inercia
    FRICTION = 2.6     # menos fricción: se desliza más, como en una tableta

    def __init__(self, rx: tuple, ry: tuple, screen: tuple, forced: dict | None = None, px: float | None = None):
        if px:
            self.CLICK_PX = max(8.0, min(120.0, float(px)))
        self.lo = (rx[0], ry[0])
        self.span = (max(1, rx[1] - rx[0]), max(1, ry[1] - ry[0]))
        self.full = False            # modo completo: el toque lo traducimos nosotros (clic, clic derecho, arrastrar para seleccionar)
        self.actions: list = []      # ("move", x, y) · ("down"/"up", botón) · ("log", texto)
        self.hold = False            # ya se mandó el clic derecho de «mantener»
        self.drag = False
        self.second = False          # este dedo es el segundo toque seguido: arrastrar = seleccionar, soltar = doble clic
        self.last_tap = (-9.0, 0, 0)  # instante y posición (px de pantalla) del último clic
        self.t_down = 0.0
        self.suppress = False
        self.screen = (max(1, screen[0]), max(1, screen[1]))
        self.forced = forced
        self.cov = [[0.0, 0.0], [0.0, 0.0]]   # cov[eje del táctil][eje de pantalla]
        self.learned: tuple | None = None
        self.mt = False
        self.legacy = False
        self.slot = 0
        self.pos: dict = {}          # slot → [x, y] de cada dedo apoyado
        self.down = False            # arrastre de un dedo en curso
        self.multi = False           # hay (o hubo, sin soltar todos) dos o más dedos
        self.g = None                # gesto de dos dedos: estado
        self.zoom = 0
        self.fling = (0.0, 0.0)
        self.tr = None   # grabadora: tr(evento, **datos) o None
        self.last_pos: dict = {}   # ranura → [x, y] de su último contacto (el núcleo NO repite un valor igual al anterior de la ranura)
        self._reset()

    def _reset(self) -> None:
        self.cx = self.cy = None
        self.start = self.last = None
        self.ptr0 = self.ptr = None
        self.moved = False
        self.hold = self.drag = False
        self.acc = [0.0, 0.0]
        self.vel = [0.0, 0.0]
        self.t = None

    def mapping(self) -> tuple:
        """(eje del táctil que mueve Y de pantalla, signo, eje que mueve X, signo)."""
        if self.forced and "ay" in self.forced:
            return (int(self.forced.get("ay", 1)), int(self.forced.get("sy", 1)), int(self.forced.get("ax", 0)), int(self.forced.get("sx", 1)))
        if self.learned:
            return self.learned
        same = (self.span[0] < self.span[1]) == (self.screen[0] < self.screen[1])
        return (1, 1, 0, 1) if same else (0, 1, 1, 1)

    def to_screen(self, dxr: float, dyr: float) -> tuple:
        ay, sy, ax, sx = self.mapping()
        raw = (dxr, dyr)
        return (sx * raw[ax] / self.span[ax] * self.screen[0], sy * raw[ay] / self.span[ay] * self.screen[1])

    def _learn(self) -> None:
        # Solo cuando gamescope mueve el puntero con el dedo (modo normal). En modo completo la pantalla va agarrada y el puntero solo se
        # mueve porque lo llevamos nosotros al empezar el arrastre (dev.72): aprender de eso invertía los ejes del desplazamiento.
        if self.full or not (self.start and self.last and self.ptr0 and self.ptr):
            return
        raw = ((self.last[0] - self.start[0]) / self.span[0], (self.last[1] - self.start[1]) / self.span[1])
        pt = ((self.ptr[0] - self.ptr0[0]) / self.screen[0], (self.ptr[1] - self.ptr0[1]) / self.screen[1])
        for a in (0, 1):
            for b in (0, 1):
                self.cov[a][b] += raw[a] * pt[b]
        cy, cx = (abs(self.cov[0][1]), abs(self.cov[1][1])), (abs(self.cov[0][0]), abs(self.cov[1][0]))
        if max(cy) < 0.05 and max(cx) < 0.05:
            return
        ay = 0 if cy[0] >= cy[1] else 1
        ax = 1 - ay
        sy = 1 if self.cov[ay][1] >= 0 else -1
        sx = 1 if self.cov[ax][0] >= 0 else -1
        self.learned = (ay, sy, ax, sx)

    def feed(self, typ: int, code: int, val: int, now: float, ptr: tuple | None = None) -> tuple:
        if typ == EV_ABS:
            if code == ABS_MT_SLOT:
                self.slot = val
            elif code == ABS_MT_TRACKING_ID:
                self.mt = True
                if val == -1:
                    self.pos.pop(self.slot, None)
                    self._fingers_changed(now)
                else:
                    # Contacto nuevo: el núcleo de Linux filtra los valores iguales al último de la ranura, así que un dedo que cae en la misma X
                    # (o Y) que el anterior no manda esa coordenada. Se parte de la última conocida; con None el toque se quedaba sin posición y se
                    # perdía (justo al tocar de nuevo el mismo botón: «a veces no abre»).
                    self.pos[self.slot] = list(self.last_pos.get(self.slot, [None, None]))
                    self._fingers_changed(now)
            elif code in (ABS_MT_POSITION_X, ABS_MT_POSITION_Y) or (code in (0, 1) and not self.mt):   # ABS_X/Y solo en táctiles de un contacto
                if self.slot in self.pos:
                    i = 0 if code in (ABS_MT_POSITION_X, 0) else 1
                    self.pos[self.slot][i] = val
                    self.last_pos.setdefault(self.slot, [None, None])[i] = val
        elif typ == EV_KEY and code == BTN_TOUCH and not self.mt:
            self.legacy = val == 1
            if val == 1:
                self.pos[0] = list(self.last_pos.get(0, [None, None]))
            else:
                self.pos.pop(0, None)
            self._fingers_changed(now)
        elif typ == EV_SYN and code == 0:
            return self._frame(now, ptr)
        return (0, 0)

    def take_zoom(self) -> int:
        """Pasos de zoom pendientes (+ acercar, − alejar), una sola vez."""
        z, self.zoom = self.zoom, 0
        return z

    def _fingers_changed(self, now: float) -> None:
        n = len(self.pos)
        if n >= 2 and not self.multi:   # entra un segundo dedo: se acaba el arrastre de uno y empieza el gesto de dos
            self.multi = True
            self.fling = (0.0, 0.0)
            self._reset()
            self.down = False
            self.g = None
        if n == 0:
            if self.multi and self.g and self.g["mode"] is None and now - self.g["t"] < 0.3:   # dos dedos que apenas se mueven y se sueltan enseguida
                self.actions.append(("kb",))
            self._touch(False, now)
            self.multi = False
            self.g = None
        elif n == 1 and not self.multi and not self.down:
            self._touch(True, now)

    def _touch(self, on: bool, now: float) -> None:
        if on and not self.down:
            self.down = True
            self.suppress = max(abs(self.fling[0]), abs(self.fling[1])) > 80   # un toque que solo frena la inercia no hace clic
            if self.tr:
                self.tr("dedo.abajo", inercia=round(max(abs(self.fling[0]), abs(self.fling[1]))), frena=self.suppress)
            self.fling = (0.0, 0.0)   # un dedo nuevo detiene la inercia
            self._reset()
            self.t_down = now
        elif not on and self.down:
            self.down = False
            if self.tr:
                self.tr("dedo.arriba", ms=round((now - self.t_down) * 1000), movido=self.moved, arrastre=self.drag, mantenido=self.hold, completo=self.full, inicio=self.start is not None, suprime=self.suppress, segundo=self.second)
            if self.full and self.start is not None:
                self.poll(now)
                if self.drag:
                    self.actions.append(("up", 1))
                elif not self.moved and not self.suppress and not self.hold:
                    x, y = self.to_abs(*(self.last or self.start))   # la posición final del dedo: es donde apuntaba
                    self.actions += [("move", x, y), ("down", 1), ("up", 1),
                                     ("log", f"{'doble toque → clic' if self.second else 'toque → clic'} en {x},{y}"), ("tap", x, y)]
                    self.last_tap = (now, x, y)
            if self.moved and not self.drag:
                self._learn()
                if max(abs(self.vel[0]), abs(self.vel[1])) >= self.FLING_MIN:
                    self.fling = (self.vel[0], self.vel[1])
            self._reset()

    def _frame(self, now: float, ptr: tuple | None) -> tuple:
        pts = [tuple(v) for _k, v in sorted(self.pos.items()) if v[0] is not None and v[1] is not None]
        if self.multi:
            return self._gesture2(pts, now) if len(pts) >= 2 else (0, 0)
        if not self.down or len(pts) != 1:
            return (0, 0)
        cur = pts[0]
        if ptr is not None:
            self.ptr = ptr
        if self.start is None:
            self.start = self.last = cur
            self.ptr0 = ptr
            self.t = now
            if self.full:
                x, y = self.to_abs(*cur)
                lt, lx, ly = self.last_tap
                self.second = now - lt <= 0.35 and ((x - lx) ** 2 + (y - ly) ** 2) ** 0.5 <= 70
            return (0, 0)
        if self.hold:
            return (0, 0)   # ya salió el menú contextual: el resto de este dedo no hace nada
        sx, sy = self.to_screen(cur[0] - self.last[0], cur[1] - self.last[1])
        tx, ty = self.to_screen(cur[0] - self.start[0], cur[1] - self.start[1])
        self.last = cur
        dt = max(1e-3, now - (self.t or now))
        self.t = now
        if self.full:
            self.poll(now)
        if not self.moved:
            if (tx * tx + ty * ty) ** 0.5 < self.DEAD_PX:
                return (0, 0)
            self.moved = True
            if self.full and self.second:   # toque y, enseguida, arrastrar = seleccionar / arrastrar de verdad
                self.drag = True
                x, y = self.to_abs(*self.start)
                self.actions += [("move", x, y), ("down", 1), ("log", f"toque + arrastrar → selección desde {x},{y}")]
            elif self.full:
                # Con la pantalla táctil agarrada gamescope ya no mueve el puntero con el dedo, y la rueda va a lo que hay bajo el PUNTERO (donde se
                # tocó la última vez), no bajo el dedo: en el menú de Firefox, un desplegable o un panel lateral no se desplazaba. Se lleva el puntero
                # al punto donde empezó el dedo (sin pulsar) antes de mandar la rueda.
                x, y = self.to_abs(*self.start)
                self.actions.append(("move", x, y))
                if self.tr:
                    self.tr("scroll.inicio", puntero=f"{x},{y}")
            sx, sy = tx, ty   # lo recorrido hasta pasar la zona muerta cuenta
        if self.drag:
            x, y = self.to_abs(*cur)
            self.actions.append(("move", x, y))
            return (0, 0)
        self.vel[0] = 0.6 * self.vel[0] + 0.4 * (sx / dt)
        self.vel[1] = 0.6 * self.vel[1] + 0.4 * (sy / dt)
        return self._clicks(sx, sy)

    HOLD_S = 0.45     # mantener quieto el dedo: clic derecho (o, si luego se arrastra, seleccionar)

    def to_abs(self, cx: int, cy: int) -> tuple:
        """Posición cruda del táctil → píxel de la pantalla (para colocar el puntero)."""
        ay, sy, ax, sx = self.mapping()
        raw = (cx, cy)
        nx = min(1.0, max(0.0, (raw[ax] - self.lo[ax]) / self.span[ax]))
        ny = min(1.0, max(0.0, (raw[ay] - self.lo[ay]) / self.span[ay]))
        if sx < 0:
            nx = 1 - nx
        if sy < 0:
            ny = 1 - ny
        return (round(nx * (self.screen[0] - 1)), round(ny * (self.screen[1] - 1)))

    def abort(self) -> None:
        """Se corta el toque (panel o teclado delante): si había una selección en curso, se suelta el botón."""
        if self.drag:
            self.actions.append(("up", 1))
        self.down = self.multi = False
        self.fling = (0.0, 0.0)
        self.pos.clear()
        self._reset()

    def take_actions(self) -> list:
        a, self.actions = self.actions, []
        return a

    def poll(self, now: float) -> None:
        """Cada fotograma: un dedo quieto 0,45 s abre el menú contextual (clic derecho) YA, sin esperar a soltar, como en el móvil."""
        if self.full and self.down and not self.moved and not self.hold and not self.suppress and self.start is not None and now - self.t_down >= self.HOLD_S:
            self.hold = True
            x, y = self.to_abs(*(self.last or self.start))
            self.actions += [("move", x, y), ("down", 3), ("up", 3), ("log", f"mantener → menú contextual en {x},{y}")]

    PINCH_PX = 46.0   # variación de la distancia entre los dedos por cada paso de zoom
    LOCK_PX = 22.0    # lo que hay que moverse para decidir si el gesto de dos dedos es zoom o desplazamiento

    def _gesture2(self, pts: list, now: float) -> tuple:
        """Dos dedos: separarlos/juntarlos = zoom (Ctrl + rueda); moverlos juntos = desplazar. Se decide una vez por gesto."""
        (x0, y0), (x1, y1) = pts[0], pts[1]
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        sx0, sy0 = self.to_screen(x0, y0)
        sx1, sy1 = self.to_screen(x1, y1)
        dist = ((sx1 - sx0) ** 2 + (sy1 - sy0) ** 2) ** 0.5
        smx, smy = self.to_screen(mx, my)
        if self.g is None:
            self.g = {"d0": dist, "m0": (smx, smy), "dist": dist, "mid": (smx, smy), "mode": None, "acc": 0.0, "t": now}
            self.acc = [0.0, 0.0]
            return (0, 0)
        g = self.g
        if g["mode"] is None:
            dd, dm = abs(dist - g["d0"]), ((smx - g["m0"][0]) ** 2 + (smy - g["m0"][1]) ** 2) ** 0.5
            if max(dd, dm) < self.LOCK_PX:
                g["dist"], g["mid"] = dist, (smx, smy)
                return (0, 0)
            g["mode"] = "zoom" if dd > 1.2 * dm else "scroll"
            g["dist"], g["mid"] = g["d0"], g["m0"]   # lo recorrido hasta decidir también cuenta
        if g["mode"] == "zoom":
            g["acc"] += dist - g["dist"]
            n = int(g["acc"] / self.PINCH_PX)
            g["acc"] -= n * self.PINCH_PX
            self.zoom += n
            res = (0, 0)
        else:
            res = self._clicks(smx - g["mid"][0], smy - g["mid"][1])
        g["dist"], g["mid"] = dist, (smx, smy)
        return res

    def _clicks(self, sx: float, sy: float) -> tuple:
        self.acc[0] += sx
        self.acc[1] += sy
        nx, ny = int(self.acc[0] / self.CLICK_PX), int(self.acc[1] / self.CLICK_PX)
        self.acc[0] -= nx * self.CLICK_PX
        self.acc[1] -= ny * self.CLICK_PX
        return (-ny, -nx)   # dedo hacia arriba → la página baja (rueda +)

    def tick(self, dt: float) -> tuple:
        """Clics de la inercia tras soltar."""
        vx, vy = self.fling
        if abs(vx) < 80 and abs(vy) < 80:
            self.fling = (0.0, 0.0)
            return (0, 0)
        k = math.exp(-self.FRICTION * dt)
        self.fling = (vx * k, vy * k)
        return self._clicks(vx * dt, vy * dt)


# ---------------------------------------------------------------- bucle
class PadRunner:
    """Con una app de escritorio delante, lee el mando y manda ratón/teclado. `ours()` da los identificadores de las apps de escritorio abiertas;
    `env()` (async) da (DISPLAY, XAUTHORITY). El primer plano se lee de la propiedad de X con una conexión propia: sin lanzar procesos."""

    TAP_GAP_MOVE = 0.02   # s entre colocar el puntero y pulsar (toque en modo completo)
    TAP_GAP_HOLD = 0.04   # s entre pulsar y soltar

    def __init__(self, ours, env, log, enabled, event=None, touch=None, trace=None):
        self.ours_fn, self.env_fn, self.log, self.enabled_fn = ours, env, log, enabled
        self.trace = trace   # qam_trace.Trace o None: la grabadora de navegación (apagada no cuesta nada)
        self._pend: list = []        # pasos de toque pendientes: (cuándo, acción, cuándo se pidió)
        self._pend_end = 0.0
        self._trw = {"dedo": 0, "inercia": 0, "mando": 0}   # clics de rueda por origen, para la grabadora
        self._tr_wheel_at = 0.0
        self._tr_x_at = 0.0
        self._tr_win_at = 0.0       # cuándo mirar las ventanas visibles (grabadora)
        self._tr_wins: dict = {}    # ventanas visibles ya vistas: id → (x, y, w, h, override)
        self._tr_tap_at = 0.0       # hora del último toque (para decir «la ventana apareció N ms después»)
        self._probes: list = []     # (cuándo, id, ancho, alto): mirar el contenido de una ventana emergente nueva
        self._snaps: list = []      # (cuándo, ventana bajo el puntero al pulsar, nº de ventanas al pulsar) para anotar el efecto del toque
        # touch() → None (apagado, o el panel/teclado está delante) o {} / {"ay":…} (correspondencia de ejes forzada)
        self.touch_fn = touch or (lambda: None)
        self._tfds: dict = {}       # event → fd de una pantalla táctil
        self._ts: dict = {}         # event → TouchScroll
        self._tnoted: set = set()
        self._tlogged = 0
        self._text_at = 0.0
        self._grabbed: dict = {}
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
        self._sel_down = False      # Select mantenido: con Y abre el teclado; solo (al soltar) hace Esc
        self._sel_used = False
        self._y_at = 0.0            # última pulsación de Y suelta (Steam avisa de su botón al soltarlo, tras la Y)

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

    def _scan_touch(self) -> None:
        """Abre las pantallas táctiles (solo lectura, sin agarrarlas: gamescope sigue recibiendo el toque como siempre)."""
        try:
            with open("/proc/bus/input/devices", encoding="utf-8", errors="replace") as fh:
                devs = parse_touch(fh.read())
        except OSError:
            return
        loop = asyncio.get_event_loop()
        for d in devs:
            ev = d["event"]
            if ev in self._tfds or self._x is None:
                continue
            try:
                import fcntl
                fd = os.open("/dev/input/" + ev, os.O_RDONLY | os.O_NONBLOCK)
                rg = {}
                for code in (ABS_MT_POSITION_X, ABS_MT_POSITION_Y, 0, 1):
                    buf = bytearray(24)
                    try:
                        fcntl.ioctl(fd, 0x80184540 + code, buf)
                        _v, lo, hi, _f, _fl, _r = struct.unpack("6i", bytes(buf))
                        if hi > lo:
                            rg[code] = (lo, hi)
                    except OSError:
                        pass
                rx = rg.get(ABS_MT_POSITION_X) or rg.get(0)
                ry = rg.get(ABS_MT_POSITION_Y) or rg.get(1)
                if not rx or not ry:
                    os.close(fd)
                    continue
            except OSError as e:
                if ev not in self._tnoted:
                    self._tnoted.add(ev)
                    self.log(f"táctil: no se pudo abrir {ev} ({d['name']}): {e}")
                continue
            cfg = self.touch_fn() or {}
            self._ts[ev] = TouchScroll(rx, ry, self._x.screen_size(), cfg or None, cfg.get("px"))
            self._ts[ev].tr = self._tr
            self._tfds[ev] = fd
            loop.add_reader(fd, self._tread, ev)
            self.log(f"táctil: leyendo {ev} «{d['name']}» ejes {rx} × {ry}, pantalla {self._x.screen_size()}")

    def _tread(self, ev: str) -> None:
        fd, ts = self._tfds.get(ev), self._ts.get(ev)
        if fd is None or ts is None:
            return
        try:
            data = os.read(fd, EVENT_SIZE * 128)
        except (BlockingIOError, OSError):
            return
        if not self.is_active or self._x is None or self.touch_fn() is None:
            ts.abort()   # el panel o el teclado están delante: este toque no es para la app
            if ts.actions and self._x is not None:
                try:
                    self._touch_apply(ts)
                except Exception:  # noqa: BLE001
                    pass
            return
        evs = [struct.unpack_from(EVENT_FMT, data, i)[2:] for i in range(0, len(data) - EVENT_SIZE + 1, EVENT_SIZE)]
        self._touch_feed(ts, evs, time.monotonic())

    def _touch_feed(self, ts: "TouchScroll", evs: list, now: float) -> None:
        """Pasa eventos (tipo, código, valor) del táctil por el TouchScroll y manda lo que piden (clics, rueda, zoom). Lo usan el lector real
        (`_tread`) y la autoprueba del navegador, que inyecta toques sintéticos por el MISMO camino."""
        for typ, code, val in evs:
            ptr = self._x.pointer() if (typ == EV_SYN and ts.down) else None
            was = ts.learned
            v, h = ts.feed(typ, code, val, now, ptr)
            if ts.learned != was:
                self.log(f"táctil: ejes aprendidos (eje Y de pantalla ← eje {ts.learned[0]} signo {ts.learned[1]}; eje X ← {ts.learned[2]} signo {ts.learned[3]})")
            z = ts.take_zoom()
            if ts.actions:
                try:
                    self._touch_apply(ts)
                except Exception as e:  # noqa: BLE001
                    self.log(f"táctil: error en el modo completo: {e}")
                    return
            if v or h or z:
                try:
                    if v or h:
                        self._x.wheel(v, h)
                        self._trw["dedo"] += abs(v) + abs(h)
                    if z:
                        self._x.zoom(z)
                    self._x.flush()
                except Exception as e:  # noqa: BLE001
                    self.log(f"táctil: error al mandar la rueda: {e}")
                    return

    def _tr(self, ev: str, **kv) -> None:
        t = self.trace
        if t is not None and t.on:
            t.add(ev, **kv)

    def _tr_windows(self, now: float) -> None:
        """Grabadora: ventanas que aparecen y desaparecen (menús y listas emergentes de GTK son ventanas aparte) y, 0,4 s después de cada toque,
        a qué ventana iba el clic y si cambió el número de ventanas. Así, un menú que «no abre» se ve: el toque fue a X pero no apareció ventana."""
        if self._snaps and now >= self._snaps[0][0]:
            _t, (ch, n0, px, py) = self._snaps.pop(0)
            n1 = len(self._x.windows())
            self._tr("toque.efecto", clic_en=f"{px},{py}", ventana_bajo_el_puntero=hex(ch), ventanas=f"{n0}→{n1}")
        if self._probes and now >= self._probes[0][0]:
            _t, wid, ww, hh = self._probes.pop(0)
            self._tr("ventana.contenido", id=hex(wid), pintado=self._x.window_probe(wid, ww, hh))
        if now < self._tr_win_at:
            return
        self._tr_win_at = now + 0.2
        cur = {w[0]: w[1:] for w in self._x.windows()}
        if not self._tr_wins:
            self._tr_wins = cur
            self._tr("ventanas.inicio", n=len(cur), lista=" ".join(f"{hex(i)}@{v[0]},{v[1]} {v[2]}x{v[3]}{'*' if v[4] else ''}" for i, v in list(cur.items())[:8]))
            return
        ms = round((now - self._tr_tap_at) * 1000) if self._tr_tap_at else -1
        for i, v in cur.items():
            if i not in self._tr_wins:
                orden = list(cur).index(i) + 1
                self._tr("ventana.nueva", id=hex(i), pos=f"{v[0]},{v[1]}", tam=f"{v[2]}x{v[3]}", emergente=v[4], desde_el_toque_ms=ms, capa=f"{orden}/{len(cur)}")
                if v[4]:
                    self._probes.append((now + 0.35, i, v[2], v[3]))
        for i, v in self._tr_wins.items():
            if i not in cur:
                self._tr("ventana.cierra", id=hex(i), tam=f"{v[2]}x{v[3]}", emergente=v[4], desde_el_toque_ms=ms)
        self._tr_wins = cur

    def _touch_apply(self, ts: "TouchScroll") -> None:
        """Lo que el modo completo pide: colocar el puntero, pulsar/soltar botones y anotar (con tope) lo que hizo.
        Un toque es mover → pulsar → soltar con un respiro entre cada paso (GTK, en menús y desplegables de Firefox/Edge, a veces aún no ha visto
        llegar el puntero cuando ya recibe la pulsación). El respiro NO se duerme (dev.68 lo hacía y paraba el lector 80 ms por toque: los toques
        siguientes llegaban tarde o se perdían): los pasos se encolan con su hora y los ejecuta el bucle."""
        acts = ts.take_actions()
        if not acts:
            return
        now = time.monotonic()
        t = max(now, self._pend_end)
        prev = None
        for a in acts:
            if a[0] == "down" and prev == "move":
                t += self.TAP_GAP_MOVE
            elif a[0] == "up" and prev == "down":
                t += self.TAP_GAP_HOLD
            prev = a[0]
            self._pend.append((t, a, now))
        self._pend_end = t
        self._pend_run(now)

    def _pend_run(self, now: float, force: bool = False) -> None:
        """Ejecuta los pasos de toque que ya tocan (todos, si `force`: al cerrar, para no dejar un botón pulsado)."""
        if not self._pend or self._x is None:
            if self._x is None:
                self._pend.clear()
            return
        did = False
        while self._pend and (force or self._pend[0][0] <= now):
            _t, a, t_enq = self._pend.pop(0)
            did = True
            if a[0] == "move":
                self._x.move_abs(a[1], a[2])
            elif a[0] == "down":
                self._x.button(a[1], True)
                tr = self.trace
                if tr is not None and tr.on and a[1] == 1:
                    px, py, ch = self._x.pointer_child()
                    self._snap_pre = (ch, len(self._x.windows()), px, py)
            elif a[0] == "up":
                self._x.button(a[1], False)
                self._tr("toque.enviado", desde_el_dedo_ms=(time.monotonic() - t_enq) * 1000)
                tr = self.trace
                if tr is not None and tr.on and a[1] == 1:
                    self._tr_tap_at = time.monotonic()
                    pre = getattr(self, "_snap_pre", None)
                    if pre:
                        self._snaps.append((time.monotonic() + 0.4, pre))
            elif a[0] == "kb":
                self.log("táctil: dos dedos → teclado grande")
                self.event("kb.combo")
            elif a[0] == "tap":
                self._text_at = time.monotonic() + 0.15
                self._text_tries = 3   # mirar luego qué cursor hay: si es de texto y está activado, se abre el teclado
            elif a[0] == "log" and self._tlogged < 40:
                self._tlogged += 1
                self.log("táctil: " + a[1])
        if not self._pend:
            self._pend_end = 0.0
        if did:
            self._x.flush()

    def _grab(self, want: bool) -> None:
        """Modo completo: agarrar (o soltar) la pantalla táctil para que gamescope no mande además su propio clic/arrastre."""
        import fcntl
        for ev, fd in self._tfds.items():
            if self._grabbed.get(ev, False) == want:
                continue
            try:
                fcntl.ioctl(fd, 0x40044590, 1 if want else 0)   # EVIOCGRAB
                self._grabbed[ev] = want
                self.log(f"táctil: {'agarrada' if want else 'soltada'} {ev}")
            except OSError as e:
                self._grabbed[ev] = want   # no insistir cada fotograma
                self.log(f"táctil: no se pudo {'agarrar' if want else 'soltar'} {ev}: {e}")

    def _close_touch(self) -> None:
        try:
            self._pend_run(time.monotonic(), force=True)   # que no quede un botón pulsado
        except Exception:  # noqa: BLE001
            self._pend.clear()
        loop = asyncio.get_event_loop()
        for ev, fd in list(self._tfds.items()):
            try:
                loop.remove_reader(fd)
                os.close(fd)
            except OSError:
                pass
        self._tfds.clear()
        self._ts.clear()
        self._grabbed.clear()   # al cerrar el descriptor el núcleo suelta la pantalla

    def _close(self) -> None:
        self._close_touch()
        self._mode_down, self._mode_until = False, 0.0
        self._sel_down = self._sel_used = False
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
                        if val == 1 and 0 < now - self._y_at < 1.0:
                            # Steam + Y con el aviso de Steam llegando después de la Y (así lo vimos en el equipo): también abre el teclado
                            self._y_at = 0.0
                            self.log("mando: combo Y→Steam → teclado grande")
                            self.event("kb.combo")
                        self._mode_down = val == 1
                        self._mode_until = now + 0.5 if val == 0 else 0.0
                    elif val == 1 and (self._mode_down or now < self._mode_until):
                        if code == 304 and self._mode_down:
                            self.log("mando: combo Steam+A → QAM")
                            self.event("qam.combo")  # Steam + A: el usuario pidió el QAM
                        elif code == 308 and self._mode_down:
                            self.log("mando: combo Steam+Y → teclado grande")
                            self.event("kb.combo")   # Steam + Y: el usuario pidió el teclado grande
                        continue  # Steam + botón (abrir el QAM, capturas…): no es un clic para la app
                    if code == 314:
                        # Select no manda Esc al pulsarlo sino al soltarlo, y solo si no se usó de combinación
                        if val == 1:
                            self._sel_down, self._sel_used = True, False
                        else:
                            self._sel_down = False
                            if not self._sel_used:
                                acts = self.mapper.feed_button(314, True, now)
                        if self._logged < 150:
                            self._logged += 1
                            self.log(f"mando: botón 314 {'pulsado' if val else 'soltado'} ({ev})")
                        for a in acts:
                            apply_action(self._x, a)
                        continue
                    if code == 308 and val == 1 and self._sel_down:
                        self._sel_used = True
                        self.log("mando: combo Select+Y → teclado grande")
                        self.event("kb.combo")   # Select + Y: el teclado grande, sin pasar por el botón Steam
                        continue
                    if code == 308 and val == 1:
                        self._y_at = now
                    if self._logged < 150:
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
                    if self.touch_fn() is not None:
                        try:
                            self._scan_touch()
                        except Exception as e:  # noqa: BLE001  (un fallo del táctil no debe parar el mando)
                            if "scan" not in self._tnoted:
                                self._tnoted.add("scan")
                                self.log(f"táctil: error al buscar la pantalla: {e!r}")
                    elif self._tfds:
                        self._close_touch()
                    scan_at = now + 2.0
                tr = self.trace
                if tr is not None and tr.on:
                    if now - last > 0.1 and last:
                        self._tr("parón.lector", ms=(now - last) * 1000)   # el bucle (60 Hz) tardó más de 100 ms en volver: algo lo frenó
                    if self._x is not None and now >= self._tr_x_at:
                        self._tr_x_at = now + 1.0
                        t1 = time.perf_counter()
                        fw = self._x.focus_window()
                        self._tr("x.ida-vuelta", ms=(time.perf_counter() - t1) * 1000, foco=hex(fw))
                if tr is not None and tr.on and self._x is not None:
                    self._tr_windows(now)
                if self._pend:
                    try:
                        self._pend_run(now)
                    except Exception as e:  # noqa: BLE001
                        self._pend.clear()
                        self.log(f"táctil: error al enviar el toque: {e!r}")
                if self._x is not None:
                    acts, dx, dy, wv, wh = self.mapper.tick(now - last, now)
                    try:
                        for a in acts:
                            apply_action(self._x, a)
                        if dx or dy:
                            self._x.move(dx, dy)
                        if wv or wh:
                            self._x.wheel(wv, wh)
                        cfg = self.touch_fn()
                        full = bool(cfg) and bool(cfg.get("full"))
                        for ts in self._ts.values():
                            ts.full = full or getattr(ts, "force_full", False)
                        if self._text_at and now >= self._text_at:
                            # Edge pinta el cursor de texto un poco después del toque: se mira hasta 3 veces (0,15 · 0,45 · 0,85 s).
                            tries = getattr(self, "_text_tries", 1) - 1
                            self._text_tries = tries
                            self._text_at = now + (0.3 if tries == 2 else 0.4) if tries > 0 else 0.0
                            if cfg and cfg.get("text"):
                                is_t, why = self._x.cursor_is_text()
                                self._tr("cursor.tras-toque", texto=is_t, visto=why)
                                if is_t:
                                    self._text_at = 0.0
                                    self.log(f"táctil: cursor de texto ({why}) tras el toque → teclado grande")
                                    self.event("kb.combo")
                                elif tries <= 0 and self._tlogged < 40:
                                    self._tlogged += 1
                                    self.log(f"táctil: tras el toque el cursor no es de texto ({why})")
                            else:
                                self._text_at = 0.0
                        if self._tfds:
                            self._grab(full)   # si el panel o el teclado se abren (cfg None) se suelta al instante
                        self._trw["mando"] += abs(wv) + abs(wh)
                        for ts in self._ts.values():   # inercia tras soltar el dedo
                            tv, th = ts.tick(now - last)
                            if tv or th:
                                self._x.wheel(tv, th)
                                self._trw["inercia"] += abs(tv) + abs(th)
                                wv = wv or tv or th
                            ts.poll(now)
                            tz = ts.take_zoom()
                            if tz:
                                self._x.zoom(tz)
                                wv = wv or tz
                        if any(self._trw.values()) and now - self._tr_wheel_at >= 0.5:
                            self._tr("rueda", dedo=self._trw["dedo"], inercia=self._trw["inercia"], mando=self._trw["mando"], en_ms=500)
                            self._trw = {"dedo": 0, "inercia": 0, "mando": 0}
                            self._tr_wheel_at = now
                        if acts or dx or dy or wv or wh:
                            t2 = time.perf_counter()
                            self._x.flush()
                            if (time.perf_counter() - t2) > 0.02:
                                self._tr("x.flush-lento", ms=(time.perf_counter() - t2) * 1000)
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
