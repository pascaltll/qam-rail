"""Pruebas de la parte pura de scripts/captura.py (la captura real necesita Steam)."""
import importlib.util, json, os, tempfile, time
from pathlib import Path

spec = importlib.util.spec_from_file_location("captura", Path(__file__).resolve().parents[2] / "scripts" / "captura.py")
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)

assert c.slug("Steam Big Picture Mode") == "Steam-Big-Picture-Mode"
assert c.slug("") == "pagina" and c.slug("¡¡¡") == "pagina"
assert len(c.slug("x" * 100)) == 40

pags = [{"title": "QuickAccess_uid2", "webSocketDebuggerUrl": "ws://a"},
        {"title": "SharedJSContext", "webSocketDebuggerUrl": "ws://b"},
        {"title": "MainMenu_uid2"},
        {"title": "Steam Big Picture Mode", "webSocketDebuggerUrl": "ws://c"}]
assert [p["title"] for p in c.elegir(pags)] == ["Steam Big Picture Mode"]
assert [p["title"] for p in c.elegir(pags, "todas")] == ["QuickAccess_uid2", "Steam Big Picture Mode"]
assert [p["title"] for p in c.elegir(pags, "quick")] == ["QuickAccess_uid2"]
assert c.elegir(pags, "nada") == []

with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    for i in range(6):
        f = d / f"{i}.png"
        f.write_bytes(b"x")
        os.utime(f, (time.time() + i, time.time() + i))
    c.podar(d, 3)
    assert sorted(f.name for f in d.glob("*.png")) == ["3.png", "4.png", "5.png"]
assert c.plan_scroll(900, 900) == [0] and c.plan_scroll(100, 0) == [0]
assert c.plan_scroll(2000, 800) == [0, 760, 1200] and c.plan_scroll(10000, 800, 4) == [0, 760, 1520, 2280]


class Falso:
    """Imita la conexión CEF: guarda las expresiones y responde lo mínimo."""
    def __init__(self, alto=None):
        self.expr, self.alto = [], alto

    def call(self, metodo, params=None):
        e = params["expression"]
        self.expr.append(e)
        if ".current()" in e:
            v = "home"
        elif "scrollHeight" in e:
            v = self.alto
        else:
            v = None
        return {"result": {"value": v}}


h = Falso()
nombres = []
r = c.recorrido(h, ["home", "audio"], False, lambda n: nombres.append(n) or n, dormir=lambda s: None)
assert nombres == ["01-home", "02-audio"] and r == nombres
assert h.expr[-1].endswith('.go("home")')  # vuelve a la sección original
h = Falso(alto=json.dumps([2000, 800]))
nombres = []
c.recorrido(h, ["audio"], True, lambda n: nombres.append(n) or n, dormir=lambda s: None)
assert nombres == ["01-audio-1", "01-audio-2", "01-audio-3"]
assert c.parse_secciones([], ["a", "b"]) == ["a", "b"]
assert c.parse_secciones(["--secciones=b,x,a"], ["a", "b"]) == ["b", "a"]
assert c.clip_compacto(1920, 1080) == {"x": 844, "y": 0, "width": 1076, "height": 1080, "scale": 0.6}
assert c.formatear_desborde("01-home", json.dumps([{"t": "Equilibrado 15", "p": ["cortado"]}, {"t": "OLED", "p": ["partido", "bajo 34px"]}])) == [
    "  01-home — «Equilibrado 15» — cortado", "  01-home — «OLED» — partido, bajo 34px"]
assert c.formatear_desborde("x", "[]") == [] and c.formatear_desborde("x", None) == []
assert "no se pudo" in c.formatear_desborde("x", "{no json")[0]
print("OK test_captura")
