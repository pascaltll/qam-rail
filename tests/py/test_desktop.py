"""Pruebas de qam_desktop (0.52 a): python3 tests/py/test_desktop.py"""
import os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "py_modules"))
import qam_desktop as d

def desk(**kw):
    base = {"Type": "Application", "Name": "App", "Exec": "app %U", "Categories": "Utility;"}
    base.update(kw)
    return "[Desktop Entry]\n" + "\n".join(f"{k}={v}" for k, v in base.items()) + "\n[Desktop Action x]\nName=Otra\nExec=rm -rf /\n"

def test_parse_and_exec():
    p = d.parse_desktop("# c\n[Desktop Entry]\nName=Foo\nName[es]=Fú\nExec=foo --x %U\n[Desktop Action a]\nName=Z\n")
    assert p == {"Name": "Foo", "Exec": "foo --x %U"}          # sin traducciones ni acciones
    assert d.clean_exec('flatpak run --branch=stable org.mozilla.firefox @@u %U @@') == ["flatpak", "run", "--branch=stable", "org.mozilla.firefox"]
    assert d.clean_exec("foo %f %% bar") == ["foo", "%", "bar"]
    for bad in ("foo; rm -rf /", "foo && bar", "foo > x", "sh -c '$(x)'", "", "foo `id`"):
        assert d.clean_exec(bad) is None, bad

def test_groups():
    assert d.group_of("Network;WebBrowser;") == "Navegadores"
    assert d.group_of("AudioVideo;Player;") == "Multimedia"
    assert d.group_of("Game;Emulator;") == "Juegos y emuladores"
    assert d.group_of("") == d.OTHER

def test_entry_rules():
    f = lambda **kw: d.entry_from_desktop("/x/app.desktop", desk(**kw))
    assert f()[0]["source"] == "system"
    assert f(NoDisplay="true")[0] is None and f(Hidden="true")[0] is None and f(Terminal="true")[0] is None
    assert f(OnlyShowIn="GNOME;")[0] is None and f(OnlyShowIn="KDE;")[0] is not None and f(NotShowIn="KDE;")[0] is None
    assert f(Name="Volver al Modo Juego")[0] is None and f(Name="Decky Loader")[0] is None
    e = d.entry_from_desktop("/x/org.mozilla.firefox.desktop", desk(Name="Firefox", Exec="/usr/bin/flatpak run --branch=stable org.mozilla.firefox @@u %U @@", Categories="WebBrowser;"))[0]
    assert e["source"] == "flatpak" and e["key"] == "org.mozilla.firefox" and e["group"] == "Navegadores"
    assert d.entry_from_desktop("/x/steam.desktop", desk(Name="Steam", Exec="steam %U"))[0] is None
    assert f(Exec="x; rm -rf /")[0] is None

def make_appimage(path, kind=2):
    with open(path, "wb") as fh:
        fh.write(b"\x7fELF\x02\x01\x01\x00AI" + bytes([kind]) + b"\x00" * 50)
    os.chmod(path, 0o755)

def test_appimage_magic():
    with tempfile.TemporaryDirectory() as t:
        a, b, c = (os.path.join(t, n) for n in ("a", "b", "c"))
        make_appimage(a); make_appimage(b, 1)
        open(c, "wb").write(b"\x7fELF\x02\x01\x01\x00" + b"\x00" * 20)   # ELF normal
        assert d.is_appimage(a) and d.is_appimage(b) and not d.is_appimage(c) and not d.is_appimage(t + "/nada")
    assert d.entry_from_appimage("/h/AppImages/Foo_Bar-1.2.3-x86_64.AppImage")["name"] == "Foo Bar"

