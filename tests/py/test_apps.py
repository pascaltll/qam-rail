"""Pruebas de la tuberia de apps de QAM (0.50): python3 tests/py/test_apps.py"""
import asyncio, hashlib, json, os, stat, sys, tempfile, types, zipfile

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
sys.path.insert(0, os.path.join(ROOT, "py_modules"))
import qam_apps, qam_pipeline as pl

# ---------------------------------------------------------------- utilidades
def make_zip(path, files, root="forge", symlink=None):
    with zipfile.ZipFile(path, "w") as zf:
        for name, data in files.items():
            info = zipfile.ZipInfo(f"{root}/{name}" if root else name)
            info.external_attr = (0o755 if name.endswith(".sh") or name.startswith("bin/") else 0o644) << 16
            zf.writestr(info, data)
        if symlink:
            info = zipfile.ZipInfo(f"{root}/{symlink}")
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            zf.writestr(info, "/etc/passwd")
    return path

def manifest(version="1.0", **kw):
    m = {"schema": 1, "id": "forge", "name": "Forge", "version": version, "launch": "bin/forge", "install": "install.sh", "status": "bin/forge --qam-status",
         "data_dirs": ["~/.local/share/forge-test"], "update": {"provider": "github-release", "repo": "pascaltll/Forgeinator", "channel": "stable"}}
    m.update(kw)
    return json.dumps(m)

STATUS_OK = '#!/bin/bash\necho \'{"version":"X","running":false}\'\n'
STATUS_BAD = '#!/bin/bash\necho "no soy json"\n'
INSTALL_OK = "#!/bin/bash\necho instalado > instalado.txt\n"
INSTALL_FAIL = "#!/bin/bash\necho roto >&2\nexit 3\n"

def pack(tmp, name, version="1.0", install=INSTALL_OK, status=STATUS_OK, extra=None, **mk):
    files = {"qam-app.json": manifest(version, **mk), "install.sh": install, "bin/forge": status.replace("X", version), "app.txt": f"v{version}"}
    files.update(extra or {})
    return make_zip(os.path.join(tmp, name), files)

# ---------------------------------------------------------------- versiones
def test_versions():
    c = pl.compare_versions
    assert c("3.12", "3.13") == -1 and c("v3.12.0", "3.12") == 0 and c("3.12.1", "3.12") == 1
    assert c("3.13-beta1", "3.13") == -1 and c("3.13-beta2", "3.13-beta1") == 1 and c("3.13", "3.13-rc1") == 1
    assert c(None, "0.1") == -1 and c("0.51.1", "0.50") == 1
    print("ok versiones")

# ---------------------------------------------------------------- SHA-256
def test_verify():
    with tempfile.TemporaryDirectory() as t:
        p = pack(t, "forge-1.0.zip")
        h = hashlib.sha256(open(p, "rb").read()).hexdigest()
        assert pl.verify(p)["matched"] is None
        assert pl.verify(p, h)["ok"] and pl.verify(p, h.upper())["ok"]
        assert not pl.verify(p, "0" * 64)["ok"]
        sums = f"{h}  forge-1.0.zip\n{'1' * 64} *otro.zip\nbasura\n"
        assert pl.parse_sums(sums) == {"forge-1.0.zip": h, "otro.zip": "1" * 64}
        assert pl.verify(p, sums_text=sums)["matched"] is True
        assert not pl.verify(p, sums_text=f"{'1' * 64}  otro.zip")["ok"]          # no figura
        assert not pl.verify(p, sums_text=f"{'2' * 64}  forge-1.0.zip")["ok"]     # no coincide
    print("ok sha256")

# ---------------------------------------------------------------- manifiesto
def test_manifest_check():
    ok = {"id": "x", "launch": "bin/x", "install": "install.sh", "status": "bin/x --qam-status", "version": "1", "art": {"icon": "a.png"},
          "update": {"provider": "github-release", "repo": "a/b"}, "data_dirs": ["~/.config/x"], "schema": 1}
    assert qam_apps.check_manifest(ok)["errors"] == []
    for bad, frag in [({"launch": "../x"}, "launch"), ({"install": "/bin/sh"}, "install"), ({"status": "../../x --s"}, "status"),
                      ({"art": {"icon": "../../etc"}}, "arte"), ({"update": {"provider": "ftp", "repo": "a/b"}}, "provider"),
                      ({"update": {"provider": "github-release", "repo": "a b"}}, "repo"), ({"data_dirs": ["/etc"]}, "data_dirs"),
                      ({"data_dirs": ["~"]}, "data_dirs"), ({"schema": 2}, "esquema"), ({"min_qam_rail": "9.0"}, "necesita")]:
        e = qam_apps.check_manifest({**ok, **bad}, "0.50.0")["errors"]
        assert e and any(frag in x for x in e), (bad, e)
    assert qam_apps.check_manifest({**ok, "min_qam_rail": "0.50.0"}, "0.50.0")["errors"] == []
    print("ok manifiesto")

