"""Rendimiento del backend (dev.27): sesión en caché, desktop_running compartido y overlay sin procesos de más. python3 tests/py/test_perf.py"""
import asyncio, logging, os, sys, tempfile, types

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "py_modules"))
dk = types.ModuleType("decky")
tmp = tempfile.mkdtemp()
for k in ("DECKY_PLUGIN_SETTINGS_DIR", "DECKY_PLUGIN_RUNTIME_DIR", "DECKY_PLUGIN_LOG_DIR", "DECKY_PLUGIN_DIR", "DECKY_HOME", "DECKY_USER_HOME"):
    setattr(dk, k, tmp)
dk.DECKY_USER = "bazzite"; dk.logger = logging.getLogger("t"); dk.emit = lambda *a, **k: None
sys.modules["decky"] = dk
import main

P = main.Plugin


def make():
    p = P()
    calls = {"fresh": 0, "scan": 0, "x": []}

    async def fresh(self):
        calls["fresh"] += 1
        return ["env"], {"DISPLAY": ":0", "XAUTHORITY": "/x"}

    async def scan(self):
        calls["scan"] += 1
        await asyncio.sleep(0.05)
        return {"keys": ["a"], "apps": []}

    async def xr(self, prefix, display, *cmd):
        calls["x"].append(cmd[0])
        if cmd[:2] == ("xwininfo", "-root"):
            return 0, '     0x2a00035 "Steam Big Picture Mode": ("steamwebhelper" "stea")  1920x1080+0+0  +0+0\n', ""
        return 0, "", ""

    P._user_session_fresh = fresh; P._desktop_running_scan = scan; P._x_run = xr
    return p, calls


async def main_test():
    p, calls = make()
    # sesión: una sola consulta aunque se pida muchas veces
    for _ in range(5):
        await p._user_session()
    assert calls["fresh"] == 1, calls
    # desktop_running: tres peticiones a la vez = una ejecución; otra dentro de 1,5 s sale de la caché
    r = await asyncio.gather(p.desktop_running(), p.desktop_running(), p.desktop_running())
    assert calls["scan"] == 1 and all(x["keys"] == ["a"] for x in r), calls
    await p.desktop_running()
    assert calls["scan"] == 1
    # abrir/cerrar/minimizar invalida la caché
    p._run_c = None
    await p.desktop_running()
    assert calls["scan"] == 2
    # overlay: activar busca la ventana de Steam una vez; desactivar no vuelve a recorrer la pantalla ni lee el valor previo
    calls["x"].clear()
    assert (await p.desktop_overlay(True))["ok"]
    assert (await p.desktop_overlay(False))["ok"]
    assert calls["x"] == ["xwininfo", "xprop", "xprop"], calls["x"]
    assert (await p.desktop_overlay(False)).get("skipped")  # sin activar antes: no toca nada


asyncio.run(main_test())
print("TODO OK")
