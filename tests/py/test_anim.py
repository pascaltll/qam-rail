"""dev.32: animación al volver de QAM, interruptor, log único del mando y doble entrada. python3 tests/py/test_anim.py"""
import asyncio, logging, os, struct, sys, tempfile, types

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "py_modules"))
dk = types.ModuleType("decky")
tmp = tempfile.mkdtemp()
for k in ("DECKY_PLUGIN_SETTINGS_DIR", "DECKY_PLUGIN_RUNTIME_DIR", "DECKY_PLUGIN_LOG_DIR", "DECKY_PLUGIN_DIR", "DECKY_HOME", "DECKY_USER_HOME"):
    setattr(dk, k, tmp)
dk.DECKY_USER = "bazzite"; dk.logger = logging.getLogger("t"); dk.emit = lambda *a, **k: None
sys.modules["decky"] = dk
import main, qam_pad

# --- pasos de la animación: acaban SIEMPRE en tamaño completo, crecen y nunca pasan de él
st = qam_pad.grow_steps(1920, 1080)
assert st[-1] == (1920, 1080) and len(st) == 6, st
ws = [a for a, _ in st]
assert ws == sorted(ws) and ws[0] < 1920 and ws[0] >= 1920 * 0.78 - 1, ws
assert qam_pad.grow_steps(100, 50, n=1) == [(100, 50)]


class FakeX:
    def __init__(self): self.log, self.closed = [], False
    def screen_size(self): return 1920, 1080
    def resize(self, wid, w, h): self.log.append((wid, w, h))
    def close(self): self.closed = True


async def t_anim():
    p = main.Plugin()
    p._claims_v = {"0x3400016": "firefox", "0x10": "qam:minitube"}
    assert p._anim_wids() == [0x3400016]
    fx = FakeX()
    main.qam_pad.XOut = lambda d, a: fx
    async def env(self): return ":0", None
    main.Plugin._pad_env = env
    # activada por defecto; el interruptor la apaga y la guarda
    assert (await p.desktop_anim())["on"] is True
    assert (await p.desktop_anim(False))["on"] is False
    assert await p._anim_start() is None and fx.log == []
    await p.desktop_anim(True)
    st = await p._anim_start()
    assert st and fx.log[0][0] == 0x3400016 and fx.log[0][1] < 1920, fx.log  # encogida antes de quitar el panel
    await p._anim_grow(st)
    assert fx.log[-1] == (0x3400016, 1920, 1080) and fx.closed, fx.log
    # sin ventanas nuestras: no hace nada
    p._claims_v = {}
    assert await p._anim_start() is None

    # desktop_overlay(off): encoge, quita el panel y luego crece; si falla xprop, vuelve a pantalla completa sin animar
    p._claims_v = {"0x3400016": "firefox"}
    p._ov_prev = True
    fx2 = FakeX(); main.qam_pad.XOut = lambda d, a: fx2
    order = []
    async def sess(self): return ["env"], {"DISPLAY": ":0"}
    async def swid(self, prefix, display, fresh=False): return "0x2600035"
    async def xr(self, prefix, display, *cmd):
        order.append(("xprop", len(fx2.log))); return 1, "", "boom"
    main.Plugin._user_session = sess; main.Plugin._steam_wid = swid; main.Plugin._x_run = xr
    r = await p.desktop_overlay(False)
    assert r["ok"] is False and order and order[0][1] == 1, order       # ya estaba encogida cuando se pidió quitar el panel
    assert fx2.log[-1] == (0x3400016, 1920, 1080) and fx2.closed, fx2.log  # y se restauró

asyncio.run(t_anim())


async def t_cancel():
    """Si el overlay sube mientras la app crece, la animación se cancela y termina a pantalla completa."""
    p = main.Plugin()
    p._claims_v = {"0x3400016": "firefox"}
    fx = FakeX(); main.qam_pad.XOut = lambda d, a: fx
    st = await p._anim_start()
    assert st and p._anim_cancel is False
    p._anim_cancel = True      # lo que hace desktop_overlay(True)
    await p._anim_grow(st)
    assert fx.log[-1] == (0x3400016, 1920, 1080) and fx.closed, fx.log
    assert len(fx.log) <= 3, fx.log   # encogida + (como mucho) completa; no los 6 pasos


asyncio.run(t_cancel())


# --- mando: un error de apertura se anota una sola vez; el mismo botón por dos dispositivos cuenta una vez
logs = []
r = qam_pad.PadRunner(lambda: set(), None, logs.append, lambda: True)
r._warned = set()
r.is_active = True


class FakeXo:
    def __init__(self): self.acts = []
    def flush(self): pass
    def button(self, n, down): self.acts.append(("b", n, down))
    def key(self, c): self.acts.append(("k", c))
    def move(self, *a): pass
    def wheel(self, *a): pass


r._x = FakeXo()
import os as _os
rd, wr = _os.pipe(); _os.set_blocking(rd, False)
r._fds = {"event15": (rd, {}), "event16": (rd, {}), "event20": (rd, {})}


def feed(ev, code, val):
    _os.write(wr, struct.pack(qam_pad.EVENT_FMT, 0, 0, qam_pad.EV_KEY, code, val))
    r._read(ev)


BTN_SOUTH = 0x130
feed("event15", BTN_SOUTH, 1); feed("event20", BTN_SOUTH, 1)   # el mismo clic llega por los dos
feed("event15", BTN_SOUTH, 0); feed("event20", BTN_SOUTH, 0)
downs = [a for a in r._x.acts if a[0] == "b" and a[2]]
assert len(downs) == 1, r._x.acts
assert sum("doble entrada" in l for l in logs) == 1, logs
assert sum("pulsado" in l for l in logs) == 1, logs


