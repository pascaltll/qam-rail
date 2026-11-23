"""Pruebas de qam_updates (0.51): python3 tests/py/test_updates.py"""
import io, json, os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "py_modules"))
import qam_updates as u

def rel(tag, pre=False, draft=False, assets=None):
    base = f"https://github.com/pascaltll/Forgeinator/releases/download/{tag}/"
    a = assets if assets is not None else [("forge-%s.zip" % tag, 10), ("SHA256SUMS", 1), ("forge-src-%s.zip" % tag, 5)]
    return {"tag_name": tag, "prerelease": pre, "draft": draft, "body": "notas",
            "assets": [{"name": n, "size": s, "browser_download_url": base + n} for n, s in a]}

APP = {"id": "forge", "version": "3.12", "update": {"provider": "github-release", "repo": "pascaltll/Forgeinator", "channel": "stable"}}
REL = [rel("v3.14.0-beta", pre=True), rel("v3.13.0"), rel("v3.12.0"), rel("v9.9", draft=True)]

def fetcher(calls, status=200, body=None):
    def f(url, etag):
        calls.append((url, etag))
        return status, '"e1"', json.dumps(body if body is not None else REL)
    return f

def test_pick():
    assert u.pick_release(REL, "stable")["tag_name"] == "v3.13.0"
    assert u.pick_release(REL, "beta")["tag_name"] == "v3.14.0-beta"   # beta incluye prerelease; borrador nunca
    z, s = u.pick_assets(REL[1])
    assert z["name"] == "forge-v3.13.0.zip" and s["name"] == "SHA256SUMS"   # no elige el -src-

def test_check_update_and_current():
    calls, cache = [], {}
    r = u.check_app(APP, cache, fetcher(calls), now=1000)
    assert r["state"] == "update" and r["latest"] == "3.13.0" and r["sums_url"] and r["url"].startswith("https://github.com/")
    r = u.check_app({**APP, "version": "3.13"}, cache, fetcher(calls), now=1001)
    assert r["state"] == "current" and len(calls) == 1            # dentro de 6 h no vuelve a consultar
    r = u.check_app({**APP, "update": {**APP["update"], "channel": "beta"}}, cache, fetcher(calls), now=1002)
    assert r["state"] == "update" and r["latest"] == "3.14.0-beta"

def test_interval_etag_force():
    calls, cache = [], {}
    u.check_app(APP, cache, fetcher(calls), now=0)
    u.check_app(APP, cache, fetcher(calls), now=u.MIN_INTERVAL + 1)   # pasadas 6 h: consulta con ETag
    assert len(calls) == 2 and calls[1][1] == '"e1"'
    r = u.check_app(APP, cache, fetcher(calls, status=304, body=[]), now=2 * u.MIN_INTERVAL + 5)
    assert r["state"] == "update" and cache["checked_at"] == 2 * u.MIN_INTERVAL + 5   # 304 conserva lo guardado
    u.check_app(APP, cache, fetcher(calls), now=2 * u.MIN_INTERVAL + 6, force=True)
    assert len(calls) == 4

def test_errors_and_safety():
    assert u.check_app(APP, {}, fetcher([], status=403), now=0)["state"] == "error"
    assert u.check_app({"version": "1", "update": None}, {}, fetcher([]))["state"] == "none"
    bad = [rel("v4.0", assets=[("x.zip", 1)])]
    bad[0]["assets"][0]["browser_download_url"] = "http://evil.example/x.zip"
    assert u.check_app(APP, {}, fetcher([], body=bad), now=0)["state"] == "error"
    assert not u.https_ok("https://evil.example/x.zip") and not u.https_ok("http://github.com/x") and not u.https_ok("https://github.com@evil.example/x")
    assert u.https_ok("https://objects.githubusercontent.com/a")
    try:
        u.releases_url("../etc/passwd"); assert False
    except ValueError:
        pass

def test_download_limit():
    class R(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): pass
    with tempfile.TemporaryDirectory() as t:
        d = os.path.join(t, "a.zip")
        assert u.download("https://github.com/a/b/x.zip", d, lambda url: R(b"x" * 3000)) == 3000
        try:
            u.download("https://github.com/a/b/x.zip", d, lambda url: R(b"x" * 3000), limit=1000); assert False
        except ValueError:
            pass
        try:
            u.download("http://github.com/x", d, lambda url: R(b"")); assert False
        except ValueError:
            pass

if __name__ == "__main__":
    for k, f in list(globals().items()):
        if k.startswith("test_"):
            f(); print("ok", k)
    print("TODO OK")
