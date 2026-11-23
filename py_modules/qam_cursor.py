"""Puntero propio en gamescope sin depender de que cada app lea un tema.
gamescope dibuja el cursor que X le da (XFixes). `XFixesChangeCursorByName` cambia, en el servidor X, la imagen de TODOS los cursores que
tienen un nombre («default», «pointer», «text»…): las apps (Firefox, Edge, Stremio…) lo ven sin enterarse. Solo afecta a los cursores que
ya existen, así que se repite cada pocas décimas mientras una app esté delante (cada cursor nuevo se cambia una sola vez)."""
import ctypes
import ctypes.util
import os

PREFIX = "qam-"       # nombre de nuestro cursor: lo que ya empieza así ya está cambiado
SIZE = 64  # el doble que antes: el puntero de la Xbox se ve grande en pantalla


class _Img(ctypes.Structure):
    _fields_ = [("x", ctypes.c_short), ("y", ctypes.c_short), ("width", ctypes.c_ushort), ("height", ctypes.c_ushort),
                ("xhot", ctypes.c_ushort), ("yhot", ctypes.c_ushort), ("serial", ctypes.c_ulong),
                ("pixels", ctypes.POINTER(ctypes.c_ulong)), ("atom", ctypes.c_ulong), ("name", ctypes.c_char_p)]


def available() -> bool:
    return bool(ctypes.util.find_library("Xfixes")) and bool(ctypes.util.find_library("Xcursor"))


class CursorSkin:
    """`x11` y `dpy` son los de una conexión ya abierta (qam_pad.XOut); `cursors_dir` es `<tema>/cursors`."""

    def __init__(self, x11, dpy, cursors_dir: str):
        self.x11, self.dpy, self.dir = x11, dpy, cursors_dir
        vp, cl = ctypes.c_void_p, ctypes.c_ulong
        self.fx = ctypes.CDLL(ctypes.util.find_library("Xfixes") or "libXfixes.so.3")
        self.xc = ctypes.CDLL(ctypes.util.find_library("Xcursor") or "libXcursor.so.1")
        self.fx.XFixesGetCursorImage.restype = ctypes.POINTER(_Img)
        self.fx.XFixesGetCursorImage.argtypes = [vp]
        self.fx.XFixesSetCursorName.argtypes = [vp, cl, ctypes.c_char_p]
        self.fx.XFixesChangeCursorByName.argtypes = [vp, cl, ctypes.c_char_p]
        self.xc.XcursorFilenameLoadCursor.restype = cl
        self.xc.XcursorFilenameLoadCursor.argtypes = [vp, ctypes.c_char_p]
        self.xc.XcursorSetDefaultSize.argtypes = [vp, ctypes.c_int]
        self.xc.XcursorSetDefaultSize(dpy, SIZE)
        self._loaded: dict = {}
        self.changed: list = []

    def _cursor(self, name: str):
        if name in self._loaded:
            return self._loaded[name]
        path = os.path.join(self.dir, name)
        cur = 0
        if os.path.isfile(path):
            cur = int(self.xc.XcursorFilenameLoadCursor(self.dpy, path.encode()))
            if cur:
                self.fx.XFixesSetCursorName(self.dpy, cur, (PREFIX + name).encode())
        self._loaded[name] = cur or None
        return self._loaded[name]

    def current_name(self):
        """Nombre del cursor que X muestra ahora (p. ej. «text» sobre un campo de texto), o None."""
        p = self.fx.XFixesGetCursorImage(self.dpy)
        if not p:
            return None
        try:
            n = p.contents.name
            return n.decode("utf-8", "replace") if n else None
        finally:
            self.x11.XFree(ctypes.cast(p, ctypes.c_void_p))

    def tick(self) -> str | None:
        """Cambia el cursor actual si aún es el de la app. Devuelve su nombre si lo cambió."""
        name = self.current_name()
        if not name or name.startswith(PREFIX):
            return None
        cur = self._cursor(name)
        if not cur:
            return None
        self.fx.XFixesChangeCursorByName(self.dpy, cur, name.encode())
        self.x11.XFlush(self.dpy)
        self.changed.append(name)
        return name
