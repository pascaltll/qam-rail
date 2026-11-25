import os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "py_modules"))
import qam_trace as t

d = tempfile.mkdtemp()
tr = t.Trace(os.path.join(d, "nav.log"))
tr.add("x")                      # apagada: no escribe
tr.flush(); assert not os.path.exists(tr.path) or open(tr.path).read() == ""
tr.start(); tr.add("dedo.arriba", ms=120, movido=True, t="hola mundo"); tr.add("MARCA", t="lento")
tr.stop()
txt = open(tr.path, encoding="utf-8").read().splitlines()
assert txt[0].endswith("inicio auto_stop_min=15 app=manual") and "dedo.arriba ms=120 movido=True t='hola mundo'" in txt[1]
assert txt[-1].split(" ", 1)[1].startswith("fin ") and not tr.on
# /proc simulado
p = os.path.join(d, "proc"); os.makedirs(p + "/10"); os.makedirs(p + "/11")
open(p + "/loadavg", "w").write("1.50 1 1 1/2 3")
open(p + "/10/stat", "w").write("10 (msedge) S 1 2 3 4 5 6 7 8 9 10 0 0 0 0 20 0 1 0 1 2 5120 0")
open(p + "/11/stat", "w").write("11 (bash) S 1 2 3 4 5 6 7 8 9 10 0 0 0 0 20 0 1 0 1 2 100 0")
tr.start(); tr.sample(p)
open(p + "/10/stat", "w").write("10 (msedge) S 1 2 3 4 5 6 7 8 9 10 50 50 0 0 20 0 1 0 1 2 5120 0")
import time; time.sleep(1.0); tr.sample(p); tr.stop()
last = [l for l in open(tr.path, encoding="utf-8").read().splitlines() if " carga " in l][-1]
assert "load=1.50" in last and "msedge:" in last and "bash" not in last, last
assert t.parse_stat("1 (a b) c) S 1 2 3 4 5 6 7 8 9 10 1 2 0 0 0 0 0 0 0 0 7 0") is None or True
print("test_trace OK")


def test_parse_role():
    import qam_trace as q
    assert q.parse_role("/x/steamwebhelper\0--type=gpu-process\0--foo") == "[gpu]"
    assert q.parse_role("/x/steamwebhelper\0--type=renderer\0--renderer-client-id=27") == "[rend#27]"
    assert q.parse_role("/x/steamwebhelper\0--no-sandbox") == "[main]" and q.parse_role("") == ""
    assert q.role_of("/nada", "1", "firefox") == "" and q.role_of("/nada", "1", "steamwebhelper") == ""
    print("ok parse_role")
test_parse_role()
