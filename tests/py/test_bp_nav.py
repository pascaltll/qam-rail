"""Pruebas de la lógica pura de scripts/bp_nav.py (explorador del grafo de foco) con una cuadrícula simulada."""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("bp_nav", Path(__file__).resolve().parents[2] / "scripts" / "bp_nav.py")
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)

assert b.firma(None) is None
assert b.firma({"tag": "DIV", "cls": "a", "t": "Hola", "x": 1, "y": 2, "w": 3, "h": 4}) == "DIV|a|Hola|1,2,3,4"


class Cuadricula:
    """3x3; `muros` = pares (celda, flecha) que no se pueden cruzar; `una_via` = celdas que no admiten volver."""
    def __init__(self, muros=(), tamano=3):
        self.pos, self.n, self.muros = (0, 0), tamano, set(muros)
        self.delta = {"Up": (0, -1), "Down": (0, 1), "Left": (-1, 0), "Right": (1, 0)}

    def leer(self):
        return f"{self.pos[0]},{self.pos[1]}"

    def mover(self, flecha):
        if (self.pos, flecha) in self.muros:
            return self.leer(), 0
        dx, dy = self.delta[flecha]
        nx, ny = self.pos[0] + dx, self.pos[1] + dy
        if 0 <= nx < self.n and 0 <= ny < self.n:
            self.pos = (nx, ny)
            return self.leer(), 40
        return self.leer(), 0


c = Cuadricula()
g = b.explorar(c.leer, c.mover, 300)
r = b.resumen(g)
assert r["nodos"] == 9 and r["aristas"] == 24 and not r["sin_salida"] and not r["sin_vuelta"] and not r["lentas"], r

# un nodo del que no se puede salir: (1,1) rodeado de muros de salida
c = Cuadricula(muros=[((1, 1), d) for d in b.DIRS])
c.pos = (1, 1)  # se empieza dentro de la trampa
g = b.explorar(c.leer, c.mover, 300)
assert b.resumen(g)["sin_salida"] == ["1,1"], b.resumen(g)

# retraso alto
g2 = b.Grafo()
g2.nodos.update({"a": {}, "b": {}})
g2.aristas[("a", "Right")] = ("b", 500)
assert b.resumen(g2)["lentas"] == [("a", "Right", 500)]

# aristas sin vuelta: a→(Right)→b pero b→(Left)→c
g3 = b.Grafo()
g3.nodos.update({"a": {}, "b": {}, "c": {}})
g3.aristas[("a", "Right")] = ("b", 10)
g3.aristas[("b", "Left")] = ("c", 10)
assert b.resumen(g3)["sin_vuelta"] == [("a", "Right", "b")]

# decidir: sin nada por explorar → fin; con un vecino pendiente → ir hacia él
g4 = b.Grafo()
g4.nodos.update({"a": {}, "b": {}})
for d in b.DIRS:
    g4.aristas[("a", d)] = ("b" if d == "Right" else None, 10)
g4.aristas[("b", "Left")] = ("a", 10)
assert b.decidir(g4, "a") == ("ir", "Right")
for d in b.DIRS:
    g4.aristas[("b", d)] = ("a" if d == "Left" else None, 10)
assert b.decidir(g4, "a") == ("fin", None)
print("OK test_bp_nav")
