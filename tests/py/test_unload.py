"""dev.44: al descargar el plugin se limpia la capa base y el overlay. python3 tests/py/test_unload.py"""
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


async def t_unload():
    p = main.Plugin()
    calls = []

    async def sess(): return [], {"DISPLAY": ":1"}
    async def base(prefix, display, key, on): calls.append(("base", display, key, on))
    async def ov(on, reason="panel"): calls.append(("ov", on, reason)); return {"ok": True}
    p._user_session, p._base_layer, p.desktop_overlay = sess, base, ov
    p._claims_v = {"0x1": "firefox", "0x2": "com.stremio.Stremio"}
    p._ov_prev = "0"
    await p._unload()
    assert ("base", ":1", "firefox", False) in calls and ("base", ":1", "com.stremio.Stremio", False) in calls, calls
    assert ("ov", False, "descarga") in calls, calls
    # sin nada que limpiar: no toca el overlay
    calls.clear(); p._claims_v = {}; p._ov_prev = None
    await p._unload()
    assert not [c for c in calls if c[0] == "ov"], calls
    # si algo falla o se cuelga, la descarga no se rompe
    async def boom(*a, **k): raise RuntimeError("x")
    p._user_session = boom
    await p._unload()


asyncio.run(t_unload())
print("TODO OK")
