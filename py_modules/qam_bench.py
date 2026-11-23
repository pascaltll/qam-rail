"""Prueba de rendimiento de CPU por nivel de potencia (solo lectura de sysfs + carga sintetica).

La carga: N procesos Python haciendo SHA-256 en bucle durante `seconds`; el 'score' es hashes/s totales.
Mientras tanto se muestrea (cada 0.5 s) consumo de bateria, frecuencia de CPU/GPU y temperatura maxima.
No cambia el TDP: eso lo hace el frontend (a traves de Panel de Control) antes de llamar a run_level().
"""
import asyncio
import glob
import os
import shutil
import sys
import time

WORKER = (
    "import hashlib,sys,time\n"
    "end=time.perf_counter()+float(sys.argv[1]);n=0;b=b'x'*64\n"
    "while time.perf_counter()<end:\n"
    "    for _ in range(2000): b=hashlib.sha256(b).digest()\n"
    "    n+=2000\n"
    "print(n)\n"
)


def _read(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return fh.read().strip()
    except OSError:
        return None


def _num(path):
    v = _read(path)
    try:
        return float(v) if v is not None else None
    except ValueError:
        return None


def battery_power_w():
    """Consumo de la bateria en W (positivo = descargando). None si no hay datos."""
    for bat in glob.glob("/sys/class/power_supply/BAT*"):
        p = _num(os.path.join(bat, "power_now"))
        if p is not None and p > 0:
            return p / 1e6
        c, v = _num(os.path.join(bat, "current_now")), _num(os.path.join(bat, "voltage_now"))
        if c is not None and v is not None and c > 0:
            return c * v / 1e12
    return None


def cpu_freq_mhz():
    vals = [x for x in (_num(p) for p in glob.glob("/sys/devices/system/cpu/cpu[0-9]*/cpufreq/scaling_cur_freq")) if x]
    return sum(vals) / len(vals) / 1000 if vals else None


def gpu_freq_mhz():
    for p in glob.glob("/sys/class/hwmon/hwmon*/freq1_input"):
        v = _num(p)
        if v:
            return v / 1e6
    return None


def max_temp_c():
    temps = []
    for p in glob.glob("/sys/class/hwmon/hwmon*/temp*_input"):
        v = _num(p)
        if v is not None and 0 < v < 125000:
            temps.append(v / 1000)
    return max(temps) if temps else None


def _avg(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 2) if xs else None


def _python():
    for cand in (shutil.which("python3"), shutil.which("python"), "/usr/bin/python3"):
        if cand and os.path.exists(cand):
            return cand
    return sys.executable


async def run_level(seconds: float, procs=None) -> dict:
    """Ejecuta la carga `seconds` segundos y devuelve el resumen (sin tocar el TDP)."""
    seconds = max(2.0, min(float(seconds), 30.0))
    n = int(procs or os.cpu_count() or 4)
    py = _python()
    children = [
        await asyncio.create_subprocess_exec(py, "-c", WORKER, str(seconds), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
        for _ in range(n)
    ]
    samples = {"power": [], "cpu": [], "gpu": [], "temp": []}
    t0 = time.monotonic()
    while time.monotonic() - t0 < seconds:
        await asyncio.sleep(0.5)
        samples["power"].append(battery_power_w())
        samples["cpu"].append(cpu_freq_mhz())
        samples["gpu"].append(gpu_freq_mhz())
        samples["temp"].append(max_temp_c())
    total = 0
    for c in children:
        try:
            out, _ = await asyncio.wait_for(c.communicate(), timeout=seconds + 10)
            total += int((out or b"0").strip() or 0)
        except (asyncio.TimeoutError, ValueError):
            c.kill()
    return {
        "procs": n,
        "seconds": seconds,
        "score": round(total / seconds),
        "power_w": _avg(samples["power"]),
        "cpu_mhz": _avg(samples["cpu"]),
        "gpu_mhz": _avg(samples["gpu"]),
        "temp_max_c": max((t for t in samples["temp"] if t is not None), default=None),
    }