def test_scan_end_to_end():
    with tempfile.TemporaryDirectory() as h:
        w = lambda rel, txt: (os.makedirs(os.path.dirname(os.path.join(h, rel)), exist_ok=True), open(os.path.join(h, rel), "w").write(txt))
        ai = os.path.join(h, "AppImages", "Cool-2.0.AppImage"); os.makedirs(os.path.dirname(ai)); make_appimage(ai)
        solo = os.path.join(h, "AppImages", "Solo-1.0-x86_64.AppImage"); make_appimage(solo)
        w(".local/share/applications/cool.desktop", desk(Name="Cool", Exec=ai + " %U", Categories="Game;"))       # Gear Lever
        w(".local/share/applications/rota.desktop", "[Desktop Entry]\nName=Rota\nExec=a; b\nType=Application\n")
        w(".local/share/flatpak/exports/share/applications/org.mozilla.firefox.desktop", desk(Name="Firefox", Exec="flatpak run org.mozilla.firefox", Categories="WebBrowser;"))
        w(".local/share/applications/firefox.desktop", desk(Name="Firefox", Exec="firefox", Categories="WebBrowser;"))
        r = d.scan(h, dirs=[d.FLATPAK_DIRS[1], d.SYSTEM_DIRS[1]])   # solo bajo el home de prueba
        names = [(e["name"], e["source"], e["group"]) for e in r["apps"]]
        assert ("Cool", "appimage", "Juegos y emuladores") in names                     # AppImage con .desktop de Gear Lever
        assert sum(1 for e in r["apps"] if e["exec"][0] == ai) == 1                      # no se duplica con el escaneo de carpeta
        assert ("Solo", "appimage", d.OTHER) in names                                    # suelto, sin .desktop
        assert ("Firefox", "flatpak", "Navegadores") in names
        assert r["omitidas"] == 1 and "sin nombre o con Exec no permitido" in r["motivos"]   # solo la rota se cuenta
        assert [g for _, _, g in names].index(d.OTHER) == len(names) - 1                 # «Otras» al final

def test_scan_dedup_y_copias():
    """dev.101: «ES-DE», «ES DE.AppImage» y «esde.appimage» son una sola app; las copias .OLD/_old no salen; gana la que tiene .desktop."""
    with tempfile.TemporaryDirectory() as h:
        w = lambda rel, txt: (os.makedirs(os.path.dirname(os.path.join(h, rel)), exist_ok=True), open(os.path.join(h, rel), "w").write(txt))
        a = os.path.join(h, "Applications", "ES-DE.AppImage"); os.makedirs(os.path.dirname(a)); make_appimage(a)
        b = os.path.join(h, "AppImages", "esde.appimage"); os.makedirs(os.path.dirname(b)); make_appimage(b)
        for old in ("ES-DE.AppImage_3.4.1.OLD", "rpcs3.AppImage_old"):
            make_appimage(os.path.join(h, "Applications", old))
        w(".local/share/applications/esde.desktop", desk(Name="ES-DE AppImage", Exec="/bin/sh " + a, Categories="Game;"))
        d.APPIMAGE_DIRS, keep = ("~/Applications", "~/AppImages"), d.APPIMAGE_DIRS
        try:
            r = d.scan(h, dirs=[d.SYSTEM_DIRS[1]])
        finally:
            d.APPIMAGE_DIRS = keep
        esde = [e for e in r["apps"] if d.norm_name(e["name"]) == "esde"]
        assert len(esde) == 1 and esde[0]["desktop"], esde                              # una sola, la del .desktop
        assert not any("old" in e["name"].lower() for e in r["apps"]), [e["name"] for e in r["apps"]]


if __name__ == "__main__":
    for k, f in list(globals().items()):
        if k.startswith("test_"):
            f(); print("ok", k)
    print("TODO OK")


# ---- 0.54: lanzamiento y registro ----
def _t054_exec():
    assert d.clean_exec("/usr/bin/flatpak run --branch=stable --file-forwarding org.mozilla.firefox @@u %u @@") == ["/usr/bin/flatpak", "run", "--branch=stable", "org.mozilla.firefox"]


