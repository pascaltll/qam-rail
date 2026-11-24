"""Caracterización de PadRunner._read (CC 42): fija lo que hace hoy antes de trocearlo. python3 tests/py/test_read.py"""
import os, struct, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "py_modules"))
import qam_pad as q


class FakeX:
    def __init__(self):
        self.out, self.flushed = [], 0
    def button(self, b, d): self.out.append(("button", b, d))
    def key(self, k): self.out.append(("key", k))
    def flush(self): self.flushed += 1


class FakeMapper:
    """Anota lo que recibe y devuelve una acción por entrada para ver que se aplica."""
    def __init__(self):
        self.buttons, self.axes = [], []
    def feed_button(self, code, down, now):
        self.buttons.append((code, down))
        return [("key", f"b{code}{'d' if down else 'u'}")]
    def feed_axis(self, code, v, now):
        self.axes.append((code, round(v, 3)))
        return [("button", 1, True)] if abs(v) > 0.5 else []


def runner():
    logs, evs = [], []
    r = q.PadRunner(lambda: set(), None, logs.append, lambda: True, event=lambda ev, **d: evs.append(ev))
    r.mapper, r._x, r.is_active = FakeMapper(), FakeX(), True
    return r, logs, evs


def feed(r, events, name="event7", ranges=None):
    """Mete eventos (tipo, código, valor) por una tubería como si vinieran del mando y llama a _read."""
    rd, wr = os.pipe()
    os.set_blocking(rd, False)
    os.write(wr, b"".join(struct.pack(q.EVENT_FMT, 0, 0, t, c, v) for t, c, v in events))
    r._fds[name] = (rd, ranges or {})
    try:
        r._read(name)
    finally:
        os.close(rd); os.close(wr)


K, A = q.EV_KEY, q.EV_ABS

# --- inactivo: no lee ni cuenta
r, logs, evs = runner(); r.is_active = False
feed(r, [(K, 304, 1)])
assert r.events == 0 and r.mapper.buttons == []

# --- botón normal: pasa al mapper y la acción se aplica y se vacía a X
r, logs, evs = runner()
feed(r, [(K, 304, 1), (K, 304, 0)])
assert r.mapper.buttons == [(304, True), (304, False)], r.mapper.buttons
assert r._x.out == [("key", "b304d"), ("key", "b304u")], r._x.out
assert r._x.flushed == 1 and r.events == 2

# --- repetición (valor 2) se ignora
r, logs, evs = runner()
feed(r, [(K, 304, 2)])
assert r.mapper.buttons == []

# --- el mismo botón por otro dispositivo en <25 ms se cuenta una vez, y se avisa una sola vez
r, logs, evs = runner()
feed(r, [(K, 305, 1)], name="event7")
feed(r, [(K, 305, 1)], name="event8")
assert r.mapper.buttons == [(305, True)], r.mapper.buttons
assert sum("doble entrada" in l for l in logs) == 1

# --- Steam + A → qam.combo, la app no recibe nada
r, logs, evs = runner()
feed(r, [(K, q.BTN_MODE, 1), (K, 304, 1)])
assert evs == ["qam.combo"] and r.mapper.buttons == [(316, True)], (evs, r.mapper.buttons)   # Steam llega al mapper; la A no

# --- Steam + Y → kb.combo
r, logs, evs = runner()
feed(r, [(K, q.BTN_MODE, 1), (K, 308, 1)])
assert evs == ["kb.combo"] and r.mapper.buttons == [(316, True)]

# --- Steam + otro botón: se traga, sin evento
r, logs, evs = runner()
feed(r, [(K, q.BTN_MODE, 1), (K, 307, 1)])
assert evs == [] and r.mapper.buttons == [(316, True)]

# --- Y y, enseguida, Steam (Steam avisa tras la Y) → kb.combo; la Y sí llegó a la app
r, logs, evs = runner()
feed(r, [(K, 308, 1)])
time.sleep(0.01)    # Steam llega en otra lectura, después de la Y
feed(r, [(K, q.BTN_MODE, 1)])
assert evs == ["kb.combo"] and r.mapper.buttons == [(308, True), (316, True)], (evs, r.mapper.buttons)

# --- soltar Steam abre una ventana de 0,5 s en la que un botón sigue siendo combinación
r, logs, evs = runner()
feed(r, [(K, q.BTN_MODE, 1), (K, q.BTN_MODE, 0), (K, 304, 1)])
assert evs == [], evs    # dentro de los 0,5 s tras soltar Steam, el botón se traga sin evento (el combo solo cuenta con Steam mantenido)
assert r.mapper.buttons == [(316, True), (316, False)], r.mapper.buttons

# --- Select solo: Esc (botón 314) al SOLTAR, no al pulsar
r, logs, evs = runner()
feed(r, [(K, 314, 1)])
assert r.mapper.buttons == []
feed(r, [(K, 314, 0)], name="event9")
assert r.mapper.buttons == [(314, True)] and r._x.out == [("key", "b314d")]

# --- Select + Y → kb.combo y al soltar Select NO hay Esc
r, logs, evs = runner()
feed(r, [(K, 314, 1), (K, 308, 1), (K, 314, 0)])
assert evs == ["kb.combo"] and r.mapper.buttons == [], (evs, r.mapper.buttons)

# --- ejes: el gatillo y el stick se normalizan con su rango; la cruceta pasa tal cual
r, logs, evs = runner()
feed(r, [(A, q.ABS_HAT0X, -1)])
assert r.mapper.axes == [(q.ABS_HAT0X, -1.0)], r.mapper.axes
r, logs, evs = runner()
feed(r, [(A, 0, 100)], ranges={0: (0, 200)})
assert r.mapper.axes[0][0] == 0 and abs(r.mapper.axes[0][1]) < 0.05, r.mapper.axes
assert any("primer movimiento del eje 0" in l for l in logs)
feed(r, [(A, 0, 200)], ranges={0: (0, 200)})
assert sum("primer movimiento" in l for l in logs) == 1   # solo se anota la primera vez

# --- un fallo al enviar se anota y no interrumpe el resto
r, logs, evs = runner()
def boom(*a): raise RuntimeError("x")
r._x.key = boom
feed(r, [(K, 304, 1), (K, 305, 1)])
assert len(r.mapper.buttons) == 2 and sum("error al enviar" in l for l in logs) == 2

# --- descriptor desconocido: no hace nada
r, logs, evs = runner()
r._read("event99")
assert r.events == 0

print("ok test_read")
