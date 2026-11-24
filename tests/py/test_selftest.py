import asyncio, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "py_modules"))
import qam_pad as q
import qam_selftest as st

# el dedo imita al núcleo: no repite coordenadas iguales a las de la ranura
f = st.Finger()
d1 = f.down(100, 200)
assert (q.EV_ABS, q.ABS_MT_POSITION_X, 100) in d1 and (q.EV_ABS, q.ABS_MT_POSITION_Y, 200) in d1
f.up()
d2 = f.down(100, 200)                       # mismo punto: ni X ni Y
assert not [e for e in d2 if e[1] in (q.ABS_MT_POSITION_X, q.ABS_MT_POSITION_Y)] and d2[1][1] == q.ABS_MT_TRACKING_ID and d2[1][2] != d1[1][2]
d3 = f.down(100, 250)                       # misma X, otra Y
assert [e[1] for e in d3 if e[1] in (q.ABS_MT_POSITION_X, q.ABS_MT_POSITION_Y)] == [q.ABS_MT_POSITION_Y]
assert d3[-1] == (q.EV_SYN, 0, 0) and f.up() == [(q.EV_ABS, q.ABS_MT_TRACKING_ID, -1), (q.EV_SYN, 0, 0)]

# ajuste lineal pantalla ← página
a, b = st.fit_axis(100, 700, 50, 350)
assert abs(a - 2.0) < 1e-9 and abs(b) < 1e-9
assert st.fit_axis(5, 5, 1, 2) is None and st.fit_axis(1, 2, 3, 3) is None

# el servidor de la prueba apunta lo que manda la página y sirve la página
async def probe_test():
    p = st.Probe(); await p.start()
    async def get(path):
        r, w = await asyncio.open_connection("127.0.0.1", p.port)
        w.write(f"GET {path} HTTP/1.1\r\nHost: x\r\n\r\n".encode()); await w.drain()
        data = await r.read(); w.close(); return data
    i = p.mark()
    assert b"204" in (await get("/ev?k=click&d=%7B%22id%22%3A%22b1%22%7D")).split(b"\r\n")[0]
    assert b"QAM autoprueba" in await get("/")
    e = await p.wait(i, "click", lambda d: d.get("id") == "b1", 0.5)
    assert e and e["d"]["id"] == "b1"
    assert await p.wait(i, "vis", None, 0.1) is None
    await p.stop()
asyncio.run(probe_test())
print("test_selftest OK")