def _t054_x():
    txt = """
     0x38000aa "Mozilla Firefox": ("Navigator" "firefox")  1920x1080+0+0  +0+0
     0x380004e "Firefox": ()  10x10+-100+-100  +-100+-100
     0x380002c "Firefox": ("Firefox" "firefox")  364x359+1369+28  +1369+28
     0x3800001 "Firefox": ("org.mozilla.firefox" "Firefox")  10x10+10+10  +10+10
     0x3800010 (has no name): ()  300x300+0+0  +0+0
"""
    w = d.parse_xwininfo(txt)
    assert len(w) == 5 and w[0]["classes"] == ["Navigator", "firefox"] and w[0]["w"] == 1920
    assert [x["id"] for x in d.windows_to_tag(w, {"0x38000aa"}, set())] == ["0x380002c", "0x3800010"]
    assert [x["id"] for x in d.windows_to_tag(w, {"0x38000aa", "0x380002c", "0x3800010"}, {"firefox"})] == ["0x38000aa", "0x380002c"]


def _t054_base():
    assert d.parse_baselayer("GAMESCOPECTRL_BASELAYER_APPID(CARDINAL) = 413091, 769") == [413091, 769]
    assert d.parse_baselayer("GAMESCOPECTRL_BASELAYER_APPID:  not found.") == []
    g = d.app_gameid("flatpak:x")
    assert g == d.app_gameid("flatpak:x") and g != d.app_gameid("flatpak:y") and 1_100_000_000 <= g < 2_000_000_000
    assert d.baselayer_with([413091, 769], g) == [g, 413091, 769] and d.baselayer_with([g, 769], g) == [g, 769]
    assert d.baselayer_without([g, 413091, 769], g) == [413091, 769]


def _t054_opts():
    assert d.clean_opts({"scale": 1.4, "touch": 1}) == {"scale": 1.5, "touch": True, "fullscreen": True}
    assert d.clean_opts("x") == {"scale": 1.0, "touch": False, "fullscreen": True} and d.clean_opts({"scale": 9})["scale"] == 2.0
    assert d.apply_opts(["flatpak", "run", "com.microsoft.Edge", "--start-fullscreen"], "chromium", {"scale": 1.5, "touch": True}) == \
        ["flatpak", "run", "com.microsoft.Edge", "--start-fullscreen", "--force-device-scale-factor=1.5", "--touch-events=enabled"]
    assert d.apply_opts(["edge", "--start-fullscreen"], "chromium", {"fullscreen": False}) == ["edge", "--start-maximized"]
    assert d.apply_opts(["flatpak", "run", "org.mozilla.firefox"], "firefox", {"scale": 2}) == ["flatpak", "run", "org.mozilla.firefox"]
    blk = d.userjs_block({"scale": 1.5, "touch": True})
    assert 'devPixelsPerPx", "1.5"' in blk and "touch_events.enabled\", 1" in blk and 'devPixelsPerPx", "-1.0"' in d.userjs_block({})
    base = 'user_pref("a", 1);\n'
    once = d.merge_userjs(base, blk)
    twice = d.merge_userjs(once, d.userjs_block({"scale": 2}))
    assert once.startswith(base) and twice.count(d.UJ_BEGIN) == 1 and '"2"' in twice and base in twice and "1.5" not in twice
    assert d.merge_userjs("", blk) == blk


def _t055_steam():
    mk = lambda ex, cat="Game;": "[Desktop Entry]\nType=Application\nName=Juego\nExec=%s\nCategories=%s\n" % (ex, cat)
    assert d.entry_from_desktop("/x/steam_app_220.desktop", mk("steam steam://rungameid/220"))[1] == "juego de Steam"
    assert d.entry_from_desktop("/x/foo.desktop", mk("steam steam://rungameid/9"))[1] == "juego de Steam"
    assert d.entry_from_desktop("/x/foo.desktop", mk("/usr/bin/steam -applaunch 9"))[1] == "juego de Steam"
    assert d.entry_from_desktop("/x/steam_app_7.desktop", mk("env FOO=1 /opt/run-game"))[1] == "juego de Steam"
    ok = d.entry_from_desktop("/x/retroarch.desktop", mk("retroarch"))[0]
    assert ok and ok["name"] == "Juego"


