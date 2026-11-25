#!/usr/bin/env python3
"""Mide QUÉ página de la interfaz de Steam gasta CPU (depuración CEF, puerto 8080). Solo biblioteca estándar.
Uso:  python3 ~/homebrew/plugins/qam-rail-dev/steam-cpu.py [segundos=10]
Por cada página (QuickAccess, MainMenu, Steam Big Picture Mode, SharedJSContext…) imprime el % de tiempo ocupada, cuánto en JavaScript,
en maquetación y en estilos, y cuántos relayouts/recálculos por segundo. Sirve para ver si el gasto lo causa un tema (CSS animado), el panel de
QAM Rail o la propia Steam. No cambia nada en Steam ni envía nada fuera del equipo."""
import base64, json, os, socket, struct, sys, time, urllib.request

HOST, PORT = "127.0.0.1", 8080


class WS:
    def __init__(self, url: str):
        path = url.split(f"{HOST}:{PORT}", 1)[1]
        self.s = socket.create_connection((HOST, PORT), timeout=5)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f"GET {path} HTTP/1.1\r\nHost: {HOST}:{PORT}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.s.recv(4096)
            if not chunk:
                raise OSError("sin respuesta al abrir el websocket")
            buf += chunk
        if b" 101 " not in buf.split(b"\r\n", 1)[0]:
            raise OSError(buf.split(b"\r\n", 1)[0].decode(errors="replace"))
        self.rest = buf.split(b"\r\n\r\n", 1)[1]
        self.n = 0

    def _read(self, n: int) -> bytes:
        while len(self.rest) < n:
            chunk = self.s.recv(65536)
            if not chunk:
                raise OSError("conexión cerrada")
            self.rest += chunk
        out, self.rest = self.rest[:n], self.rest[n:]
        return out

    def send(self, obj: dict) -> None:
        data = json.dumps(obj).encode()
        mask = os.urandom(4)
        n = len(data)
        head = b"\x81" + (bytes([0x80 | n]) if n < 126 else b"\xfe" + struct.pack(">H", n) if n < 65536 else b"\xff" + struct.pack(">Q", n))
        self.s.sendall(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def recv(self) -> dict:
        while True:
            b1, b2 = self._read(2)
            n = b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            data = self._read(n)
            if b1 & 0x0F == 1:
                return json.loads(data)

    def call(self, method: str, params: dict | None = None) -> dict:
        self.n += 1
        self.send({"id": self.n, "method": method, "params": params or {}})
        while True:
            m = self.recv()
            if m.get("id") == self.n:
                return m.get("result", {})


def metrics(ws: WS) -> dict:
    return {m["name"]: m["value"] for m in ws.call("Performance.getMetrics").get("metrics", [])}


def main() -> None:
    secs = float(sys.argv[1]) if len(sys.argv) > 1 else 10.0
    pages = [p for p in json.load(urllib.request.urlopen(f"http://{HOST}:{PORT}/json/list", timeout=5)) if p.get("webSocketDebuggerUrl")]
    conns = []
    for p in pages:
        try:
            ws = WS(p["webSocketDebuggerUrl"])
            ws.call("Performance.enable")
            conns.append((p.get("title") or p.get("url", "?")[:40], ws, metrics(ws)))
        except OSError as e:
            print(f"(no se pudo abrir {p.get('title')!r}: {e})")
    t0 = time.monotonic()
    time.sleep(secs)
    dt = time.monotonic() - t0
    rows = []
    for title, ws, m0 in conns:
        try:
            m1 = metrics(ws)
        except OSError:
            continue
        d = lambda k: m1.get(k, 0) - m0.get(k, 0)
        rows.append((d("TaskDuration") / dt * 100, title, d("ScriptDuration") / dt * 100, d("LayoutDuration") / dt * 100,
                     d("RecalcStyleDuration") / dt * 100, d("LayoutCount") / dt, d("RecalcStyleCount") / dt))
    for _t, ws, _m in conns:
        try:
            ws.s.close()
        except OSError:
            pass
    rows.sort(reverse=True)
    print(f"Medido {dt:.0f} s. % = tiempo ocupado de cada página (100 % = un núcleo entero)")
    print(f"{'página':34} {'total':>6} {'JS':>6} {'maquet.':>8} {'estilos':>8} {'layout/s':>9} {'estilo/s':>9}")
    for tot, title, js, lay, st, lc, sc in rows:
        print(f"{title[:34]:34} {tot:5.0f}% {js:5.0f}% {lay:7.0f}% {st:7.0f}% {lc:9.1f} {sc:9.1f}")


if __name__ == "__main__":
    main()
