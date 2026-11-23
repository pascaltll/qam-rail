import os, struct, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))
import cursor_xbox as c

def t_formato():
    for kind in ("arrow", "hand", "text"):
        d = c.xcursor(kind)
        assert d[:4] == b"Xcur"
        hs, ver, n = struct.unpack("<3I", d[4:16])
        assert hs == 16 and n == len(c.SIZES)
        for i in range(n):
            ty, sub, pos = struct.unpack("<3I", d[16 + 12 * i:28 + 12 * i])
            assert ty == 0xFFFD0002 and sub == c.SIZES[i]
            h = struct.unpack("<9I", d[pos:pos + 36])
            assert h[0] == 36 and h[2] == sub and h[4] == h[5] == sub
            assert pos + 36 + h[4] * h[5] * 4 <= len(d)
            # la esquina de abajo a la derecha es transparente y la de la punta (hotspot) lleva dibujo
            px = d[pos + 36:pos + 36 + h[4] * h[5] * 4]
            assert px[3] == 0 and px[-1] == 0
            if kind != "text":
                assert h[6] == h[7] and 0 < h[6] < sub // 3
                assert px[(h[7] * sub + h[6] + 1) * 4 + 3] > 150

def t_instala():
    with tempfile.TemporaryDirectory() as t:
        made = c.install(t)
        for n in ("left_ptr", "pointer", "xterm", "default"):
            assert n in made and os.path.getsize(os.path.join(t, "qam-xbox", "cursors", n)) > 100
        assert "Name=qam-xbox" in open(os.path.join(t, "qam-xbox", "index.theme")).read()
        c.install(t)  # idempotente

if __name__ == "__main__":
    t_formato(); t_instala(); print("TODO OK")
