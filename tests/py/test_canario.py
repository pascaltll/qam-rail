"""Pruebas de la lógica pura de scripts/canario.py (juzgar)."""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("canario", Path(__file__).resolve().parents[2] / "scripts" / "canario.py")
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)

bueno = {"paginas": ["Steam Big Picture Mode", "SharedJSContext", "QuickAccess_uid2"], "chromium": "Chrome/109",
         "steam": {"steamUIStore": "object", "getFocused": "function", "menuStore": "object", "open": "function", "side": "function",
                   "toggle": "function", "steamClient": "object", "qamRail": "object"},
         "pantalla": {"gpfocus": 2, "ancho": 1920, "alto": 1080}}
r = {n: (e, d) for n, e, d in c.juzgar(bueno, {"chromium": "Chrome/109"})}
assert all(e == c.OK for e, _ in r.values()), r

# falta una página → FALLA
m = dict(bueno, paginas=["Steam Big Picture Mode"])
assert {n: e for n, e, _ in c.juzgar(m)}["páginas CEF"] == c.FALLA

# MenuStore sin ninguna función → FALLA; con una sola → AVISO
m = dict(bueno, steam=dict(bueno["steam"], open="undefined", side="undefined", toggle="undefined"))
assert {n: e for n, e, _ in c.juzgar(m)}["MenuStore (abrir menú)"] == c.FALLA
m = dict(bueno, steam=dict(bueno["steam"], toggle="undefined"))
assert {n: e for n, e, _ in c.juzgar(m)}["MenuStore (abrir menú)"] == c.AVISO

# sin foco, otro tamaño, plugin ausente y Chromium distinto → solo AVISOS
m = dict(bueno, pantalla={"gpfocus": 0, "ancho": 1280, "alto": 800}, steam=dict(bueno["steam"], qamRail="undefined"))
e = {n: x for n, x, _ in c.juzgar(m, {"chromium": "Chrome/100"})}
assert e["foco de mando (.gpfocus)"] == c.AVISO and e["tamaño de la ventana"] == c.AVISO
assert e["plugin cargado (__qamRail)"] == c.AVISO and e["versión de Chromium"] == c.AVISO

# sin datos de Steam → FALLA sin romper
assert {n: x for n, x, _ in c.juzgar({"paginas": []})}["SteamUIStore"] == c.FALLA

# --abrir
assert {n: x for n, x, _ in c.juzgar(dict(bueno, abrir=False))}["abrir/cerrar el panel"] == c.FALLA
print("OK test_canario")
