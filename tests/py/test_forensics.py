"""qam_forensics: análisis puro de los registros alrededor de un corte. python3 tests/py/test_forensics.py"""
import os, sys, tempfile, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "py_modules"))
import qam_forensics as f

# ventana de fechas; sin coincidencias → las últimas 40
L = ["[2026-11-01 10:00:00] viejo", "[2026-11-01 10:05:00] dentro", "[2026-11-01 10:06:00] dentro2"]
assert f.window_lines(L, "2026-11-01 10:04:00") == L[1:]
many = [f"[2026-01-01 00:00:{i % 60:02d}] x{i}" for i in range(100)]
assert f.window_lines(many, "2027-01-01 00:00:00") == many[-40:]

# sesión gráfica
steam = ["[x] Game process removed: 5", "[x] TerminateApp 7", "otra"]
allj = ["Fatal IO error 11 on X server", "gamescope version 3.1", "el X server lost", "nada"]
g = f.graphic_session(steam, allj)
assert g["servidor_x_perdido"] == [allj[0], allj[2]] and g["gamescope_arranco"] == [allj[1]]
assert g["fin_del_juego"] == steam[:2]
assert f.graphic_session([], [])["fin_del_juego"] == []

# pids de gamescope y su cola
lines = ["gamescope-session-plus[10]: a", "gamescope-session-plus[10]: console: ruido", "gamescope-session-plus[10]: binding: x",
         "gamescope-session-plus[10]: Unreferenced static string to 0", "gamescope-session-plus[22]: nuevo", "sin pid"]
assert f.gamescope_pids(lines) == ["10", "22"]
old = f.previous_gamescope(lines, "10")
assert old == [lines[0], lines[3]]
assert f.opengamepadui_closed(old) == [lines[3]] and f.opengamepadui_closed([lines[0]]) == []

# volcados: solo los recientes, ordenados, y directorios que no existen se saltan
with tempfile.TemporaryDirectory() as d:
    a, b, c = (os.path.join(d, n) for n in ("a.dmp", "b.dmp", "viejo.dmp"))
    for p in (a, b, c):
        open(p, "wb").write(b"x" * 2048)
    now = time.time()
    os.utime(a, (now - 30, now - 30)); os.utime(b, (now - 10, now - 10)); os.utime(c, (now - 5000, now - 5000))
    r = f.recent_dumps([d, "/no/existe"], now - 60)
    assert [x["archivo"] for x in r] == ["a.dmp", "b.dmp"] and r[0]["kb"] == 2, r
    # cadenas legibles que parecen el motivo
    open(a, "wb").write(b"\x00\x01Assertion Failed: foo.cpp:123 bad\x00\x02hola mundo normal\x00" + b"error en el modulo grande\x00" * 3)
    s = f.dump_strings(a)
    assert any("Assertion Failed" in t for t in s) and not any("hola" in t for t in s)
    assert len([t for t in s if "error en el modulo" in t]) == 1   # sin repetidos
assert f.dump_strings("/no/existe") == []

print("ok test_forensics")
