"""Pruebas de la parte pura de scripts/captura.py (la captura real necesita Steam)."""
import importlib.util, os, tempfile, time
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
assert [p["title"] for p in c.elegir(pags)] == ["QuickAccess_uid2", "Steam Big Picture Mode"]
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
print("OK test_captura")
