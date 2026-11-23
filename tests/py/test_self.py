"""Pruebas de qam_self (0.52): python3 tests/py/test_self.py"""
import json, os, sys, tempfile, zipfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "py_modules"))
import qam_self as s

def mkplugin(root, ver, extra=None):
    os.makedirs(os.path.join(root, "dist"), exist_ok=True)
    json.dump({"version": ver}, open(os.path.join(root, "package.json"), "w"))
    for n, c in {"plugin.json": "{}", "main.py": f"# {ver}", "dist/index.js": f"js{ver}", **(extra or {})}.items():
        p = os.path.join(root, n); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, "w").write(c)

def mkzip(path, ver, top="qam-rail", drop=None):
    with tempfile.TemporaryDirectory() as t:
        mkplugin(os.path.join(t, top), ver)
        if drop: os.remove(os.path.join(t, top, drop))
        with zipfile.ZipFile(path, "w") as zf:
            for d, _, fs in os.walk(t):
                for f in fs:
                    full = os.path.join(d, f); zf.write(full, os.path.relpath(full, t))
    return path

def test_stage_checks():
    with tempfile.TemporaryDirectory() as t:
        ok = mkzip(t + "/a.zip", "0.52.0")
        root = s.stage(ok, t + "/w1", "0.52.0"); assert s.read_version(root) == "0.52.0"
        for bad, why in ((mkzip(t + "/b.zip", "0.52.0", top="otro"), "carpeta"), (mkzip(t + "/c.zip", "0.52.0", drop="main.py"), "falta"),
                         (ok, "versión")):
            try:
                s.stage(bad, t + "/w_" + why, "0.99.0" if why == "versión" else None); assert False, why
            except ValueError:
                pass

def test_swap_backup_restore_and_prune():
    with tempfile.TemporaryDirectory() as t:
        plugins, bk = t + "/plugins", t + "/bk"
        cur = plugins + "/qam-rail"; mkplugin(cur, "0.51.0", {"datos.txt": "mio"})
        for i, v in enumerate(("0.52.0", "0.53.0", "0.54.0", "0.55.0")):
            new = t + f"/new{i}/qam-rail"; mkplugin(new, v)
            r = s.swap(cur, new, bk, keep=3)
            assert r["to"] == v and s.read_version(cur) == v
            os.utime(r["backup"], (1000 + i, 1000 + i))               # orden estable
        assert len(s.backups(bk)) == 3                                   # poda a 3
        assert not os.path.exists(plugins + "/.qam-rail.viejo") and not os.path.exists(plugins + "/.qam-rail.nuevo")
        r = s.restore(cur, bk); assert r["to"] == "0.54.0" and s.read_version(cur) == "0.54.0"   # la más reciente
        assert len(s.backups(bk)) == 2

def test_restore_without_backups():
    with tempfile.TemporaryDirectory() as t:
        mkplugin(t + "/p/qam-rail", "1.0")
        try:
            s.restore(t + "/p/qam-rail", t + "/nada"); assert False
        except ValueError:
            pass

if __name__ == "__main__":
    for k, f in list(globals().items()):
        if k.startswith("test_"):
            f(); print("ok", k)
    print("TODO OK")
