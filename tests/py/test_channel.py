"""Canales (0.53): activo, interruptor y red de seguridad. python3 tests/py/test_channel.py"""
import os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "py_modules"))
import qam_channel as C

def mk(root, *names):
    for n in names:
        os.makedirs(os.path.join(root, "plugins", n), exist_ok=True)
        open(os.path.join(root, "plugins", n, "plugin.json"), "w").write("{}")

with tempfile.TemporaryDirectory() as t:
    P = os.path.join(t, "plugins"); S = os.path.join(t, "settings", "qam-rail"); D = os.path.join(t, "settings", "qam-rail-dev")
    SD = C.state_dir(S); assert SD == os.path.join(t, "settings", "qam-rail-canal") and C.state_dir(D) == SD
    assert C.kind_of("/x/plugins/qam-rail-dev") == "dev" and C.kind_of("/x/plugins/qam-rail/") == "stable" and C.kind_of("") == "stable"
    # solo estable instalada
    mk(t, "qam-rail"); assert C.active(SD, P) == "stable"
    assert C.switch(SD, P, "dev")["ok"] is False  # dev no está instalada
    # dev instalada: manda dev por defecto
    mk(t, "qam-rail-dev"); assert C.active(SD, P) == "dev"
    # pasar a estable y volver
    assert C.switch(SD, P, "stable") == {"ok": True, "active": "stable"} and C.active(SD, P) == "stable"
    assert open(os.path.join(SD, "activo")).read() == "estable"
    assert C.switch(SD, P, "dev")["ok"] and C.active(SD, P) == "dev"
    # una bandera que apunta a algo no instalado se corrige sola
    C.write_flag(SD, "dev"); os.remove(os.path.join(P, "qam-rail-dev", "plugin.json")); assert C.active(SD, P) == "stable"
    mk(t, "qam-rail-dev"); os.remove(os.path.join(P, "qam-rail", "plugin.json")); C.write_flag(SD, "stable"); assert C.active(SD, P) == "dev"
    mk(t, "qam-rail")
    # red de seguridad: 2 arranques sin confirmar se toleran, el tercero vuelve a estable
    C.write_flag(SD, "dev")
    assert C.boot_guard(D, SD, P) is False and C.boot_guard(D, SD, P) is False
    assert C.boot_guard(D, SD, P) is True and C.active(SD, P) == "stable"
    assert "volví a la estable" in C.take_notice(SD) and C.take_notice(SD) is None  # el aviso sale una sola vez
    # confirmar reinicia la cuenta
    C.write_flag(SD, "dev"); C.boot_guard(D, SD, P); C.boot_guard(D, SD, P); C.confirm(D)
    assert C.boot_guard(D, SD, P) is False and C.boot_guard(D, SD, P) is False and C.active(SD, P) == "dev"
    # sin estable de respaldo no hay a dónde volver: sigue en dev
    os.remove(os.path.join(P, "qam-rail", "plugin.json")); C._write_count(D, 5)
    assert C.boot_guard(D, SD, P) is False and C.active(SD, P) == "dev"
print("TODO OK")
