"""Pantalla completa automática: parser y decisión puros + integración con Xvfb (si está). python3 tests/py/test_fswatch.py"""
import ctypes, ctypes.util, os, shutil, struct, subprocess, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "py_modules"))
import qam_fswatch as f

# --- puro: un ClientMessage de 32 bits se lee entero
raw = struct.pack(f._FMT, 33, 0, 1, 0, 0x4000016, 300, 32, 1, 400, 0, 1, 0).ljust(192, b"\0")
assert f.parse_client_message(raw) == (0x4000016, 300, 1, 400, 0), f.parse_client_message(raw)
assert f.parse_client_message(struct.pack(f._FMT, 12, 0, 0, 0, 1, 2, 32, 0, 0, 0, 0, 0)) is None    # no es ClientMessage
assert f.parse_client_message(struct.pack(f._FMT, 33, 0, 0, 0, 1, 2, 8, 0, 0, 0, 0, 0)) is None     # formato 8: no es de estado de ventana
assert f.parse_client_message(b"x") is None

WS, FS = 300, 400
msg = lambda act, a1=FS, a2=0, mt=WS: (1, mt, act, a1, a2)
assert f.wants_fullscreen(msg(1), WS, FS, False) is True
assert f.wants_fullscreen(msg(0), WS, FS, True) is False
assert f.wants_fullscreen(msg(2), WS, FS, False) is True and f.wants_fullscreen(msg(2), WS, FS, True) is False   # alternar
assert f.wants_fullscreen(msg(1, a1=999), WS, FS, False) is None          # otro estado (maximizar…)
assert f.wants_fullscreen(msg(1, a1=999, a2=FS), WS, FS, False) is True    # el átomo puede ir en el segundo hueco
assert f.wants_fullscreen(msg(1, mt=7), WS, FS, False) is None            # otro tipo de mensaje
assert f.wants_fullscreen(None, WS, FS, False) is None and f.wants_fullscreen(msg(9), WS, FS, False) is None
print("ok puro")

# --- integración: Xvfb, un cliente manda la petición a la raíz, FsWatch la ve y XOut le pone el estado
if not shutil.which("Xvfb"):
    print("sin Xvfb: integración omitida"); sys.exit(0)
import qam_pad as q
D = ":97"
xv = subprocess.Popen(["Xvfb", D, "-screen", "0", "800x600x24"], stderr=subprocess.DEVNULL)
try:
    time.sleep(1.0)
    os.environ["DISPLAY"] = D
    x11 = ctypes.CDLL(ctypes.util.find_library("X11") or "libX11.so.6")
    vp, cl, ci = ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int
    x11.XOpenDisplay.restype, x11.XOpenDisplay.argtypes = vp, [ctypes.c_char_p]
    x11.XDefaultRootWindow.restype, x11.XDefaultRootWindow.argtypes = cl, [vp]
    x11.XCreateSimpleWindow.restype = cl
    x11.XCreateSimpleWindow.argtypes = [vp, cl, ci, ci, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint, cl, cl]
    x11.XInternAtom.restype, x11.XInternAtom.argtypes = cl, [vp, ctypes.c_char_p, ci]
    x11.XSendEvent.argtypes = [vp, cl, ci, ctypes.c_long, ctypes.c_char_p]
    x11.XMapWindow.argtypes = [vp, cl]
    x11.XFlush.argtypes = [vp]
    dpy = x11.XOpenDisplay(D.encode())
    root = x11.XDefaultRootWindow(dpy)
    win = x11.XCreateSimpleWindow(dpy, root, 0, 0, 200, 100, 0, 0, 0)
    x11.XMapWindow(dpy, win); x11.XFlush(dpy)
    watch = f.FsWatch(D, None)
    xo = q.XOut(D, None)
    ev = struct.pack(f._FMT, 33, 0, 1, 0, win, watch.wm_state, 32, 1, watch.fullscreen, 0, 1, 0).ljust(192, b"\0")
    x11.XSendEvent(dpy, root, 0, (1 << 20) | (1 << 19), ev); x11.XFlush(dpy)   # SubstructureRedirect | SubstructureNotify, como hace un navegador
    got = []
    for _ in range(40):
        got += watch.poll()
        if got: break
        time.sleep(0.05)
    assert got, "FsWatch no recibió la petición"
    want = f.wants_fullscreen(got[0], watch.wm_state, watch.fullscreen, "_NET_WM_STATE_FULLSCREEN" in xo.wm_state(win))
    assert want is True and got[0][0] == win
    assert xo.set_wm_fullscreen(win, True)
    assert "_NET_WM_STATE_FULLSCREEN" in xo.wm_state(win)
    xo.set_wm_fullscreen(win, False)
    assert "_NET_WM_STATE_FULLSCREEN" not in xo.wm_state(win)
    watch.close()
    print("ok test_fswatch (integración con Xvfb)")
finally:
    xv.terminate()
