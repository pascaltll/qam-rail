"""Un error de X (ventana que ya no existe) no debe matar el backend: sin manejador, Xlib llama a exit() y el plugin se queda sin backend."""
import os, shutil, subprocess, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "py_modules"))

if not shutil.which("Xvfb"):
    print("TODO OK (sin Xvfb: omitido)"); sys.exit(0)

child = r'''
import sys
sys.path.insert(0, "py_modules")
import qam_pad
x = qam_pad.XOut(":78", None)
bogus = 0x1234567
assert x.geometry(bogus) is None
x.resize(bogus, 100, 100)
try:
    x.focus(bogus)
except Exception:
    pass
x.x11.XSync(x.dpy, 0)
print("vivo")
'''
p = subprocess.Popen(["Xvfb", ":78", "-screen", "0", "640x480x24"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.0)
    r = subprocess.run([sys.executable, "-I", "-c", child], capture_output=True, text=True, timeout=20, cwd=os.path.join(os.path.dirname(__file__), "..", ".."))
    assert r.returncode == 0 and "vivo" in r.stdout, (r.returncode, r.stdout, r.stderr[-300:])
finally:
    p.terminate()
print("TODO OK")