def _t054():
    import qam_desktop as D
    w = lambda c: "/usr/bin/" + c
    chrome = {"key": "com.google.Chrome", "name": "Google Chrome", "group": "Navegadores", "exec": ["flatpak", "run", "com.google.Chrome"]}
    p = D.launch_plan(chrome, which=w, home="/home/u")
    assert p["fullscreen"] and p["browser"] == "chromium" and p["exe"] == "/usr/bin/flatpak" and p["args"] == "run com.google.Chrome --start-fullscreen", p
    assert p["argv"][0] == "/usr/bin/flatpak" and p["argv"][-1] == "--start-fullscreen" and p["dir"] == "/usr/bin"
    assert D.launch_plan(chrome, which=w, fullscreen=False)["args"] == "run com.google.Chrome"
    ff = {"key": "org.mozilla.firefox", "name": "Firefox", "group": "Navegadores", "exec": ["flatpak", "run", "org.mozilla.firefox"]}
    assert D.launch_plan(ff, which=w)["fullscreen"] is False and "--start-fullscreen" not in D.launch_plan(ff, which=w)["args"]
    assert D.browser_kind({"group": "Navegadores", "name": "Algo raro", "exec": ["x"]}) == "other" and D.browser_kind({"group": "Multimedia"}) is None
    edge = {"key": "ai-abc", "name": "Microsoft Edge", "group": "Navegadores", "exec": ["/home/u/AppImages/edge.AppImage", "--x"]}
    pe = D.launch_plan(edge, which=w, home="/home/u")
    assert pe["exe"] == "/home/u/AppImages/edge.AppImage" and pe["dir"] == "/home/u/AppImages" and pe["args"] == "--x --start-fullscreen"
    vlc = {"key": "vlc", "name": "VLC", "group": "Multimedia", "exec": ["vlc"]}
    assert D.launch_plan(vlc, which=lambda c: None, home="/home/u")["dir"] == "/home/u" and D.launch_plan(vlc, which=lambda c: None)["exe"] == "vlc"
    try: D.launch_plan({"exec": []}); raise SystemExit("debía fallar")
    except ValueError: pass
    # argumentos con espacios o comillas no se parten (sin shell)
    odd = {"key": "k", "name": "X", "group": "Otras", "exec": ["/opt/a b/app", "--name=un valor", "it's"]}
    import shlex
    assert shlex.split(D.launch_plan(odd)["args"]) == ["--name=un valor", "it's"]
    # iconos
    assert D.icon_path("/x/i.png", "/h", isfile=lambda p: p == "/x/i.png") == "/x/i.png" and D.icon_path("/x/no.png", "/h", isfile=lambda p: False) is None
    assert D.icon_path("org.x.App", "/h", isfile=lambda p: p == "/usr/share/icons/hicolor/256x256/apps/org.x.App.png") == "/usr/share/icons/hicolor/256x256/apps/org.x.App.png"
    assert D.icon_path(None, "/h") is None
    # registro
    r = D.clean_registry({"a": {"appid": 123, "name": "A", "source": "flatpak", "added": 5}, "b": {"appid": True}, "c": "x", 7: {"appid": 1}, "d": {"appid": "9"}})
    assert list(r) == ["a"] and r["a"]["appid"] == 123 and D.clean_registry(None) == {}
    print("0.54 OK")
_t054()
_t055_steam()