def test_defaults_schema1():
    with tempfile.TemporaryDirectory() as t:
        m = qam_apps.read_manifest(t)         # sin manifiesto: se deduce y trae los campos nuevos vacios
        assert m["schema"] == 0 and m["update"] is None and m["data_dirs"] == [] and m["status"] is None
    print("ok defaults")

# ---------------------------------------------------------------- archivos: preparar / cambiar / volver
def test_zip_hostile():
    with tempfile.TemporaryDirectory() as t:
        apps = os.path.join(t, "apps")
        bad = make_zip(os.path.join(t, "slip.zip"), {"../fuera.txt": "x", "qam-app.json": manifest()}, root="")
        try: pl.stage_zip(bad, apps); raise SystemExit("zip slip aceptado")
        except ValueError as e: assert "peligrosa" in str(e)
        ln = make_zip(os.path.join(t, "ln.zip"), {"qam-app.json": manifest()}, symlink="enlace")
        try: pl.stage_zip(ln, apps); raise SystemExit("symlink aceptado")
        except ValueError as e: assert "simbólico" in str(e)
        assert not os.listdir(os.path.join(apps, ".staging"))          # no deja restos
    print("ok zip hostil")

def test_stage_commit_previous_rollback():
    with tempfile.TemporaryDirectory() as t:
        apps = os.path.join(t, "apps")
        s1 = pl.stage_zip(pack(t, "f1.zip", "1.0"), apps)
        assert not os.path.exists(os.path.join(apps, "forge"))            # preparar no instala
        m1 = pl.commit(s1, apps)
        assert m1["version"] == "1.0" and os.path.isfile(os.path.join(apps, "forge", "app.txt"))
        assert qam_apps.previous_manifest(apps, "forge") is None
        # el usuario genera datos «keep»
        open(os.path.join(apps, "forge", "ajustes.json"), "w").write("{}")
        m2 = pl.commit(pl.stage_zip(pack(t, "f2.zip", "2.0"), apps), apps)
        assert m2["version"] == "2.0" and open(os.path.join(apps, "forge", "app.txt")).read() == "v2.0"
        assert os.path.isfile(os.path.join(apps, "forge", "ajustes.json"))     # lo del usuario pasa a la nueva
        assert qam_apps.previous_manifest(apps, "forge")["version"] == "1.0"
        assert [a["id"] for a in qam_apps.list_apps(apps)] == ["forge"]         # .previous/.staging no salen como apps
        back = qam_apps.rollback(apps, "forge")
        assert back["version"] == "1.0" and qam_apps.previous_manifest(apps, "forge")["version"] == "2.0"
        assert os.path.isfile(os.path.join(apps, "forge", "ajustes.json"))     # y vuelve con ella
        assert qam_apps.rollback(apps, "forge")["version"] == "2.0"            # ida y vuelta
        # descartar una instalacion fallida: vuelve a la anterior y no deja la mala
        pl.commit(pl.stage_zip(pack(t, "f3.zip", "3.0"), apps), apps)
        b = qam_apps.discard_new(apps, "forge", True)
        assert b["version"] == "2.0" and qam_apps.previous_manifest(apps, "forge")["version"] == "1.0"   # la «anterior» de antes se conserva
        # primera instalacion fallida: no queda nada
        pl.commit(pl.stage_zip(pack(t, "g.zip", "1.0", id="otra"), apps), apps)
        assert qam_apps.discard_new(apps, "otra", False) is None and not os.path.exists(os.path.join(apps, "otra"))
        try: qam_apps.rollback(apps, "nada"); raise SystemExit("rollback sin anterior")
        except ValueError: pass
    print("ok preparar/cambiar/volver")

# ---------------------------------------------------------------- flujo completo de main.py (con decky simulado)
def load_plugin(tmp):
    dk = types.ModuleType("decky")
    dk.DECKY_PLUGIN_SETTINGS_DIR = os.path.join(tmp, "settings"); os.makedirs(dk.DECKY_PLUGIN_SETTINGS_DIR)
    dk.DECKY_HOME = os.path.join(tmp, "homebrew"); dk.DECKY_USER_HOME = tmp; dk.DECKY_PLUGIN_VERSION = "0.50.0"
    dk.logger = types.SimpleNamespace(info=lambda *a, **k: None, error=lambda *a, **k: None, warning=lambda *a, **k: None)
    sys.modules["decky"] = dk
    import importlib.util
    spec = importlib.util.spec_from_file_location("qam_main", os.path.join(ROOT, "main.py"))
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod.Plugin(), mod

async def wait_job(p, answer=None):
    for _ in range(400):
        j = await p.apps_job()
        if j["state"] == "confirm" and answer is not None:
            await p.apps_confirm(answer)
        elif j["state"] not in ("running", "confirm"):
            return j
        await asyncio.sleep(0.05)
    raise SystemExit("la instalacion no termino")

