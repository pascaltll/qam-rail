"""SelfTest._libre: si el teclado/panel se abren durante la prueba (táctil en pausa), se cierran antes de tocar. python3 tests/py/test_libre.py"""
import asyncio, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "py_modules"))
import qam_selftest as q


def make(pausado, act):
    t = object.__new__(q.SelfTest)
    t.interf, t.act = 0, act
    t.r = type("R", (), {})()
    t.r.touch_fn = lambda: None if pausado[0] else {}
    return t

# sin pausa: no hace nada
llamadas, p = [], [False]
async def act(n): llamadas.append(n)
t = make(p, act); asyncio.run(t._libre())
assert llamadas == [] and t.interf == 0

# teclado abierto por fuera: se cierra con kb_close y se cuenta
llamadas, p = [], [True]
async def act2(n):
    llamadas.append(n)
    if n == "kb_close": p[0] = False
t = make(p, act2); asyncio.run(t._libre())
assert llamadas == ["kb_close"] and t.interf == 1, llamadas

# era el panel: tras kb_close sigue en pausa → qam_close
llamadas, p = [], [True]
async def act3(n):
    llamadas.append(n)
    if n == "qam_close": p[0] = False
t = make(p, act3); asyncio.run(t._libre())
assert llamadas == ["kb_close", "qam_close"], llamadas

# sin act (prueba sin interfaz): no falla
t = make([True], None); asyncio.run(t._libre()); assert t.interf == 0
print("ok test_libre")
