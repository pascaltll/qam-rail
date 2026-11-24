"""Análisis puro de los registros alrededor de un corte (sin E/S propia salvo leer ficheros): lo usa Plugin._forensics.
Separado de main.py para poder probarlo sin Decky."""
import os
import re
import time


def window_lines(lines: list, since: str) -> list:
    """Solo lo fechado desde `since` (las líneas empiezan por [AAAA-MM-DD hh:mm:ss]); si no queda nada, las últimas 40."""
    return [l for l in lines if l[1:20] >= since[:19]] or lines[-40:]


def recent_dumps(dirs: list, start: float) -> list:
    """Volcados de Steam modificados desde 10 min antes de `start`, ordenados por hora."""
    dumps = []
    for d in dirs:
        try:
            for f in os.listdir(d):
                mt = os.path.getmtime(os.path.join(d, f))
                if mt >= start - 600:
                    dumps.append({"archivo": f, "hora": time.strftime("%H:%M:%S", time.localtime(mt)),
                                  "kb": os.path.getsize(os.path.join(d, f)) // 1024})
        except OSError:
            pass
    return sorted(dumps, key=lambda x: x["hora"])


def dump_strings(path: str) -> list:
    """Cadenas legibles de un volcado de Steam que parecen el motivo (assert, fichero .cpp, error)."""
    try:
        with open(path, "rb") as fh:
            data = fh.read(4_000_000)
    except OSError:
        return []
    found = []
    for m in re.finditer(rb"[\x20-\x7e]{12,300}", data):
        t = m.group().decode("ascii", "replace")
        if re.search(r"assert|Assertion|\.cpp|\.h:\d|fatal|error|failed", t, re.I) and t not in found:
            found.append(t)
        if len(found) >= 15:
            break
    return found


def graphic_session(steam_lines: list, allj: list) -> dict:
    """¿Se reinició TODA la sesión gráfica (gamescope + Xwayland), no solo Steam? Entonces el fallo es del compositor."""
    x_lost = [l for l in steam_lines + allj if "Fatal IO error" in l or "X server" in l and "lost" in l.lower()]
    gs_start = [l for l in allj if "gamescope version" in l or "OpenGamepadUI v" in l]
    return {"servidor_x_perdido": x_lost[:4], "gamescope_arranco": gs_start[:4],
            "fin_del_juego": [l for l in steam_lines if "TerminateApp" in l or "Game process removed" in l][-3:]}


def gamescope_pids(allj: list) -> list:
    """Pids de gamescope-session-plus distintos, en orden de aparición."""
    pids = []
    for l in allj:
        m = l.split("gamescope-session-plus[", 1)
        if len(m) == 2:
            pid = m[1].split("]", 1)[0]
            if pid not in pids:
                pids.append(pid)
    return pids


def previous_gamescope(allj: list, pid: str) -> list:
    """Líneas del gamescope que murió, sin su consola ni los binding."""
    return [l for l in allj if f"gamescope-session-plus[{pid}]" in l and "console:" not in l and "binding:" not in l]


def opengamepadui_closed(old: list) -> list:
    """OpenGamepadUI (Godot) al cerrarse deja «leaked at exit» / «Unreferenced static string»."""
    return [l for l in old if "at exit" in l or "Unreferenced static string" in l]
