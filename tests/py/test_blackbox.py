"""Caja negra (dev.39): línea de tiempo, vigilante, eventos de la interfaz, reparar y que nunca se anote lo escrito. python3 tests/py/test_blackbox.py"""
import asyncio, json, logging, os, sys, tempfile, types

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "py_modules"))
dk = types.ModuleType("decky")
tmp = tempfile.mkdtemp()
for k in ("DECKY_PLUGIN_SETTINGS_DIR", "DECKY_PLUGIN_RUNTIME_DIR", "DECKY_PLUGIN_LOG_DIR", "DECKY_PLUGIN_DIR", "DECKY_HOME", "DECKY_USER_HOME"):
    setattr(dk, k, tmp)
dk.DECKY_USER = "bazzite"; dk.logger = logging.getLogger("t"); dk.emit = lambda *a, **k: None
sys.modules["decky"] = dk
import main, qam_blackbox as bb

# --- datos limpios: nada de contenido largo ni claves raras
d = bb.clean_data({"app": "firefox", "n": 3, "ok": True, "x" * 3: "y" * 500, "MAL": 1, "raro clave": 2, "lista": [1]})
assert d["app"] == "firefox" and d["n"] == 3 and len(d["xxx"]) == 60 and "MAL" not in d and "lista" not in d, d
assert bb.EV_OK.match("ui.panel.abre") and not bb.EV_OK.match("Panel") and not bb.EV_OK.match("a b")

# --- línea de tiempo: anillo acotado y JSON válido
tl = bb.Timeline(size=5)
for i in range(8):
    line = tl.add("estado", {"n": i}, now=1000.0 + i)
assert json.loads(line)["n"] == 7 and len(tl.recent(99)) == 5 and tl.recent(2)[0]["n"] == 6

# --- vigilante
SCREEN = (1920, 1080)
def snap(**k):
    s = {"focused": 769, "base": [111, 769], "overlay": 0, "screen": SCREEN, "wins": [SCREEN], "anim": False, "running": True}
    s.update(k); return s
NOUI = {"panel": False, "kb": False, "steamkb": False, "combo_at": 0, "panel_at": 0}
wd = bb.Watchdog()
assert wd.check(snap(focused=111), NOUI, 0) == []                       # app delante, todo normal
assert wd.check(snap(), NOUI, 10) == [] and [n for n, _ in wd.check(snap(), NOUI, 14)] == ["app_oculta_sin_ui"]  # foco en Steam sin interfaz nuestra: tras 3 s
assert wd.check(snap(), NOUI, 15) == []                                  # y no se repite en 30 s
assert [n for n, _ in wd.check(snap(), NOUI, 50)] == ["app_oculta_sin_ui"]
# con el panel abierto no es una anomalía
wd = bb.Watchdog(); P = dict(NOUI, panel=True)
assert wd.check(snap(overlay=1), P, 0) == [] and wd.check(snap(overlay=1), P, 20) == []
# overlay puesto sin interfaz nuestra: 5 s
wd = bb.Watchdog()
assert wd.check(snap(overlay=1), NOUI, 0) == [] and [n for n, _ in wd.check(snap(overlay=1), NOUI, 6)] == ["overlay_sin_ui"]
# ventana pequeña: solo si no hay animación en curso
wd = bb.Watchdog()
small = snap(focused=111, wins=[(1500, 840)])
assert wd.check(dict(small, anim=True), NOUI, 0) == [] and wd.check(dict(small, anim=True), NOUI, 5) == []
assert wd.check(small, NOUI, 6) == [] and [n for n, _ in wd.check(small, NOUI, 8)] == ["ventana_pequena"]
# teclado abierto con overlay 0: no se ve
wd = bb.Watchdog(); K = dict(NOUI, kb=True)
assert wd.check(snap(focused=111), K, 0) == [] and [n for n, _ in wd.check(snap(focused=111), K, 3)] == ["teclado_sin_overlay"]
# Steam+A sin que aparezca el panel
wd = bb.Watchdog(); C = dict(NOUI, combo_at=100.0)
assert wd.check(snap(focused=111), C, 101) == [] and [n for n, _ in wd.check(snap(focused=111), C, 103)] == ["qam_no_aparece"]
assert wd.check(snap(focused=111), C, 140) == []                         # el mismo aviso no se repite
assert wd.check(snap(focused=111), dict(NOUI, combo_at=200.0, panel_at=201.0), 210) == []  # sí apareció

