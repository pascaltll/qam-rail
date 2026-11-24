"""Pantalla completa de los navegadores bajo gamescope: el navegador (F11, botón ⛶ del vídeo) PIDE la pantalla completa mandando a la raíz de X un
mensaje `_NET_WM_STATE`, y con gamescope nadie lo contesta (así que no pasa nada). Aquí se escucha esa petición y se le pone a la ventana el estado
`_NET_WM_STATE_FULLSCREEN` (lo que haría un gestor de ventanas); la autoprueba vio que así sí entra. Las funciones puras se prueban sin X."""
import ctypes
import ctypes.util
import struct

CLIENT_MESSAGE = 33
SUBSTRUCTURE_NOTIFY = 1 << 19
# XClientMessageEvent en 64 bits: type(i) serial(L) send_event(i) display(P) window(L) message_type(L) format(i) data(l×5), con el relleno de alineación a 8 bytes
_FMT = "<i4xQi4xQQQi4x5q"
EVENT_SIZE = 192


def parse_client_message(buf: bytes):
    """Un XEvent crudo → (ventana, tipo de mensaje, acción, átomo1, átomo2) si es un ClientMessage de formato 32; si no, None."""
    if len(buf) < struct.calcsize(_FMT):
        return None
    t, _serial, _send, _dpy, win, mtype, fmt, a, b1, b2, _c, _d = struct.unpack_from(_FMT, buf)
    if t != CLIENT_MESSAGE or fmt != 32:
        return None
    return win, mtype, a, b1, b2


def wants_fullscreen(msg, wm_state: int, fullscreen: int, currently: bool):
    """¿Qué pide el mensaje respecto a la pantalla completa? True (poner), False (quitar) o None (no va con ella).
    Acciones EWMH: 0 quitar, 1 poner, 2 alternar."""
    if msg is None:
        return None
    _win, mtype, action, a1, a2 = msg
    if mtype != wm_state or fullscreen not in (a1 & 0xFFFFFFFF, a2 & 0xFFFFFFFF):
        return None
    if action == 1:
        return True
    if action == 0:
        return False
    if action == 2:
        return not currently
    return None


class FsWatch:
    """Conexión propia a X que solo escucha los mensajes de estado de ventana de la raíz. Lanza OSError si no puede abrir la pantalla."""

    def __init__(self, display: str, xauth: str | None):
        import os
        if xauth:
            os.environ["XAUTHORITY"] = xauth
        x11 = ctypes.CDLL(ctypes.util.find_library("X11") or "libX11.so.6")
        vp, ci, cl = ctypes.c_void_p, ctypes.c_int, ctypes.c_ulong
        x11.XOpenDisplay.restype, x11.XOpenDisplay.argtypes = vp, [ctypes.c_char_p]
        x11.XDefaultRootWindow.restype, x11.XDefaultRootWindow.argtypes = cl, [vp]
        x11.XSelectInput.argtypes = [vp, cl, ctypes.c_long]
        x11.XPending.restype, x11.XPending.argtypes = ci, [vp]
        x11.XNextEvent.argtypes = [vp, ctypes.c_char_p]
        x11.XInternAtom.restype, x11.XInternAtom.argtypes = cl, [vp, ctypes.c_char_p, ci]
        x11.XCloseDisplay.argtypes = [vp]
        self.x11 = x11
        self.dpy = x11.XOpenDisplay(display.encode() if isinstance(display, str) else display)
        if not self.dpy:
            raise OSError(f"no se pudo abrir la pantalla {display}")
        root = x11.XDefaultRootWindow(self.dpy)
        x11.XSelectInput(self.dpy, root, SUBSTRUCTURE_NOTIFY)
        self.wm_state = x11.XInternAtom(self.dpy, b"_NET_WM_STATE", 0)
        self.fullscreen = x11.XInternAtom(self.dpy, b"_NET_WM_STATE_FULLSCREEN", 0)

    def poll(self, max_events: int = 64) -> list:
        """Mensajes de ClientMessage pendientes (sin bloquear): [(ventana, tipo, acción, átomo1, átomo2)]."""
        out = []
        buf = ctypes.create_string_buffer(EVENT_SIZE)
        n = 0
        while n < max_events and self.x11.XPending(self.dpy) > 0:
            self.x11.XNextEvent(self.dpy, buf)
            n += 1
            m = parse_client_message(buf.raw)
            if m is not None:
                out.append(m)
        return out

    def close(self) -> None:
        try:
            self.x11.XCloseDisplay(self.dpy)
        except Exception:  # noqa: BLE001
            pass
