#!/usr/bin/env python3
"""Genera el tema de cursor "qam-xbox" (círculo blanco con borde oscuro, como el puntero de la Xbox) en formato Xcursor.
Uso: cursor_xbox.py DESTINO [--tam 32]   → crea DESTINO/qam-xbox/{index.theme,cursors/*}. Solo biblioteca estándar."""
import math
import os
import struct
import sys

NAME = "qam-xbox"
SIZES = (24, 32, 48, 64)
# nombres que usan los toolkits para cada forma; todo lo que no sea mano o texto es la flecha (círculo)
HAND = ("pointer", "hand1", "hand2", "pointing_hand", "grab", "grabbing", "openhand", "closedhand")
TEXT = ("xterm", "text", "ibeam")
ARROW = ("left_ptr", "default", "arrow", "top_left_arrow", "left_arrow", "right_ptr", "center_ptr", "cross", "crosshair",
         "watch", "wait", "progress", "left_ptr_watch", "help", "question_arrow", "not-allowed", "no-drop", "forbidden",
         "move", "fleur", "all-scroll", "size_all", "sb_h_double_arrow", "sb_v_double_arrow", "col-resize", "row-resize",
         "ew-resize", "ns-resize", "nesw-resize", "nwse-resize", "h_double_arrow", "v_double_arrow")


def _cov(d: float, edge: float) -> float:
    """Cobertura (0-1) de un borde suavizado: 1 dentro, 0 fuera, rampa de un píxel."""
    return max(0.0, min(1.0, edge - d + 0.5))


def _over(dst, src):
    """Compone src sobre dst (RGBA no premultiplicado, 0-1)."""
    sa, da = src[3], dst[3]
    oa = sa + da * (1 - sa)
    if oa <= 0:
        return (0.0, 0.0, 0.0, 0.0)
    return tuple((src[i] * sa + dst[i] * da * (1 - sa)) / oa for i in range(3)) + (oa,)


def render(kind: str, size: int):
    """Devuelve (ancho, alto, xhot, yhot, píxeles ARGB premultiplicados en bytes little-endian)."""
    w = h = size
    c = (size - 1) / 2.0
    r = size * 0.30  # radio del círculo
    ring = max(1.5, size / 14.0)
    buf = bytearray()
    for y in range(h):
        for x in range(w):
            px = (0.0, 0.0, 0.0, 0.0)
            d = math.hypot(x - c, y - c)
            if kind in ("arrow", "hand"):
                # sombra suave, borde oscuro, relleno blanco; la mano lleva además un anillo exterior
                px = _over(px, (0, 0, 0, 0.28 * _cov(math.hypot(x - c - size * 0.03, y - c - size * 0.05), r + ring + size * 0.05)))
                px = _over(px, (0.08, 0.08, 0.08, _cov(d, r + ring)))
                px = _over(px, (1, 1, 1, _cov(d, r)))
                if kind == "hand":
                    ro = r + ring + size * 0.12
                    px = _over(px, (1, 1, 1, _cov(d, ro) * (1 - _cov(d, ro - ring * 1.1))))
            elif kind == "text":
                # I-beam: barra vertical con remates, blanca con borde oscuro
                bx, half = abs(x - c), size * 0.36
                vert = bx <= max(1.0, size / 24.0) and abs(y - c) <= half
                cap = abs(y - c) >= half - max(1.0, size / 24.0) and abs(y - c) <= half and bx <= size * 0.16
                core = vert or cap
                edge = (bx <= max(1.0, size / 24.0) + 1.2 and abs(y - c) <= half + 1.2) or (abs(y - c) >= half - max(1.0, size / 24.0) - 1.2 and abs(y - c) <= half + 1.2 and bx <= size * 0.16 + 1.2)
                if edge:
                    px = _over(px, (0.08, 0.08, 0.08, 1.0))
                if core:
                    px = _over(px, (1, 1, 1, 1.0))
            a = px[3]
            buf += struct.pack("<I", (int(a * 255 + 0.5) << 24) | (int(px[0] * a * 255 + 0.5) << 16) | (int(px[1] * a * 255 + 0.5) << 8) | int(px[2] * a * 255 + 0.5))
    hot = int(round(c))
    return w, h, hot, hot, bytes(buf)


def xcursor(kind: str) -> bytes:
    """Archivo Xcursor con una imagen por tamaño."""
    imgs = [render(kind, s) for s in SIZES]
    head = 16 + 12 * len(imgs)
    toc, body, pos = b"", b"", head
    for s, (w, h, xh, yh, data) in zip(SIZES, imgs):
        chunk = struct.pack("<9I", 36, 0xFFFD0002, s, 1, w, h, xh, yh, 0) + data
        toc += struct.pack("<3I", 0xFFFD0002, s, pos)
        body += chunk
        pos += len(chunk)
    return b"Xcur" + struct.pack("<3I", 16, 0x10000, len(imgs)) + toc + body


def install(dest: str) -> list:
    """Crea el tema bajo `dest/qam-xbox` y devuelve los nombres de cursor creados."""
    root = os.path.join(dest, NAME)
    cur = os.path.join(root, "cursors")
    os.makedirs(cur, exist_ok=True)
    with open(os.path.join(root, "index.theme"), "w") as f:
        f.write(f"[Icon Theme]\nName={NAME}\nComment=Puntero redondo estilo Xbox (QAM Rail)\n")
    made = []
    for names, kind in ((ARROW, "arrow"), (HAND, "hand"), (TEXT, "text")):
        data = xcursor(kind)
        for n in names:
            path = os.path.join(cur, n)
            if os.path.lexists(path):
                os.remove(path)
            with open(path, "wb") as f:
                f.write(data)
            made.append(n)
    return made


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("uso: cursor_xbox.py DESTINO")
    print(f"{len(install(sys.argv[1]))} cursores en {os.path.join(sys.argv[1], NAME)}")