def _t056_pad():
    import qam_pad as pad
    devs = pad.parse_devices('''I: Bus=0003 Vendor=045e Product=028e Version=0114
N: Name="Microsoft X-Box 360 pad"
H: Handlers=event5 js0
B: EV=20000b

I: Bus=0003 Vendor=0b05 Product=1abe Version=0110
N: Name="ASUS Keyboard"
H: Handlers=sysrq kbd event3 leds

I: Bus=0006 Vendor=28de Product=11ff Version=0001
N: Name="Steam Virtual Gamepad"
H: Handlers=event9 js1
''')
    assert [x["event"] for x in devs] == ["event5", "event9"], devs
    assert pad.norm_axis(0, -32768, 32767) == pad.norm_axis(0, -32768, 32767) and abs(pad.norm_axis(0, -32768, 32767)) < 0.01
    assert pad.norm_axis(255, 0, 255, trigger=True) == 1.0 and pad.norm_axis(-5, 0, 255, trigger=True) == 0.0
    assert pad.stick_vector(0.1, 0.1) == (0.0, 0.0)
    vx, vy = pad.stick_vector(1.0, 0.0)
    assert abs(vx - 1.0) < 1e-9 and vy == 0.0
    m = pad.PadMapper()
    assert m.feed_button(304, True) == [("button", 1, True)] and m.feed_button(304, False) == [("button", 1, False)]
    assert m.feed_button(305, True) == [("key", "alt+Left")] and m.feed_button(305, False) == []
    assert m.feed_button(310, True) == [("key", "ctrl+Prior")] and m.feed_button(311, True) == [("key", "ctrl+Next")]
    assert m.feed_button(999, True) == []
    # cruceta como botones y como hat, con repetición
    assert m.feed_button(545, True, 0.0) == [("key", "Down")]
    assert m.tick(0.016, 0.1)[0] == [] and m.tick(0.016, 0.5)[0] == [("key", "Down")]
    m.feed_button(545, False, 0.6)
    assert m.tick(0.016, 5.0)[0] == []
    assert m.feed_axis(pad.ABS_HAT0Y, -1.0, 1.0) == [("key", "Up")]
    assert m.feed_axis(pad.ABS_HAT0Y, 0.0, 1.1) == [] and not m.dpad
    # gatillos: un solo evento al cruzar el umbral
    assert m.feed_axis(pad.ABS_RZ, 0.2) == [] and m.feed_axis(pad.ABS_RZ, 0.9) == [("key", "Next")] and m.feed_axis(pad.ABS_RZ, 0.95) == []
    # cursor: a fondo, ~1100 px por segundo; en reposo no se mueve
    m2 = pad.PadMapper()
    assert m2.tick(1 / 60, 0.0)[1:] == (0, 0, 0, 0)
    m2.feed_axis(pad.ABS_X, 1.0)
    tot = sum(m2.tick(1 / 60, i / 60)[1] for i in range(60))
    assert 1090 <= tot <= 1100, tot
    m2.feed_axis(pad.ABS_RY, 1.0)
    wv = sum(m2.tick(1 / 60, i / 60)[3] for i in range(60))
    assert 13 <= wv <= 14, wv
    rs = m2.reset()
    assert ("button", 1, False) in rs and m2.tick(1 / 60, 0.0)[1:] == (0, 0, 0, 0)


_t056_pad()
_t054_exec()
_t054_x()
_t054_base()
_t054_opts()


def test_icon_path_small_sizes_and_scalable():
    import qam_desktop as d
    have = {"/usr/share/icons/hicolor/512x512/apps/x.png", "/usr/share/icons/hicolor/48x48/apps/x.png"}
    isf = lambda p: p in have  # noqa: E731
    assert d.icon_path("x", "/h", isf).endswith("512x512/apps/x.png")
    assert d.icon_path("x", "/h", isf, sizes=d.ICON_SIZES_SMALL).endswith("48x48/apps/x.png")
    svg = {"/usr/share/icons/hicolor/scalable/apps/y.svg"}
    assert d.icon_path("y", "/h", lambda p: p in svg).endswith("scalable/apps/y.svg")
    assert d.icon_path("z", "/h", lambda p: False) is None
test_icon_path_small_sizes_and_scalable()