# --- backend: eventos de interfaz, anomalías en el archivo, reparar y privacidad
class FX:
    def __init__(self, geo): self.geo, self.log, self.cards = dict(geo), [], {}
    def screen_size(self): return SCREEN
    def geometry(self, wid): return self.geo.get(wid)
    def resize(self, wid, w, h): self.log.append((wid, w, h)); self.geo[wid] = (w, h)
    def cardinals(self, name, wid=None): return self.cards.get((name, wid), [])
    def close(self): pass


async def t_main():
    p = main.Plugin()
    await p.qam_event("panel.abre", {"x": 1})
    assert p._ui()["panel"] is True and p._ui()["panel_at"] > 0
    await p.qam_event("panel.cierra"); assert p._ui()["panel"] is False
    await p.qam_event("kb.abre"); await p.qam_event("steamkb.abre")
    assert p._ui()["kb"] and p._ui()["steamkb"]
    await p.qam_event("Mal Evento")   # se ignora
    p._tl_combo("qam.combo"); assert p._ui()["combo_at"] > 0
    lines = [json.loads(l) for l in open(os.path.join(tmp, "timeline.log"), encoding="utf-8")]
    evs = [l["ev"] for l in lines]
    assert evs[:2] == ["ui.panel.abre", "ui.panel.cierra"] and "qam.combo" in evs and "ui.Mal Evento" not in evs, evs
    # Reparar: ventana a pantalla completa + overlay a 0 si lo subimos nosotros, y limpia las banderas de interfaz
    p._claims_v = {"0x3400016": "firefox"}
    fx = FX({0x3400016: (900, 500)}); p._kx_x = fx
    p._ov_prev = True
    async def ov(self, on, reason="panel"): self._ov_prev = None; return {"ok": True}
    main.Plugin.desktop_overlay = ov
    r = await p.desktop_repair()
    assert r["ok"] and "ventana a pantalla completa" in r["fixed"] and "overlay a 0" in r["fixed"], r
    assert fx.log[-1] == (0x3400016, 1920, 1080) and not any(p._ui()[k] for k in ("panel", "kb", "steamkb"))
    r = await p.desktop_repair()
    assert r["ok"] and r["fixed"] == [], r        # ya estaba bien
    # instantánea con los datos de gamescope (sin procesos)
    gid = main.qam_desktop.app_gameid("firefox")
    fx.cards = {("GAMESCOPE_FOCUSED_APP", None): [gid], ("GAMESCOPECTRL_BASELAYER_APPID", None): [gid, 769], ("STEAM_OVERLAY", 0x2600035): [1]}
    p._steam_wid_c = "0x2600035"
    _x, sn = await p._wd_snapshot()
    assert sn["focused"] == gid and sn["overlay"] == 1 and sn["wins"] == [(1920, 1080)] and sn["running"], sn
    # lo escrito con el teclado nunca llega a la línea de tiempo
    kx = type("K", (), {})()
    for n in ("flush", "close"): setattr(kx, n, lambda *a: None)
    kx.cardinals = lambda name, wid=None: [gid, 769] if name == "GAMESCOPECTRL_BASELAYER_APPID" else []
    kx.focus = lambda w: None; kx.type_char = lambda c, **k: True; kx.key = lambda c, **k: None
    p._kx_x = kx
    await p.desktop_key("contraseña-secreta")
    alltxt = open(os.path.join(tmp, "timeline.log"), encoding="utf-8").read() + open(os.path.join(tmp, "desktop-tag.log"), encoding="utf-8").read()
    assert "secreta" not in alltxt and "contraseña" not in alltxt


asyncio.run(t_main())
print("TODO OK")
