"""Durante la autoprueba «tocar texto abre el teclado» se apaga (si no, cada toque en un campo abriría el teclado y pausaría el táctil). python3 tests/py/test_textoff.py"""
import asyncio, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "py_modules"))
import qam_selftest as q

visto = []
class R:
    def __init__(self): self.cfg = {"on": True, "full": True, "text": True}; self.touch_fn = lambda: self.cfg; self._ts = {}
    def _tr(self, *a, **k): pass
    def _pend_run(self, *a, **k): pass
    class _X:
        def screen_size(self): return 1920, 1080
    _x = _X()
r = R()
t = object.__new__(q.SelfTest)
t.r, t.steps, t.opened, t.interf = r, [], False, 0
class P:
    async def start(self): visto.append(("dentro", r.touch_fn()))
    async def stop(self): pass
    events = []
t.probe = P()
async def no_cargar(W, H): visto.append(("cfg", r.touch_fn())); return False
t.s_cargar = no_cargar
asyncio.run(t.run())
assert visto[0] == ("dentro", {"on": True, "full": True, "text": False}), visto     # durante la prueba: sin «texto abre el teclado»
assert r.touch_fn() == {"on": True, "full": True, "text": True}                      # al acabar vuelve la configuración del usuario
r.cfg = None
assert r.touch_fn() is None                                                           # y la pausa (None) se respeta
print("ok test_textoff")
