"""Plugin._forensics de punta a punta con decky simulado y registros falsos. python3 tests/py/test_main_forensics.py"""
import asyncio, os, sys, tempfile, time, types
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
sys.path.insert(0, os.path.join(ROOT, "py_modules"))


def load(tmp):
    dk = types.ModuleType("decky")
    dk.DECKY_PLUGIN_SETTINGS_DIR = os.path.join(tmp, "settings"); os.makedirs(dk.DECKY_PLUGIN_SETTINGS_DIR)
    dk.DECKY_HOME = os.path.join(tmp, "homebrew"); dk.DECKY_USER_HOME = tmp; dk.DECKY_PLUGIN_VERSION = "0.50.0"
    dk.logger = types.SimpleNamespace(info=lambda *a, **k: None, error=lambda *a, **k: None, warning=lambda *a, **k: None)
    sys.modules["decky"] = dk
    import importlib.util
    spec = importlib.util.spec_from_file_location("qam_main_f", os.path.join(ROOT, "main.py"))
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod.Plugin()


async def main(tmp):
    p = load(tmp)
    logs = os.path.join(tmp, ".local", "share", "Steam", "logs"); os.makedirs(logs)
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    with open(os.path.join(logs, "webhelper.txt"), "w") as fh:
        fh.write(f"[{ts}] TerminateApp 5\n[{ts}] otra cosa\n")
    p._user_env = lambda: dict(os.environ)
    out = await p._forensics(time.time())
    assert "webhelper.txt" in out, out.keys()
    assert out["sesion_grafica"]["fin_del_juego"], out["sesion_grafica"]
    for k in ("journal_usuario", "evidencias", "volcados_steam", "orca", "ventana"):
        assert k in out, k
    assert out["volcados_steam"] == [] or isinstance(out["volcados_steam"], list)
    print("ok test_main_forensics")

with tempfile.TemporaryDirectory() as t:
    asyncio.run(main(t))
