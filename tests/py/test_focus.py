"""Registro de foco con el mando (py_modules/qam_focus.py): validar lo que manda la interfaz, guardar con rotación y resumir. python3 tests/py/test_focus.py"""
import json, os, sys, tempfile

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
sys.path.insert(0, os.path.join(ROOT, "py_modules"))
import qam_focus as f

# --- limpiar: solo tipos simples, claves conocidas, textos cortos, tope de eventos
s = {"v": "0.54.0-dev.110", "t0": 1764056400.0, "ev": [
    {"k": "m", "t": 1.5, "s": "home", "f": "a|div:1", "fl": "Steam 10", "d": "D", "to": "b|div:2", "tl": "Eco 7"},
    {"k": "m", "t": 2.0, "s": "home", "f": "b|div:2", "fl": "Eco 7", "d": "D", "to": "", "tl": ""},
    {"k": "s", "t": 3.0, "s": "home", "to": "energy"},
    {"k": "t", "t": 4.0, "s": "energy", "f": "c|div:3", "fl": "Manual"},
    {"k": "x", "t": 5.0},                                   # tipo desconocido: se descarta
    {"k": "m", "t": 6.0, "s": "home", "f": "x" * 500, "fl": "y" * 500, "d": "U", "to": "z", "tl": "w", "extra": "no"},
    "no es un dict", 7, None]}
c = f.limpiar(s)
assert c is not None and c["v"] == "0.54.0-dev.110" and len(c["ev"]) == 5
assert all(set(e) <= f.CLAVES for e in c["ev"])
assert len(c["ev"][-1]["f"]) <= f.MAX_TXT and len(c["ev"][-1]["fl"]) <= f.MAX_TXT and "extra" not in c["ev"][-1]
assert f.limpiar("no") is None and f.limpiar({"ev": "no"}) is None and f.limpiar({"ev": []}) is None   # sin eventos: nada que guardar
big = {"ev": [{"k": "s", "t": float(i), "s": "home", "to": "energy"} for i in range(5000)]}
assert len(f.limpiar(big)["ev"]) == f.MAX_EV
# las etiquetas de listas con datos de otras personas (amigos, apps) se anonimizan
assert f.anonimizar("social", "MrDesdes") == "(lista)" and f.anonimizar("apps", "Firefox") == "(lista)"
assert f.anonimizar("home", "Steam 10") == "Steam 10"

# --- guardar con rotación
with tempfile.TemporaryDirectory() as d:
    p = os.path.join(d, "foco.jsonl")
    for i in range(30):
        f.guardar(p, c, max_bytes=2000)
    assert os.path.getsize(p) <= 2000 + 800   # rotó: se queda con lo último
    lineas = [json.loads(l) for l in open(p, encoding="utf-8")]
    assert lineas and all("ev" in l for l in lineas)
    assert f.guardar(p, None) is False

# --- resumen
ses = [c, {"v": "x", "t0": 2.0, "ev": [
    {"k": "m", "t": 1, "s": "home", "f": "b|div:2", "fl": "Eco 7", "d": "D", "to": "", "tl": ""},
    {"k": "m", "t": 2, "s": "home", "f": "a|div:1", "fl": "Steam 10", "d": "R", "to": "b|div:2", "tl": "Eco 7"},
    {"k": "t", "t": 3, "s": "home", "f": "k|div:9", "fl": "Noche"},
    {"k": "t", "t": 4, "s": "home", "f": "k|div:9", "fl": "Noche"}]}]
r = f.resumen(ses)
assert r["sesiones"] == 2 and r["movimientos"] == 5
# sin destino: «Eco 7» + abajo, 2 veces
assert r["sin_destino"][0] == {"s": "home", "fl": "Eco 7", "d": "D", "n": 2}
# toques en controles a los que el mando nunca llegó (ni como origen ni como destino)
assert {"s": "home", "fl": "Noche", "n": 2} in r["solo_tactil"] and all(t["fl"] != "Manual" or t["s"] == "energy" for t in r["solo_tactil"])
l = f.formatear(r)
assert any("Eco 7" in x for x in l) and any("Noche" in x for x in l) and len(l) <= 30
assert f.resumen([])["sesiones"] == 0 and f.formatear(f.resumen([]))[0].startswith("Sin datos")
print("OK test_focus")
