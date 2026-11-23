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
    assert d.clean_exec('flatpak run --branch=stable org.mozilla.firefox @@u %U @@') == ["flatpak", "run", "--branch=stable", "org.mozilla.firefox", "@@u", "@@"]
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

if __name__ == "__main__":
    for k, f in list(globals().items()):
        if k.startswith("test_"):
            f(); print("ok", k)
    print("TODO OK")
