import os
#!/usr/bin/env python3
"""Prueba de extremo a extremo de la autoprueba del navegador SIN la consola: arranca Xvfb y Chrome (o Chromium) y pasa por la misma
autoprueba (toques, scroll, inercia, teclado, pestañas) que corre en el equipo con Firefox. Sirve para ver que un cambio en qam_pad.py o en
qam_selftest.py no la rompe. Necesita: Xvfb y google-chrome/chromium. Uso: python3 scripts/e2e-selftest.py"""
import asyncio, os, subprocess, sys, time, ctypes
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "py_modules"))
import qam_pad as q, qam_selftest as st, qam_transtest as tt

DISP = ":97"
xv = subprocess.Popen(["Xvfb", DISP, "-screen", "0", "1920x1080x24"], stderr=subprocess.DEVNULL)
time.sleep(1.0)
os.environ["DISPLAY"] = DISP
ch = subprocess.Popen([next((b for b in ("google-chrome", "chromium", "chromium-browser") if subprocess.call(["which", b], stdout=subprocess.DEVNULL) == 0), "google-chrome"), "--no-sandbox", "--user-data-dir=/tmp/qam-e2e-profile", "--no-first-run", "--disable-gpu", "--window-position=0,0",
                       "--window-size=1920,1080", "--disable-features=Translate", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(4.0)
x = q.XOut(DISP, None)
x.mod_mode = os.environ.get('KMOD', x.mod_mode); x.char_mode = os.environ.get('KCH', x.char_mode)   # forzar un modo de teclado
def top_windows():
    root = x.x11.XDefaultRootWindow(x.dpy)
    r, p, kids, n = ctypes.c_ulong(), ctypes.c_ulong(), ctypes.POINTER(ctypes.c_ulong)(), ctypes.c_uint()
    x.x11.XQueryTree.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.POINTER(ctypes.c_ulong)), ctypes.POINTER(ctypes.c_uint)]
    x.x11.XQueryTree(x.dpy, root, ctypes.byref(r), ctypes.byref(p), ctypes.byref(kids), ctypes.byref(n))
    return [int(kids[i]) for i in range(n.value)]
best = max(top_windows(), key=lambda w: (x.geometry(w) or (0, 0))[0] * (x.geometry(w) or (0, 0))[1])
print("ventana", hex(best), x.geometry(best))

runner = q.PadRunner(lambda: set(), None, lambda t: None, lambda: True)
runner._x = x
runner.is_active = True
x.focus(best)

async def keys(key, mods):
    x.focus(best) if not x.focus_within(best) else None
    if mods:
        x.key("+".join([*mods, q.NAMED_KEYS.get(key, key)]))
    else:
        x.key(q.NAMED_KEYS.get(key, key))
    x.flush(); return True
async def typ(text):
    x.focus(best) if not x.focus_within(best) else None
    for ch_ in text: x.type_char(ch_)
    x.flush(); return True

async def pump():
    last = time.monotonic()
    while True:
        now = time.monotonic()
        runner._pend_run(now)
        for ts in list(runner._ts.values()):
            tv, th = ts.tick(now - last)
            if tv or th: x.wheel(tv, th); x.flush()
            ts.poll(now)
        last = now
        await asyncio.sleep(1/60)

async def main():
    pt = asyncio.ensure_future(pump())
    if os.environ.get("TRANS"):   # prueba de transiciones con un QAM simulado: mismos eventos que manda la interfaz, con retrasos
        sink = []
        async def act(name):
            now = time.monotonic
            async def later(dt, ev, **d):
                await asyncio.sleep(dt); sink.append((now(), ev, d))
            if name == "qam_open":
                asyncio.ensure_future(later(0.12, "ui.panel.abre")); asyncio.ensure_future(later(0.2, "overlay", on=True)); asyncio.ensure_future(later(0.25, "pad", t="táctil: en pausa — el panel"))
            elif name == "qam_close":
                asyncio.ensure_future(later(0.05, "ui.panel.cierra")); asyncio.ensure_future(later(0.08, "overlay", on=False)); asyncio.ensure_future(later(0.3, "pad", t="táctil: agarrada event5"))
            elif name == "kb_open":
                asyncio.ensure_future(later(0.15, "ui.kb.abre")); asyncio.ensure_future(later(0.2, "overlay", on=True)); asyncio.ensure_future(later(0.25, "pad", t="táctil: en pausa"))
            elif name == "kb_close":
                asyncio.ensure_future(later(0.05, "ui.kb.cierra")); asyncio.ensure_future(later(0.08, "overlay", on=False)); asyncio.ensure_future(later(0.3, "pad", t="táctil: agarrada"))
        t = tt.TransTest(runner, keys, typ, lambda ev, **kw: print("  ", ev, kw), act=act, sink=sink, wid=0)
        out = await t.run(); pt.cancel()
        print(out["ok"], out["secs"], "s")
        for s_ in out["steps"]:
            print(("OK  " if s_["ok"] else "FALLA"), s_["name"], "|", s_["detail"], "|", s_["ms"])
        return
    t = st.SelfTest(runner, keys, typ, lambda ev, **kw: print("  ", ev, kw))
    out = await t.run()
    pt.cancel()
    print(out["ok"], out["secs"], "s")
    for s in out["steps"]:
        print(("OK  " if s["ok"] else "FALLA"), s["name"], "|", s["detail"], "|", s["ms"])
try:
    asyncio.run(main())
finally:
    ch.terminate(); xv.terminate()