# --- Steam + A (abrir el QAM) no manda un clic a la app; A sola, sí; y 0,5 s después de soltar Steam sigue ignorado
r._x.acts.clear(); r._last_key.clear(); r._dup_noted = True
feed("event16", 316, 1); feed("event16", BTN_SOUTH, 1); feed("event16", BTN_SOUTH, 0); feed("event16", 316, 0)
assert not [a for a in r._x.acts if a[0] == "b" and a[2]], r._x.acts
r._mode_until = 0.0
feed("event16", BTN_SOUTH, 1); feed("event16", BTN_SOUTH, 0)
assert [a for a in r._x.acts if a[0] == "b" and a[2]], r._x.acts


# --- Steam + Y abre el teclado grande: avisa a la interfaz y no manda nada a la app; Y sola sigue siendo la barra de direcciones
evs = []
r.event = lambda ev, **d: evs.append(ev)
r._x.acts.clear(); r._last_key.clear(); r._mode_until = 0.0
feed("event16", 316, 1); feed("event16", 308, 1); feed("event16", 308, 0); feed("event16", 316, 0)
assert evs == ["kb.combo"], evs
assert not [a for a in r._x.acts if a[0] in ("b", "k")], r._x.acts
r._mode_until = 0.0
feed("event16", 308, 1); feed("event16", 308, 0)
assert evs == ["kb.combo"] and [a for a in r._x.acts if a == ("k", "ctrl+l")], (evs, r._x.acts)
# Steam avisa de su botón DESPUÉS de la Y (visto en el equipo: «308 pulsado, 308 soltado, 316 pulsado»): también cuenta como Steam + Y
feed("event16", 316, 1); feed("event16", 316, 0)
assert evs == ["kb.combo", "kb.combo"], evs
feed("event16", 316, 1); feed("event16", 316, 0)   # sin Y reciente no hay combo
assert evs == ["kb.combo", "kb.combo"], evs
assert qam_pad.KEYS["LB"] == "ctrl+Prior" and qam_pad.KEYS["RB"] == "ctrl+Next"


# --- teclado del panel: símbolos de X, ventana de delante, teclas con nombre y errores
assert qam_pad.keysym_for_char("a") == 0x61 and qam_pad.keysym_for_char("ñ") == 0xF1 and qam_pad.keysym_for_char("€") == 0x1000000 + 0x20AC
assert qam_pad.LEVEL_MODS[3] == ["Shift_L", "ISO_Level3_Shift"] and "Return" in qam_pad.NAMED_KEYS


class KX(FakeXo):
    def __init__(self):
        super().__init__(); self.typed, self.keys, self.focused, self.closed = [], [], [], False
    def cardinals(self, name): return [1265881686, 413091, 769] if name == "GAMESCOPECTRL_BASELAYER_APPID" else []
    def focus(self, wid): self.focused.append(wid)
    def type_char(self, ch): self.typed.append(ch); return ch != "\x07"
    def key(self, c): self.keys.append(c)
    def close(self): self.closed = True


async def t_key():
    p = main.Plugin()
    kx = KX()
    p._kx_x = kx
    # sin app nuestra de delante: no escribe a ciegas
    p._claims_v = {}
    r = await p.desktop_key("hola")
    assert r["ok"] is False and "delante" in r["error"] and kx.typed == [], r  # y no escribe nada
    # con la app delante: foco en su ventana y escribe
    gid = main.qam_desktop.app_gameid("firefox")
    kx.cardinals = lambda name: [gid, 769] if name == "GAMESCOPECTRL_BASELAYER_APPID" else []
    p._claims_v = {"0x3400016": "firefox", "0x10": "qam:minitube"}
    r = await p.desktop_key("ñ¿")
    assert r["ok"] and kx.focused[-1] == 0x3400016 and kx.typed == ["ñ", "¿"], (r, kx.typed)
    r = await p.desktop_key(None, "BackSpace")
    assert r["ok"] and kx.keys == ["BackSpace"], kx.keys
    r = await p.desktop_key(None, "rm -rf")   # solo teclas de la lista
    assert r["ok"] is False and kx.keys == ["BackSpace"], r
    r = await p.desktop_key("\x07")           # carácter sin tecla en la distribución
    assert r["ok"] is False
    # Ctrl + tecla: solo letras/dígitos o teclas con nombre
    kx.keys.clear()
    r = await p.desktop_key("v", None, ["ctrl"])
    assert r["ok"] and kx.keys == ["ctrl+v"], kx.keys
    r = await p.desktop_key(None, "Left", ["ctrl", "shift"])
    assert r["ok"] and kx.keys[-1] == "ctrl+shift+Left", kx.keys
    r = await p.desktop_key("ñ", None, ["ctrl"])             # no es una tecla suelta válida
    assert r["ok"] is False
    r = await p.desktop_key("v", None, ["super"])            # modificador desconocido: se ignora y escribe la letra
    assert r["ok"] and kx.typed[-1] == "v"
    # el registro nunca contiene lo escrito
    logtxt = open(os.path.join(tmp, "desktop-tag.log"), encoding="utf-8").read()
    assert "tecla " in logtxt and "ñ¿" not in logtxt and "'ñ'" not in logtxt and "carácter(es)" in logtxt, logtxt[-300:]
    # un fallo de X cierra la conexión y lo cuenta
    kx.focus = lambda wid: (_ for _ in ()).throw(OSError("X se cayó"))
    r = await p.desktop_key("a")
    assert r["ok"] is False and kx.closed and p._kx_x is None, r


asyncio.run(t_key())

print("TODO OK")
