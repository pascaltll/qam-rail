"""s_teclado: solo cambia de modo si otra combinación MEJORA lo que ya había (dev.90). python3 tests/py/test_kbmatrix.py"""
import asyncio, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "py_modules"))
import qam_selftest as q


def make(inicial, tabla):
    """SelfTest sin constructor: `tabla[(mod, ch)]` = nº de casos que pasan con ese modo (12 casos)."""
    t = object.__new__(q.SelfTest)
    t.rects, t.modo, t.guardado, t.resultados = {"ta": 1}, {"mod": inicial[0], "ch": inicial[1]}, [], []
    def setmode(mod=None, ch=None, save=False):
        if save:
            t.guardado.append((t.modo["mod"], t.modo["ch"]))
    t.setmode = setmode
    async def bateria(completa=True):
        bien = tabla[(t.modo["mod"], t.modo["ch"])]
        return [(f"c{i}", i < bien, "ab", "ab" if i < bien else "xx", 10) for i in range(12)]
    t._bateria = bateria
    t.res = lambda nombre, ok, det="", ms=None: t.resultados.append((nombre, ok, det))
    return t


def tabla(**kw):
    base = {(m, c): 2 for m in ("keys", "slow", "lock") for c in ("levels", "remap")}
    for k, v in kw.items():
        m, c = k.split("_"); base[(m, c)] = v
    return base

# 1) lo que había (lock+remap 11/12) NO se estropea cuando la matriz da empate o peor (el fallo visto en el aparato)
t = make(("lock", "remap"), tabla(lock_levels=10, lock_remap=10))
t.rects = {"ta": 1}
asyncio.run(t.s_teclado())
assert t.guardado == [("lock", "remap")], t.guardado
assert "se queda en" in t.resultados[-1][2], t.resultados[-1]

# 2) si otra combinación mejora, se cambia a ella
t = make(("keys", "levels"), tabla(keys_levels=2, lock_remap=12))
asyncio.run(t.s_teclado())
assert t.guardado == [("lock", "remap")], t.guardado
assert "cambia a" in t.resultados[-1][2] and t.resultados[-1][1] is True

# 3) un empate entre otras dos no desplaza al modo actual
t = make(("slow", "remap"), tabla(slow_remap=2, lock_levels=2, lock_remap=2))
asyncio.run(t.s_teclado())
assert t.guardado == [("slow", "remap")], t.guardado

# 4) la diferencia de texto señala dónde falla
assert "carácter 4" in q.SelfTest._dif("abcdef", "abcxef") and "largo 6 → 5" in q.SelfTest._dif("abcdef", "abcde")
print("ok test_kbmatrix")
