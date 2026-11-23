"""Caja negra de QAM Rail (dev.39): línea de tiempo de eventos entre el QAM, las apps de escritorio y el teclado, y un vigilante que detecta
los casos raros (la app queda oculta, la ventana se queda pequeña, el QAM no aparece, el overlay se queda puesto…). Puro: sin X ni red.
Nunca recibe lo que se escribe."""
from __future__ import annotations

import json
import re
import time

EV_OK = re.compile(r"^[a-z][a-z0-9_.]{0,31}$")
FLAGS = {"panel", "kb", "steamkb"}   # interfaz que Steam puede estar dibujando sobre la app


def clean_data(data) -> dict:
    """Datos de un evento: solo claves cortas con números, booleanos o texto breve (el texto se recorta; nada de contenido escrito)."""
    out = {}
    if isinstance(data, dict):
        for k, v in list(data.items())[:12]:
            if not isinstance(k, str) or not EV_OK.match(k):
                continue
            if isinstance(v, (bool, int, float)) or v is None:
                out[k] = v
            elif isinstance(v, str):
                out[k] = v[:60]
    return out


class Timeline:
    """Anillo con los últimos eventos (para adjuntarlos a una anomalía) y líneas JSON para el archivo."""

    def __init__(self, size: int = 300):
        self.size = size
        self.ring: list = []

    def add(self, ev: str, data: dict | None = None, now: float | None = None) -> str:
        t = time.time() if now is None else now
        rec = {"t": round(t, 3), "hora": time.strftime("%H:%M:%S", time.localtime(t)), "ev": ev, **clean_data(data or {})}
        self.ring.append(rec)
        del self.ring[:-self.size]
        return json.dumps(rec, ensure_ascii=False)

    def recent(self, n: int = 15) -> list:
        return self.ring[-n:]


class Watchdog:
    """Mira una instantánea y devuelve las anomalías nuevas. `snap`: focused, base, overlay, screen, wins [(w, h)], anim, running.
    `ui`: panel, kb, steamkb (bool), combo_at / panel_at (cuándo se pidió y cuándo apareció el QAM). Cada anomalía se repite como mucho cada 30 s."""

    HOLD = {"overlay_sin_ui": 5.0, "app_oculta_sin_ui": 3.0, "ventana_pequena": 1.5, "teclado_sin_overlay": 2.0}

    def __init__(self, quiet: float = 30.0):
        self.quiet = quiet
        self.since: dict = {}
        self.last: dict = {}
        self.combo_seen = 0.0

    def _held(self, name: str, cond: bool, now: float) -> bool:
        if not cond:
            self.since.pop(name, None)
            return False
        first = self.since.setdefault(name, now)
        return now - first >= self.HOLD[name]

    def check(self, snap: dict, ui: dict, now: float) -> list:
        found = []
        shown = bool(ui.get("panel") or ui.get("kb") or ui.get("steamkb"))
        overlay, focused = snap.get("overlay"), snap.get("focused")
        w0, h0 = snap.get("screen") or (0, 0)
        if self._held("overlay_sin_ui", overlay == 1 and not shown, now):
            found.append(("overlay_sin_ui", "STEAM_OVERLAY=1 sin panel ni teclado nuestros (puede ser un QAM nativo de Steam)"))
        if self._held("app_oculta_sin_ui", bool(snap.get("running")) and overlay == 0 and focused == 769 and not shown, now):
            found.append(("app_oculta_sin_ui", "el foco está en Steam, hay una app abierta y no hay interfaz nuestra: la app puede quedar oculta"))
        small = bool(w0) and not snap.get("anim") and any(w < w0 * 0.95 or h < h0 * 0.95 for w, h in snap.get("wins") or [])
        if self._held("ventana_pequena", small, now):
            found.append(("ventana_pequena", "la ventana de la app no ocupa la pantalla y no hay animación en curso"))
        if self._held("teclado_sin_overlay", bool(ui.get("kb") or ui.get("steamkb")) and overlay == 0, now):
            found.append(("teclado_sin_overlay", "el teclado está abierto pero STEAM_OVERLAY=0: no se ve sobre la app"))
        combo, panel_at = float(ui.get("combo_at") or 0), float(ui.get("panel_at") or 0)
        if combo and combo > self.combo_seen and now - combo > 2.5 and panel_at < combo:
            self.combo_seen = combo
            found.append(("qam_no_aparece", "se pulsó Steam+A y el panel no se abrió en 2,5 s"))
        out = []
        for name, detail in found:
            if now - self.last.get(name, -1e9) >= self.quiet:
                self.last[name] = now
                out.append((name, detail))
        return out
