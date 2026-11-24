"""Grabadora de navegación (dev.69): una línea por cosa que pasa mientras se usa una app de escritorio (toques, desplazamientos, clics enviados,
paradas del lector, ida y vuelta a X, carga de los procesos del navegador, avisos de Steam…), con hora al milisegundo, para ver DÓNDE se pone
lenta o falla. Apagada no cuesta nada. NUNCA se anota lo que se escribe (solo cuántas teclas y cuánto tardó)."""
from __future__ import annotations

import os
import re
import time

MAX_BYTES = 1_500_000          # el archivo se rota (nav-trace.log.old) al pasar de aquí
AUTO_STOP_S = 15 * 60          # se apaga sola: así no se queda grabando olvidada
FLUSH_S = 0.5
KEEP_FILES = 25                # grabaciones guardadas en trazas/ (una por app abierta)
KEEP_BYTES = 12_000_000
WATCH_RE = re.compile(r"^(msedge|firefox|firefox-bin|chrome|chromium|brave|steamwebhelper|gamescope.*|opengamepad.*|mangoapp|pipewire|Isolated Web Co|WebExtensions|Web Content)$")


def fmt_line(ts: float, ev: str, kv: dict) -> str:
    """`HH:MM:SS.mmm evento clave=valor …` (los valores con espacios van entre comillas; sin saltos de línea)."""
    lt = time.localtime(ts)
    head = f"{time.strftime('%H:%M:%S', lt)}.{int((ts % 1) * 1000):03d} {ev}"
    parts = []
    for k, v in kv.items():
        if isinstance(v, float):
            v = round(v, 1)
        sv = str(v).replace("\n", " ")
        parts.append(f"{k}={sv!r}" if (" " in sv or not sv) else f"{k}={sv}")
    return head + (" " + " ".join(parts) if parts else "")


def parse_stat(text: str):
    """/proc/PID/stat → (nombre, ticks de CPU usados, páginas residentes) o None. El nombre puede llevar espacios y paréntesis."""
    try:
        a, b = text.index("("), text.rindex(")")
        comm = text[a + 1:b]
        f = text[b + 2:].split()
        return comm, int(f[11]) + int(f[12]), int(f[21])
    except (ValueError, IndexError):
        return None


def cpu_pct(prev_ticks: int, ticks: int, dt: float, hz: int = 100) -> float:
    return 0.0 if dt <= 0 else max(0.0, (ticks - prev_ticks) / hz / dt * 100.0)


class Trace:
    def __init__(self, path: str):
        self.path = path
        self.on = False
        self.t0 = 0.0
        self.lines = 0
        self._buf: list = []
        self._flushed = 0.0
        self._prev: dict = {}   # pid → (ticks, t)

    def start(self, label: str = "") -> None:
        if self.on:
            return
        self.on, self.t0, self.lines, self._prev = True, time.time(), 0, {}
        self.archive()
        try:
            open(self.path, "w", encoding="utf-8").close()   # cada grabación empieza limpia
        except OSError:
            pass
        self.add("inicio", auto_stop_min=AUTO_STOP_S // 60, app=re.sub(r"[^\w.-]", "_", label)[:40] or "manual")

    def archive(self) -> None:
        """La grabación anterior pasa a `trazas/AAAAMMDD-HHMMSS-<app>.log` (se queda con las últimas KEEP_FILES / KEEP_BYTES): así hay una por app abierta."""
        try:
            if os.path.getsize(self.path) <= 0:
                return
            with open(self.path, encoding="utf-8", errors="replace") as fh:
                m = re.search(r"\bapp=(\S+)", fh.readline())
            folder = os.path.join(os.path.dirname(self.path), "trazas")
            os.makedirs(folder, exist_ok=True)
            stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime(os.path.getmtime(self.path)))
            os.replace(self.path, os.path.join(folder, f"{stamp}-{m.group(1) if m else 'manual'}.log"))
            files = sorted(os.listdir(folder))
            total = sum(os.path.getsize(os.path.join(folder, f)) for f in files)
            while files and (len(files) > KEEP_FILES or total > KEEP_BYTES):
                f = files.pop(0)
                total -= os.path.getsize(os.path.join(folder, f))
                os.remove(os.path.join(folder, f))
        except OSError:
            pass

    def stop(self) -> None:
        if not self.on:
            return
        self.add("fin", segundos=round(time.time() - self.t0), lineas=self.lines)
        self.flush(force=True)
        self.on = False

    def expired(self) -> bool:
        return self.on and time.time() - self.t0 > AUTO_STOP_S

    def add(self, ev: str, **kv) -> None:
        if not self.on:
            return
        self._buf.append(fmt_line(time.time(), ev, kv))
        self.lines += 1
        if time.monotonic() - self._flushed > FLUSH_S or len(self._buf) > 200:
            self.flush()

    def flush(self, force: bool = False) -> None:
        if not self._buf:
            return
        data, self._buf = "\n".join(self._buf) + "\n", []
        self._flushed = time.monotonic()
        try:
            with open(self.path, "a", encoding="utf-8") as fh:
                fh.write(data)
            if os.path.getsize(self.path) > MAX_BYTES:
                os.replace(self.path, self.path + ".old")
        except OSError:
            pass

    def sample(self, proc: str = "/proc") -> None:
        """Una vez por segundo: carga media y CPU/memoria de los procesos que importan (navegador, Steam, gamescope…)."""
        if not self.on:
            return
        now = time.monotonic()
        try:
            load = open(f"{proc}/loadavg", encoding="utf-8").read().split()[0]
        except OSError:
            load = "?"
        rows = []
        seen = {}
        try:
            pids = [d for d in os.listdir(proc) if d.isdigit()]
        except OSError:
            pids = []
        for pid in pids:
            try:
                st = parse_stat(open(f"{proc}/{pid}/stat", encoding="utf-8", errors="replace").read())
            except OSError:
                continue
            if not st or not WATCH_RE.match(st[0]):
                continue
            comm, ticks, rss = st
            seen[pid] = (ticks, now)
            p = self._prev.get(pid)
            if p:
                pc = cpu_pct(p[0], ticks, now - p[1])
                rows.append((pc, comm, pid, rss * 4 // 1024))
        self._prev = seen
        rows.sort(reverse=True)
        top = " ".join(f"{c}:{pc:.0f}%/{mb}M" for pc, c, _pid, mb in rows[:5] if pc >= 1.0)
        self.add("carga", load=load, top=top or "-")
