"""Puntero Xbox por XFixes: el cursor de la app se cambia en el servidor X. python3 tests/py/test_cursor_skin.py"""
import filecmp, os, shutil, subprocess, sys, tempfile, time
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
sys.path.insert(0, os.path.join(ROOT, "py_modules"))
import qam_cursor, qam_cursor_theme

assert filecmp.cmp(os.path.join(ROOT, "scripts", "cursor_xbox.py"), os.path.join(ROOT, "py_modules", "qam_cursor_theme.py"), shallow=False), "las dos copias del generador difieren"
# forma de gota: el hotspot cae en la punta (arriba a la izquierda) y esa esquina está pintada; la opuesta, vacía
for _k in ("arrow", "hand"):
    _w, _h, _xh, _yh, _d = qam_cursor_theme.render(_k, 32)
    _a = lambda x, y: _d[(y * _w + x) * 4 + 3]
    assert _xh == _yh and _xh < _w // 4, (_k, _xh, _yh)
    assert _a(_xh, _yh) > 120 and _a(_xh + 1, _yh + 1) > 200 and _a(_w - 1, _h - 1) == 0, _k
assert open(os.path.join(ROOT, "py_modules", "qam_cursor_theme.py")).read().count("VERSION = ") == 1
if not shutil.which("Xvfb") or not qam_cursor.available():
    print("TODO OK (sin Xvfb o sin Xfixes/Xcursor: omitido)"); sys.exit(0)

child = r'''
import ctypes, ctypes.util, sys
sys.path.insert(0, "py_modules")
import qam_pad, qam_cursor
x = qam_pad.XOut(":80", None)
c = ctypes.CDLL(ctypes.util.find_library("Xcursor")); c.XcursorLibraryLoadCursor.restype = ctypes.c_ulong; c.XcursorLibraryLoadCursor.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
x.x11.XCreateSimpleWindow.restype = ctypes.c_ulong
x.x11.XCreateSimpleWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint, ctypes.c_ulong, ctypes.c_ulong]
x.x11.XDefineCursor.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong]
x.x11.XMapWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong]; x.x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
x.x11.XDefaultRootWindow.restype = ctypes.c_ulong
win = x.x11.XCreateSimpleWindow(x.dpy, x.x11.XDefaultRootWindow(x.dpy), 0, 0, 640, 480, 0, 0, 0); x.x11.XMapWindow(x.dpy, win)
x.x11.XDefineCursor(x.dpy, win, c.XcursorLibraryLoadCursor(x.dpy, b"left_ptr")); x.x11.XSync(x.dpy, 0)
sk = qam_cursor.CursorSkin(x.x11, x.dpy, sys.argv[1])
assert sk.current_name() == "left_ptr", sk.current_name()
assert sk.tick() == "left_ptr" and sk.current_name() == "qam-left_ptr", sk.current_name()
assert sk.tick() is None                     # ya es nuestro: no se repite
assert sk._cursor("no-existe") is None       # un nombre sin archivo no rompe nada
print("vivo")
'''
tmp = tempfile.mkdtemp()
import qam_cursor_theme as t
t.install(tmp)
p = subprocess.Popen(["Xvfb", ":80", "-screen", "0", "640x480x24"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.0)
    r = subprocess.run([sys.executable, "-I", "-c", child, os.path.join(tmp, "qam-xbox", "cursors")], capture_output=True, text=True, timeout=30, cwd=ROOT)
    assert r.returncode == 0 and "vivo" in r.stdout, (r.returncode, r.stdout, r.stderr[-400:])
finally:
    p.terminate(); shutil.rmtree(tmp, ignore_errors=True)
print("TODO OK")
