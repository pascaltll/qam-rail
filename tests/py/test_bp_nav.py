"""Pruebas de la lógica pura de scripts/bp_nav.py (explorador del grafo de foco) con una cuadrícula simulada."""
import importlib.util, json, os, tempfile
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

# ───── visibilidad del foco (cuadrícula 3×3) ─────
V = b.veredicto_visibilidad
assert V({"v": 9, "c": 0, "k": 0, "f": 0}) == {"veredicto": "visible", "porciento": 100, "puntos": 9}
assert V({"v": 0, "c": 9, "k": 0, "f": 0})["veredicto"] == "tapado"
assert V({"v": 0, "c": 0, "k": 6, "f": 3})["veredicto"] == "fuera"  # recortado por un ancestro: nada encima, pero no se pinta
assert V({"v": 0, "c": 2, "k": 0, "f": 7})["veredicto"] == "tapado"
assert V({"v": 7, "c": 2, "k": 0, "f": 0}) == {"veredicto": "parcial", "porciento": 78, "puntos": 9}
assert V({})["veredicto"] == "sin_datos"
linea = b.describir_foco({"tag": "BUTTON", "cls": "x", "t": "Ok", "x": 10, "y": 20, "w": 5, "h": 3, "largo": 2, "ae": True,
                          "vis": {"p": {"v": 9, "c": 0, "k": 0, "f": 0}}})
assert "visible 100%" in linea and "⚠" not in linea, linea
linea = b.describir_foco({"tag": "DIV", "cls": "", "t": "", "largo": 400, "ae": False,
                          "vis": {"p": {"v": 0, "c": 9, "k": 0, "f": 0}, "tapa": "DIV.dock"}})
assert "tapado 0%, tapado por DIV.dock" in linea and "activeElement NO coincide" in linea and "contenedor" in linea, linea

# ───── interruptor de parada ─────
tmp = Path(tempfile.mkdtemp())
stop = tmp / "stop"
assert b.parada_activa(stop) is None
b.exigir_activo(stop)  # no lanza
stop.write_text(json.dumps({"at": "hoy", "motivo": "prueba"}))
assert b.parada_activa(stop)["motivo"] == "prueba"
try:
    b.exigir_activo(stop)
    raise AssertionError("debía lanzar Parado")
except b.Parado as e:
    assert "prueba" in str(e) and "armar" in str(e)
stop.write_text("{{{ basura")  # ilegible = parado
assert b.parada_activa(stop) is not None
stop.write_text("[1,2]")  # JSON que no es objeto = parado
assert b.parada_activa(stop) is not None


class WsFalso:
    def __init__(self):
        self.llamadas = []

    def call(self, metodo, params=None):
        self.llamadas.append(metodo)
        return {}


b.PARADA = stop  # pulsar() usa la parada global: aquí está puesta
ws = WsFalso()
antes = b.PULSACIONES[0]
try:
    b.pulsar(ws, "Down")
    raise AssertionError("con la parada puesta no debe salir ninguna tecla")
except b.Parado:
    pass
assert ws.llamadas == [] and b.PULSACIONES[0] == antes
stop.unlink()
b.pulsar(ws, "Down")
assert ws.llamadas == ["Input.dispatchKeyEvent", "Input.dispatchKeyEvent"] and b.PULSACIONES[0] == antes + 1
os.environ["QAM_NAV_SIN_TECLAS"] = "1"
try:
    b.pulsar(ws, "Up")
    raise AssertionError("QAM_NAV_SIN_TECLAS debe impedir pulsar")
except b.Parado:
    pass
del os.environ["QAM_NAV_SIN_TECLAS"]
assert len(ws.llamadas) == 2

# explorar: la parada, el plazo y Parado en mitad NO dejan aristas falsas
c = Cuadricula()
g = b.explorar(c.leer, c.mover, 300, parar=lambda: True)
assert len(g.aristas) == 0
c = Cuadricula()
cuenta = []
def mover_parado(flecha):
    cuenta.append(flecha)
    if len(cuenta) == 3:
        raise b.Parado("x")
    return c.mover(flecha)
g = b.explorar(c.leer, mover_parado, 300)
assert len(g.aristas) == 2 and len(cuenta) == 3, (len(g.aristas), cuenta)
t = [0.0]
def reloj():
    t[0] += 1.0
    return t[0]
c = Cuadricula()
g = b.explorar(c.leer, c.mover, 300, plazo_s=5, reloj=reloj)
assert 0 < len(g.aristas) < 24

# ───── registro ─────
log = tmp / "ledger"
b.INICIO = 1_700_000_000.0
assert b.registrar("foco", [], lambda: "foco en 1 página(s): X", dir_=log, pid=7) == "foco en 1 página(s): X"
try:
    b.registrar("grafo", ["--pasos=3"], lambda: (_ for _ in ()).throw(b.Parado("PARADO: x\ndetalle")), dir_=log, pid=7)
    raise AssertionError("debía propagar Parado")
except b.Parado:
    pass
archivos = list(log.glob("*.ndjson"))
assert len(archivos) == 1 and archivos[0].name == "20231114T221320Z_pid7.ndjson", archivos
filas = [json.loads(x) for x in archivos[0].read_text().splitlines()]
assert [f["orden"] for f in filas] == ["foco", "grafo"]
assert filas[0]["ok"] is True and filas[0]["nota"].startswith("foco en 1") and "error" not in filas[0]
assert filas[1]["ok"] is False and filas[1]["error"] == "Parado: PARADO: x" and filas[1]["parado"] is True and filas[1]["args"] == ["--pasos=3"]
assert b.registrar("parada", [], lambda: "x", dir_=log, pid=7) == "x" and len(archivos[0].read_text().splitlines()) == 2  # consulta: no se anota
# escribir el registro no puede hacer fallar la orden
estorbo = tmp / "archivo"
estorbo.write_text("no soy una carpeta")
assert b.registrar("foco", [], lambda: "bien", dir_=estorbo / "dentro", pid=7) == "bien"
assert len(b.primera_linea("a" * 500)) == 300 and b.primera_linea("\n\n  hola \nadiós") == "hola"
print("OK test_bp_nav")