async def flow(t):
    p, mod = load_plugin(t)
    apps = mod._apps_dir()
    zdir = os.path.join(t, "z"); os.makedirs(zdir)
    z1 = pack(zdir, "forge-1.0.zip", "1.0")
    h1 = hashlib.sha256(open(z1, "rb").read()).hexdigest()
    # primera instalacion: pide confirmar (tiene instalador); si se rechaza no queda nada
    assert (await p.apps_install(z1))["ok"]
    j = await wait_job(p, answer=False)
    assert j["state"] == "cancelled" and not os.path.exists(os.path.join(apps, "forge")) and not os.listdir(os.path.join(apps, ".staging"))
    # suma incorrecta: se rechaza antes de tocar nada
    await p.apps_install(z1, confirmed=True, sha256="0" * 64)
    j = await wait_job(p); assert j["state"] == "error" and "SHA-256" in j["error"] and not os.path.exists(os.path.join(apps, "forge"))
    # instalar bien, con suma correcta y confirmando
    await p.apps_install(z1, sha256=h1)
    j = await wait_job(p, answer=True)
    assert j["state"] == "done" and j["verified"] is True and j["status"]["version"] == "1.0", j
    assert open(os.path.join(apps, "forge", "instalado.txt")).read().strip() == "instalado"
    lst = (await p.apps_list())["apps"]; a = next(x for x in lst if x["id"] == "forge")
    assert a["version"] == "1.0" and not a["has_previous"] and a["check"]["errors"] == []
    # actualizar a 2.0 (ya no pide confirmar)
    await p.apps_install(pack(zdir, "forge-2.0.zip", "2.0"))
    j = await wait_job(p); assert j["state"] == "done" and j["updated"] is True, j
    a = next(x for x in (await p.apps_list())["apps"] if x["id"] == "forge")
    assert a["version"] == "2.0" and a["has_previous"] and a["previous_version"] == "1.0"
    # 3.0 con instalador roto → vuelve a 2.0 y la 3.0 queda marcada como mala
    await p.apps_install(pack(zdir, "forge-3.0.zip", "3.0", install=INSTALL_FAIL))
    j = await wait_job(p)
    assert j["state"] == "error" and j["rolled_back"] and j["back_to"] == "2.0" and "instalador" in j["error"], j
    a = next(x for x in (await p.apps_list())["apps"] if x["id"] == "forge")
    assert a["version"] == "2.0" and a["bad_versions"] == ["3.0"] and a["previous_version"] == "1.0" and open(os.path.join(apps, "forge", "app.txt")).read() == "v2.0"
    # esa version no se reintenta sola, pero se puede forzar
    await p.apps_install(pack(zdir, "forge-3.0.zip", "3.0", install=INSTALL_FAIL))
    j = await wait_job(p); assert j["state"] == "error" and "ya falló" in j["error"] and not j.get("rolled_back")
    # 4.0 cuyo «status» no devuelve JSON → vuelve atras
    await p.apps_install(pack(zdir, "forge-4.0.zip", "4.0", status=STATUS_BAD))
    j = await wait_job(p); assert j["state"] == "error" and j["rolled_back"] and "JSON" in j["error"], j
    assert next(x for x in (await p.apps_list())["apps"] if x["id"] == "forge")["version"] == "2.0"
    # manifiesto peligroso: ni se cambia nada
    await p.apps_install(pack(zdir, "forge-5.0.zip", "5.0", launch="../../bin/sh"))
    j = await wait_job(p); assert j["state"] == "error" and "fuera de la carpeta" in j["error"] and not j.get("rolled_back")
    # volver a la anterior a mano
    r = await p.apps_rollback("forge"); assert r["ok"] and r["app"]["version"] == "1.0"
    r = await p.apps_rollback("forge"); assert r["ok"] and r["app"]["version"] == "2.0"
    # desinstalar: no toca los datos salvo que se pida, y solo dentro del HOME
    data = os.path.join(t, ".local", "share", "forge-test"); os.makedirs(data); open(os.path.join(data, "biblioteca.db"), "w").write("x")
    r = await p.apps_uninstall("forge"); assert r["removed"] and r["purged"] == [] and os.path.isfile(os.path.join(data, "biblioteca.db"))
    assert not os.path.exists(os.path.join(apps, ".previous", "forge"))
    await p.apps_install(z1, confirmed=True); await wait_job(p)
    r = await p.apps_uninstall("forge", purge_data=True); assert r["purged"] == [data] and not os.path.exists(data)
    # arranque: limpia restos de una instalacion interrumpida
    os.makedirs(os.path.join(apps, ".staging", "s-resto")); assert pl.clean_staging(apps) == 1 and not os.path.exists(os.path.join(apps, ".staging"))
    print("ok flujo completo")

def test_flow():
    with tempfile.TemporaryDirectory() as t:
        asyncio.run(flow(t))

def test_controls():
    assert qam_apps.controls_for({"id": "ytmini"}) == {"show": "open", "minimize": "mini", "close": "close", "kill": "kill"}
    assert qam_apps.controls_for({"id": "otra"}) == {}
    assert qam_apps.controls_for({"id": "otra", "controls": {"close": "stop", "kill": "a;b", "x": "y"}}) == {"close": "stop"}


if __name__ == "__main__":
    test_versions(); test_verify(); test_manifest_check(); test_defaults_schema1(); test_zip_hostile()
    test_stage_commit_previous_rollback(); test_flow(); test_controls()
    print("TODO OK")
