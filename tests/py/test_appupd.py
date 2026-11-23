"""Comprobación de actualizaciones de apps de extremo a extremo en el backend (dev.28): python3 tests/py/test_appupd.py"""
import asyncio, json, logging, os, sys, tempfile, types

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "py_modules"))
dk = types.ModuleType("decky")
home = tempfile.mkdtemp()
settings = os.path.join(home, "settings"); os.makedirs(settings)
for k in ("DECKY_PLUGIN_RUNTIME_DIR", "DECKY_PLUGIN_LOG_DIR", "DECKY_PLUGIN_DIR", "DECKY_USER_HOME"):
    setattr(dk, k, home)
dk.DECKY_HOME = home; dk.DECKY_PLUGIN_SETTINGS_DIR = settings
dk.DECKY_USER = "bazzite"; dk.logger = logging.getLogger("t"); dk.emit = lambda *a, **k: None
sys.modules["decky"] = dk
import main

app_dir = os.path.join(home, "qam-apps", "forgeinator", "bin"); os.makedirs(app_dir)
open(os.path.join(app_dir, "forgeinator"), "w").write("#!/bin/sh\n")
os.chmod(os.path.join(app_dir, "forgeinator"), 0o755)
json.dump({"schema": 1, "id": "forgeinator", "name": "Forgeinator 3000", "version": "3.15", "launch": "bin/forgeinator",
           "update": {"provider": "github-release", "repo": "pascaltll/Forgeinator", "channel": "stable"}},
          open(os.path.join(home, "qam-apps", "forgeinator", "qam-app.json"), "w"))

REL = [{"tag_name": "v3.18", "draft": False, "prerelease": False, "body": "nueva", "assets": [
    {"name": "forgeinator-3.18.zip", "size": 1000, "browser_download_url": "https://github.com/pascaltll/Forgeinator/releases/download/v3.18/forgeinator-3.18.zip"},
    {"name": "SHA256SUMS", "size": 90, "browser_download_url": "https://github.com/pascaltll/Forgeinator/releases/download/v3.18/SHA256SUMS"}]},
       {"tag_name": "v3.15", "draft": False, "prerelease": False, "body": "", "assets": []}]
calls = []

def fake_http(url, etag=None):
    calls.append((url, etag))
    return 200, "W/\"abc\"", json.dumps(REL)

main.Plugin._http = staticmethod(fake_http)


async def t():
    p = main.Plugin()
    # caché vieja de ANTES de la release (dentro de las 6 h): con force se vuelve a preguntar y sale la nueva
    json.dump({"forgeinator": {"etag": "W/\"old\"", "checked_at": 9e12, "releases": [{"tag_name": "v3.15", "draft": False, "prerelease": False, "assets": []}]}},
              open(os.path.join(settings, "updates.json"), "w"))
    r = await p.apps_check_updates(False)
    assert r["results"]["forgeinator"]["state"] == "current", r  # sin force, la caché manda (comportamiento esperado)
    assert not calls
    r = await p.apps_check_updates(True)
    u = r["results"]["forgeinator"]
    assert u["state"] == "update" and u["latest"] == "3.18" and u["current"] == "3.15", u
    assert u["url"].endswith("forgeinator-3.18.zip") and calls and calls[0][1] == "W/\"old\"", (u, calls)
    # un fallo de red no se traga: queda como «error» con el motivo y en updates.log
    def boom(url, etag=None):
        raise OSError("fallo de certificado")
    main.Plugin._http = staticmethod(boom)
    r = await p.apps_check_updates(True)
    assert r["results"]["forgeinator"]["state"] == "error" and "certificado" in r["results"]["forgeinator"]["error"], r
    log = open(os.path.join(settings, "updates.log"), encoding="utf-8").read()
    assert "→ update última=3.18" in log and "→ error" in log and "certificado" in log, log


async def t_uninstall():
    import shutil
    p = main.Plugin()
    real = shutil.rmtree
    shutil.rmtree = lambda d, **kw: None  # no consigue borrar
    try:
        r = await p.apps_uninstall("forgeinator")
    finally:
        shutil.rmtree = real
    assert r["ok"] is False and not r["removed"] and r["error"], r
    assert os.path.isdir(os.path.join(home, "qam-apps", "forgeinator"))
    r = await p.apps_uninstall("forgeinator")  # ahora sí
    assert r["ok"] and r["removed"] and not os.path.exists(os.path.join(home, "qam-apps", "forgeinator")), r
    assert "SIGUE" in open(os.path.join(settings, "updates.log"), encoding="utf-8").read()


asyncio.run(t())
asyncio.run(t_uninstall())

def t_ssl():
    import ssl, tempfile
    ctx = main.Plugin._ssl_ctx()
    assert isinstance(ctx, ssl.SSLContext) and ctx.verify_mode == ssl.CERT_REQUIRED and ctx.check_hostname
    pem = "/etc/ssl/certs/ca-certificates.crt"
    if os.path.isfile(pem):
        os.environ["SSL_CERT_FILE"] = pem
        assert main.Plugin._ssl_ctx().verify_mode == ssl.CERT_REQUIRED
        os.environ.pop("SSL_CERT_FILE")


t_ssl()
print("TODO OK")
