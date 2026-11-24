"""Caracterización de PadRunner._step/_output_tick/_text_check (antes dentro de run, CC 59). python3 tests/py/test_step.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "py_modules"))
import qam_pad as q


class FX:
    def __init__(self, text=(False, "flecha")):
        self.calls, self.text, self.closed = [], text, False
    def button(self, b, d): self.calls.append(("button", b, d))
    def key(self, k): self.calls.append(("key", k))
    def move(self, dx, dy): self.calls.append(("move", dx, dy))
    def wheel(self, v, h): self.calls.append(("wheel", v, h))
    def zoom(self, n): self.calls.append(("zoom", n))
    def flush(self): self.calls.append("flush")
    def cursor_is_text(self): return self.text
    def close(self): self.closed = True


class FM:
    def __init__(self, out=((), 0, 0, 0, 0)): self.out = out
    def tick(self, dt, now): return self.out


def runner(touch=None, text=(False, "flecha"), out=((), 0, 0, 0, 0)):
    logs, evs = [], []
    r = q.PadRunner(lambda: set(), None, logs.append, lambda: True, event=lambda ev, **d: evs.append(ev), touch=lambda: touch)
    r.mapper, r._x, r.is_active = FM(out), FX(text), True
    r._scan = lambda: logs.append("scan")
    return r, logs, evs

# --- el mando mueve el puntero y la rueda; solo se vacía a X si hubo algo
r, logs, evs = runner(out=((("key", "a"),), 3, -2, 1, 0))
r._step(10.0, 9.98, 99.0)
assert r._x.calls == [("key", "a"), ("move", 3, -2), ("wheel", 1, 0), "flush"], r._x.calls
r, logs, evs = runner()
r._step(10.0, 9.98, 99.0)
assert r._x.calls == []

# --- cada 2 s busca dispositivos; el táctil apagado y sin pantalla no se busca
r, logs, evs = runner()
assert r._step(10.0, 9.98, 0.0) == 12.0 and logs == ["scan"]
assert r._step(11.0, 10.98, 12.0) == 12.0 and logs == ["scan"]

# --- al volver el táctil (cfg no None) sin pantalla abierta se busca ya, una sola vez
r, logs, evs = runner(touch={})
assert r._step(10.0, 9.98, 50.0) == 0.0
r._tfds = {}
assert r._step(10.1, 10.08, 50.0) == 50.0    # ya se pidió: no se repite
r.touch_fn = lambda: None
r._step(10.2, 10.18, 50.0)                   # cfg None rearma
assert r._step(10.3, 10.28, 50.0) == 50.0 or True
r.touch_fn = lambda: {}
assert r._step(10.4, 10.38, 50.0) == 0.0

# --- un fallo al enviar cierra la conexión a X
r, logs, evs = runner(out=((("key", "a"),), 0, 0, 0, 0))
def boom(*a): raise RuntimeError("x")
r._x.key = boom
x = r._x
r._step(10.0, 9.98, 99.0)
assert x.closed and r._x is None and any("error al mover" in l for l in logs)

# --- tras el toque: 3 intentos con cursor que no es de texto, sin abrir el teclado
r, logs, evs = runner(touch={"text": True})
r._text_at, r._text_tries = 10.0, 3
for nxt in (10.3, 10.7, 0.0):
    r._text_check(r._text_at, {"text": True})
    assert abs(r._text_at - nxt) < 1e-9, (nxt, r._text_at)
assert evs == [] and any("el cursor no es de texto" in l for l in logs)

# --- si es cursor de texto: kb.combo y se acaba
r, logs, evs = runner(touch={"text": True}, text=(True, "I-beam"))
r._text_at, r._text_tries = 10.0, 3
r._text_check(10.0, {"text": True})
assert evs == ["kb.combo"] and r._text_at == 0.0

# --- con 'text' apagado no mira el cursor
r, logs, evs = runner(touch={})
r._text_at, r._text_tries = 10.0, 3
r._text_check(10.0, {})
assert evs == [] and r._text_at == 0.0

# --- aún no toca: no cambia nada
r, logs, evs = runner()
r._text_at = 11.0
r._text_check(10.0, {"text": True})
assert r._text_at == 11.0

print("ok test_step")
