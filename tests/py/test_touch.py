"""dev.56: scroll táctil (arrastrar = rueda con inercia) y detección de pantallas táctiles. python3 tests/py/test_touch.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "py_modules"))
import qam_pad as q

# --- detección: la pantalla táctil (PROP DIRECT) sí; touchpad y mando no
TXT = '''I: Bus=0018 Vendor=04f3 Product=2c1b Version=0100
N: Name="ELAN9009:00 04F3:2C1B"
H: Handlers=mouse2 event5
B: PROP=2
B: EV=b
B: ABS=260800000000003

I: Bus=0003 Vendor=1 Product=2 Version=1
N: Name="Touchpad"
H: Handlers=mouse1 event4
B: PROP=5
B: ABS=260800000000003

I: Bus=0003 Vendor=3 Product=4 Version=1
N: Name="Pad"
H: Handlers=js0 event6
B: PROP=0
B: ABS=3
'''
r = q.parse_touch(TXT)
assert [d["event"] for d in r] == ["event5"], r

EV_SYN, EV_ABS, EV_KEY = 0, 3, 1
def finger(ts, pts, t0=0.0, dt=1 / 60, up=True):
    """Un dedo de un solo contacto: lista de (x, y) crudos; devuelve la suma de clics (v, h)."""
    V = H = 0
    t = t0
    ts.feed(EV_ABS, q.ABS_MT_SLOT, 0, t)
    ts.feed(EV_ABS, q.ABS_MT_TRACKING_ID, 1, t)
    for x, y in pts:
        ts.feed(EV_ABS, q.ABS_MT_POSITION_X, x, t)
        ts.feed(EV_ABS, q.ABS_MT_POSITION_Y, y, t)
        v, h = ts.feed(EV_SYN, 0, 0, t)
        V, H, t = V + v, H + h, t + dt
    if up:
        ts.feed(EV_ABS, q.ABS_MT_TRACKING_ID, -1, t)
        ts.feed(EV_SYN, 0, 0, t)
    return V, H

# pantalla horizontal 1920x1080 con táctil también horizontal (1920x1080 crudo): ejes directos
ts = q.TouchScroll((0, 1920), (0, 1080), (1920, 1080))
assert ts.mapping() == (1, 1, 0, 1)
# un toque sin moverse no hace nada
assert finger(ts, [(500, 500)] * 5) == (0, 0)
# dedo hacia arriba 340 px → la página baja ~10 clics (rueda +), poco a poco
V, H = finger(ts, [(500, 800 - 17 * i) for i in range(21)], up=False)
assert 8 <= V <= 11 and H == 0, (V, H)
# dedo hacia abajo → rueda −
ts2 = q.TouchScroll((0, 1920), (0, 1080), (1920, 1080))
V, H = finger(ts2, [(500, 300 + 17 * i) for i in range(21)], up=False)
assert -11 <= V <= -8, V
# horizontal
ts3 = q.TouchScroll((0, 1920), (0, 1080), (1920, 1080))
V, H = finger(ts3, [(900 - 17 * i, 500) for i in range(21)], up=False)
assert V == 0 and 8 <= H <= 11, (V, H)

# zona muerta: 8 px no es arrastre
ts4 = q.TouchScroll((0, 1920), (0, 1080), (1920, 1080))
assert finger(ts4, [(500, 500), (500, 504), (500, 508)]) == (0, 0)

# inercia: un gesto rápido sigue un rato y se para
ts5 = q.TouchScroll((0, 1920), (0, 1080), (1920, 1080))
finger(ts5, [(500, 900 - 40 * i) for i in range(12)])   # 2400 px/s
assert abs(ts5.fling[1]) > 1000
tot, n = 0, 0
while ts5.fling != (0.0, 0.0) and n < 600:
    v, h = ts5.tick(1 / 60)
    tot += v
    n += 1
assert tot > 5 and n < 300, (tot, n)
# un dedo nuevo detiene la inercia
ts6 = q.TouchScroll((0, 1920), (0, 1080), (1920, 1080))
finger(ts6, [(500, 900 - 40 * i) for i in range(12)])
ts6.feed(EV_ABS, q.ABS_MT_TRACKING_ID, 2, 5.0)
assert ts6.fling == (0.0, 0.0)

# pantalla del Ally: táctil vertical (1080x1920) con la pantalla girada. Se aprende mirando el puntero:
# aquí el eje X del táctil, al crecer, MUEVE el puntero hacia abajo (Y de pantalla).
al = q.TouchScroll((0, 1080), (0, 1920), (1920, 1080))
assert al.mapping()[0] == 0  # sin aprender: Y de pantalla ← eje X del táctil
for k in range(3):
    t = 10.0 + k
    al.feed(EV_ABS, q.ABS_MT_TRACKING_ID, 1, t)
    for i in range(10):
        x, y = 300 + 40 * i, 900
        al.feed(EV_ABS, q.ABS_MT_POSITION_X, x, t); al.feed(EV_ABS, q.ABS_MT_POSITION_Y, y, t)
        al.feed(EV_SYN, 0, 0, t + i / 60, (500, 100 + 40 * i))   # puntero: baja
    al.feed(EV_ABS, q.ABS_MT_TRACKING_ID, -1, t + 1)
    al.feed(EV_SYN, 0, 0, t + 1)
assert al.learned is not None and al.learned[0] == 0 and al.learned[1] == 1, al.learned
# y con el signo contrario se aprende el signo contrario
al2 = q.TouchScroll((0, 1080), (0, 1920), (1920, 1080))
al2.feed(EV_ABS, q.ABS_MT_TRACKING_ID, 1, 1.0)
for i in range(10):
    al2.feed(EV_ABS, q.ABS_MT_POSITION_X, 800 - 40 * i, 1.0); al2.feed(EV_ABS, q.ABS_MT_POSITION_Y, 900, 1.0)
    al2.feed(EV_SYN, 0, 0, 1.0 + i / 60, (500, 100 + 40 * i))
al2.feed(EV_ABS, q.ABS_MT_TRACKING_ID, -1, 3.0); al2.feed(EV_SYN, 0, 0, 3.0)
assert al2.learned and al2.learned[0] == 0 and al2.learned[1] == -1, al2.learned

# dispositivos de un solo contacto (BTN_TOUCH + ABS_X/Y) también valen
st = q.TouchScroll((0, 1920), (0, 1080), (1920, 1080))
st.feed(EV_KEY, q.BTN_TOUCH, 1, 0.0)
V = 0
for i in range(21):
    st.feed(EV_ABS, 0, 500, i / 60); st.feed(EV_ABS, 1, 800 - 17 * i, i / 60)
    V += st.feed(EV_SYN, 0, 0, i / 60)[0]
assert V >= 8, V

# --- dos dedos (los dos con MT): separar = zoom, juntarlos = menos zoom, moverlos juntos = desplazar
def two(ts, frames, t0=100.0, dt=1 / 60):
    """frames: lista de ((x0,y0),(x1,y1)); devuelve (clics_v, clics_h, zoom)."""
    V = H = 0
    t = t0
    for s_ in (0, 1):
        ts.feed(EV_ABS, q.ABS_MT_SLOT, s_, t)
        ts.feed(EV_ABS, q.ABS_MT_TRACKING_ID, 10 + s_, t)
    for f in frames:
        for s_ in (0, 1):
            ts.feed(EV_ABS, q.ABS_MT_SLOT, s_, t)
            ts.feed(EV_ABS, q.ABS_MT_POSITION_X, f[s_][0], t)
            ts.feed(EV_ABS, q.ABS_MT_POSITION_Y, f[s_][1], t)
        v, h = ts.feed(EV_SYN, 0, 0, t)
        V, H, t = V + v, H + h, t + dt
    Z = ts.take_zoom()
    for s_ in (0, 1):
        ts.feed(EV_ABS, q.ABS_MT_SLOT, s_, t)
        ts.feed(EV_ABS, q.ABS_MT_TRACKING_ID, -1, t)
    ts.feed(EV_SYN, 0, 0, t)
    return V, H, Z

tp = q.TouchScroll((0, 1920), (0, 1080), (1920, 1080))
V, H, Z = two(tp, [((800 - 10 * i, 500), (1000 + 10 * i, 500)) for i in range(25)])   # se separan 500 px
assert Z >= 8 and V == 0, (V, H, Z)
tp = q.TouchScroll((0, 1920), (0, 1080), (1920, 1080))
V, H, Z = two(tp, [((400 + 10 * i, 500), (1100 - 10 * i, 500)) for i in range(25)])  # se juntan
assert Z <= -4 and V == 0, (V, H, Z)
tp = q.TouchScroll((0, 1920), (0, 1080), (1920, 1080))
V, H, Z = two(tp, [((700, 800 - 14 * i), (1000, 800 - 14 * i)) for i in range(25)])   # suben juntos 336 px
assert V >= 8 and Z == 0, (V, H, Z)
assert tp.fling == (0.0, 0.0)   # los dos dedos no dejan inercia
# tras un gesto de dos dedos, el dedo que queda no arrastra hasta soltar todo
tp = q.TouchScroll((0, 1920), (0, 1080), (1920, 1080))
tp.feed(EV_ABS, q.ABS_MT_SLOT, 0, 0); tp.feed(EV_ABS, q.ABS_MT_TRACKING_ID, 1, 0)
tp.feed(EV_ABS, q.ABS_MT_SLOT, 1, 0); tp.feed(EV_ABS, q.ABS_MT_TRACKING_ID, 2, 0)
tp.feed(EV_ABS, q.ABS_MT_SLOT, 1, 0); tp.feed(EV_ABS, q.ABS_MT_TRACKING_ID, -1, 0)
tp.feed(EV_ABS, q.ABS_MT_SLOT, 0, 0)
V = 0
for i in range(20):
    tp.feed(EV_ABS, q.ABS_MT_POSITION_X, 500, i / 60); tp.feed(EV_ABS, q.ABS_MT_POSITION_Y, 800 - 20 * i, i / 60)
    V += tp.feed(EV_SYN, 0, 0, i / 60)[0]
assert V == 0, V

# --- modo completo: el toque lo traducimos nosotros
def fingerF(ts, pts, t0=0.0, dt=1 / 60, hold_extra=0.0):
    t = t0
    ts.feed(EV_ABS, q.ABS_MT_SLOT, 0, t); ts.feed(EV_ABS, q.ABS_MT_TRACKING_ID, 1, t)
    for x, y in pts:
        ts.feed(EV_ABS, q.ABS_MT_POSITION_X, x, t); ts.feed(EV_ABS, q.ABS_MT_POSITION_Y, y, t)
        ts.feed(EV_SYN, 0, 0, t); ts.poll(t)
        t += dt
    t += hold_extra
    ts.poll(t)
    ts.feed(EV_ABS, q.ABS_MT_TRACKING_ID, -1, t); ts.feed(EV_SYN, 0, 0, t)
    return ts.take_actions()

def full():
    f = q.TouchScroll((0, 1920), (0, 1080), (1920, 1080)); f.full = True
    return f

acts = fingerF(full(), [(960, 540)] * 6)   # toque corto
assert [a[0] for a in acts if a[0] not in ("log", "tap")] == ["move", "down", "up"] and acts[0][1:] == (960, 540) and acts[1][1] == 1, acts
# mantener quieto 0,45 s: el menú contextual sale YA (con el dedo aún apoyado), no al soltar
f = full()
t_ = 0.0
f.feed(EV_ABS, q.ABS_MT_SLOT, 0, t_); f.feed(EV_ABS, q.ABS_MT_TRACKING_ID, 1, t_)
got = []
for i in range(40):
    f.feed(EV_ABS, q.ABS_MT_POSITION_X, 960, i / 60); f.feed(EV_ABS, q.ABS_MT_POSITION_Y, 540, i / 60); f.feed(EV_SYN, 0, 0, i / 60); f.poll(i / 60)
    got += [a for a in f.take_actions() if a[0] in ("down", "up")]
    if i < 20:
        assert got == [], (i, got)
assert got == [("down", 3), ("up", 3)], got
f.feed(EV_ABS, q.ABS_MT_TRACKING_ID, -1, 1.0); f.feed(EV_SYN, 0, 0, 1.0)
assert [a for a in f.take_actions() if a[0] in ("down", "up")] == []   # al soltar no hay más clics
# …y moverse después de salir el menú no desplaza ni hace nada
# toque + (enseguida) arrastrar = seleccionar; dos toques seguidos = dos clics (doble clic)
f = full()
acts = fingerF(f, [(500, 500)] * 4, t0=0.0)
assert [a[0] for a in acts if a[0] in ("down", "up")] == ["down", "up"]
acts = fingerF(f, [(500, 500)] + [(500 + 30 * i, 500) for i in range(1, 12)], t0=0.2)
kinds = [a[0] for a in acts if a[0] in ("down", "up", "move")]
assert kinds[0:2] == ["move", "down"] and kinds[-1] == "up" and kinds.count("move") >= 5 and ("down", 1) in acts, acts
f = full()
fingerF(f, [(500, 500)] * 4, t0=0.0)
acts = fingerF(f, [(505, 502)] * 4, t0=0.2)
assert [a[0] for a in acts if a[0] in ("down", "up")] == ["down", "up"] and any("doble" in str(a) for a in acts), acts
# un toque lejos del anterior o pasado el tiempo no es «segundo»
f = full()
fingerF(f, [(500, 500)] * 4, t0=0.0)
acts = fingerF(f, [(900, 500)] + [(900 + 30 * i, 500) for i in range(1, 12)], t0=0.2)   # lejos: es desplazar
assert [a for a in acts if a[0] in ("down", "up")] == [], acts
# la posición del clic es la FINAL del dedo, no la del primer instante
f = full()
acts = fingerF(f, [(500, 500), (504, 503), (508, 505), (508, 505)])
assert acts[0] == ("move", 508, 505), acts
# dos dedos que se tocan un instante y se sueltan = teclado
for fl in (False, True):
    k = q.TouchScroll((0, 1920), (0, 1080), (1920, 1080)); k.full = fl
    for s_ in (0, 1):
        k.feed(EV_ABS, q.ABS_MT_SLOT, s_, 0.0); k.feed(EV_ABS, q.ABS_MT_TRACKING_ID, 20 + s_, 0.0)
    for i in range(4):
        for s_ in (0, 1):
            k.feed(EV_ABS, q.ABS_MT_SLOT, s_, i / 60)
            k.feed(EV_ABS, q.ABS_MT_POSITION_X, 800 + 200 * s_, i / 60); k.feed(EV_ABS, q.ABS_MT_POSITION_Y, 500, i / 60)
        k.feed(EV_SYN, 0, 0, i / 60)
    for s_ in (0, 1):
        k.feed(EV_ABS, q.ABS_MT_SLOT, s_, 0.1); k.feed(EV_ABS, q.ABS_MT_TRACKING_ID, -1, 0.1)
    k.feed(EV_SYN, 0, 0, 0.1)
    assert ("kb",) in k.take_actions(), fl
f = full()   # arrastrar sin mantener: desplaza, NO pulsa botones; lleva el puntero (una vez) adonde empezó el dedo para que la rueda llegue a lo de debajo
acts = fingerF(f, [(500, 800 - 17 * i) for i in range(21)])
assert [a[0] for a in acts] == ["move"] and acts[0][1:] == f.to_abs(500, 800), acts
# un toque que solo frena la inercia no hace clic
f = full()
fingerF(f, [(500, 900 - 40 * i) for i in range(12)])
assert f.fling != (0.0, 0.0)
acts = fingerF(f, [(960, 540)] * 6, t0=5.0)
assert [a for a in acts if a[0] in ("down", "up")] == [], acts
# si se abre el panel en mitad de una selección, se suelta el botón
f = full()
fingerF(f, [(500, 500)] * 4, t0=0.0)
f.feed(EV_ABS, q.ABS_MT_SLOT, 0, 0.2); f.feed(EV_ABS, q.ABS_MT_TRACKING_ID, 1, 0.2)
for i in range(0, 8):
    f.feed(EV_ABS, q.ABS_MT_POSITION_X, 500 + 30 * i, 0.2 + i / 60); f.feed(EV_ABS, q.ABS_MT_POSITION_Y, 500, 0.2 + i / 60); f.feed(EV_SYN, 0, 0, 0.2 + i / 60)
assert f.drag
f.take_actions(); f.abort()
assert f.take_actions() == [("up", 1)] and not f.down
# sin modo completo no hay clics propios
n = q.TouchScroll((0, 1920), (0, 1080), (1920, 1080))
assert fingerF(n, [(960, 540)] * 6) == []
# to_abs con el eje girado (táctil vertical 1080x1920, pantalla 1920x1080, X del táctil ← Y de pantalla)
al = q.TouchScroll((0, 1080), (0, 1920), (1920, 1080), {"ay": 0, "sy": 1, "ax": 1, "sx": -1})
assert al.to_abs(0, 0) == (1919, 0) and al.to_abs(1080, 1920) == (0, 1079)
# cursor de texto sin nombre (Chromium/Edge): se reconoce por la forma
def _rows(pic):
    return [[1 if ch == "#" else 0 for ch in ln] for ln in pic]
IB = _rows([
    "#######", "...#...", "...#...", "...#...", "...#...", "...#...", "...#...", "...#...", "...#...", "...#...", "#######"])
assert q.looks_like_ibeam(7, len(IB), IB)
ARROW = _rows(["#......", "##.....", "###....", "####...", "#####..", "######.", "#######", "###....", "##.....", "#......"])
assert not q.looks_like_ibeam(7, 10, ARROW)
NS = _rows(["...#...", "..###..", ".#####.", "...#...", "...#...", "...#...", ".#####.", "..###..", "...#..."])
assert not q.looks_like_ibeam(7, 9, NS)
assert not q.looks_like_ibeam(3, 3, _rows(["###", ".#.", "###"]))
# toques encolados (dev.70): el respiro entre mover/pulsar/soltar no duerme el bucle, y al cerrar no queda un botón pulsado
class FakeX:
    def __init__(self): self.ev = []
    def move_abs(self, x, y): self.ev.append(("move", x, y))
    def button(self, b, d): self.ev.append(("down" if d else "up", b))
    def flush(self): self.ev.append(("flush",))
class FakeTS:
    def __init__(self, acts): self.a = acts
    def take_actions(self): a, self.a = self.a, []; return a
import time as _t
pr = q.PadRunner(lambda: set(), None, lambda t: None, lambda: True)
pr._x = FakeX()
t0 = _t.monotonic()
pr._touch_apply(FakeTS([("move", 5, 6), ("down", 1), ("up", 1), ("log", "x"), ("tap", 5, 6)]))
assert _t.monotonic() - t0 < 0.01 and [e for e in pr._x.ev if e[0] != "flush"] == [("move", 5, 6)]   # solo el movimiento, sin dormir
pr._pend_run(_t.monotonic() + 0.025)
assert ("down", 1) in pr._x.ev and ("up", 1) not in pr._x.ev
pr._pend_run(_t.monotonic() + 0.2)
assert ("up", 1) in pr._x.ev and not pr._pend and pr._pend_end == 0.0
# cierre con un «down» enviado y el «up» aún pendiente: se suelta al instante
pr._x.ev.clear()
pr._touch_apply(FakeTS([("move", 1, 1), ("down", 1), ("up", 1)]))
pr._pend_run(_t.monotonic() + 0.025)
pr._pend_run(_t.monotonic(), force=True)
assert [e for e in pr._x.ev if e[0] in ("down", "up")] == [("down", 1), ("up", 1)] and not pr._pend
# el núcleo no repite una coordenada igual a la anterior de la ranura: tocar dos veces el mismo botón no debe perder el segundo toque
def tap_filtered(ts, t, send_x=True, send_y=True, x=500, y=500):
    ts.feed(EV_ABS, q.ABS_MT_SLOT, 0, t); ts.feed(EV_ABS, q.ABS_MT_TRACKING_ID, 7, t)
    if send_x: ts.feed(EV_ABS, q.ABS_MT_POSITION_X, x, t)
    if send_y: ts.feed(EV_ABS, q.ABS_MT_POSITION_Y, y, t)
    ts.feed(EV_SYN, 0, 0, t); ts.poll(t); ts.feed(EV_SYN, 0, 0, t + 0.03); ts.poll(t + 0.05)
    ts.feed(EV_ABS, q.ABS_MT_TRACKING_ID, -1, t + 0.06); ts.feed(EV_SYN, 0, 0, t + 0.06)
    return ts.take_actions()
g = full()
a1 = tap_filtered(g, 1.0)
assert any(a[0] == "down" for a in a1)
a2 = tap_filtered(g, 2.0, send_x=False, send_y=False)       # misma X y misma Y: no llega ninguna
assert any(a[0] == "down" for a in a2), a2
a3 = tap_filtered(g, 3.0, send_x=False, send_y=True, y=620)   # misma X, otra Y
assert any(a[0] == "down" for a in a3), a3
assert [a for a in a3 if a[0] == "move"][0][2] > 0
print("test_touch OK")
