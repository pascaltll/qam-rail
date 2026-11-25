"""Pruebas de la parte pura de scripts/navtest.py (analizar la traza de foco y dar el informe). La grabación real necesita Steam y el mando."""
import importlib.util, json
from pathlib import Path

spec = importlib.util.spec_from_file_location("navtest", Path(__file__).resolve().parents[2] / "scripts" / "navtest.py")
n = importlib.util.module_from_spec(spec)
spec.loader.exec_module(n)

P = lambda i, label, x, y: {"id": i, "label": label, "x": x, "y": y}
paradas = {
    "home": [P("a", "Steam 10", 50, 300), P("b", "Eco 7", 150, 300), P("c", "Brillo", 50, 400), P("d", "Wi-Fi", 50, 500)],
    "energy": [P("e", "Manual", 50, 200), P("f", "Auto-TDP", 150, 200)],
}
M = lambda t, sec, i, label, x, y: {"t": t, "sec": sec, "id": i, "label": label, "x": x, "y": y}
muestras = [
    M(0.0, "home", "a", "Steam 10", 50, 300),
    M(1.0, "home", "b", "Eco 7", 150, 300),
    M(2.0, "home", "c", "Brillo", 50, 400),
    M(3.0, "energy", "e", "Manual", 50, 200),
]
r = n.analizar(paradas, muestras)
# visitadas y no visitadas por sección
assert r["secciones"]["home"] == {"total": 4, "visitadas": 3, "no_visitadas": ["Wi-Fi"]}
assert r["secciones"]["energy"] == {"total": 2, "visitadas": 1, "no_visitadas": ["Auto-TDP"]}
assert r["saltos"] == [] and r["muestras"] == 4

# un salto de foco muy grande dentro de la misma sección se marca (p. ej. de arriba a abajo sin pasar por lo de en medio)
lejos = muestras[:1] + [M(1.0, "home", "d", "Wi-Fi", 50, 900)]
r2 = n.analizar(paradas, lejos)
assert r2["saltos"] == [{"sec": "home", "de": "Steam 10", "a": "Wi-Fi", "dist": 600}]
# cambiar de sección no cuenta como salto
r3 = n.analizar(paradas, [M(0, "home", "a", "Steam 10", 50, 300), M(1, "energy", "e", "Manual", 50, 1200)])
assert r3["saltos"] == []

# sin muestras: todo queda sin visitar y no revienta
r4 = n.analizar(paradas, [])
assert r4["secciones"]["home"]["visitadas"] == 0 and r4["muestras"] == 0

# la misma parada repetida solo cuenta una vez
r5 = n.analizar(paradas, muestras + [M(4, "home", "a", "Steam 10", 50, 300)])
assert r5["secciones"]["home"]["visitadas"] == 3

# informe: legible y corto
lineas = n.formatear(r)
assert any("home" in l and "3/4" in l for l in lineas) and any("Wi-Fi" in l for l in lineas)
assert len(lineas) <= 30
assert any("sin saltos" in l.lower() for l in n.formatear(r))
assert any("Steam 10" in l and "Wi-Fi" in l for l in n.formatear(r2))

# clave estable de una parada: etiqueta + ruta en el DOM (no depende de la posición, que cambia con el scroll)
assert n.clave("Eco 7", "div>div:nth-child(2)") == "Eco 7|div>div:nth-child(2)"
# el riel (x >= 800) va aparte: no cuenta como pendiente de cada sección
pr = {"home": [P("a", "Steam 10", 50, 300), P("r", "Inicio", 839, 100)]}
r6 = n.analizar(pr, [M(0, "home", "a", "Steam 10", 50, 300)])
assert r6["secciones"]["home"] == {"total": 1, "visitadas": 1, "no_visitadas": []}
assert r6["secciones"]["riel"] == {"total": 1, "visitadas": 0, "no_visitadas": ["Inicio"]}

# foco ya asentado fuera de la vista del panel (rt..rb) o sin posición (elemento oculto)
ms = [dict(M(0, "home", "a", "Steam 10", 50, 300), h=40, rt=43, rb=447, asentado=True),
      dict(M(1, "home", "b", "Eco 7", 150, -90), h=40, rt=43, rb=447, asentado=True),
      dict(M(2, "home", "c", "Brillo", 50, 500), h=40, rt=43, rb=447, asentado=True),
      dict(M(3, "home", "d", "Wi-Fi", 50, 400), h=40, rt=43, rb=447),            # aún sin asentar: no se juzga
      dict(M(4, "home", "e", "Fantasma", 0, 0), h=0, rt=43, rb=447, asentado=True)]
r7 = n.analizar(paradas, ms)
assert [f["label"] for f in r7["fuera_de_vista"]] == ["Eco 7", "Brillo"]
assert [f["label"] for f in r7["sin_posicion"]] == ["Fantasma"]
l7 = n.formatear(r7)
assert any("fuera de vista" in l.lower() for l in l7) and any("«Eco 7»" in l for l in l7)
assert any("sin posición" in l.lower() for l in l7) and any("«Fantasma»" in l for l in l7)
assert len(l7) <= 30
print("OK test_navtest")
