"""QAM Rail: backend minimo. Guarda ajustes y favoritos en JSON.

Interruptor de emergencia desde terminal (si el riel diera problemas):
    touch ~/homebrew/settings/qam-rail/DISABLE   y reiniciar Steam / plugin_loader
"""
import asyncio
import json
import os
import re
import sys
import time

import decky

try:
    import qam_bench
except ImportError:  # py_modules no cargado: la prueba queda no disponible
    qam_bench = None
try:
    import qam_apps
    import qam_pipeline
except ImportError:
    qam_apps = None
    qam_pipeline = None
try:
    import qam_updates
except ImportError:
    qam_updates = None
try:
    import qam_desktop
except ImportError:
    qam_desktop = None
try:
    import qam_pad
except ImportError:
    qam_pad = None
try:
    import qam_cursor
    import qam_cursor_theme
except ImportError:
    qam_cursor = qam_cursor_theme = None
try:
    import qam_blackbox
except ImportError:
    qam_blackbox = None
try:
    import qam_self
except ImportError:
    qam_self = None
try:
    import qam_trace
except ImportError:
    qam_trace = None
try:
    import qam_selftest
except ImportError:
    qam_selftest = None
try:
    import qam_channel
except ImportError:
    qam_channel = None


def _home() -> str:
    return getattr(decky, "DECKY_USER_HOME", None) or os.path.expanduser("~")


def _plugins_dir() -> str:
    d = getattr(decky, "DECKY_PLUGIN_DIR", None)
    return os.path.dirname(d.rstrip(os.sep)) if d else os.path.join(_home(), "homebrew", "plugins")


def _me() -> str:
    """«dev» si este es el plugin qam-rail-dev; «stable» si es qam-rail."""
    return qam_channel.kind_of(getattr(decky, "DECKY_PLUGIN_DIR", "") or "") if qam_channel else "stable"


def _chan_dir() -> str:
    return qam_channel.state_dir(decky.DECKY_PLUGIN_SETTINGS_DIR)


def _active() -> str:
    """Quién dibuja el QAM. Sin el módulo de canales, este plugin (comportamiento de siempre)."""
    return qam_channel.active(_chan_dir(), _plugins_dir()) if qam_channel else _me()


def _apps_dir() -> str:
    """Carpeta de apps de QAM Rail, junto a la de plugins de Decky: ~/homebrew/qam-apps/."""
    return os.path.join(getattr(decky, "DECKY_HOME", None) or os.path.join(_home(), "homebrew"), "qam-apps")

DEFAULTS = {
    "enabled": True,
    # "focus": al mover la cruceta sobre un icono se abre su seccion
    # "select": solo se abre con A o Derecha
    "open_on": "focus",
    "favorites": [],
    # Piloto: panel propio en lugar del QAM de Steam (apagado por defecto)
    "own_qam": False,
}


def _path(name: str) -> str:
    return os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, name)


def _clean(data: dict) -> dict:
    out = dict(DEFAULTS)
    out["enabled"] = bool(data.get("enabled", True))
    out["open_on"] = data.get("open_on") if data.get("open_on") in ("focus", "select") else "focus"
    out["own_qam"] = bool(data.get("own_qam", False))
    favs = data.get("favorites", [])
    out["favorites"] = [int(x) for x in favs if isinstance(x, (int, float)) and not isinstance(x, bool)][:64]
    return out


class Plugin:
    async def _main(self):
        os.makedirs(decky.DECKY_PLUGIN_SETTINGS_DIR, exist_ok=True)
        try:  # restos de una instalacion de app interrumpida
            if qam_pipeline is not None:
                qam_pipeline.clean_staging(_apps_dir())
        except Exception:  # noqa: BLE001
            pass
        try:  # canales (0.53): dev arranca con los ajustes de la estable (si no, el panel propio queda apagado y se ve el QAM de Steam)
            if qam_channel is not None and _me() == "dev":
                seeded = qam_channel.seed_settings(os.path.join(os.path.dirname(decky.DECKY_PLUGIN_SETTINGS_DIR.rstrip(os.sep)), "qam-rail"),
                                                   decky.DECKY_PLUGIN_SETTINGS_DIR)
                if seeded:
                    decky.logger.info(f"QAM Rail Dev: ajustes copiados de la estable ({', '.join(seeded)})")
        except Exception as exc:  # noqa: BLE001
            decky.logger.error(f"canal (ajustes): {exc}")
        try:  # canales (0.53): si este es dev y está activo, cuenta el arranque (la red de seguridad vuelve a estable tras 2 fallidos)
            if qam_channel is not None and _me() == "dev" and _active() == "dev":
                if qam_channel.boot_guard(decky.DECKY_PLUGIN_SETTINGS_DIR, _chan_dir(), _plugins_dir(), str(getattr(decky, "DECKY_PLUGIN_VERSION", "") or "")):
                    decky.logger.warning("QAM Rail Dev: 2 arranques sin confirmar, vuelvo a la versión estable")
        except Exception as exc:  # noqa: BLE001
            decky.logger.error(f"canal: {exc}")
        try:  # mando como ratón para las apps de escritorio (0.54 dev.26): duerme sin lanzar nada mientras no haya una app delante
            if qam_pad is not None:
                self._pad = qam_pad.PadRunner(self._pad_ours, self._pad_env, self._pad_log, self._pad_enabled, event=self._tl_combo, touch=self._touch_cfg, trace=self._trace_obj())
                self._spawn(self._pad.run())
            if qam_blackbox is not None and qam_pad is not None:
                self._spawn(self._wd_loop())
            if qam_cursor is not None and qam_pad is not None:
                self._spawn(self._cursor_loop())
            self._spawn(self._boost_loop())
        except Exception as exc:  # noqa: BLE001
            decky.logger.error(f"mando: {exc}")
        decky.logger.info(f"QAM Rail listo ({_me()}, activo: {_active()})")

    async def _unload_clean(self) -> None:
        """Al descargar el plugin (actualizar, reiniciar Decky): quita nuestras apps de la capa base de gamescope y baja el overlay que subimos.
        Si no, Steam queda debajo de una app que ya nadie gestiona y la pantalla puede quedarse negra."""
        if qam_desktop is None:
            return
        prefix, seen = await self._user_session()
        display = seen.get("DISPLAY") or ":0"
        for key in sorted({str(k) for k in self._claims.values()}):
            await self._base_layer(prefix, display, key, False)
        if getattr(self, "_ov_prev", None):
            await self.desktop_overlay(False, reason="descarga")
        self._tag_log("descarga del plugin: capa base y overlay limpiados")

    async def _unload(self):
        try:
            await asyncio.wait_for(self._unload_clean(), 4)
        except Exception:  # noqa: BLE001 — nunca debe impedir la descarga
            pass
        self._kx_close()
        try:
            if getattr(self, "_pad", None):
                self._pad.stop()
        except Exception:  # noqa: BLE001
            pass
        decky.logger.info("QAM Rail descargado")

    # ---- Mando como ratón (dev.26) ----
    def _trace_obj(self):
        """La grabadora de navegación (qam_trace.Trace), creada una vez."""
        if qam_trace is None:
            return None
        t = getattr(self, "_trace_v", None)
        if t is None:
            t = self._trace_v = qam_trace.Trace(_path("nav-trace.log"))
        return t

    def _pad_log(self, text: str) -> None:
        tr = getattr(self, "_trace_v", None)
        if tr is not None and tr.on:
            tr.add("pad", t=text[:160])
        try:
            with open(_path("pad.log"), "a", encoding="utf-8") as fh:
                fh.write(time.strftime("%H:%M:%S ") + text + "\n")
            if os.path.getsize(_path("pad.log")) > 40_000:
                os.replace(_path("pad.log"), _path("pad.log.old"))
        except OSError:
            pass

    def _pad_enabled(self) -> bool:
        try:
            with open(_path("pad-mouse.json"), encoding="utf-8") as fh:
                return bool(json.load(fh).get("on", True))
        except (OSError, ValueError, AttributeError):
            return True

    def _touch_file(self) -> dict:
        """touch-scroll.json, leído como mucho una vez por segundo (el lector lo consulta en cada fotograma)."""
        now = time.monotonic()
        c = getattr(self, "_touch_cache", None)
        if c and now - c[0] < 1.0:
            return c[1]
        try:
            with open(_path("touch-scroll.json"), encoding="utf-8") as fh:
                cfg = json.load(fh)
            cfg = cfg if isinstance(cfg, dict) else {}
        except (OSError, ValueError):
            cfg = {}
        self._touch_cache = (now, cfg)
        return cfg

    def _touch_cfg(self):
        """Táctil: None si está apagado o si el panel/teclado de QAM están delante (el toque es para ellos); si no, un dict: «full» (modo completo) y,
        si se fuerza, la correspondencia de ejes. Cada cambio de motivo/modo se anota en pad.log («táctil: …»)."""
        cfg = self._touch_file()
        if not cfg.get("on", True):
            why, res = "apagado en el ajuste", None
        elif self._ui().get("panel") or self._ui().get("kb"):
            why, res = "el panel o el teclado grande figuran abiertos", None
        else:
            why = ""
            res = dict(cfg["map"]) if isinstance(cfg.get("map"), dict) else {}
            res["full"] = bool(cfg.get("full", False))
            res["text"] = bool(cfg.get("text", False))
            if isinstance(cfg.get("px"), (int, float)):
                res["px"] = cfg["px"]
        tag = why or ("activo, modo completo" if res and res.get("full") else "activo, modo scroll")
        if tag != getattr(self, "_touch_why", None):
            self._touch_why = tag
            self._pad_log("táctil: " + (f"en pausa — {why}" if why else tag))
        return res

    async def nav_trace(self, on=None, mark=None) -> dict:
        """Grabadora de navegación (Más › Pruebas y herramientas): `on` la enciende/apaga, `mark` anota «esto fue lento» con la hora. Devuelve el estado."""
        t = self._trace_obj()
        if t is None:
            return {"ok": False, "error": "no disponible"}
        if on is True and not t.on:
            t.start()
            self._spawn(self._trace_loop())
        elif on is False:
            t.stop()
        if mark and t.on:
            t.add("MARCA", t=str(mark)[:80])
        t.flush()
        return {"ok": True, "on": t.on, "lines": t.lines, "secs": int(time.time() - t.t0) if t.on else 0, "path": t.path}

    async def _trace_loop(self) -> None:
        """Una muestra por segundo (carga y procesos) mientras la grabadora está encendida; a los 15 minutos la apaga."""
        t = self._trace_obj()
        while t is not None and t.on:
            try:
                await asyncio.get_event_loop().run_in_executor(None, t.sample)
                if t.expired():
                    t.stop()
                    break
                t.flush()
            except Exception:  # noqa: BLE001 - la grabadora nunca debe afectar al resto
                pass
            await asyncio.sleep(1.0)

    # ---- Autoprueba del navegador (dev.73) ----
    def _st_state(self) -> dict:
        st = getattr(self, "_st", None)
        if st is None:
            last = None
            try:
                with open(_path("selftest.json"), encoding="utf-8") as fh:
                    last = json.load(fh)
            except (OSError, ValueError):
                pass
            st = self._st = {"running": False, "phase": "", "cancel": False, "result": last if isinstance(last, dict) else None}
        return st

    async def nav_selftest(self, start=None, cancel=None) -> dict:
        """Autoprueba del navegador: `start` la lanza (hay que cerrar el panel; empieza sola) y `cancel` la para. Devuelve estado y última prueba."""
        st = self._st_state()
        if qam_selftest is None or qam_pad is None:
            return {"ok": False, "error": "no disponible"}
        if start and not st["running"]:
            st.update(running=True, phase="Cierra el panel: la prueba empieza sola", cancel=False)
            self._spawn(self._selftest_task())
        if cancel:
            st["cancel"] = True
        return {"ok": True, "running": st["running"], "phase": st["phase"], "result": st["result"], "version": str(getattr(decky, "DECKY_PLUGIN_VERSION", "") or "")}

    async def _selftest_task(self) -> None:
        st = self._st_state()
        res = None
        try:
            t0 = time.monotonic()
            quiet = 0.0
            while time.monotonic() - t0 < 60 and not st["cancel"]:   # espera a que el panel esté cerrado un momento
                quiet = quiet + 0.25 if not self._ui().get("panel") else 0.0
                if quiet >= 1.5:
                    break
                await asyncio.sleep(0.25)
            if st["cancel"]:
                res = {"ok": None, "error": "cancelada", "steps": []}
                return
            if quiet < 1.5:
                res = {"ok": False, "error": "el panel siguió abierto: ciérralo para que empiece", "steps": []}
                return
            pad = getattr(self, "_pad", None)
            x = await self._kx()
            if pad is None or pad._x is None or not pad.is_active or not self._front_wid(x):
                res = {"ok": False, "error": "no hay una app de escritorio delante (abre el navegador desde Apps, ciérralo del panel y pulsa Probar)", "steps": []}
                return
            st["phase"] = "Probando… no toques la pantalla"

            async def keys(key, mods):
                r = await (self.desktop_key(text=key, mods=mods) if len(key) == 1 else self.desktop_key(key=key, mods=mods))
                return bool(r.get("ok"))

            async def typ(text):
                return bool((await self.desktop_key(text=text)).get("ok"))

            def log(ev, **kw):
                if kw.get("name"):
                    st["phase"] = f"Probando: {kw['name']}"
                    self._pad_log(f"autoprueba: {kw['name']} → {'OK' if kw.get('ok') else 'FALLA'} · {kw.get('detalle', '')}")

            def setmode(mod=None, ch=None, save=False):
                if mod:
                    x.mod_mode = mod
                if ch:
                    x.char_mode = ch
                if save:
                    try:
                        with open(_path("kbd-mode.json"), "w", encoding="utf-8") as fh:
                            json.dump({"mod": x.mod_mode, "ch": x.char_mode}, fh)
                    except OSError:
                        pass
                self._pad_log(f"autoprueba: teclado modo mod={x.mod_mode} símbolos={x.char_mode}" + (" (guardado)" if save else ""))
            wid = self._front_wid(x)
            fkey = ""
            for w_, k_ in self._claims.items():
                try:
                    if wid and int(str(w_), 0) == wid and not str(k_).startswith("qam:"):
                        fkey = str(k_)
                        break
                except ValueError:
                    continue
            test = qam_selftest.SelfTest(pad, keys, typ, log, title=lambda: x.window_title(wid), opener=lambda u: self._open_url(u, fkey), setmode=setmode, setfs=lambda on: x.set_wm_fullscreen(wid, on))
            res = await asyncio.wait_for(test.run(), 300)
        except asyncio.TimeoutError:
            res = {"ok": False, "error": "la prueba tardó más de 2 minutos y se paró", "steps": []}
        except Exception as e:  # noqa: BLE001
            res = {"ok": False, "error": f"error: {e!r}"[:160], "steps": []}
        finally:
            if res is not None:
                res["at"] = time.time()
                res["version"] = str(getattr(decky, "DECKY_PLUGIN_VERSION", "") or "")
                st["result"] = res
                if res.get("steps"):   # solo las pruebas que llegaron a hacer algo pisan la anterior en el disco
                    try:
                        with open(_path("selftest.json"), "w", encoding="utf-8") as fh:
                            json.dump(res, fh, ensure_ascii=False)
                    except OSError:
                        pass
            st.update(running=False, phase="", cancel=False)

    async def pad_touch(self, on=None, full=None, text=None) -> dict:
        """Táctil en las apps de escritorio: «on» (scroll con el dedo y gestos de dos dedos) y «full» (toque, mantener y arrastrar los hacemos nosotros)."""
        cfg = dict(self._touch_file())
        changed = False
        if on is not None:
            cfg["on"], changed = bool(on), True
        if full is not None:
            cfg["full"], changed = bool(full), True
        if text is not None:
            cfg["text"], changed = bool(text), True
        if changed:
            try:
                with open(_path("touch-scroll.json"), "w", encoding="utf-8") as fh:
                    json.dump(cfg, fh)
                self._touch_cache = None
            except OSError:
                pass
        return {"ok": qam_pad is not None, "on": bool(cfg.get("on", True)), "full": bool(cfg.get("full", False)), "text": bool(cfg.get("text", False))}

    async def _pad_env(self) -> tuple:
        _prefix, seen = await self._user_session()
        return seen.get("DISPLAY") or ":0", seen.get("XAUTHORITY") or None

    def _pad_ours(self) -> set:
        """Identificadores de las apps de escritorio abiertas por QAM Rail (las de QAM, tipo MiniTube, llevan su propio mando)."""
        if qam_desktop is None:
            return set()
        return {qam_desktop.app_gameid(k) for k in set(self._claims.values()) if not str(k).startswith("qam:")}

    async def pad_mouse(self, on=None) -> dict:
        """Interruptor «mando como ratón» (activado por defecto) y estado del lector, para el panel y los diagnósticos."""
        if on is not None:
            try:
                with open(_path("pad-mouse.json"), "w", encoding="utf-8") as fh:
                    json.dump({"on": bool(on)}, fh)
            except OSError:
                pass
        st = self._pad.status() if getattr(self, "_pad", None) else {"active": False, "devices": [], "events": 0, "x": False}
        return {"ok": qam_pad is not None, "on": self._pad_enabled(), **st}

    async def get_settings(self) -> dict:
        try:
            with open(_path("settings.json"), encoding="utf-8") as fh:
                data = _clean(json.load(fh))
        except (OSError, ValueError):
            data = dict(DEFAULTS)
        if os.path.exists(_path("OWNQAM")):
            data["own_qam"] = True   # activar el piloto desde terminal: touch .../OWNQAM
        if os.path.exists(_path("DISABLE")):
            data["enabled"] = False  # apaga todo (riel y piloto)
        return data

    async def set_settings(self, data: dict) -> dict:
        clean = _clean(data if isinstance(data, dict) else {})
        tmp = _path("settings.json.tmp")
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(clean, fh, indent=2)
        os.replace(tmp, _path("settings.json"))
        return clean

    # --- Prueba de rendimiento por potencia (ver py_modules/qam_bench.py) ---
    async def bench_level(self, seconds: float) -> dict:
        if qam_bench is None:
            return {"error": "qam_bench no disponible"}
        try:
            return await qam_bench.run_level(seconds)
        except Exception as exc:  # noqa: BLE001 - la prueba nunca debe tumbar el plugin
            decky.logger.error(f"bench_level: {exc}")
            return {"error": str(exc)}

    async def diag_save(self, data: dict) -> str:
        folder = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "diag")
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, "dock-latest.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, default=str)
        return path

    async def diag_write(self, name: str, data: dict) -> str:
        """Guarda un diagnostico con nombre propio en diag/<nombre>.json (nombre saneado)."""
        safe = "".join(c for c in str(name) if c.isalnum() or c in "-_")[:60] or "diag"
        folder = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "diag")
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, f"{safe}.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, default=str)
        return path

    async def perf_append(self, lines: list) -> str:
        """Registro de rendimiento: una linea JSON por evento en diag/perf-log.jsonl (rota a .1 al pasar de 2 MB)."""
        folder = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "diag")
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, "perf-log.jsonl")
        try:
            if os.path.getsize(path) > 2_000_000:
                os.replace(path, path + ".1")
        except OSError:
            pass
        with open(path, "a", encoding="utf-8") as fh:
            for line in (lines if isinstance(lines, list) else [])[:500]:
                fh.write(json.dumps(line, default=str, separators=(",", ":")) + "\n")
        return path

    # ---- Informe unificado: una seccion por prueba, siempre la ultima, con fecha y version ----
    def _informe_path(self) -> str:
        folder = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "diag")
        os.makedirs(folder, exist_ok=True)
        return os.path.join(folder, "informe.json")

    def _informe_read(self) -> dict:
        try:
            with open(self._informe_path(), encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data, dict) and isinstance(data.get("secciones"), dict):
                # 0.22.0 guardaba «fluidezjuego-cargador» (se perdia la @): se separa base y situacion.
                for k in list(data["secciones"]):
                    for base in ("entorno", "fluidez", "juego"):
                        rest = k[len(base):]
                        if "@" not in k and k.startswith(base) and rest.split("-")[0] in ("escritorio", "juego"):
                            data["secciones"].setdefault(f"{base}@{rest}", data["secciones"][k])
                            del data["secciones"][k]
                            break
                return data
        except (OSError, ValueError):
            pass
        return {"formato": 1, "secciones": {}, "historial": []}

    def _informe_write(self, data: dict) -> str:
        path = self._informe_path()
        data["actualizado"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=1, default=str, ensure_ascii=False)
        os.replace(tmp, path)
        return path

    async def diag_section(self, key: str, data, resumen=None) -> str:
        """Guarda (sustituye) una seccion del informe. `resumen`, si llega, se anade al historial (max 30)."""
        key = "".join(c for c in str(key) if c.isalnum() or c in "-_.@")[:60] or "otros"
        inf = self._informe_read()
        prev = inf["secciones"].get(key)
        entry = {
            "fecha": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "version": getattr(decky, "DECKY_PLUGIN_VERSION", None),
            "datos": data,
        }
        # Pruebas por situacion (clave con @): se guardan las 5 ultimas de cada una (inicio del juego, jugando...).
        if "@" in key and isinstance(prev, dict) and "datos" in prev:
            older = prev.get("anteriores") if isinstance(prev.get("anteriores"), list) else []
            entry["anteriores"] = ([{k: prev.get(k) for k in ("fecha", "version", "datos")}] + older)[:4]
        inf["secciones"][key] = entry
        if resumen is not None:
            hist = inf.get("historial") if isinstance(inf.get("historial"), list) else []
            hist.append({"seccion": key, "fecha": inf["secciones"][key]["fecha"], "version": inf["secciones"][key]["version"], "resumen": resumen})
            inf["historial"] = hist[-30:]
        return self._informe_write(inf)

    async def diag_index(self) -> dict:
        """Que hay en el informe: seccion -> fecha y version (sin los datos)."""
        inf = self._informe_read()
        return {k: {"fecha": v.get("fecha"), "version": v.get("version"), "veces": 1 + len(v.get("anteriores") or []),
                    "versiones": sorted({str(x.get("version")) for x in [v, *(v.get("anteriores") or [])]})} for k, v in inf["secciones"].items() if isinstance(v, dict)}

    async def diag_clear(self) -> bool:
        """Vacia el informe y el registro (conserva el historial de pruebas de fluidez)."""
        inf = self._informe_read()
        self._informe_write({"formato": 1, "secciones": {}, "historial": inf.get("historial", [])})
        for name in ("perf-log.jsonl", "perf-log.jsonl.1"):
            try:
                os.remove(os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "diag", name))
            except OSError:
                pass
        return True

    def _migrate_legacy_diag(self) -> None:
        """Los .json sueltos de versiones anteriores pasan al informe (si no hay ya algo mas nuevo) y a diag/antiguos/."""
        folder = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "diag")
        if not os.path.isdir(folder):
            return
        legacy = {"potencia-minima": "potencia-minima", "decky-explorar": "decky", "amigos-diagnostico": "amigos", "dock-latest": "dock"}
        inf = self._informe_read()
        moved = False
        for fname in sorted(os.listdir(folder)):
            stem, ext = os.path.splitext(fname)
            if ext != ".json" or stem == "informe":
                continue
            key = legacy.get(stem) or ("fluidez" if stem.startswith("perf-bench-") else None)
            path = os.path.join(folder, fname)
            if key:
                try:
                    with open(path, encoding="utf-8") as fh:
                        data = json.load(fh)
                    fecha = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(os.path.getmtime(path)))
                    if key == "amigos" and isinstance(data, dict) and isinstance(data.get("pasos"), dict):
                        items = [(f"amigos.{k}", v) for k, v in data["pasos"].items()]
                    else:
                        items = [(key, data)]
                    for k, v in items:
                        old = inf["secciones"].get(k)
                        if not isinstance(old, dict) or str(old.get("fecha", "")) < fecha:
                            inf["secciones"][k] = {"fecha": fecha, "version": "anterior", "datos": v}
                except (OSError, ValueError):
                    pass
            os.makedirs(os.path.join(folder, "antiguos"), exist_ok=True)
            os.replace(path, os.path.join(folder, "antiguos", fname))
            moved = True
        if moved:
            self._informe_write(inf)

    async def diag_bundle(self, resumen=None) -> dict:
        """Zip con lo ULTIMO de cada prueba: resumen.json (estado ahora), informe.json, indice.txt y el registro.
        Queda en la carpeta personal; se conservan los 3 zips mas recientes."""
        import shutil
        import tempfile
        self._migrate_legacy_diag()
        home = getattr(decky, "DECKY_USER_HOME", None) or os.path.expanduser("~")
        name = time.strftime("qam-rail-diagnostico-%Y%m%d-%H%M%S")
        base = os.path.join(home, name)
        folder = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "diag")
        inf = self._informe_read()
        files = []
        with tempfile.TemporaryDirectory() as tmp:
            def put(fname: str, data) -> None:
                with open(os.path.join(tmp, fname), "w", encoding="utf-8") as fh:
                    if isinstance(data, str):
                        fh.write(data)
                    else:
                        json.dump(data, fh, indent=1, default=str, ensure_ascii=False)
                files.append(fname)
            if resumen is not None:
                put("resumen.json", resumen)
            put("informe.json", inf)
            # Migas de la sesion actual (que se hizo hoy en el panel: abrir, música, bluetooth, calma...).
            try:
                put("migas-sesion.json", (self._session_read() or {}).get("crumbs") or [])
            except Exception:  # noqa: BLE001
                pass
            lines = [f"QAM Rail {getattr(decky, 'DECKY_PLUGIN_VERSION', '?')} · diagnostico {time.strftime('%Y-%m-%d %H:%M:%S')}", ""]
            for k in sorted(inf["secciones"]):
                v = inf["secciones"][k]
                n = 1 + len(v.get("anteriores") or [])
                lines.append(f"{k:<34} {v.get('fecha', '?')}  (version {v.get('version', '?')}){f'  ·  {n} pruebas' if n > 1 else ''}")
            if not inf["secciones"]:
                lines.append("(el informe esta vacio: usa Mas › Diagnostico › Ejecutar todo)")
            put("indice.txt", "\n".join(lines) + "\n")
            for log in ("perf-log.jsonl", "perf-log.jsonl.1"):
                src = os.path.join(folder, log)
                if os.path.isfile(src):
                    shutil.copy(src, os.path.join(tmp, log))
                    files.append(log)
            path = shutil.make_archive(base, "zip", tmp)
        try:
            old = sorted(f for f in os.listdir(home) if f.startswith("qam-rail-diagnostico-") and f.endswith(".zip"))
            for f in old[:-3]:
                os.remove(os.path.join(home, f))
        except OSError:
            pass
        try:
            import pwd
            user = getattr(decky, "DECKY_USER", None)
            if user:
                pw = pwd.getpwnam(user)
                os.chown(path, pw.pw_uid, pw.pw_gid)
        except Exception:  # noqa: BLE001 - el permiso es opcional
            pass
        return {"path": path, "files": files, "folder": os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "diag")}

    # ---- Apps de QAM Rail (ver py_modules/qam_apps.py) ----
    def _apps_reg(self) -> dict:
        try:
            with open(_path("apps.json"), encoding="utf-8") as fh:
                data = json.load(fh)
            return data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            return {}

    def _apps_reg_save(self, reg: dict) -> None:
        tmp = _path("apps.json.tmp")
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(reg, fh, indent=1)
        os.replace(tmp, _path("apps.json"))

    async def apps_list(self) -> dict:
        if qam_apps is None:
            return {"dir": _apps_dir(), "apps": [], "error": "qam_apps no disponible"}
        reg = self._apps_reg()
        extra = [v.get("path") for v in reg.values() if isinstance(v, dict) and v.get("external")]
        apps = qam_apps.list_apps(_apps_dir(), [p for p in extra if p])
        for a in apps:
            r = reg.get(a["id"]) or {}
            a["steam_appid"] = r.get("appid")
            a["installed_at"] = r.get("installed_at")
            a["bad_versions"] = r.get("bad_versions") or []
            a["last_error"] = r.get("last_error")
            prev = None if a.get("external") else qam_apps.previous_manifest(_apps_dir(), a["id"])
            a["previous_version"] = (prev or {}).get("version") if prev else None
            a["has_previous"] = bool(prev)
            a["check"] = qam_apps.check_manifest(a, getattr(decky, "DECKY_PLUGIN_VERSION", None), _home())
        return {"dir": _apps_dir(), "apps": apps}

    async def apps_find_zips(self) -> list:
        if qam_apps is None:
            return []
        home = _home()
        roots = [os.path.join(home, d) for d in ("Downloads", "Descargas", "Games", "Desktop", "Escritorio")]
        return await asyncio.to_thread(qam_apps.find_zips, roots)

    async def apps_install(self, source: str, confirmed: bool = False, sha256: str = "", force: bool = False) -> dict:
        """Instala/actualiza desde un .zip o una carpeta. Corre en segundo plano: ver apps_job().
        Primera instalacion de una app con instalador propio: el trabajo queda en «confirm» hasta apps_confirm()."""
        if qam_apps is None or qam_pipeline is None:
            return {"ok": False, "error": "qam_apps no disponible"}
        job = getattr(self, "_apps_job", None)
        if job and job.get("state") in ("running", "confirm"):
            return {"ok": False, "error": "ya hay una instalacion en marcha"}
        self._apps_job = {"state": "running", "step": "verificando y preparando", "source": str(source), "started": time.time(), "force": bool(force)}
        asyncio.get_running_loop().create_task(self._apps_install_task(str(source), bool(confirmed), str(sha256 or "")))
        return {"ok": True, "started": True}

    # ---- Canales estable / dev (0.53; py_modules/qam_channel.py) ----
    async def channel_info(self) -> dict:
        """Qué plugin soy, cuál es el activo y qué hay instalado. El inactivo no dibuja nada y ofrece activarse."""
        if qam_channel is None:
            return {"me": "stable", "active": "stable", "dev_installed": False, "stable_installed": True,
                    "version": getattr(decky, "DECKY_PLUGIN_VERSION", None), "notice": None}
        me, act = _me(), _active()
        return {"me": me, "active": act, "dev_installed": qam_channel.installed(_plugins_dir(), "dev"),
                "stable_installed": qam_channel.installed(_plugins_dir(), "stable"),
                "version": getattr(decky, "DECKY_PLUGIN_VERSION", None),
                "notice": qam_channel.take_notice(_chan_dir()) if me == act else None}

    async def channel_switch(self, target: str) -> dict:
        """Cambia el plugin activo y reinicia Decky (el otro plugin se queda en pausa)."""
        if qam_channel is None:
            return {"ok": False, "error": "no disponible"}
        r = qam_channel.switch(_chan_dir(), _plugins_dir(), str(target))
        if r.get("ok"):
            self._restart_decky_later(3)
            r["restarting"] = True
        return r

    async def channel_ok(self) -> bool:
        """El panel ya está montado y aguantó unos segundos: este arranque cuenta como bueno (solo importa en dev)."""
        if qam_channel is not None and _me() == "dev":
            qam_channel.confirm(decky.DECKY_PLUGIN_SETTINGS_DIR)
        return True

    # ---- Auto-actualización de QAM Rail (0.52; py_modules/qam_self.py) ----
    SELF_REPO = "pascaltll/qam-rail"

    def _self_cfg(self) -> dict:
        try:
            with open(_path("self-update.json"), encoding="utf-8") as fh:
                d = json.load(fh)
            return d if isinstance(d, dict) else {}
        except (OSError, ValueError):
            return {}

    def _self_cfg_save(self, cfg: dict) -> None:
        tmp = _path("self-update.json.tmp")
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(cfg, fh)
        os.replace(tmp, _path("self-update.json"))

    async def self_info(self) -> dict:
        cfg = self._self_cfg()
        bl = qam_self.backups(_path("backups")) if qam_self else []
        return {"version": getattr(decky, "DECKY_PLUGIN_VERSION", None), "channel": "beta" if cfg.get("channel") == "beta" else "stable",
                "kind": _me(), "last_check": cfg.get("last_check"), "backup_version": bl[0][1] if bl else None, "repo": self.SELF_REPO}

    async def self_set_channel(self, channel: str) -> dict:
        cfg = self._self_cfg()
        cfg["channel"] = "beta" if channel == "beta" else "stable"
        self._self_cfg_save(cfg)
        return await self.self_info()

    async def self_check(self, force: bool = False) -> dict:
        """¿Hay versión nueva de QAM Rail? Misma regla que las apps: ETag, 6 h salvo force, solo avisa."""
        if _me() == "dev":
            return {"state": "off", "error": "versión de desarrollo: se actualiza con install.sh --dev"}
        if qam_updates is None:
            return {"state": "error", "error": "no disponible"}
        cfg = self._self_cfg()
        app = {"id": "qam-rail", "version": getattr(decky, "DECKY_PLUGIN_VERSION", None),
               "update": {"provider": "github-release", "repo": self.SELF_REPO, "asset": "qam-rail-[0-9]*.zip",
                          "channel": "beta" if cfg.get("channel") == "beta" else "stable"}}
        cache = self._upd_cache()
        c = cache.setdefault("qam-rail", {})
        res = await asyncio.to_thread(qam_updates.check_app, app, c, self._http, None, bool(force))
        try:
            tmp = _path("updates.json.tmp")
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(cache, fh)
            os.replace(tmp, _path("updates.json"))
            cfg["last_check"] = int(time.time())
            self._self_cfg_save(cfg)
        except OSError:
            pass
        return res

    @staticmethod
    def _restart_decky_later(seconds: int = 3) -> None:
        """Reinicia plugin_loader sin esperar (este proceso muere con él): desligado de la sesión, con retraso para responder antes."""
        import subprocess
        subprocess.Popen(["/bin/sh", "-c", f"sleep {int(seconds)}; systemctl restart plugin_loader"], start_new_session=True,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    async def self_update(self) -> dict:
        """Descarga la release, la verifica (SHA-256 obligatorio), guarda copia, cambia la carpeta y reinicia Decky."""
        import shutil
        import tempfile
        if _me() == "dev":
            return {"ok": False, "error": "la versión dev no se actualiza desde GitHub (usa install.sh --dev)"}
        if qam_self is None or qam_updates is None or qam_pipeline is None:
            return {"ok": False, "error": "no disponible"}
        if getattr(self, "_self_busy", False):
            return {"ok": False, "error": "ya hay una actualización en marcha"}
        res = await self.self_check(False)
        if res.get("state") != "update":
            return {"ok": False, "error": "no hay una versión nueva"}
        if not res.get("sums_url"):
            return {"ok": False, "error": "la release no trae SHA256SUMS: no se instala sin verificar"}
        plugin_dir = getattr(decky, "DECKY_PLUGIN_DIR", None)
        if not plugin_dir or os.path.basename(plugin_dir.rstrip(os.sep)) != qam_self.PLUGIN_DIRNAME:
            return {"ok": False, "error": "carpeta del plugin no reconocida"}
        self._self_busy = True
        work = tempfile.mkdtemp(prefix=".qam-rail-upd-", dir=os.path.dirname(plugin_dir.rstrip(os.sep)))
        try:
            dest = os.path.join(work, os.path.basename(res["name"]))
            await asyncio.to_thread(qam_updates.download, res["url"], dest, self._opener)
            st, _, sums_text = await asyncio.to_thread(self._http, res["sums_url"], None)
            want = qam_pipeline.parse_sums(sums_text).get(res["name"]) if st == 200 else None
            if not want:
                raise ValueError("no se pudo verificar la descarga (SHA256SUMS)")
            v = await asyncio.to_thread(qam_pipeline.verify, dest, want)
            if not v.get("ok"):
                raise ValueError(v.get("error") or "la descarga no coincide con su SHA-256")
            root = await asyncio.to_thread(qam_self.stage, dest, os.path.join(work, "x"), res.get("latest"))
            r = await asyncio.to_thread(qam_self.swap, plugin_dir, root, _path("backups"), 3)
            self._restart_decky_later(3)
            return {"ok": True, "restarting": True, **r}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)[:200]}
        finally:
            self._self_busy = False
            shutil.rmtree(work, ignore_errors=True)

    async def self_rollback(self) -> dict:
        """Vuelve a la copia de seguridad más reciente y reinicia Decky."""
        if _me() == "dev":
            return {"ok": False, "error": "en dev las copias las gestiona install.sh"}
        if qam_self is None:
            return {"ok": False, "error": "no disponible"}
        plugin_dir = getattr(decky, "DECKY_PLUGIN_DIR", None)
        try:
            r = await asyncio.to_thread(qam_self.restore, plugin_dir, _path("backups"))
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)[:200]}
        self._restart_decky_later(3)
        return {"ok": True, "restarting": True, **r}

    # ---- Apps de escritorio (pestaña «Steam» de Apps, 0.52 a; py_modules/qam_desktop.py) ----
    async def desktop_scan(self, force: bool = False) -> dict:
        """Lista las apps de escritorio (Flatpak, AppImage de Gear Lever o sueltos, sistema). Solo lee; caché de 10 min."""
        if qam_desktop is None:
            return {"ok": False, "apps": [], "error": "qam_desktop no disponible"}
        c = getattr(self, "_desk_cache", None)
        if c and not force and time.time() - c["t"] < 600:
            return c["data"]
        t0 = time.time()
        try:
            r = await asyncio.to_thread(qam_desktop.scan, _home())
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "apps": [], "error": str(e)[:160]}
        data = {"ok": True, **r, "ms": int((time.time() - t0) * 1000)}
        self._desk_cache = {"t": time.time(), "data": data}
        return data

    async def _desk_find(self, key: str):
        data = await self.desktop_scan(False)
        return next((a for a in data.get("apps", []) if a.get("key") == key), None)

    async def desktop_plan(self, key: str) -> dict:
        """Cómo lanzar una app de escritorio (ejecutable, opciones, carpeta, pantalla completa en navegadores Chromium) y su icono."""
        if qam_desktop is None:
            return {"ok": False, "error": "no disponible"}
        app = await self._desk_find(str(key))
        if not app:
            return {"ok": False, "error": "esa app ya no está"}
        try:
            plan = qam_desktop.launch_plan(app, home=_home())
        except ValueError as e:
            return {"ok": False, "error": str(e)}
        if plan.get("browser"):
            plan["argv"] = qam_desktop.apply_opts(plan["argv"], plan["browser"], self._desk_opts().get(str(key)))
        return {"ok": True, "name": app["name"], "source": app["source"], "icon_path": qam_desktop.icon_path(app.get("icon"), _home()), **plan}

    async def _user_session(self) -> tuple[list, dict]:
        """(prefijo para ejecutar como el usuario de la sesión, variables de su gestor systemd --user). Se guarda 60 s: antes cada orden lanzaba
        además `runuser … systemctl show-environment` (media docena de procesos de más cada vez que se abría el panel con una app abierta)."""
        c = getattr(self, "_sess_c", None)
        if c and time.monotonic() - c[0] < 60:
            return list(c[1]), dict(c[2])
        prefix, seen = await self._user_session_fresh()
        if seen:
            self._sess_c = (time.monotonic(), list(prefix), dict(seen))
        return prefix, seen

    async def _user_session_fresh(self) -> tuple[list, dict]:
        prefix: list = []
        env_pairs: list = []
        if os.getuid() == 0:
            user = getattr(decky, "DECKY_USER", "") or ""
            if user and user != "root":
                try:
                    import pwd
                    uid = pwd.getpwnam(user).pw_uid
                    run = f"/run/user/{uid}"
                    env_pairs = [f"XDG_RUNTIME_DIR={run}", f"DBUS_SESSION_BUS_ADDRESS=unix:path={run}/bus", f"HOME={_home()}"]
                    prefix = ["runuser", "-u", user, "--", "env", *env_pairs]
                except (KeyError, ImportError):
                    pass
        seen: dict = {}
        try:
            proc = await asyncio.create_subprocess_exec(*prefix, "systemctl", "--user", "show-environment", env=self._user_env(),
                                                        stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
            out, _ = await asyncio.wait_for(proc.communicate(), 3)
            for line in out.decode("utf-8", "replace").splitlines():
                k, _, v = line.partition("=")
                seen[k] = v
        except (OSError, asyncio.TimeoutError):
            pass
        return prefix, seen

    def _spawn(self, coro) -> None:
        t = asyncio.ensure_future(coro)
        self._bg_tasks = getattr(self, "_bg_tasks", set())
        self._bg_tasks.add(t)
        t.add_done_callback(self._bg_tasks.discard)

    @property
    def _claims(self) -> dict:
        if not hasattr(self, "_claims_v"):
            self._claims_v = {}
        return self._claims_v

    @property
    def _qam_keys(self) -> set:
        if not hasattr(self, "_qam_keys_v"):
            self._qam_keys_v = set()
        return self._qam_keys_v

    @property
    def _desk_classes(self) -> dict:
        if not hasattr(self, "_desk_classes_v"):
            self._desk_classes_v = {}
        return self._desk_classes_v

    @staticmethod
    def _desk_unit(key: str) -> str:
        import hashlib
        return "qam-desk-" + hashlib.sha1(str(key).encode()).hexdigest()[:12]

    async def _systemctl_user(self, *args: str) -> tuple[int, str]:
        prefix, _ = await self._user_session()
        try:
            proc = await asyncio.create_subprocess_exec(*prefix, "systemctl", "--user", *args, env=self._user_env(), stdin=asyncio.subprocess.DEVNULL,
                                                        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
            out, _ = await asyncio.wait_for(proc.communicate(), 8)
            return proc.returncode or 0, out.decode("utf-8", "replace")
        except (OSError, asyncio.TimeoutError):
            return 1, ""

    def _icon_data(self, a: dict) -> str | None:
        """Icono de una app de escritorio como data URL (con caché: se pide cada pocos segundos)."""
        import base64
        cache = self.__dict__.setdefault("_icon_cache", {})
        k = a.get("key")
        if k in cache:
            return cache[k]
        icon = None
        p = qam_desktop.icon_path(a.get("icon"), _home()) if qam_desktop else None
        if p and os.path.getsize(p) < 1_500_000:
            try:
                with open(p, "rb") as fh:
                    low = p.lower()
                    kind = "svg+xml" if low.endswith(".svg") else "jpeg" if low.endswith((".jpg", ".jpeg")) else "png"
                    icon = f"data:image/{kind};base64," + base64.b64encode(fh.read()).decode()
            except OSError:
                icon = None
        cache[k] = icon
        return icon

    ICON_LIST_MAX = 200_000  # bytes: en listas, un icono mayor se queda con su letra

    def _icon_small(self, a: dict) -> str | None:
        """Icono pequeño (≤200 KB) de una app para las listas del menú de apps. Caché propia: se lee una vez por app y sesión."""
        import base64
        cache = self.__dict__.setdefault("_icon_small_cache", {})
        k = a.get("key")
        if k in cache:
            return cache[k]
        icon = None
        p = qam_desktop.icon_path(a.get("icon"), _home(), sizes=qam_desktop.ICON_SIZES_SMALL) if qam_desktop else None
        try:
            if p and os.path.getsize(p) <= self.ICON_LIST_MAX:
                with open(p, "rb") as fh:
                    low = p.lower()
                    kind = "svg+xml" if low.endswith(".svg") else "jpeg" if low.endswith((".jpg", ".jpeg")) else "png"
                    icon = f"data:image/{kind};base64," + base64.b64encode(fh.read()).decode()
        except OSError:
            icon = None
        cache[k] = icon
        return icon

    async def desktop_icons(self, keys: list) -> dict:
        """Iconos pequeños (data URL o null) de las apps pedidas, máx. 24 por llamada. Lo pide el menú de apps solo para las filas que muestra."""
        if qam_desktop is None or not isinstance(keys, list):
            return {}
        data = await self.desktop_scan(False)
        by = {a.get("key"): a for a in data.get("apps", [])}
        want = [by[k] for k in keys[:24] if isinstance(k, str) and k in by]
        return await asyncio.to_thread(lambda: {a["key"]: self._icon_small(a) for a in want})

    async def _live_claim_keys(self) -> set:
        """Claves de apps de escritorio con alguna ventana marcada que sigue abierta (apps que delegan en otro proceso, como KDE Connect,
        terminan su unidad al instante y la ventana vive aparte)."""
        claims = {w: k for w, k in self._claims.items() if not str(k).startswith("qam:")}
        if not claims:
            return set()
        try:
            prefix, seen = await self._user_session()
            self._xauth = seen.get("XAUTHORITY") or None
            alive = {w["id"] for w in await self._x_windows(prefix, seen.get("DISPLAY") or ":0")}
        except Exception:
            return set()
        for w in [w for w in self._claims if w not in alive]:
            self._claims.pop(w, None)
        return {k for w, k in claims.items() if w in alive}

    async def desktop_running(self) -> dict:
        """Apps de escritorio que QAM Rail abrió y siguen abiertas (unidad activa o ventana viva), con nombre e icono para gestionarlas.
        Resultado válido 1,5 s y una sola ejecución a la vez: al abrir el panel lo pedían a la vez la franja, la fila de apps y el modo overlay
        (unos seis procesos cada uno). Abrir, cerrar o minimizar una app lo invalida."""
        c = getattr(self, "_run_c", None)
        if c and time.monotonic() - c[0] < 1.5:
            return dict(c[1])
        t = getattr(self, "_run_t", None)
        if t is None or t.done():
            t = self._run_t = asyncio.ensure_future(self._desktop_running_now())
        r = await asyncio.shield(t)
        self._run_c = (time.monotonic(), r)
        return dict(r)

    async def _desktop_running_now(self) -> dict:
        t0 = time.monotonic()
        try:
            return await self._desktop_running_scan()
        finally:
            dt = time.monotonic() - t0
            if dt > 0.25:
                self._tag_log(f"  lento: desktop_running {int(dt * 1000)} ms")

    async def _desktop_running_scan(self) -> dict:
        code, out = await self._systemctl_user("list-units", "qam-desk-*", "--state=active,activating", "--plain", "--no-legend", "--no-pager")
        units = {ln.split()[0].removesuffix(".service") for ln in out.splitlines() if ln.strip() and ln.split()[0].startswith("qam-desk-")} if code == 0 else set()
        live = await self._live_claim_keys() | await self._flatpak_running()
        if not units and not live:
            return {"keys": [], "apps": []}
        data = await self.desktop_scan(False)
        apps = [a for a in data.get("apps", []) if self._desk_unit(a.get("key", "")) in units or a.get("key") in live]
        return {"keys": [a["key"] for a in apps],
                "apps": [{"key": a["key"], "name": a.get("name", a["key"]), "source": a.get("source", ""), "icon": self._icon_data(a)} for a in apps]}

    async def _flatpak_running(self) -> set:
        """Apps Flatpak en marcha según `flatpak ps` (cubre las abiertas fuera de QAM Rail o que reenviaron a una instancia previa, p. ej. Edge)."""
        try:
            prefix, _seen = await self._user_session()
            proc = await asyncio.create_subprocess_exec(*prefix, "flatpak", "ps", "--columns=application", env=self._user_env(), stdin=asyncio.subprocess.DEVNULL,
                                                        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
            out, _ = await asyncio.wait_for(proc.communicate(), 5)
            return {ln.strip() for ln in out.decode("utf-8", "replace").splitlines() if re.fullmatch(r"[A-Za-z0-9_.-]{3,120}", ln.strip())}
        except Exception:
            return set()

    async def _flatpak_kill(self, key: str) -> bool:
        """Apps Flatpak: `flatpak kill <id>` cierra TODAS sus instancias aunque no estén en nuestra unidad (el navegador reenvía a la que ya había)."""
        app = await self._desk_find(str(key))
        if not app or app.get("source") != "flatpak" or not re.fullmatch(r"[A-Za-z0-9_.-]{3,120}", str(key)):
            return False
        try:
            prefix, _seen = await self._user_session()
            proc = await asyncio.create_subprocess_exec(*prefix, "flatpak", "kill", str(key), env=self._user_env(), stdin=asyncio.subprocess.DEVNULL,
                                                        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
            return (await asyncio.wait_for(proc.wait(), 5)) == 0
        except Exception:
            return False

    async def _kill_windows_of(self, key: str, sig: int) -> int:
        """Señal a los procesos dueños de las ventanas marcadas de la app (para las que escapan de su unidad). Nunca a PIDs < 100 (hilos del núcleo)."""
        wids = [w for w, k in self._claims.items() if k == key]
        if not wids:
            return 0
        prefix, seen = await self._user_session()
        display = seen.get("DISPLAY") or ":0"
        self._xauth = seen.get("XAUTHORITY") or None
        n = 0
        for pid in {pid for pid in [await self._win_pid(prefix, display, w) for w in wids] if pid and pid >= 100 and pid != os.getpid()}:
            try:
                os.kill(pid, sig)
                n += 1
            except OSError:
                pass
        return n

    async def desktop_stop(self, key: str) -> dict:
        """Cierra la app que abrió QAM Rail: para su unidad (termina todos sus procesos) y, si su ventana vive en otro proceso, le envía SIGTERM."""
        self._run_c = None
        import signal
        unit = self._desk_unit(key) + ".service"
        code, out = await self._systemctl_user("stop", unit)
        n = await self._kill_windows_of(key, signal.SIGTERM)
        if await self._flatpak_kill(key):
            n += 1
        await self._base_off(key)
        self._tl("app.cerrar", app=str(key)[:30], ventanas=n, codigo=code)
        if n:
            await asyncio.sleep(0.8)
            await self._live_claim_keys()
        return {"ok": code == 0 or n > 0, "error": out.strip().splitlines()[-1][:120] if code and not n and out.strip() else None}

    async def _base_off(self, key: str) -> None:
        """Quita la app de la capa base de gamescope (al cerrarla) para que vuelva a verse Steam."""
        if qam_desktop is None:
            return
        try:
            prefix, seen = await self._user_session()
            self._xauth = seen.get("XAUTHORITY") or None
            await self._base_layer(prefix, seen.get("DISPLAY") or ":0", key, False)
        except Exception:
            pass

    async def _x_run(self, prefix: list, display: str, *cmd: str) -> tuple[int, str, str]:
        env_extra = [f"DISPLAY={display}"]
        xa = getattr(self, "_xauth", None)
        if xa:
            env_extra.append(f"XAUTHORITY={xa}")
        try:
            proc = await asyncio.create_subprocess_exec(*prefix, "env", *env_extra, *cmd, env=self._user_env(), stdin=asyncio.subprocess.DEVNULL,
                                                        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            out, err = await asyncio.wait_for(proc.communicate(), 3)
            return proc.returncode or 0, out.decode("utf-8", "replace"), err.decode("utf-8", "replace")
        except (OSError, asyncio.TimeoutError) as e:
            return 127, "", str(e)[:120]

    async def _open_url(self, url: str, key: str = "") -> None:
        """Abre una dirección como el usuario de la sesión (sin pasar por la barra de direcciones del navegador). No espera a que el navegador acabe.
        Con xdg-open (el navegador predeterminado); pero si la app de delante es un Chromium/Edge en Flatpak se abre en ELLA (`flatpak run <id> <url>`),
        porque si no la prueba cargaría la página en otro navegador."""
        prefix, seen = await self._user_session()
        if key and re.fullmatch(r"[A-Za-z0-9_.-]{3,120}", key) and qam_desktop is not None and qam_desktop.CHROMIUM_RE.search(key):
            app = await self._desk_find(key)
            if app and app.get("source") == "flatpak":
                proc = await asyncio.create_subprocess_exec(*prefix, "flatpak", "run", key, url, env=self._user_env(), stdin=asyncio.subprocess.DEVNULL,
                                                            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL, start_new_session=True)
                try:
                    await asyncio.wait_for(proc.wait(), 4)
                except asyncio.TimeoutError:
                    pass
                return
        env_extra = [f"DISPLAY={seen.get('DISPLAY') or ':0'}"]
        if seen.get("XAUTHORITY"):
            env_extra.append(f"XAUTHORITY={seen['XAUTHORITY']}")
        proc = await asyncio.create_subprocess_exec(*prefix, "env", *env_extra, "xdg-open", url, env=self._user_env(), stdin=asyncio.subprocess.DEVNULL,
                                                    stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL, start_new_session=True)
        try:
            await asyncio.wait_for(proc.wait(), 4)
        except asyncio.TimeoutError:
            pass   # el navegador sigue vivo detrás: no es un error

    def _tag_log(self, text: str) -> None:
        tr = getattr(self, "_trace_v", None)
        if tr is not None and tr.on:
            tr.add("app", t=text.strip()[:160])
        try:
            with open(_path("desktop-tag.log"), "a", encoding="utf-8") as fh:
                fh.write(time.strftime("%H:%M:%S ") + text + "\n")
            if os.path.getsize(_path("desktop-tag.log")) > 60_000:
                os.replace(_path("desktop-tag.log"), _path("desktop-tag.log.old"))
        except OSError:
            pass

    async def _x_windows(self, prefix: list, display: str) -> list:
        if qam_desktop is None:
            return []
        rc, out, err = await self._x_run(prefix, display, "xwininfo", "-root", "-children")
        if rc != 0:
            self._tag_log(f"xwininfo falló (código {rc}): {err.strip()[:160]}")
            return []
        return qam_desktop.parse_xwininfo(out)

    async def _base_layer(self, prefix: list, display: str, key: str, on: bool) -> None:
        """Steam decide qué app muestra gamescope con la propiedad GAMESCOPECTRL_BASELAYER_APPID de la raíz (p. ej. «413091, 769»: la primera con ventana).
        Poner la nuestra delante la muestra por encima de Steam (el QAM sigue encima); quitarla vuelve a Steam."""
        gid = qam_desktop.app_gameid(key)
        rc, out, err = await self._x_run(prefix, display, "xprop", "-root", qam_desktop.BASELAYER)
        cur = qam_desktop.parse_baselayer(out) if rc == 0 else []
        new = qam_desktop.baselayer_with(cur, gid) if on else qam_desktop.baselayer_without(cur, gid)
        if new == cur:
            return
        rc2, _o, err2 = await self._x_run(prefix, display, "xprop", "-root", "-f", qam_desktop.BASELAYER, "32c", "-set", qam_desktop.BASELAYER, ", ".join(str(x) for x in new))
        self._tag_log(f"  capa base {'+' if on else '-'}{gid}: {cur} → {new} (código {rc2} {err2.strip()[:80]})")

    async def _win_pid(self, prefix: list, display: str, wid: str) -> int | None:
        rc, out, _e = await self._x_run(prefix, display, "xprop", "-id", wid, "_NET_WM_PID")
        m = re.search(r"=\s*(\d+)", out) if rc == 0 else None
        return int(m.group(1)) if m else None

    @staticmethod
    def _app_patterns(app: dict) -> list:
        """Trozos de orden que identifican los procesos de una app de QAM. Bazzite enlaza /home → /var/home, así que se usan la ruta real,
        la dada y «qam-apps/<carpeta>/» (con barra final: «forgeinator/» no casa con «forgeinator-dev/»)."""
        path = str(app.get("path") or "")
        out = []
        for q in (os.path.realpath(path), path):
            if q and q.rstrip("/") + "/" not in out:
                out.append(q.rstrip("/") + "/")
        base = os.path.basename(path.rstrip("/"))
        if base:
            out.append(f"qam-apps/{base}/")
        return out

    async def _app_pids(self, patterns) -> set:
        """PIDs de los procesos cuya orden contiene alguno de los trozos (para saber qué ventana es de la app)."""
        pats = [patterns] if isinstance(patterns, str) else list(patterns)
        pids: set = set()
        for pat in pats:
            try:
                proc = await asyncio.create_subprocess_exec("pgrep", "-f", "--", re.escape(pat), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
                out, _ = await asyncio.wait_for(proc.communicate(), 3)
                pids |= {int(x) for x in out.decode().split() if x.isdigit()}
            except Exception:
                pass
        pids.discard(os.getpid())
        return pids

    async def _desk_tag(self, key: str, prefix: list, display: str, before: set, path=None) -> None:
        """Game Mode (gamescope) solo muestra ventanas con la propiedad STEAM_GAME: se la ponemos a las ventanas de la app durante ~20 s.
        Apps de QAM (`path`): se reconocen por el PID de la ventana (también si ya estaba abierta). Apps de escritorio: ventanas nuevas.
        Una ventana ya marcada por otra app no se toca."""
        known = self._desk_classes.setdefault(str(key), set())
        claims = self._claims
        done: set = set()
        pidcache: dict = {}
        self._tag_log(f"== {key}: ventanas antes {len(before)}, clases conocidas {sorted(known)}" + (f", por PID ({path})" if path else ""))
        for i in range(28):
            await asyncio.sleep(0.7)
            wins = await self._x_windows(prefix, display)
            alive = {w["id"] for w in wins}
            for k in [k for k in claims if k not in alive]:
                claims.pop(k, None)
            nosteam = [w for w in wins if not any(re.search(r"steam|mangoapp|gamescope", c or "", re.I) for c in w["classes"])]
            if path:
                pids = await self._app_pids(path)
                pick = []
                for w in nosteam:
                    if min(w["w"], w["h"]) < 200:
                        continue
                    if w["id"] not in pidcache:
                        pidcache[w["id"]] = await self._win_pid(prefix, display, w["id"])
                    if pidcache[w["id"]] in pids:
                        pick.append(w)
            else:
                nosteam_ids = {w["id"] for w in nosteam}
                pick = [w for w in qam_desktop.windows_to_tag(wins, before, known) if w["id"] in nosteam_ids]
            pick = [w for w in pick if claims.get(w["id"], key) == key]
            if i in (0, 5, 13, 27):
                self._tag_log(f"  intento {i}: {len(wins)} ventanas, a marcar {[w['id'] for w in pick]}")
            for w in pick:
                if w["id"] in done:
                    continue
                done.add(w["id"])
                claims[w["id"]] = key
                known.update(c for c in w["classes"] if c)
                rc, _o, err = await self._x_run(prefix, display, "xprop", "-id", w["id"], "-f", "STEAM_GAME", "32c", "-set", "STEAM_GAME", str(qam_desktop.app_gameid(key)))
                _rc2, chk, _e = await self._x_run(prefix, display, "xprop", "-id", w["id"], "STEAM_GAME")
                self._tag_log(f"  {w['id']} {w['classes']} {w['w']}x{w['h']}: xprop código {rc} {err.strip()[:100]} → {chk.strip()[:60]}")
                await self._fit_window(w["id"], str(key))
                if qam_desktop.auto_fullscreen_key(str(key)):
                    asyncio.ensure_future(self._auto_fs(w["id"], str(key)))
                await self._base_layer(prefix, display, key, True)
            if done and i % 5 == 4:
                await self._base_layer(prefix, display, key, True)  # Steam puede reescribir la lista: se vuelve a poner delante

    async def _auto_fs(self, wid, key: str) -> None:
        """Una vez por ventana nueva: espera a que la app cargue y le manda su tecla de pantalla completa (Stremio: F11). Sin verificar en el equipo."""
        k = qam_desktop.auto_fullscreen_key(key)
        try:
            n = int(str(wid), 0)
            done = self.__dict__.setdefault("_fs_done", set())
            if n in done:
                return
            done.add(n)
            await asyncio.sleep(3.5)
            x = await self._kx()
            if x.geometry(n) is None:
                return
            x.focus(n)
            x.key(k)
            x.flush()
            self._tag_log(f"  {wid}: pantalla completa automática ({k})")
        except Exception as e:  # noqa: BLE001
            self._tag_log(f"  {wid}: pantalla completa automática falló ({e})")

    async def _fit_window(self, wid, key: str = "") -> bool:
        """Ventana de app de escritorio a pantalla completa (gamescope las centra con su tamaño propio, p. ej. Stremio a medias). Solo si es más pequeña."""
        if qam_desktop.is_browser_key(key):  # los navegadores ya arrancan a pantalla completa/maximizados: no se tocan
            return False
        try:
            n = int(str(wid), 0)
            x = await self._kx()
            w, h = x.screen_size()
            g = x.geometry(n)
            if g and (g[0] < w or g[1] < h):
                x.resize(n, w, h)
                self._tag_log(f"  {wid}: ajustada a pantalla completa {g[0]}x{g[1]} → {w}x{h}")
                return True
        except Exception as e:  # noqa: BLE001 — solo estética: nunca debe romper el abrir
            self._tag_log(f"  {wid}: no se pudo ajustar ({e})")
        return False

    async def _desk_reshow(self, key: str, prefix: list, display: str) -> int:
        """App ya abierta: vuelve a poner STEAM_GAME y la capa base en sus ventanas. Son las que ya marcamos antes (minimizadas) o, si la abrió otro,
        las que casan por clase con el nombre de la app («firefox», «edge»…). Antes «Mostrar» no hacía nada tras Minimizar o con la app abierta fuera."""
        app = await self._desk_find(str(key))
        toks = {t for t in re.split(r"[^a-z0-9]+", (str(key).split(".")[-1] if "." in str(key) else str(key)).lower()) if len(t) >= 3}
        toks |= {t for t in re.split(r"[^a-z0-9]+", ((app or {}).get("name") or "").lower()) if len(t) >= 4}
        toks |= {c.lower() for c in self._desk_classes.get(str(key), set()) if c}
        wins = await self._x_windows(prefix, display)
        n = 0
        for w in wins:
            cls = " ".join(c or "" for c in w["classes"]).lower()
            if re.search(r"steam|mangoapp|gamescope", cls) or min(w["w"], w["h"]) < 200:
                continue
            mine = self._claims.get(w["id"]) == str(key)
            if not mine and (w["id"] in self._claims or not any(t in cls for t in toks)):
                continue
            await self._x_run(prefix, display, "xprop", "-id", w["id"], "-f", "STEAM_GAME", "32c", "-set", "STEAM_GAME", str(qam_desktop.app_gameid(key)))
            self._claims[w["id"]] = str(key)
            await self._fit_window(w["id"], str(key))
            n += 1
        if n:
            await self._base_layer(prefix, display, key, True)
        self._tag_log(f"== {key}: ya abierta, ventanas vueltas a mostrar {n} (tokens {sorted(toks)[:6]})")
        return n

    async def desktop_minimize(self, key: str) -> dict:
        """Minimizar: quita STEAM_GAME a las ventanas de la app; gamescope deja de mostrarlas y vuelve Steam. La app sigue abierta («Abrir» la vuelve a mostrar)."""
        self._run_c = None
        if qam_desktop is None:
            return {"ok": False}
        prefix, seen = await self._user_session()
        display = seen.get("DISPLAY") or ":0"
        self._xauth = seen.get("XAUTHORITY") or None
        await self._base_layer(prefix, display, key, False)
        self._tl("app.minimizar", app=str(key)[:30])
        return {"ok": True}

    async def desktop_home(self) -> dict:
        """«Volver a Steam»: quita de la capa base a todas las apps de escritorio abiertas (siguen abiertas; «Mostrar» las trae de nuevo)."""
        if qam_desktop is None:
            return {"ok": False}
        prefix, seen = await self._user_session()
        display = seen.get("DISPLAY") or ":0"
        self._xauth = seen.get("XAUTHORITY") or None
        keys = set(self._claims.values()) | set((await self.desktop_running()).get("keys", []))
        for k in keys:
            await self._base_layer(prefix, display, k, False)
        self._tag_log(f"== volver a Steam: {len(keys)} app(s) fuera de la capa base")
        self._tl("app.volver_a_steam", n=len(keys))
        return {"ok": True, "n": len(keys)}

    async def _steam_wid(self, prefix: list, display: str, fresh: bool = False):
        """Ventana «Steam Big Picture Mode». Se recuerda su id (`xwininfo -root -tree` recorre toda la pantalla); se vuelve a buscar si falla."""
        if not fresh and getattr(self, "_steam_wid_c", None):
            return self._steam_wid_c
        rc, out, _e = await self._x_run(prefix, display, "xwininfo", "-root", "-tree")
        self._steam_wid_c = next((l.split()[0] for l in out.splitlines() if '"Steam Big Picture Mode"' in l), None) if rc == 0 else None
        return self._steam_wid_c

    def _anim_enabled(self) -> bool:
        try:
            with open(_path("desktop-anim.json"), encoding="utf-8") as fh:
                return bool(json.load(fh).get("on", True))
        except (OSError, ValueError, AttributeError):
            return True

    async def _kx(self):
        """Conexión a X reutilizada para el teclado del panel (se cierra al descargar o si falla)."""
        if getattr(self, "_kx_x", None) is None:
            display, xauth = await self._pad_env()
            self._kx_x = qam_pad.XOut(display, xauth)
            try:   # forma de aplicar Ctrl/Mayús que la autoprueba encontró buena (kbd-mode.json)
                with open(_path("kbd-mode.json"), encoding="utf-8") as fh:
                    km = json.load(fh)
                if km.get("mod") in qam_pad.XOut.GAPS:
                    self._kx_x.mod_mode = km["mod"]
                if km.get("ch") in ("levels", "remap"):
                    self._kx_x.char_mode = km["ch"]
            except (OSError, ValueError):
                pass
        return self._kx_x

    def _kx_close(self) -> None:
        x = getattr(self, "_kx_x", None)
        self._kx_x = None
        if x is not None:
            try:
                x.close()
            except Exception:  # noqa: BLE001
                pass

    def _front_wid(self, x):
        """Ventana de la app de escritorio que gamescope muestra (la primera de la capa base que es nuestra), o None."""
        by_gid = {}
        for w, k in self._claims.items():
            if str(k).startswith("qam:"):
                continue
            try:
                by_gid.setdefault(qam_desktop.app_gameid(k), int(str(w), 0))
            except ValueError:
                continue
        for gid in x.cardinals("GAMESCOPECTRL_BASELAYER_APPID"):
            if gid in by_gid:
                return by_gid[gid]
        return None

    async def desktop_key(self, text=None, key=None, mods=None) -> dict:
        """Teclado del panel: escribe `text` (caracteres) o pulsa `key` (BackSpace, Return, Tab, flechas…) en la app de escritorio de delante.
        `mods` (ctrl, alt, shift) solo con una tecla suelta: Ctrl+A, Ctrl+C, Ctrl+V… En el registro NUNCA se anota lo escrito."""
        if qam_pad is None or qam_desktop is None:
            return {"ok": False, "error": "no disponible"}
        t_key = time.perf_counter()
        try:
            x = await self._kx()
            wid = self._front_wid(x)
            if not wid:  # sin app de escritorio delante no se escribe a ciegas (iría a la interfaz de Steam)
                return {"ok": False, "wid": None, "error": "no hay app de escritorio delante"}
            if not getattr(x, "focus_within", lambda w: False)(wid):   # si ya lo tiene la app (o una hija suya), no se le «vuelve» a dar
                x.focus(wid)
            fw = getattr(x, "focus_window", lambda: 0)()   # solo para el registro: ¿el foco quedó en la ventana de la app (o en una hija suya)?
            ok = True
            mm = [m for m in (mods or []) if m in ("ctrl", "alt", "shift")]
            GAP = None   # la pausa y la forma de aplicar el modificador las decide x.mod_mode (la autoprueba elige la que funciona en el navegador)

            def _run() -> bool:   # en un hilo: las pausas no deben parar el bucle del mando y el táctil
                good = True
                if mm:
                    name = qam_pad.NAMED_KEYS.get(str(key)) if key else (str(text) if text and len(str(text)) == 1 and str(text).isascii() and str(text).isalnum() else None)
                    if name:
                        x.key("+".join([*mm, name]), gap=GAP)
                    else:
                        good = False
                elif text:
                    for ch in str(text)[:200]:
                        good = x.type_char(ch, gap=GAP) and good
                elif key:
                    name = qam_pad.NAMED_KEYS.get(str(key))
                    if name:
                        x.key(name, gap=GAP)
                    else:
                        good = False
                return good
            ok = await asyncio.to_thread(_run)
            x.flush()
            tr = getattr(self, "_trace_v", None)
            if tr is not None and tr.on:
                tr.add("tecla", n=len(str(text)) if text else 1, ms=(time.perf_counter() - t_key) * 1000, ok=ok)   # nunca lo escrito
            n = getattr(self, "_kx_n", 0)
            if n < 40 or not ok:
                self._kx_n = n + 1
                what = (f"{'+'.join(mm)}+" if mm else "") + (str(key) if key else f"{len(str(text or ''))} carácter(es)")
                self._tag_log(f"  tecla {what} → ventana {hex(wid)} ok={ok} foco={hex(fw)}")  # el contenido escrito no se guarda: podría ser una contraseña
            return {"ok": ok, "wid": hex(wid), "error": None}
        except Exception as e:  # noqa: BLE001
            self._kx_close()
            return {"ok": False, "error": str(e)[:100]}

    # ---- Caja negra (dev.39): línea de tiempo en timeline.log, vigilante de casos raros y «Reparar» ----
    def _tl(self, ev: str, **data) -> None:
        """Una línea JSON en timeline.log (300 KB; el anillo en memoria da el contexto de las anomalías). Nunca recibe lo que se escribe."""
        tr = getattr(self, "_trace_v", None)
        if tr is not None and tr.on:
            tr.add("caja." + ev, **{k: v for k, v in data.items() if isinstance(v, (int, float, str, bool))})
        if qam_blackbox is None:
            return
        try:
            tl = getattr(self, "_tl_w", None)
            if tl is None:
                tl = self._tl_w = qam_blackbox.Timeline()
            line = tl.add(ev, data)
            p = _path("timeline.log")
            if os.path.exists(p) and os.path.getsize(p) > 300 * 1024:
                os.replace(p, p + ".1")
            with open(p, "a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        except Exception:  # noqa: BLE001 - la caja negra nunca debe afectar al panel
            pass

    def _ui(self) -> dict:
        if not hasattr(self, "_ui_v"):
            self._ui_v = {"panel": False, "kb": False, "steamkb": False, "combo_at": 0.0, "panel_at": 0.0}
        return self._ui_v

    async def qam_event(self, ev: str, data=None) -> None:
        """Eventos de la interfaz (panel abierto/cerrado, teclado…) para la caja negra. `ev` en minúsculas; los datos se limpian."""
        if qam_blackbox is None or not isinstance(ev, str) or not qam_blackbox.EV_OK.match(ev):
            return
        ui = self._ui()
        base, _, state = ev.partition(".")
        if base in qam_blackbox.FLAGS and state in ("abre", "cierra"):
            ui[base] = state == "abre"
            if base == "panel" and state == "abre":
                ui["panel_at"] = time.time()
        self._tl("ui." + ev, **(data if isinstance(data, dict) else {}))

    def _tl_combo(self, ev: str, **data) -> None:
        if ev == "qam.combo":
            self._ui()["combo_at"] = time.time()
        self._tl(ev, **data)
        if ev == "kb.combo":
            try:   # avisa a la interfaz (Steam + Y): ella abre o cierra el teclado grande
                asyncio.ensure_future(decky.emit("qam_kb"))
            except Exception:  # noqa: BLE001
                pass

    async def _wd_snapshot(self):
        """Estado de gamescope y de las ventanas de la app que se ve: sin lanzar procesos (una conexión a X reutilizada)."""
        x = await self._kx()
        focused = (x.cardinals("GAMESCOPE_FOCUSED_APP") or [None])[0]
        base = x.cardinals("GAMESCOPECTRL_BASELAYER_APPID")
        wid_s = getattr(self, "_steam_wid_c", None)
        overlay = None
        if wid_s:
            try:
                overlay = (x.cardinals("STEAM_OVERLAY", int(str(wid_s), 0)) or [None])[0]
            except ValueError:
                overlay = None
        wins, front = [], self._front_wid(x)
        if front:
            g = x.geometry(front)
            if g:
                wins.append(g)
        return x, {"focused": focused, "base": base, "overlay": overlay, "screen": x.screen_size(), "wins": wins, "front": front,
                   "anim": bool(getattr(self, "_anim_busy", False)), "running": bool(self._claims)}

    def _cursor_on(self) -> bool:
        try:
            with open(_path("desktop-cursor.json"), encoding="utf-8") as fh:
                return bool(json.load(fh).get("on", False))
        except (OSError, ValueError, AttributeError):
            return False

    async def desktop_cursor(self, on=None) -> dict:
        """Interruptor del puntero estilo Xbox (círculo) para las apps de escritorio. Al apagarlo, las apps ya abiertas conservan el círculo hasta reabrirlas."""
        ok = qam_cursor is not None and qam_cursor.available()
        if on is not None and ok:
            try:
                with open(_path("desktop-cursor.json"), "w", encoding="utf-8") as fh:
                    json.dump({"on": bool(on)}, fh)
            except OSError:
                pass
            self._cursor_skin = None
        return {"ok": ok, "on": self._cursor_on() if ok else False}

    @staticmethod
    def _cursor_theme_ok(dest: str) -> bool:
        """El tema guardado existe y es de la versión del dibujo actual (si no, se regenera)."""
        root = os.path.join(dest, qam_cursor_theme.NAME)
        try:
            with open(os.path.join(root, "version"), encoding="utf-8") as fh:
                return fh.read().strip() == str(qam_cursor_theme.VERSION) and os.path.isdir(os.path.join(root, "cursors"))
        except OSError:
            return False

    async def _cursor_loop(self) -> None:
        """Con el puntero Xbox activado y una app de escritorio abierta, cambia cada cursor nuevo de la app (ver qam_cursor). Sin ambas cosas, duerme."""
        while True:
            try:
                if not (self._cursor_on() and self._claims and qam_cursor.available()):
                    await asyncio.sleep(2)
                    continue
                x = await self._kx()
                skin = getattr(self, "_cursor_skin", None)
                if skin is None or skin.dpy != x.dpy:
                    dest = _path("cursors")
                    if not self._cursor_theme_ok(dest):
                        qam_cursor_theme.install(dest)
                    skin = self._cursor_skin = qam_cursor.CursorSkin(x.x11, x.dpy, os.path.join(dest, qam_cursor_theme.NAME, "cursors"))
                n = skin.tick()
                if n and len(skin.changed) <= 12:
                    self._tag_log(f"puntero Xbox: cursor «{n}» cambiado")
                await asyncio.sleep(0.3)
            except asyncio.CancelledError:
                raise
            except Exception as e:  # noqa: BLE001
                self._cursor_skin = None
                self._kx_close()
                self._tl("puntero.error", error=str(e)[:80])
                await asyncio.sleep(5)

    async def _prune_dead(self, x) -> list:
        """Una app cerrada por fuera del QAM (flatpak kill, se cierra sola) deja su ventana marcada y su número en la capa base de gamescope.
        Se olvida la ventana y, si era la última de esa app, se quita su número de la capa base (Steam no debe quedar detrás de algo que ya no existe)."""
        gone = []
        for w, k in list(self._claims.items()):
            try:
                wid = int(str(w), 0)
            except ValueError:
                continue
            if x.geometry(wid) is None:
                gone.append((w, str(k)))
        if not gone:
            return []
        for w, _k in gone:
            self._claims.pop(w, None)
        prefix, seen = await self._user_session()
        display = seen.get("DISPLAY") or ":0"
        keys = sorted({k for _w, k in gone})
        for k in keys:
            if not any(str(v) == k for v in self._claims.values()):
                await self._base_layer(prefix, display, k, False)
        self._tag_log(f"ventana cerrada por fuera: {', '.join(keys)}; capa base limpiada")
        self._tl("ventana_cerrada_fuera", apps=",".join(keys)[:120])
        return keys

    async def _wd_loop(self) -> None:
        """Cada segundo (cada 4 sin apps abiertas ni interfaz) mira el estado y anota las anomalías en la línea de tiempo, con el contexto."""
        wd = qam_blackbox.Watchdog()
        while True:
            try:
                ui = self._ui()
                if not (self._claims or ui["panel"] or ui["kb"] or ui["steamkb"]):
                    await asyncio.sleep(4)
                    continue
                x, snap = await self._wd_snapshot()
                if self._claims and time.time() - getattr(self, "_prune_at", 0.0) > 3:
                    self._prune_at = time.time()
                    await self._prune_dead(x)
                last = getattr(self, "_wd_last", None)
                key = (snap["focused"], tuple(snap["base"]), snap["overlay"], tuple(snap["wins"]))
                if key != last:
                    self._wd_last = key
                    self._tl("estado", foco=snap["focused"], base=",".join(str(b) for b in snap["base"]), overlay=snap["overlay"],
                             ventana=(f"{snap['wins'][0][0]}x{snap['wins'][0][1]}" if snap["wins"] else ""), panel=ui["panel"], teclado=ui["kb"] or ui["steamkb"])
                for name, detail in wd.check(snap, ui, time.time()):
                    self._tl("anomalia", nombre=name, detalle=detail, foco=snap["focused"], overlay=snap["overlay"],
                             ventana=(f"{snap['wins'][0][0]}x{snap['wins'][0][1]}" if snap["wins"] else ""), panel=ui["panel"], teclado=ui["kb"] or ui["steamkb"])
                    self._tl("contexto", ultimos=json.dumps(self._tl_w.recent(12), ensure_ascii=False)[:900])
                    if name == "ventana_pequena" and snap.get("front"):  # lo único que se arregla solo: es seguro y no tapa nada
                        x.resize(snap["front"], *snap["screen"])
                        self._tl("reparacion", que="ventana a pantalla completa")
                await asyncio.sleep(1)
            except asyncio.CancelledError:
                raise
            except Exception as e:  # noqa: BLE001
                self._kx_close()
                self._tl("vigilante.error", error=str(e)[:80])
                await asyncio.sleep(5)

    async def desktop_repair(self) -> dict:
        """«Reparar»: salida de emergencia. Ventanas de las apps a pantalla completa, overlay de Steam a 0 si lo subimos nosotros y capa base limpia de
        ventanas que ya no existen. No cierra nada ni pierde lo escrito."""
        fixed = []
        try:
            x = await self._kx()
            w, h = x.screen_size()
            for wid in self._anim_wids():
                g = x.geometry(wid)
                if g and (g[0] != w or g[1] != h):
                    x.resize(wid, w, h)
                    fixed.append("ventana a pantalla completa")
            if getattr(self, "_ov_prev", None):
                r = await self.desktop_overlay(False)
                if r.get("ok") and not r.get("skipped"):
                    fixed.append("overlay a 0")
            ui = self._ui()
            ui["panel"] = ui["kb"] = ui["steamkb"] = False
        except Exception as e:  # noqa: BLE001
            self._tl("reparacion.error", error=str(e)[:80])
            return {"ok": False, "error": str(e)[:100], "fixed": fixed}
        self._tl("reparacion", que=", ".join(fixed) or "nada que reparar")
        return {"ok": True, "fixed": fixed}

    async def desktop_anim(self, on=None) -> dict:
        """Interruptor de la animación al volver de QAM a la app (activada por defecto)."""
        if on is not None:
            try:
                with open(_path("desktop-anim.json"), "w", encoding="utf-8") as fh:
                    json.dump({"on": bool(on)}, fh)
            except OSError:
                pass
        return {"ok": qam_pad is not None, "on": self._anim_enabled()}

    def _anim_wids(self) -> list:
        """Ventanas (ids numéricos) de las apps de escritorio abiertas por QAM Rail."""
        out = []
        for w, k in list(self._claims.items()):
            if str(k).startswith("qam:"):
                continue
            try:
                out.append(int(str(w), 0))
            except ValueError:
                continue
        return out

    async def _anim_start(self):
        """Antes de quitar el panel: las ventanas de la app se encogen (ocultas aún) y devuelve (X, ids, tamaño) para hacerlas crecer."""
        if qam_pad is None or not self._anim_enabled():
            return None
        wids = self._anim_wids()
        if not wids:
            return None
        self._anim_cancel = False
        try:
            display, xauth = await self._pad_env()
            x = qam_pad.XOut(display, xauth)
        except Exception as e:  # noqa: BLE001
            self._tag_log(f"  animación: sin pantalla ({e})")
            return None
        try:
            w, h = x.screen_size()
            first = qam_pad.grow_steps(w, h)[0]
            for wid in wids:
                x.resize(wid, *first)
        except Exception as e:  # noqa: BLE001
            self._tag_log(f"  animación: no se pudo encoger ({e})")
            self._anim_finish_now(x, wids)
            return None
        return x, wids, (w, h)

    @staticmethod
    def _anim_finish_now(x, wids, size=None) -> None:
        try:
            w, h = size or x.screen_size()
            for wid in wids:
                x.resize(wid, w, h)
        except Exception:  # noqa: BLE001
            pass
        try:
            x.close()
        except Exception:  # noqa: BLE001
            pass

    async def _anim_grow(self, st) -> None:
        """Hace crecer las ventanas hasta pantalla completa. Pase lo que pase, la última orden es el tamaño completo."""
        x, wids, (w, h) = st
        t0 = time.monotonic()
        self._anim_busy = True
        try:
            for sz in qam_pad.grow_steps(w, h):
                if getattr(self, "_anim_cancel", False):  # el panel o el teclado vuelven a subir: nada de redimensionar a la vez
                    self._tag_log("  animación: cancelada (sube el overlay)")
                    break
                for wid in wids:
                    x.resize(wid, *sz)
                await asyncio.sleep(0.035)
        except Exception as e:  # noqa: BLE001
            self._tag_log(f"  animación: error {e}")
        finally:
            self._anim_busy = False
            self._anim_finish_now(x, wids, (w, h))
            self._tag_log(f"  animación: {len(wids)} ventana(s) {int((time.monotonic() - t0) * 1000)} ms")

    async def desktop_overlay(self, on: bool, reason: str = "panel") -> dict:
        """Con el panel abierto y alguna app de escritorio en marcha, sube STEAM_OVERLAY=1 en la ventana de Steam (gamescope dibuja entonces
        la interfaz de Steam —el panel, el teclado— por encima de la app, como con un juego). Al cerrar vuelve a 0, que es lo que Steam deja."""
        if qam_desktop is None:
            return {"ok": False}
        t0 = time.monotonic()
        try:
            if on and not (await self.desktop_running()).get("keys") and not self._qam_keys:
                return {"ok": True, "skipped": True}
            if not on:
                if not getattr(self, "_ov_prev", None):
                    return {"ok": True, "skipped": True}
                self._ov_prev = None
            else:
                self._ov_prev = True
            val = 1 if on else 0
            if on:
                self._anim_cancel = True  # si una animación sigue en marcha, termina ya en pantalla completa
            anim = await self._anim_start() if not on else None  # encoge la app mientras sigue oculta
            prefix, seen = await self._user_session()
            display = seen.get("DISPLAY") or ":0"
            self._xauth = seen.get("XAUTHORITY") or None
            wid = await self._steam_wid(prefix, display)
            if not wid:
                return {"ok": False, "error": "no hay ventana de Steam"}
            rc2, _o, err = await self._x_run(prefix, display, "xprop", "-id", wid, "-f", "STEAM_OVERLAY", "32c", "-set", "STEAM_OVERLAY", str(val))
            if rc2 != 0:  # la ventana de Steam pudo recrearse: nuevo id y un segundo intento
                wid = await self._steam_wid(prefix, display, fresh=True)
                if wid:
                    rc2, _o, err = await self._x_run(prefix, display, "xprop", "-id", wid, "-f", "STEAM_OVERLAY", "32c", "-set", "STEAM_OVERLAY", str(val))
            self._tag_log(f"  overlay {'on' if on else 'off'} {wid} → {val} (código {rc2} {err.strip()[:60]}) {int((time.monotonic() - t0) * 1000)} ms")
            self._tl("overlay", on=bool(on), motivo=str(reason)[:12], codigo=rc2, ms=int((time.monotonic() - t0) * 1000))
            if anim:
                if rc2 == 0:
                    self._spawn(self._anim_grow(anim))
                else:
                    self._anim_finish_now(anim[0], anim[1], anim[2])
                anim = None
            return {"ok": rc2 == 0}
        except Exception as e:  # nunca debe afectar al panel
            if locals().get("anim"):
                self._anim_finish_now(anim[0], anim[1], anim[2])
            return {"ok": False, "error": str(e)[:100]}

    async def desktop_kill(self, key: str) -> dict:
        """Forzar el cierre: SIGKILL a todos los procesos de la app."""
        self._run_c = None
        unit = self._desk_unit(key) + ".service"
        await self._systemctl_user("kill", "--signal=SIGKILL", unit)
        code, out = await self._systemctl_user("stop", unit)
        import signal
        n = await self._kill_windows_of(key, signal.SIGKILL)
        if await self._flatpak_kill(key):
            n += 1
        await self._base_off(key)
        for w in [w for w, k in self._claims.items() if k == key]:
            self._claims.pop(w, None)
        return {"ok": code == 0 or n > 0, "error": out.strip().splitlines()[-1][:120] if code and not n and out.strip() else None}

    async def desktop_run(self, key: str) -> dict:
        """Abre la app de escritorio dentro de la sesión del usuario (`systemd-run --user`: entorno limpio, sin los límites del servicio de Decky,
        que hacían fallar el sandbox de Firefox con «CanCreateUserNamespace EPERM»). Espera 1,5 s: si se cierra con error devuelve el final de su salida."""
        self._run_c = None
        pl = await self.desktop_plan(key)
        if not pl.get("ok"):
            self._tl("app.abrir_fallo", app=str(key)[:30], error=str(pl.get("error"))[:50])
            return pl
        self._tl("app.abrir", app=str(key)[:30])
        log = _path("desktop-run.log")
        try:
            open(log, "wb").close()
            os.chmod(log, 0o666)  # lo escribe el gestor del usuario
        except OSError:
            pass
        prefix, seen = await self._user_session()
        display = seen.get("DISPLAY") or ":0"
        self._xauth = seen.get("XAUTHORITY") or None
        before = {w["id"] for w in await self._x_windows(prefix, display)}
        unit = self._desk_unit(key)
        if str(key) in (await self.desktop_running()).get("keys", []):
            n = await self._desk_reshow(key, prefix, display)  # ya abierta: se vuelve a mostrar su ventana (minimizada u abierta fuera de QAM Rail)
            if n:
                self._spawn(self._desk_tag(key, prefix, display, before))
                self._tl("app.mostrar", app=str(key)[:30], ventanas=n)
                return {"ok": True, "already": True, "shown": n}
            # En marcha pero SIN ventana que mostrar (p. ej. Edge/Chromium con «seguir en segundo plano», o cerrado desde su propia X): hay que lanzarla de
            # nuevo; el navegador reenvía a su proceso y abre una ventana. Si nuestra unidad sigue activa, se usa otra para no chocar con ella.
            self._tag_log(f"== {key}: en marcha sin ventanas; se vuelve a lanzar")
            if (await self._systemctl_user("is-active", "--quiet", unit + ".service"))[0] == 0:
                unit += "-fwd"
        sets = []
        if "DISPLAY" not in seen:
            sets.append("--setenv=DISPLAY=:0")
        cwd = pl["dir"] if os.path.isdir(pl["dir"]) else _home()
        cmd = [*prefix, "systemd-run", "--user", "--wait", "--collect", "--quiet", f"--unit={unit}", f"--working-directory={cwd}",
               "-p", f"StandardOutput=file:{log}", "-p", f"StandardError=file:{log}", *sets, "--", *pl["argv"]]
        try:
            proc = await asyncio.create_subprocess_exec(*cmd, env=self._user_env(), stdin=asyncio.subprocess.DEVNULL,
                                                        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE, start_new_session=True)
        except OSError as e:
            return {"ok": False, "error": str(e)[:120]}
        self._spawn(self._desk_tag(key, prefix, display, before))
        try:
            await asyncio.wait_for(proc.wait(), 1.5)
        except asyncio.TimeoutError:
            try:
                proc.kill()  # el cliente de systemd-run; la app sigue en su unidad
            except ProcessLookupError:
                pass
            return {"ok": True}
        if proc.returncode == 0:
            return {"ok": True}
        tail = ""
        try:
            with open(log, "rb") as r:
                lines = r.read()[-400:].decode("utf-8", "replace").strip().splitlines()
            tail = lines[-1][:140] if lines else ""
            if not tail and proc.stderr:
                tail = (await proc.stderr.read(300)).decode("utf-8", "replace").strip().splitlines()[-1][:140]
        except (OSError, IndexError):
            pass
        return {"ok": False, "error": f"salió con código {proc.returncode}" + (f": {tail}" if tail else "")}

    def _desk_pins(self) -> list:
        try:
            with open(_path("desktop-pins.json"), encoding="utf-8") as fh:
                raw = json.load(fh)
        except (OSError, ValueError):
            return []
        return [k for k in raw if isinstance(k, str) and len(k) <= 120][:60] if isinstance(raw, list) else []

    async def desktop_pins(self) -> dict:
        """Apps de escritorio que el usuario agregó a QAM, con su icono (data URL) para el cajón de apps."""
        keys = self._desk_pins()
        if not keys or qam_desktop is None:
            return {"pins": []}
        data = await self.desktop_scan(False)
        by = {a.get("key"): a for a in data.get("apps", [])}
        out = []
        for k in keys:
            a = by.get(k)
            if not a:
                continue
            icon = self._icon_data(a)
            out.append({"key": k, "name": a.get("name", k), "source": a.get("source", ""), "icon": icon})
        return {"pins": out}

    def _desk_opts(self) -> dict:
        try:
            with open(_path("desktop-opts.json"), encoding="utf-8") as fh:
                raw = json.load(fh)
        except (OSError, ValueError):
            return {}
        return {k: v for k, v in raw.items() if isinstance(k, str) and len(k) <= 120} if isinstance(raw, dict) else {}

    def _write_firefox_prefs(self, opts: dict) -> int:
        """Escribe el bloque de QAM Rail en el `user.js` de los perfiles de Firefox (Firefox lo lee al arrancar). Devuelve cuántos perfiles."""
        home = _home()
        n = 0
        try:
            st = os.stat(home)
        except OSError:
            return 0
        block = qam_desktop.userjs_block(opts)
        for d in qam_desktop.firefox_profiles(home):
            f = os.path.join(d, "user.js")
            try:
                try:
                    with open(f, encoding="utf-8") as fh:
                        old = fh.read()
                except OSError:
                    old = ""
                with open(f, "w", encoding="utf-8") as fh:
                    fh.write(qam_desktop.merge_userjs(old, block))
                if os.getuid() == 0:
                    os.chown(f, st.st_uid, st.st_gid)
                n += 1
            except OSError:
                continue
        return n

    async def desktop_opts(self, key: str, scale: float | None = None, touch: bool | None = None, fullscreen: bool | None = None) -> dict:
        """Ajustes de lanzamiento de una app de escritorio (hoy solo navegadores: zoom y táctil). Se aplican al abrirla de nuevo."""
        if qam_desktop is None:
            return {"ok": False}
        app = await self._desk_find(str(key))
        kind = qam_desktop.browser_kind(app) if app else None
        allo = self._desk_opts()
        cur = qam_desktop.clean_opts(allo.get(str(key)))
        if kind in ("chromium", "firefox") and (scale is not None or touch is not None):
            cur = qam_desktop.clean_opts({"scale": cur["scale"] if scale is None else scale, "touch": cur["touch"] if touch is None else touch,
                                          "fullscreen": cur["fullscreen"] if fullscreen is None else fullscreen})
            allo[str(key)] = cur
            if kind == "firefox":
                self._write_firefox_prefs(cur)
            tmp = _path("desktop-opts.json.tmp")
            try:
                with open(tmp, "w", encoding="utf-8") as fh:
                    json.dump(allo, fh)
                os.replace(tmp, _path("desktop-opts.json"))
            except OSError as e:
                return {"ok": False, "error": str(e)[:100]}
        return {"ok": True, "browser": kind, **cur}

    async def desktop_pin_set(self, key: str, on: bool) -> dict:
        keys = [k for k in self._desk_pins() if k != str(key)]
        if on:
            keys.append(str(key))
        tmp = _path("desktop-pins.json.tmp")
        try:
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(keys[:60], fh)
            os.replace(tmp, _path("desktop-pins.json"))
        except OSError as e:
            return {"ok": False, "error": str(e)[:100]}
        return {"ok": True, "keys": keys}

    def _desk_reg(self) -> dict:
        try:
            with open(_path("apps-steam.json"), encoding="utf-8") as fh:
                return qam_desktop.clean_registry(json.load(fh)) if qam_desktop else {}
        except (OSError, ValueError):
            return {}

    async def desktop_reg_get(self) -> dict:
        """Atajos de Steam creados por QAM Rail para apps de escritorio (solo estos se pueden quitar desde aquí)."""
        return self._desk_reg()

    async def desktop_reg_set(self, key: str, entry: dict | None) -> dict:
        """Anota (o, con None, borra) el atajo de una app. Solo tocamos lo nuestro: nunca otros atajos de Steam."""
        if qam_desktop is None:
            return {}
        reg = self._desk_reg()
        if entry is None:
            reg.pop(str(key), None)
        else:
            one = qam_desktop.clean_registry({str(key): {**(entry if isinstance(entry, dict) else {}), "added": int(time.time())}})
            reg.update(one)
        tmp = _path("apps-steam.json.tmp")
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(reg, fh, indent=1)
        os.replace(tmp, _path("apps-steam.json"))
        return reg

    # ---- Actualizaciones desde GitHub Releases (0.51; ver py_modules/qam_updates.py) ----
    @staticmethod
    def _ssl_ctx():
        """Contexto TLS con verificacion. El Python de Decky no trae certificados raiz:
        se usa el paquete del sistema (Bazzite/Fedora, Debian) o certifi. Nunca se desactiva la verificacion."""
        import ssl
        cands = [os.environ.get("SSL_CERT_FILE"), "/etc/pki/tls/certs/ca-bundle.crt",
                 "/etc/ssl/certs/ca-certificates.crt", "/etc/ssl/cert.pem"]
        try:
            import certifi  # type: ignore
            cands.append(certifi.where())
        except Exception:
            pass
        for c in cands:
            if c and os.path.isfile(c):
                try:
                    return ssl.create_default_context(cafile=c)
                except (OSError, ssl.SSLError):
                    continue
        return ssl.create_default_context()

    @staticmethod
    def _http(url: str, etag: str | None = None):
        """GET con tiempo limite. Devuelve (estado, etag, texto). Un 304 no es error."""
        import urllib.error
        import urllib.request
        req = urllib.request.Request(url, headers={"User-Agent": "qam-rail", "Accept": "application/vnd.github+json"})
        if etag:
            req.add_header("If-None-Match", etag)
        try:
            with urllib.request.urlopen(req, timeout=15, context=Plugin._ssl_ctx()) as r:
                return r.status, r.headers.get("ETag"), r.read(4 * 1024 * 1024).decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            return e.code, None, ""

    @staticmethod
    def _opener(url: str):
        import urllib.request
        r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "qam-rail"}), timeout=30, context=Plugin._ssl_ctx())
        if not qam_updates.https_ok(r.geturl()):  # tras redirecciones sigue siendo un host de GitHub
            r.close()
            raise ValueError("la descarga se redirigió a un sitio no permitido")
        return r

    def _upd_cache(self) -> dict:
        try:
            with open(_path("updates.json"), encoding="utf-8") as fh:
                d = json.load(fh)
            return d if isinstance(d, dict) else {}
        except (OSError, ValueError):
            return {}

    def _upd_log(self, text: str) -> None:
        """`updates.log`: qué devolvió cada comprobación de GitHub (antes un error o un «al día» no dejaba rastro)."""
        try:
            with open(_path("updates.log"), "a", encoding="utf-8") as fh:
                fh.write(time.strftime("%H:%M:%S ") + text + "\n")
            if os.path.getsize(_path("updates.log")) > 40_000:
                os.replace(_path("updates.log"), _path("updates.log.old"))
        except OSError:
            pass

    async def apps_check_updates(self, force: bool = False) -> dict:
        """Mira GitHub por cada app con «update» (como mucho cada 6 h salvo force; ETag). Solo avisa, no instala."""
        if qam_apps is None or qam_updates is None:
            return {"ok": False, "results": {}}
        data = await self.apps_list()
        cache = self._upd_cache()
        results = {}
        for a in data["apps"]:
            if not (a.get("update") or {}).get("provider"):
                continue
            c = cache.setdefault(a["id"], {})
            try:
                results[a["id"]] = await asyncio.to_thread(qam_updates.check_app, a, c, self._http, None, bool(force))
            except Exception as e:  # noqa: BLE001  (check_app ya atrapa lo suyo; esto cubre cualquier otra cosa)
                results[a["id"]] = {"state": "error", "error": str(e)[:160], "current": a.get("version")}
            r = results[a["id"]]
            self._upd_log(f"{a['id']} v{a.get('version')} force={bool(force)} → {r.get('state')} última={r.get('latest')} {r.get('error') or ''}".rstrip())
        try:
            tmp = _path("updates.json.tmp")
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(cache, fh)
            os.replace(tmp, _path("updates.json"))
        except OSError:
            pass
        return {"ok": True, "results": results}

    async def apps_update(self, app_id: str, force: bool = False) -> dict:
        """Descarga la release nueva, la verifica con SHA256SUMS y la instala con la misma tuberia (con vuelta atras)."""
        if qam_apps is None or qam_updates is None or qam_pipeline is None:
            return {"ok": False, "error": "no disponible"}
        job = getattr(self, "_apps_job", None)
        if job and job.get("state") in ("running", "confirm"):
            return {"ok": False, "error": "ya hay una instalacion en marcha"}
        res = (await self.apps_check_updates(False))["results"].get(app_id)
        if not res or res.get("state") != "update":
            return {"ok": False, "error": "no hay una versión nueva"}
        if not res.get("sums_url"):
            return {"ok": False, "error": "la release no trae SHA256SUMS: no se instala sin verificar"}
        self._apps_job = {"state": "running", "step": f"descargando {res.get('latest')}", "source": res["url"], "started": time.time(), "force": bool(force)}
        asyncio.get_running_loop().create_task(self._apps_update_task(app_id, res))
        return {"ok": True, "started": True}

    async def _apps_update_task(self, app_id: str, res: dict) -> None:
        import shutil
        import tempfile
        job = self._apps_job
        work = None
        try:
            base = os.path.join(_apps_dir(), qam_pipeline.STAGING)
            os.makedirs(base, exist_ok=True)
            work = tempfile.mkdtemp(prefix="dl-", dir=base)
            dest = os.path.join(work, os.path.basename(res["name"]))
            await asyncio.to_thread(qam_updates.download, res["url"], dest, self._opener)
            job["step"] = "verificando la descarga"
            sums_status, _, sums_text = await asyncio.to_thread(self._http, res["sums_url"], None)
            if sums_status != 200:
                raise ValueError("no se pudo leer SHA256SUMS")
            want = qam_pipeline.parse_sums(sums_text).get(res["name"])
            if not want:
                raise ValueError(f"{res['name']} no figura en SHA256SUMS")
            await self._apps_install_task(dest, False, want)
        except Exception as e:  # noqa: BLE001
            job.update({"state": "error", "error": str(e)[:200]})
        finally:
            if work:
                shutil.rmtree(work, ignore_errors=True)

    async def apps_confirm(self, ok: bool) -> dict:
        """Respuesta a «Esta app ejecuta su propio instalador»."""
        c = getattr(self, "_apps_confirm", None)
        if not c:
            return {"ok": False}
        c["ok"] = bool(ok)
        c["ev"].set()
        return {"ok": True}

    async def _run_script(self, cwd: str, argv: list, timeout: float) -> tuple:
        """(codigo, salida) de un proceso como el usuario; sin esperar mas de `timeout` segundos."""
        try:
            proc = await asyncio.create_subprocess_exec(
                *argv, cwd=cwd, env=self._user_env(),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, stdin=asyncio.subprocess.DEVNULL)
            try:
                out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            except asyncio.TimeoutError:
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass
                return -1, f"tiempo agotado ({int(timeout)} s)"
            return proc.returncode, out.decode("utf-8", "replace")[-4000:]
        except Exception as exc:  # noqa: BLE001
            return -1, str(exc)

    async def _apps_install_task(self, source: str, confirmed: bool, sha256: str) -> None:
        """Tuberia de APPS-ESTANDAR.md §3: preparar aparte (+SHA-256) → confirmar → cambiar → install.sh → probar → (volver atras)."""
        import shlex
        import traceback
        job = self._apps_job
        apps_dir = _apps_dir()
        qv = getattr(decky, "DECKY_PLUGIN_VERSION", None)
        staged, new, had_prev = None, None, False
        try:
            if os.path.isdir(source):
                staged = await asyncio.to_thread(qam_pipeline.stage_dir, source, apps_dir, qv, _home())
            else:
                staged = await asyncio.to_thread(qam_pipeline.stage_zip, source, apps_dir, sha256 or None, None, qv, _home())
            man, chk = staged["manifest"], staged["check"]
            preview = {k: man.get(k) for k in ("id", "name", "version", "group", "description", "install", "launch")}
            job.update({"app_preview": preview, "warnings": chk["warnings"], "verified": staged["verify"].get("matched"), "sha256": staged["verify"].get("sha256")})
            if chk["errors"]:
                raise ValueError("; ".join(chk["errors"]))
            reg = self._apps_reg()
            if qam_pipeline.is_bad(reg, man["id"], man.get("version")) and not job.get("force"):
                raise ValueError(f"la versión {man.get('version')} ya falló en este equipo; instálala con «Forzar» si quieres reintentar")
            had_prev = os.path.isdir(os.path.join(apps_dir, man["id"]))
            if not had_prev and man.get("install") and not confirmed:
                ev = asyncio.Event()
                self._apps_confirm = {"ev": ev, "ok": False}
                job.update({"state": "confirm", "step": "esperando confirmación", "app": preview})
                try:
                    await asyncio.wait_for(ev.wait(), timeout=120)
                except asyncio.TimeoutError:
                    pass
                ok = self._apps_confirm["ok"]
                self._apps_confirm = None
                if not ok:
                    job.update({"state": "cancelled", "step": "cancelada"})
                    return
                job["state"] = "running"
            job["step"] = f"instalando {man.get('name')}"
            new = await asyncio.to_thread(qam_pipeline.commit, staged, apps_dir)
            staged = None
            log = None
            if new.get("install") and os.path.isfile(os.path.join(new["path"], new["install"])):
                job["step"] = f"preparando {new.get('name')} ({new['install']}, puede tardar)"
                code, text = await self._run_script(new["path"], ["bash", os.path.join(new["path"], new["install"])], 600)
                try:
                    with open(os.path.join(new["path"], "qam-install.log"), "w", encoding="utf-8") as fh:
                        fh.write(text)
                except OSError:
                    pass
                log = f"[{code}] {text[-600:]}"
                if code != 0:
                    raise RuntimeError(f"el instalador de la app falló (código {code}): {text.strip()[-160:]}")
            status = None
            if new.get("status"):
                job["step"] = "probando la app"
                parts = shlex.split(str(new["status"]))
                exe = os.path.join(new["path"], parts[0])
                argv = (["bash", exe] if exe.endswith(".sh") else [exe]) + parts[1:]
                if os.path.isfile(exe) and not exe.endswith(".sh"):
                    os.chmod(exe, os.stat(exe).st_mode | 0o111)
                code, text = await self._run_script(new["path"], argv, 8)
                status = qam_pipeline.parse_status(text) if code == 0 else None
                if status is None:
                    raise RuntimeError(f"la app no respondió a «{new['status']}» con un JSON (código {code}): {text.strip()[-120:]}")
            reg = self._apps_reg()
            r = reg.setdefault(new["id"], {})
            r.update({"path": new["path"], "version": new.get("version"), "installed_at": time.time(), "source": os.path.basename(source),
                      "sha256": job.get("sha256"), "last_error": None})
            if (r.get("bad_versions") and new.get("version") in r["bad_versions"]):
                r["bad_versions"].remove(new.get("version"))   # se forzó y funcionó
            self._apps_reg_save(reg)
            qam_apps.finish_install(apps_dir, new["id"])
            job.update({"state": "done", "step": "listo", "app": new, "install_log": log, "status": status, "updated": had_prev})
        except Exception as exc:  # noqa: BLE001
            job.update({"state": "error", "error": f"{type(exc).__name__}: {exc}"[:300], "trace": traceback.format_exc()[-1500:]})
            decky.logger.error(f"apps_install: {exc}")
            if new is not None:
                # Ya se habia cambiado la carpeta: volver a como estaba (o quitar si era la primera vez) y no reintentar esta version sola.
                try:
                    back = await asyncio.to_thread(qam_apps.discard_new, apps_dir, new["id"], had_prev)
                    reg = self._apps_reg()
                    qam_pipeline.mark_bad(reg, new["id"], new.get("version"), job["error"])
                    if back:
                        reg.setdefault(new["id"], {}).update({"path": back["path"], "version": back.get("version")})
                    self._apps_reg_save(reg)
                    job["rolled_back"] = True
                    job["back_to"] = (back or {}).get("version")
                except Exception as exc2:  # noqa: BLE001
                    job["rolled_back"] = False
                    job["rollback_error"] = str(exc2)[:200]
        finally:
            if staged is not None:
                qam_pipeline.abort(staged)
        job["seconds"] = round(time.time() - job.get("started", time.time()), 1)
        # Queda en el informe de diagnostico (seccion apps) para poder ver por que fallo.
        try:
            await self.diag_section("apps", {k: v for k, v in job.items() if k not in ("app", "app_preview")} | {"app": (job.get("app") or job.get("app_preview") or {}).get("id")})
        except Exception:  # noqa: BLE001
            pass

    async def apps_rollback(self, app_id: str) -> dict:
        """Vuelve a la version anterior (la actual pasa a ser la «anterior»: se puede ir y volver)."""
        if qam_apps is None:
            return {"ok": False, "error": "qam_apps no disponible"}
        aid = qam_apps.slug(app_id)
        try:
            man = await asyncio.to_thread(qam_apps.rollback, _apps_dir(), aid)
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)[:200]}
        reg = self._apps_reg()
        reg.setdefault(aid, {}).update({"path": man["path"], "version": man.get("version"), "installed_at": time.time()})
        self._apps_reg_save(reg)
        return {"ok": True, "app": man}

    async def apps_job(self) -> dict:
        return dict(getattr(self, "_apps_job", None) or {"state": "idle"})

    async def apps_icons(self) -> dict:
        """Icono de cada app como data URL (para mostrarlas en el cajon de apps del QAM)."""
        import base64
        data = await self.apps_list()
        out = {}
        for a in data["apps"]:
            rel = (a.get("art") or {}).get("icon") or (a.get("art") or {}).get("capsule")
            p = os.path.join(a["path"], rel) if rel else None
            if p and os.path.isfile(p) and os.path.getsize(p) < 1_500_000:
                with open(p, "rb") as fh:
                    kind = "jpeg" if p.lower().endswith((".jpg", ".jpeg")) else "png"
                    out[a["id"]] = f"data:image/{kind};base64," + base64.b64encode(fh.read()).decode()
        return out

    @staticmethod
    def _user_env() -> dict:
        """Entorno de la sesion del usuario (systemd --user, D-Bus) para lanzar apps desde el plugin."""
        env = dict(os.environ)
        env.setdefault("HOME", _home())
        uid = os.getuid()
        run = f"/run/user/{uid}"
        if os.path.isdir(run):
            env.setdefault("XDG_RUNTIME_DIR", run)
            env.setdefault("DBUS_SESSION_BUS_ADDRESS", f"unix:path={run}/bus")
        return env

    async def _run_app_script(self, cwd: str, script: str) -> str:
        env = self._user_env()
        try:
            proc = await asyncio.create_subprocess_exec(
                "bash", os.path.join(cwd, script), cwd=cwd, env=env,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, stdin=asyncio.subprocess.DEVNULL)
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=600)
            text = out.decode("utf-8", "replace")[-4000:]
            code = proc.returncode
        except asyncio.TimeoutError:
            text, code = "tiempo agotado (10 min)", -1
        except Exception as exc:  # noqa: BLE001
            text, code = str(exc), -1
        try:
            with open(os.path.join(cwd, "qam-install.log"), "w", encoding="utf-8") as fh:
                fh.write(text)
        except OSError:
            pass
        return f"[{code}] {text[-600:]}"

    async def apps_add_folder(self, path: str) -> dict:
        """Registra una carpeta ya existente (p. ej. ~/Games/steam-ytmini) sin moverla."""
        if qam_apps is None or not os.path.isdir(str(path)):
            return {"ok": False, "error": "carpeta no valida"}
        man = qam_apps.read_manifest(str(path))
        man["path"] = str(path)
        reg = self._apps_reg()
        reg.setdefault(man["id"], {}).update({"path": str(path), "external": True})
        self._apps_reg_save(reg)
        return {"ok": True, "app": man}

    async def apps_set_appid(self, app_id: str, appid) -> bool:
        reg = self._apps_reg()
        reg.setdefault(str(app_id), {})["appid"] = appid
        self._apps_reg_save(reg)
        return True

    async def apps_art(self, app_id: str) -> dict:
        """Arte de la app en base64 (para SetCustomArtworkForApp) y ruta del icono."""
        import base64
        data = await self.apps_list()
        app = next((a for a in data["apps"] if a["id"] == app_id), None)
        if not app:
            return {}
        out = {}
        for kind, rel in (app.get("art") or {}).items():
            p = os.path.join(app["path"], rel)
            if os.path.isfile(p) and os.path.getsize(p) < 6_000_000:
                with open(p, "rb") as fh:
                    out[kind] = {"b64": base64.b64encode(fh.read()).decode(), "type": "jpg" if p.lower().endswith((".jpg", ".jpeg")) else "png", "path": p}
        return out

    async def apps_uninstall(self, app_id: str, purge_data: bool = False) -> dict:
        """Borra la carpeta (solo si esta dentro de qam-apps; las añadidas a mano solo se olvidan). Sus datos (`data_dirs`)
        no se tocan salvo que se pida (purge_data), y solo dentro de la carpeta personal."""
        import shutil
        aid = qam_apps.slug(app_id) if qam_apps else str(app_id)
        reg = self._apps_reg()
        info = reg.pop(aid, {}) or {}
        path = os.path.join(_apps_dir(), aid)
        removed, purged, script = False, [], None
        if os.path.isdir(path) and os.path.dirname(os.path.normpath(path)) == os.path.normpath(_apps_dir()):
            man = qam_apps.read_manifest(path) if qam_apps else {}
            if man.get("uninstall") and os.path.isfile(os.path.join(path, man["uninstall"])):
                code, text = await self._run_script(path, ["bash", os.path.join(path, man["uninstall"])], 120)
                script = f"[{code}] {text[-200:]}"
            if purge_data:
                home = os.path.normpath(_home())
                for d in man.get("data_dirs") or []:
                    e = qam_apps.expand_home(str(d), home)
                    if e.startswith(home + os.sep) and e != home and os.path.isdir(e):
                        shutil.rmtree(e, ignore_errors=True)
                        purged.append(e)
            errs: list = []
            for d in (path, os.path.join(_apps_dir(), ".previous", aid), os.path.join(_apps_dir(), ".previous", aid + ".older")):
                if not os.path.lexists(d):
                    continue
                if sys.version_info >= (3, 12):
                    shutil.rmtree(d, onexc=lambda f, p, e: errs.append(f"{p}: {e}"))
                else:
                    shutil.rmtree(d, onerror=lambda f, p, e: errs.append(f"{p}: {e[1]}"))
            removed = not os.path.exists(path)
            self._upd_log(f"desinstalar {aid}: carpeta {'borrada' if removed else 'SIGUE'}; script={script}; errores={errs[:3]}")
            if not removed:  # antes se decía «desinstalada» aunque la carpeta siguiera (ignore_errors)
                reg[aid] = info
                self._apps_reg_save(reg)
                return {"ok": False, "removed": False, "error": (errs[0] if errs else "la carpeta sigue ahí")[:200], "uninstall_script": script}
        self._apps_reg_save(reg)
        return {"ok": True, "removed": removed, "appid": info.get("appid"), "purged": purged, "uninstall_script": script}

    async def apps_run(self, app_id: str, args: str = "") -> dict:
        """Accion rapida de la app (p. ej. «mini», «pp»): ejecuta su lanzador con argumentos, sin esperar."""
        data = await self.apps_list()
        app = next((a for a in data["apps"] if a["id"] == app_id), None)
        if not app or not app.get("launch"):
            return {"ok": False}
        import shlex
        cmd = ["bash", os.path.join(app["path"], app["launch"]), *shlex.split(str(args or ""))]
        before: set = set()
        prefix: list = []
        seen: dict = {}
        display = ":0"
        tag = qam_desktop is not None and not str(args or "").strip()
        try:
            prefix, seen = await self._user_session()
            display = seen.get("DISPLAY") or ":0"
            self._xauth = seen.get("XAUTHORITY") or None
            if tag:  # abrir sin argumentos: si la app crea una ventana X (Forgeinator, pygame), gamescope solo la muestra con STEAM_GAME
                before = {w["id"] for w in await self._x_windows(prefix, display)}
        except Exception:
            tag = False
        # La app necesita la pantalla de la sesión (sin DISPLAY una app gráfica arranca «a ciegas»: Forgeinator corría sin ventana).
        gfx = {"DISPLAY": display}
        for k in ("XAUTHORITY", "WAYLAND_DISPLAY"):
            if seen.get(k):
                gfx[k] = seen[k]
        env = self._user_env()
        env.update(gfx)
        native = (app.get("controls") or {}).get("close") == "@"
        if prefix and native:  # Decky corre como root: las apps con ventana se lanzan como el usuario de la sesión
            cmd = [*prefix, *[f"{k}={v}" for k, v in gfx.items()], *cmd]
        await asyncio.create_subprocess_exec(*cmd, cwd=app["path"], env=env, stdin=asyncio.subprocess.DEVNULL,
                                             stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL, start_new_session=True)
        if tag:
            self._qam_keys.add(f"qam:{app_id}")
            self._spawn(self._desk_tag(f"qam:{app_id}", prefix, display, before, self._app_patterns(app)))
        return {"ok": True}

    async def _apps_native(self, app: dict, action: str) -> dict:
        """Menú de una app de QAM sin órdenes propias: mostrar (o abrir si está cerrada), minimizar, cerrar (SIGTERM) y forzar cierre (SIGKILL)."""
        key = f"qam:{app['id']}"
        pids = await self._app_pids(self._app_patterns(app))
        if action == "show":
            if not pids:
                return await self.apps_run(app["id"], "")
            prefix, seen = await self._user_session()
            display = seen.get("DISPLAY") or ":0"
            self._xauth = seen.get("XAUTHORITY") or None
            self._qam_keys.add(key)
            self._spawn(self._desk_tag(key, prefix, display, set(), self._app_patterns(app)))
            return {"ok": True}
        if action == "minimize":
            await self._base_off(key)
            return {"ok": True}
        if action in ("close", "kill"):
            import signal
            sig = signal.SIGKILL if action == "kill" else signal.SIGTERM
            n = 0
            for pid in sorted(pids, reverse=True):  # hijos antes que padres
                try:
                    os.kill(pid, sig)
                    n += 1
                except OSError:
                    pass
            await self._base_off(key)
            self._qam_keys.discard(key)
            return {"ok": True, "n": n} if n else {"ok": True, "error": None, "n": 0}
        return {"ok": False, "error": "acción desconocida"}

    async def apps_running(self) -> dict:
        """Apps de QAM con órdenes nativas que tienen procesos en marcha (para el «●» del cajón)."""
        data = await self.apps_list()
        ids = []
        for a in data["apps"]:
            if (a.get("controls") or {}).get("close") == "@" and a.get("launch") and await self._app_pids(self._app_patterns(a)):
                ids.append(a["id"])
        return {"ids": ids}

    async def apps_control(self, app_id: str, action: str) -> dict:
        """Menú de la app de QAM: ejecuta la orden de su lanzador para mostrar / minimizar / cerrar / forzar cierre (según su manifiesto)."""
        data = await self.apps_list()
        app = next((a for a in data["apps"] if a["id"] == app_id), None)
        args = ((app or {}).get("controls") or {}).get(action)
        if not app or not app.get("launch") or not args:
            return {"ok": False, "error": "esa app no ofrece esa opción"}
        if args == "@":
            return await self._apps_native(app, action)
        import shlex
        cmd = ["bash", os.path.join(app["path"], app["launch"]), *shlex.split(args)]
        try:
            await asyncio.create_subprocess_exec(*cmd, cwd=app["path"], env=self._user_env(), stdin=asyncio.subprocess.DEVNULL,
                                                 stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL, start_new_session=True)
        except OSError as e:
            return {"ok": False, "error": str(e)[:100]}
        if action in ("minimize", "close", "kill") and qam_desktop is not None:
            await self._base_off(f"qam:{app_id}")
            if action != "minimize":
                self._qam_keys.discard(f"qam:{app_id}")
        return {"ok": True}

    async def keyboard_log(self, text: str) -> None:
        """Anota en keyboard.log qué método se probó para abrir el teclado de Steam y qué pasó (máx. 40 KB)."""
        try:
            p = _path("keyboard.log")
            if os.path.exists(p) and os.path.getsize(p) > 40 * 1024:
                os.replace(p, p + ".1")
            with open(p, "a", encoding="utf-8") as fh:
                fh.write(f"{time.strftime('%H:%M:%S')} {str(text)[:600]}\n")
        except OSError:
            pass

    async def keyboard_url(self, close: bool = False) -> dict:
        """Respaldo para el teclado de Steam: `steam steam://open/keyboard` como el usuario (Decky corre como root). [H]"""
        url = "steam://close/keyboard" if close else "steam://open/keyboard"
        user = getattr(decky, "DECKY_USER", "") or ""
        argv = ["steam", "-ifrunning", url]
        if os.getuid() == 0 and user and user != "root":
            argv = ["runuser", "-u", user, "--", *argv]
        try:
            proc = await asyncio.create_subprocess_exec(*argv, env=self._user_env(), stdin=asyncio.subprocess.DEVNULL,
                                                        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
                                                        start_new_session=True)
            await asyncio.wait_for(proc.wait(), 5)
            return {"ok": proc.returncode == 0, "url": url}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "url": url, "error": str(e)[:120]}

    # ---- Sesiones y reinicios: si Steam se cae o se reinicia, al volver se guarda que paso ----
    def _session_path(self) -> str:
        return os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "diag", "sesion.json")

    def _session_read(self) -> dict:
        try:
            with open(self._session_path(), encoding="utf-8") as fh:
                data = json.load(fh)
            return data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            return {}

    def _session_write(self, data: dict) -> None:
        os.makedirs(os.path.dirname(self._session_path()), exist_ok=True)
        tmp = self._session_path() + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False)
        os.replace(tmp, self._session_path())

    async def diag_crumb(self, text: str) -> None:
        """Una miga: se escribe ya (max 40) para que sobreviva a un cuelgue de Steam."""
        ses = self._session_read()
        crumbs = ses.get("crumbs") if isinstance(ses.get("crumbs"), list) else []
        crumbs.append([time.strftime("%H:%M:%S"), str(text)[:160]])
        ses["crumbs"] = crumbs[-40:]
        ses["last"] = time.time()
        self._session_write(ses)

    @staticmethod
    def _steam_pid() -> dict | None:
        """PID y arranque (segundos desde el boot) del proceso steam principal."""
        try:
            hz = os.sysconf("SC_CLK_TCK")
            for pid in os.listdir("/proc"):
                if not pid.isdigit():
                    continue
                try:
                    with open(f"/proc/{pid}/comm", encoding="utf-8") as fh:
                        if fh.read().strip() != "steam":
                            continue
                    with open(f"/proc/{pid}/stat", encoding="utf-8") as fh:
                        start = int(fh.read().rsplit(")", 1)[1].split()[19]) / hz
                    return {"pid": int(pid), "start_s": round(start, 1)}
                except (OSError, ValueError, IndexError):
                    continue
        except (OSError, ValueError):
            pass
        return None

    # Ruido conocido que tapaba lo importante (0.25.0 guardo 160 lineas de «pipewire: out of buffers»).
    _NOISE = ("out of buffers", "TagLib:", "vk_wsi_force_swapchain", "nis_steam_sharpness", "xkbcomp", "Gamescope WSI",
              "pApplicationName", "applicationVersion", "pEngineName", "engineVersion", "apiVersion", "Executable name",
              "Forcing on VK_EXT", "ProtonFixes", "CAPIJobRequestUserStats")
    _EVIDENCE = ("orca", "core", "dump", "assert", "segv", "sigsegv", "sigabrt", "webhelper", "crash", "oom", "killed",
                 "exited", "restart", "fatal", "abort", "plugin_loader", "decky", "gamescope-session", "main process")

    @classmethod
    def _clean(cls, lines: list, limit: int) -> list:
        """Sin ruido conocido y sin repetidas (ignorando hora y PID): lo que de verdad paso."""
        import re
        out, seen = [], set()
        for l in lines:
            if any(n in l for n in cls._NOISE):
                continue
            key = re.sub(r"\[\d+\]|\d+", "#", l[26:] if len(l) > 26 else l)[:160]
            if key in seen:
                continue
            seen.add(key)
            out.append(l[:300])
        return out[-limit:]

    async def _forensics(self, since_ts: float | None = None) -> dict:
        """Registros ALREDEDOR del corte: desde 90 s antes de la ultima miga hasta ahora, sin ruido, mas volcados
        de Steam (/tmp/dumps), estado de orca (lector de pantalla) y si el sistema acaba de encender."""
        out: dict = {}
        now = time.time()
        start = (since_ts or now - 1200) - 90
        since = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(start))
        steam_logs = os.path.join(_home(), ".local", "share", "Steam", "logs")
        for name in ("console_log.txt", "console-linux.txt", "webhelper.txt", "cef_log.txt"):
            p = os.path.join(steam_logs, name)
            if os.path.isfile(p):
                try:
                    with open(p, encoding="utf-8", errors="replace") as fh:
                        lines = fh.read()[-60000:].splitlines()
                    # Solo lo fechado dentro de la ventana (las lineas empiezan por [AAAA-MM-DD hh:mm:ss]).
                    keep = [l for l in lines if l[1:20] >= since[:19]] or lines[-40:]
                    out[name] = self._clean(keep, 120)
                except OSError:
                    pass
        env = self._user_env()

        async def cmd(*args: str) -> list:
            try:
                proc = await asyncio.create_subprocess_exec(*args, env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
                data, _ = await asyncio.wait_for(proc.communicate(), timeout=20)
                return data.decode("utf-8", "replace").splitlines()
            except Exception as exc:  # noqa: BLE001
                return [f"(no disponible: {exc})"]

        ju = await cmd("journalctl", "--user", "--no-pager", "-o", "short-iso", "--since", since, "-n", "4000")
        js = await cmd("journalctl", "--no-pager", "-o", "short-iso", "--since", since, "-n", "6000")
        out["journal_usuario"] = self._clean(ju, 150)
        out["evidencias"] = self._clean([l for l in ju + js if any(k in l.lower() for k in self._EVIDENCE)], 120)
        dumps = []
        for d in ("/tmp/dumps", os.path.join(_home(), ".local", "share", "Steam", "dumps")):
            try:
                for f in os.listdir(d):
                    p = os.path.join(d, f)
                    mt = os.path.getmtime(p)
                    if mt >= start - 600:
                        dumps.append({"archivo": f, "hora": time.strftime("%H:%M:%S", time.localtime(mt)), "kb": os.path.getsize(p) // 1024})
            except OSError:
                pass
        out["volcados_steam"] = sorted(dumps, key=lambda x: x["hora"])
        # El texto del aviso que hizo saltar cada volcado («Assertion Failed: ...», fichero.cpp:linea).
        for dmp in out["volcados_steam"][-3:]:
            if dmp["archivo"].endswith(".dmp"):
                for d in ("/tmp/dumps", os.path.join(_home(), ".local", "share", "Steam", "dumps")):
                    pth = os.path.join(d, dmp["archivo"])
                    if os.path.isfile(pth):
                        dmp["texto"] = self._dump_strings(pth)
                        break
        # ¿Se reinicio TODA la sesion de juego (gamescope + Xwayland), no solo Steam? Entonces el fallo no es de Steam
        # ni de un plugin: es del compositor (se ve como «Fatal IO error ... on X server» y gamescope arrancando de nuevo).
        allj = ju + js
        steam_lines = [l for k in ("webhelper.txt", "console-linux.txt", "console_log.txt") for l in (out.get(k) or []) if isinstance(l, str)]
        x_lost = [l for l in steam_lines + allj if "Fatal IO error" in l or "X server" in l and "lost" in l.lower()]
        gs_start = [l for l in allj if "gamescope version" in l or "OpenGamepadUI v" in l]
        out["sesion_grafica"] = {"servidor_x_perdido": x_lost[:4], "gamescope_arranco": gs_start[:4],
                                 "fin_del_juego": [l for l in steam_lines if "TerminateApp" in l or "Game process removed" in l][-3:]}
        # Las ultimas lineas del gamescope que murio (sin la ayuda de su consola), por si dice por que.
        pids = []
        for l in allj:
            m = l.split("gamescope-session-plus[", 1)
            if len(m) == 2:
                pid = m[1].split("]", 1)[0]
                if pid not in pids:
                    pids.append(pid)
        if len(pids) > 1:
            old = [l for l in allj if f"gamescope-session-plus[{pids[0]}]" in l and "console:" not in l and "binding:" not in l]
            out["gamescope_anterior"] = self._clean(old[-40:], 40)
            # OpenGamepadUI (Godot) al cerrarse deja «leaked at exit» / «Unreferenced static string»: si aparece, fue
            # el que se cerro y con el cayo la sesion (zip 2026-11-07 21:19).
            ogui = [l for l in old if "at exit" in l or "Unreferenced static string" in l]
            out["sesion_grafica"]["opengamepadui_se_cerro"] = bool(ogui)
            out["sesion_grafica"]["hora_cierre_opengamepadui"] = ogui[0][:25] if ogui else None
        out["orca"] = (await cmd("systemctl", "--user", "show", "orca", "-p", "ActiveState", "-p", "NRestarts", "-p", "Result"))[:4]
        try:
            with open("/proc/uptime", encoding="utf-8") as fh:
                out["uptime_s"] = float(fh.read().split()[0])
        except (OSError, ValueError):
            pass
        out["ventana"] = [since, time.strftime("%Y-%m-%d %H:%M:%S")]
        return out

    @staticmethod
    def _dump_strings(path: str) -> list:
        """Cadenas legibles de un volcado de Steam que parecen el motivo (assert, fichero .cpp, error)."""
        import re
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

    async def session_begin(self, info: dict) -> dict:
        """El frontend arranco. Si la sesion anterior no se cerro limpia (Steam se cayo, se reinicio o se cambio de
        modo), se guarda en el informe: migas de antes, registros y si Steam cambio de proceso."""
        prev = self._session_read()
        steam = self._steam_pid()
        unclean = bool(prev.get("open"))
        saved = None
        if unclean:
            report = {
                "fecha": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "sesion_anterior": {k: prev.get(k) for k in ("started", "last", "info", "steam")},
                "steam_ahora": steam,
                "steam_reiniciado": bool(prev.get("steam") and steam and prev["steam"].get("pid") != steam.get("pid")),
                "segundos_desde_ultima_miga": round(time.time() - float(prev.get("last") or time.time()), 1),
                "migas": prev.get("crumbs") or [],
                "arranque_actual": info,
                "registros": await self._forensics(float(prev.get("last") or 0) or None),
            }
            up = report["registros"].get("uptime_s") or 1e9
            # Que tipo de corte fue (para no confundir un apagado con un cuelgue).
            sg = report["registros"].get("sesion_grafica") or {}
            report["tipo"] = ("encendido del sistema (apagado o reinicio de la consola)" if up < 240
                              else "toda la sesión de juego se reinició: se cerró OpenGamepadUI (y Steam cayó con ella)"
                              if sg.get("opengamepadui_se_cerro")
                              else "toda la sesión de juego se reinició (gamescope/Xwayland cayó; Steam cayó con ella)"
                              if sg.get("servidor_x_perdido") or (sg.get("gamescope_arranco") and report["steam_reiniciado"])
                              else "Steam se reinicio (proceso nuevo)" if report["steam_reiniciado"]
                              else "solo la interfaz de Steam se recargo (mismo proceso)")
            report["volcado_de_steam"] = bool(report["registros"].get("volcados_steam"))
            inf = self._informe_read()
            sec = inf["secciones"].get("reinicios") if isinstance(inf["secciones"].get("reinicios"), dict) else {}
            lista = sec.get("datos") if isinstance(sec.get("datos"), list) else []
            await self.diag_section("reinicios", ([report] + lista)[:6])
            saved = report["fecha"]
        self._session_write({"open": True, "started": time.time(), "last": time.time(), "info": info, "steam": steam,
                             "crumbs": [[time.strftime("%H:%M:%S"), f"arranque (listo en {round(((info or {}).get('settledAt') or 0) - ((info or {}).get('loadedAt') or 0))} ms)"]]})
        return {"previous_unclean": unclean, "saved": saved}

    async def session_end(self) -> None:
        ses = self._session_read()
        ses["open"] = False
        ses["ended"] = time.time()
        self._session_write(ses)

    # ---- Explorar un tema de CSS Loader (para adaptar la apariencia del panel) ----
    async def theme_explore(self, name: str) -> dict:
        """theme.json, archivos (con tamaño), variables CSS, colores mas usados y url() de un tema instalado."""
        import re
        root = os.path.join(getattr(decky, "DECKY_HOME", None) or os.path.join(_home(), "homebrew"), "themes")
        folder = None
        try:
            for d in sorted(os.listdir(root)):
                tj = os.path.join(root, d, "theme.json")
                if os.path.isfile(tj):
                    try:
                        with open(tj, encoding="utf-8") as fh:
                            meta = json.load(fh)
                    except (OSError, ValueError):
                        continue
                    if str(meta.get("name", d)) == str(name) or d == str(name):
                        folder = os.path.join(root, d)
                        break
        except OSError:
            return {"error": f"sin carpeta de temas en {root}"}
        if not folder:
            return {"error": f"no encuentro el tema «{name}» en {root}"}
        files, css_text = [], {}
        for dirpath, _dirs, fnames in os.walk(folder):
            for f in fnames:
                p = os.path.join(dirpath, f)
                rel = os.path.relpath(p, folder)
                files.append({"archivo": rel, "kb": round(os.path.getsize(p) / 1024, 1)})
                if f.endswith(".json") and os.path.getsize(p) < 80_000 and f != "theme.json":
                    try:
                        with open(p, encoding="utf-8", errors="replace") as fh:
                            css_text["json:" + rel] = fh.read(80_000)
                    except OSError:
                        pass
                if f.endswith(".css") and len(css_text) < 40:
                    try:
                        with open(p, encoding="utf-8", errors="replace") as fh:
                            css_text[rel] = fh.read(120_000)
                    except OSError:
                        pass
        allcss = "\n".join(css_text.values())
        colors: dict = {}
        for m in re.findall(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)", allcss):
            colors[m.lower()] = colors.get(m.lower(), 0) + 1
        with open(os.path.join(folder, "theme.json"), encoding="utf-8") as fh:
            meta = json.load(fh)
        return {
            "carpeta": folder, "theme_json": meta, "archivos": sorted(files, key=lambda x: x["archivo"])[:300],
            "variables": sorted(set(re.findall(r"(--[\w-]+)\s*:", allcss)))[:200],
            "colores": sorted(colors.items(), key=lambda x: -x[1])[:40],
            "urls": sorted(set(re.findall(r"url\(([^)]{1,200})\)", allcss)))[:80],
            "css": {k: v[:60_000] for k, v in sorted(css_text.items(), key=lambda kv: (not kv[0].startswith("json:"), kv[0] not in ("tokens.css", "qam.css", "panel.css"), kv[0]))[:16]},
        }

    # ---- Wi-Fi por NetworkManager (nmcli): Steam solo da el estado en protobuf ----
    # ---- Audio (PipeWire, wpctl): salida y micrófono ----
    async def _wpctl(self, *args: str, timeout: float = 6) -> tuple:
        return await self._acmd("wpctl", *args, timeout=timeout)

    async def _acmd(self, prog: str, *args: str, timeout: float = 6) -> tuple:
        try:
            proc = await asyncio.create_subprocess_exec(prog, *args, env=self._user_env(),
                                                        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            return proc.returncode, out.decode("utf-8", "replace"), err.decode("utf-8", "replace")
        except FileNotFoundError:
            return 127, "", f"{prog} no está instalado"
        except asyncio.TimeoutError:
            return 124, "", "tiempo agotado"

    async def audio_state(self, raw: bool = False) -> dict:
        """Salidas y micrófonos que se pueden elegir (con el filtro de altavoces en vez de la tarjeta en crudo)."""
        # Caché de 4 s (lo pide cada tarjeta de audio abierta): cada lectura lanza 5 procesos contra PipeWire.
        c = getattr(self, "_audio_cache", None)
        if not raw and c and time.monotonic() - c[0] < 4.0:
            return c[1]
        res = await self._audio_state_read(raw)
        if not raw and res.get("ok"):
            self._audio_cache = (time.monotonic(), res)
        return res

    async def _audio_state_read(self, raw: bool) -> dict:
        import qam_audio
        code, out, err = await self._wpctl("status")
        if code != 0:
            return {"ok": False, "error": (err or out).strip()[:200]}
        st = qam_audio.parse_status(out)
        _, si, _ = await self._wpctl("inspect", "@DEFAULT_AUDIO_SINK@")
        _, so, _ = await self._wpctl("inspect", "@DEFAULT_AUDIO_SOURCE@")
        # Con el ecualizador de Panel delante hay que saber a qué dispositivo real manda el sonido (ver qam_audio.choices).
        names, dest, links = {}, None, ""
        if any(qam_audio._EQ.search(f["nombre"].strip()) for f in st.get("filtros_salida") or []):
            (_, ps, _), (_, links, _) = await asyncio.gather(self._acmd("pactl", "list", "sinks"), self._acmd("pw-link", "-l"))
            names = qam_audio.sink_object_ids(ps)
            for o in st.get("salidas") or []:  # sin «object.id» en pactl: el nombre interno sale de wpctl inspect
                if o["id"] not in names:
                    _c, ins, _e = await self._wpctl("inspect", str(o["id"]))
                    nm = re.search(r'node\.name\s*=\s*"([^"]+)"', ins)
                    if nm:
                        names[o["id"]] = nm.group(1)
            dest = qam_audio.eq_target(links, names)
        res = {"ok": True, **qam_audio.choices(st, qam_audio.inspect_id(si), qam_audio.inspect_id(so), names, dest)}
        if raw:  # para el diagnóstico: lo que dice PipeWire tal cual
            res["wpctl_status"] = out[:4000]
            res["defecto_salida"] = si[:800]
            res["nombres"] = names
            res["enlaces_eq"] = "\n".join(l for l in links.splitlines() if "pdc_eq" in l or "|->" in l)[:1500]
        return res

    async def audio_trace(self, seconds: int = 20) -> dict:
        """Sigue el audio unos segundos (solo lee): quién es la salida por defecto, a dónde manda el ecualizador de
        Panel, volumen/silencio/estado de cada salida y a qué salida va cada flujo. Guarda solo los cambios, con su
        segundo. Al final: cortes (pw-top), perfil y códec Bluetooth, reinicios de filter-chain y el registro."""
        import qam_audio
        import re as _re
        import time as _t
        seconds = max(5, min(60, int(seconds)))
        t0, prev, log, n = _t.monotonic(), None, [], 0
        while _t.monotonic() - t0 < seconds:
            (_, d, _), (_, ls, _), (_, lk, _), (_, sh, _), (_, si, _) = await asyncio.gather(
                self._acmd("pactl", "get-default-sink"), self._acmd("pactl", "list", "sinks"), self._acmd("pw-link", "-l"),
                self._acmd("pactl", "list", "short", "sinks"), self._acmd("pactl", "list", "short", "sink-inputs"))
            names = qam_audio.sink_names(sh)
            dest = qam_audio.eq_target(lk, names)
            sinks = {k: v for k, v in qam_audio.parse_sinks(ls).items() if _re.search(r"pdc_eq|alsa_output|bluez_output|\bEQ\b", k)}
            flujos = sorted(names.get(int(f[1]), f[1]) for f in (x.split() for x in si.splitlines()) if len(f) > 1 and f[1].isdigit())
            now = {"defecto": d.strip(), "destino_eq": names.get(dest) if dest else None, "sinks": sinks, "flujos": flujos}
            ch = qam_audio.trace_diff(prev, now)
            if ch:
                log.append({"s": round(_t.monotonic() - t0, 1), "cambios": ch, **(now if prev is None else {})})
            prev, n = now, n + 1
            await asyncio.sleep(0.5)
        (_, top, _), (_, cards, _), (_, fc, _), (_, ju, _), (_, md, _) = await asyncio.gather(
            self._acmd("pw-top", "-b", "-n", "3", timeout=10), self._acmd("pactl", "list", "cards"),
            self._acmd("systemctl", "--user", "show", "filter-chain.service", "-p", "NRestarts", "-p", "ActiveState", "-p", "ActiveEnterTimestamp"),
            self._acmd("journalctl", "--user", "--no-pager", "-o", "short-iso", "--since", "-5min", "-n", "3000", timeout=10),
            self._acmd("pw-metadata", "-n", "default"))
        (_, sl, _), (_, wf, _) = await asyncio.gather(
            self._acmd("pactl", "list", "sinks"), self._acmd("nmcli", "-t", "-f", "active,ssid,chan,freq,signal", "dev", "wifi"))
        bt = [l.strip() for l in cards.splitlines() if _re.search(r"bluez_card|Active Profile|Perfil activo|api\.bluez5\.codec|bluetooth\.battery|device\.description", l)]
        bt += [l.strip() for l in sl.splitlines() if _re.search(r"bluez5\.codec|api\.bluez5\.profile|node\.latency|api\.bluez5\.address", l)]
        wifi_on = [l for l in wf.splitlines() if l.startswith("yes")]
        jr = [l for l in ju.splitlines() if _re.search(r"pipewire|wireplumber|filter-chain|bluez|bluetooth|xrun|underrun|pdc_eq|spa\.|rtkit", l, _re.I)]
        return {"ok": True, "segundos": seconds, "muestras": n, "final": prev, "cambios": log[:120],
                "pw_top": "\n".join(top.splitlines()[-40:])[:3500], "bluetooth": bt[:30], "filter_chain": fc.strip(),
                "metadata": md[:1200], "wifi": wifi_on[:2],
                "reinicios_eq": sum(1 for l in jr if "Started filter-chain.service" in l), "registro": jr[-80:]}

    async def audio_reset(self) -> dict:
        """Vuelve a la salida que elige el sistema (deshace una elección; en Bazzite, el filtro de los altavoces)."""
        self._audio_cache = None
        import qam_audio
        code, out, err = await self._wpctl("clear-default")
        if code == 0:
            return {"ok": True, "detail": "clear-default"}
        _, txt, _ = await self._wpctl("status")
        filt = qam_audio.parse_status(txt).get("filtros_salida") or []
        if filt:
            c2, o2, e2 = await self._wpctl("set-default", str(filt[0]["id"]))
            return {"ok": c2 == 0, "detail": f"set-default {filt[0]['id']} {(e2 or o2).strip()[:120]}"}
        return {"ok": False, "detail": (err or out).strip()[:200]}

    async def audio_set_default(self, node: int) -> dict:
        self._audio_cache = None
        code, out, err = await self._wpctl("set-default", str(int(node)))
        detail = (err or out).strip()[:200]
        if code == 0:
            detail = (detail + " " + await self._real_sink_full(int(node))).strip()
        return {"ok": code == 0, "detail": detail}

    async def _real_sink_full(self, node: int) -> str:
        """0.49.7: con el ecualizador de Panel delante, el volumen que se mueve es el del EQ (100 %) y el del dispositivo real
        (tarjeta analogica) se queda donde lo dejo la ultima vez: se vieron 1 % y 40 % con el EQ al 100 % → altavoces «bajos».
        Al elegir un dispositivo real con ruta fisica (alsa), se sube a 100 %; el volumen se gobierna desde el EQ.
        No se toca el Bluetooth (volumen absoluto del propio auricular)."""
        try:
            code, out, _ = await self._wpctl("inspect", str(node))
            if code != 0 or not re.search(r'node\.name = "alsa_output', out):
                return ""
            code, out, _ = await self._wpctl("get-volume", str(node))
            m = re.search(r"Volume:\s*([0-9.]+)", out)
            if code != 0 or not m or float(m.group(1)) >= 0.9:
                return ""
            await self._wpctl("set-volume", str(node), "1.00")
            await self._wpctl("set-mute", str(node), "0")
            return f"[volumen del dispositivo {round(float(m.group(1)) * 100)} % → 100 %]"
        except Exception as e:  # nunca debe romper el cambio de salida
            return f"[volumen: {e}]"

    # ---- Refuerzo por fuente (0.61): vídeo, música, juegos suben; los sonidos del sistema no ----
    def _boost_cfg(self) -> dict:
        try:
            with open(_path("audio-boost.json"), encoding="utf-8") as fh:
                c = json.load(fh)
        except (OSError, ValueError):
            c = {}
        c = c if isinstance(c, dict) else {}
        import qam_audio
        return {"pct": qam_audio.clamp_pct(c.get("pct", 100)),
                "ov": {str(k): v for k, v in (c.get("ov") or {}).items() if isinstance(v, bool)} if isinstance(c.get("ov"), dict) else {},
                "seen": [str(x) for x in (c.get("seen") or []) if isinstance(x, str)][:16], "mig2": bool(c.get("mig2", False))}

    def _boost_save(self, cfg: dict) -> None:
        try:  # atómico: si Decky recarga a mitad de escritura, el archivo no queda cortado (dev.62 lo dejó a medias)
            tmp = _path("audio-boost.json") + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(cfg, fh)
            os.replace(tmp, _path("audio-boost.json"))
        except OSError as exc:
            decky.logger.error(f"refuerzo: {exc}")

    async def _boost_streams(self) -> list:
        import qam_audio
        code, out, _ = await self._acmd("pactl", "list", "sink-inputs")
        return qam_audio.parse_sink_inputs(out) if code == 0 else []

    async def _boost_apply(self, streams: list, cfg: dict) -> int:
        import qam_audio
        applied = getattr(self, "_boost_applied", None)
        if applied is None:
            applied = self._boost_applied = {}
        todo = qam_audio.plan_boost(streams, cfg["pct"], cfg["ov"], applied)
        for sid, pct in todo:
            await self._acmd("pactl", "set-sink-input-volume", str(sid), f"{pct}%")
        return len(todo)

    async def _boost_migrate(self, cfg: dict) -> None:
        """Una vez: deshace lo que dejaron dev.61 y dev.62 (subían el dispositivo y los flujos internos del ecualizador, y con ellos los
        avisos de Steam). Los altavoces reales y los flujos sin app que estén por encima de 100 % vuelven a 100 %."""
        import qam_audio
        code, out, _ = await self._acmd("pactl", "list", "sinks")
        if code == 0:
            for name, v in qam_audio.parse_sinks(out).items():
                if name.startswith("alsa_output") and (v.get("vol") or 0) > 100:
                    await self._acmd("pactl", "set-sink-volume", name, "100%")
                    decky.logger.info(f"refuerzo: {name} volvía a {v.get('vol')} % → 100 %")
        for s in await self._boost_streams():
            if qam_audio.is_anonymous(s) and (s.get("vol") or 0) > 100:
                await self._acmd("pactl", "set-sink-input-volume", str(s["id"]), "100%")
                decky.logger.info(f"refuerzo: flujo interno «{s.get('nombre')}» volvía a {s.get('vol')} % → 100 %")
        cfg["mig2"] = True
        self._boost_save(cfg)

    async def _boost_loop(self) -> None:
        """Mientras haya refuerzo (o algo reforzado que devolver), cada 2 s mira los flujos y fija el volumen de los nuevos. Sin refuerzo, duerme sin lanzar nada."""
        while True:
            try:
                cfg = self._boost_cfg()
                if not cfg["mig2"]:
                    await self._boost_migrate(cfg)
                active = cfg["pct"] > 100 or any(v != 100 for v in (getattr(self, "_boost_applied", None) or {}).values())
                if active:
                    streams = await self._boost_streams()
                    await self._boost_apply(streams, cfg)
                await asyncio.sleep(2.0 if active else 5.0)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                decky.logger.error(f"refuerzo: {exc}")
                await asyncio.sleep(10)

    async def audio_boost(self) -> dict:
        """Nivel de refuerzo y las fuentes: las que suenan ahora y las vistas hace poco, cada una con «refuerza» (sí/no)."""
        import qam_audio
        cfg = self._boost_cfg()
        streams = await self._boost_streams()
        seen = list(cfg["seen"])
        for s in streams:
            if s["app"] not in seen and s["app"] != "?":
                seen.insert(0, s["app"])
        seen = seen[:16]
        if seen != cfg["seen"]:
            cfg["seen"] = seen
            self._boost_save(cfg)
        playing = {s["app"]: s for s in streams if not s["pausado"]}
        apps = []
        for name in seen:
            s = playing.get(name) or next((x for x in streams if x["app"] == name), None) or {"app": name, "rol": "", "binario": ""}
            apps.append({"app": name, "suena": name in playing, "sistema": qam_audio.is_system_stream(s), "refuerza": qam_audio.boost_on(s, cfg["ov"])})
        apps.sort(key=lambda a: (not a["suena"], a["sistema"], a["app"].lower()))
        return {"ok": True, "pct": cfg["pct"], "apps": apps}

    async def audio_boost_set(self, pct: int | None = None, app: str | None = None, on: bool | None = None) -> dict:
        import qam_audio
        cfg = self._boost_cfg()
        if pct is not None:
            cfg["pct"] = qam_audio.clamp_pct(pct)
        if app is not None and on is not None:
            cfg["ov"][str(app)] = bool(on)
        self._boost_save(cfg)
        n = await self._boost_apply(await self._boost_streams(), cfg)
        return {"ok": True, "pct": cfg["pct"], "tocados": n}

    async def audio_mute(self, node: int, on: bool) -> dict:
        self._audio_cache = None
        code, out, err = await self._wpctl("set-mute", str(int(node)), "1" if on else "0")
        return {"ok": code == 0, "detail": (err or out).strip()[:200]}

    async def audio_volume(self, node: int, vol: float) -> dict:
        self._audio_cache = None
        import qam_audio
        v = qam_audio.clamp_vol(vol)  # 0.61: hasta 2.0 (refuerzo de volumen por software en la salida)
        code, out, err = await self._wpctl("set-volume", str(int(node)), f"{v:.2f}")
        return {"ok": code == 0, "detail": (err or out).strip()[:200]}

    async def _nmcli(self, *args: str, timeout: float = 20) -> tuple:
        try:
            proc = await asyncio.create_subprocess_exec("nmcli", *args, env=self._user_env(),
                                                        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            return proc.returncode, out.decode("utf-8", "replace"), err.decode("utf-8", "replace")
        except FileNotFoundError:
            return 127, "", "nmcli no esta instalado"
        except asyncio.TimeoutError:
            return 124, "", "tiempo agotado"

    @staticmethod
    def _split_terse(line: str) -> list:
        """Campos de «nmcli -t» (separados por «:», con «\\:» escapado)."""
        out, cur, esc = [], "", False
        for ch in line:
            if esc:
                cur += ch
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == ":":
                out.append(cur)
                cur = ""
            else:
                cur += ch
        out.append(cur)
        return out

    async def wifi_state(self, rescan: bool = False) -> dict:
        """Radio, red actual y redes visibles (con señal, seguridad y si estan guardadas)."""
        # Las tres lecturas a la vez (antes en fila: el estado tardaba en llegar).
        (code, radio, err), (_c, saved_out, _e), (_c2, lst, _e2) = await asyncio.gather(
            self._nmcli("-t", "-f", "WIFI", "radio"),
            self._nmcli("-t", "-f", "NAME,TYPE", "connection", "show"),
            self._nmcli("-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY,CHAN", "device", "wifi", "list", "--rescan", "yes" if rescan else "no", timeout=30),
        )
        if code != 0:
            return {"ok": False, "error": err.strip() or f"nmcli {code}"}
        saved = {self._split_terse(l)[0] for l in saved_out.splitlines() if l.endswith(":802-11-wireless")}
        nets, seen = [], set()
        for l in lst.splitlines():
            f = self._split_terse(l)
            if len(f) < 5 or not f[1] or f[1] in seen:
                continue
            seen.add(f[1])
            nets.append({"ssid": f[1], "active": f[0].strip() == "*", "signal": int(f[2] or 0), "security": f[3], "channel": f[4], "saved": f[1] in saved})
        nets.sort(key=lambda n: (not n["active"], not n["saved"], -n["signal"]))
        return {"ok": True, "radio": radio.strip() == "enabled", "networks": nets[:20], "saved": sorted(saved)}

    async def wifi_connect(self, ssid: str) -> dict:
        """Conecta a una red GUARDADA (las nuevas, con contraseña, desde Ajustes de Steam)."""
        code, out, err = await self._nmcli("connection", "up", "id", str(ssid), timeout=45)
        return {"ok": code == 0, "detail": (out or err).strip()[-300:]}

    async def wifi_radio(self, on: bool) -> dict:
        code, out, err = await self._nmcli("radio", "wifi", "on" if on else "off")
        log = [(out or err).strip()[-120:]]
        if on:
            # Si lo bloqueó rfkill (lo que hace el interruptor del sistema), nmcli solo no lo enciende.
            await self._rfkill("unblock", "wifi")
            await self._nmcli("radio", "wifi", "on")
        await asyncio.sleep(1.0)
        _c, now, _e = await self._nmcli("-t", "-f", "WIFI", "radio")
        if not on and now.strip() == "enabled":
            # NetworkManager lo dejó encendido (o algo lo reenciende): se bloquea en el núcleo.
            await self._rfkill("block", "wifi")
            log.append("rfkill block")
            await asyncio.sleep(1.0)
            _c, now, _e = await self._nmcli("-t", "-f", "WIFI", "radio")
        ok = (now.strip() == "enabled") == bool(on)
        return {"ok": ok, "detail": ("sigue " + now.strip() + ": " if not ok else "") + " | ".join(x for x in log if x)[-200:]}

    async def _rfkill(self, action: str, kind: str) -> bool:
        try:
            proc = await asyncio.create_subprocess_exec("rfkill", action, kind, stdout=asyncio.subprocess.DEVNULL,
                                                        stderr=asyncio.subprocess.DEVNULL)
            await asyncio.wait_for(proc.wait(), timeout=4)
            return proc.returncode == 0
        except Exception:  # noqa: BLE001
            return False

    async def diag_mark(self, step: str, estado: str, detalle: str = "") -> bool:
        """Luz de cada prueba (ok / aviso / error / saltada) con fecha y version, para verla de un vistazo."""
        inf = self._informe_read()
        est = inf.get("estados") if isinstance(inf.get("estados"), dict) else {}
        est[str(step)[:60]] = {"estado": str(estado)[:12], "detalle": str(detalle)[:160],
                               "fecha": time.strftime("%Y-%m-%dT%H:%M:%S"), "version": getattr(decky, "DECKY_PLUGIN_VERSION", None)}
        inf["estados"] = est
        self._informe_write(inf)
        return True

    async def diag_states(self) -> dict:
        inf = self._informe_read()
        return inf.get("estados") if isinstance(inf.get("estados"), dict) else {}

    # ---- Bluetooth por BlueZ (bluetoothctl): esta version de Steam ya no expone SteamClient.System.Bluetooth ----
    async def _btctl(self, *args: str, timeout: float = 15) -> tuple:
        try:
            proc = await asyncio.create_subprocess_exec("bluetoothctl", *args, env=self._user_env(),
                                                        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
                                                        stdin=asyncio.subprocess.DEVNULL)
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            return proc.returncode, out.decode("utf-8", "replace")
        except FileNotFoundError:
            return 127, "bluetoothctl no esta instalado"
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except Exception:  # noqa: BLE001
                pass
            return 124, "tiempo agotado"

    @staticmethod
    def _bt_info(text: str) -> dict:
        info = {}
        for line in text.splitlines():
            line = line.strip()
            if ":" in line:
                k, v = line.split(":", 1)
                info[k.strip()] = v.strip()
        return info

    async def bt_state(self) -> dict:
        """Adaptador (encendido, buscando) y dispositivos conocidos con tipo, conexion, emparejado y señal."""
        code, show = await self._btctl("show")
        if code != 0 or "Controller" not in show:
            return {"ok": False, "error": show.strip()[-200:] or f"bluetoothctl {code}"}
        sh = self._bt_info(show)

        async def listed(*flt: str) -> dict:
            _c, txt = await self._btctl("devices", *flt)
            res = {}
            for line in txt.splitlines():
                parts = line.strip().split(" ", 2)
                if len(parts) == 3 and parts[0] == "Device":
                    res[parts[1]] = parts[2]
            return res

        # Las tres listas a la vez (antes en fila: cada lectura tardaba el triple).
        every, paired, connected = await asyncio.gather(listed(), listed("Paired"), listed("Connected"))
        out = []
        # Solo los emparejados se consultan uno a uno (tipo de dispositivo); los de cerca, solo nombre.
        # El tipo de cada emparejado no cambia: se pregunta una vez (antes: 7+ procesos en cada lectura).
        icons = getattr(self, "_bt_icons", None) or {}
        self._bt_icons = icons
        for mac, name in paired.items():
            if mac not in icons:
                _c, it = await self._btctl("info", mac, timeout=6)
                icons[mac] = self._bt_info(it)
            inf = icons[mac]
            out.append({"mac": mac, "name": inf.get("Alias") or name, "icon": inf.get("Icon", ""), "connected": mac in connected,
                        "paired": True, "rssi": None})
        for mac, name in every.items():
            if mac in paired or name.replace("-", ":").upper() == mac.upper():
                continue
            out.append({"mac": mac, "name": name, "icon": "", "connected": mac in connected, "paired": False, "rssi": None})
        return {"ok": True, "powered": sh.get("Powered") == "yes", "discovering": sh.get("Discovering") == "yes", "devices": out[:40]}

    async def bt_action(self, action: str, mac: str = "") -> dict:
        """power-on / power-off / connect / disconnect / pair (pair + trust + connect) / remove."""
        import re
        if mac and not re.fullmatch(r"[0-9A-Fa-f:]{17}", mac):
            return {"ok": False, "detail": "MAC no valida"}
        steps = {
            "power-on": [("power", "on")], "power-off": [("power", "off")],
            "connect": [("connect", mac)], "disconnect": [("disconnect", mac)],
            "pair": [("pair", mac), ("trust", mac), ("connect", mac)], "remove": [("remove", mac)],
        }.get(action)
        if not steps:
            return {"ok": False, "detail": "accion desconocida"}
        log = []
        if action == "power-on":
            # Si el Bluetooth esta bloqueado por rfkill, «power on» falla con org.bluez.Error.Blocked.
            try:
                proc = await asyncio.create_subprocess_exec("rfkill", "unblock", "bluetooth", stdout=asyncio.subprocess.DEVNULL,
                                                            stderr=asyncio.subprocess.DEVNULL)
                await asyncio.wait_for(proc.wait(), timeout=4)
            except Exception:  # noqa: BLE001
                pass
        for st in steps:
            code, out = await self._btctl(*st, timeout=20)
            log.append(out.strip()[-160:])
            if code != 0 and st[0] != "trust":
                return {"ok": False, "detail": " | ".join(log)[-300:]}
        if action == "power-off":
            # «power off» de BlueZ deja la radio sin bloquear y Steam la vuelve a encender (diagnóstico 14‑11): se bloquea
            # también en el núcleo (rfkill), que es lo que hace de verdad el interruptor del sistema.
            try:
                proc = await asyncio.create_subprocess_exec("rfkill", "block", "bluetooth", stdout=asyncio.subprocess.DEVNULL,
                                                            stderr=asyncio.subprocess.DEVNULL)
                await asyncio.wait_for(proc.wait(), timeout=4)
                log.append("rfkill block")
            except Exception:  # noqa: BLE001
                log.append("rfkill no disponible")
            await asyncio.sleep(0.8)
            _c, show = await self._btctl("show", timeout=6)
            if "Powered: yes" in show:
                return {"ok": False, "detail": "sigue encendido: " + " | ".join(log)[-240:]}
        return {"ok": True, "detail": " | ".join(log)[-300:]}

    async def bt_scan(self, seconds: int = 20) -> dict:
        """Busca dispositivos durante unos segundos (en segundo plano: luego se leen con bt_state)."""
        secs = max(5, min(int(seconds or 20), 60))
        asyncio.get_running_loop().create_task(self._btctl("--timeout", str(secs), "scan", "on", timeout=secs + 5))
        return {"ok": True, "seconds": secs}

    async def post_game_sample(self, seconds: int = 10) -> dict:
        """Que ocupa la CPU justo al salir de un juego: carga media y procesos que mas consumen (top, 2 muestras)."""
        secs = max(3, min(int(seconds or 10), 20))

        def loadavg() -> list:
            try:
                with open("/proc/loadavg", encoding="utf-8") as fh:
                    return fh.read().split()[:3]
            except OSError:
                return []

        start = loadavg()
        top = []
        try:
            proc = await asyncio.create_subprocess_exec("top", "-b", "-n", "2", "-d", str(secs), "-o", "%CPU", "-w", "200",
                                                        env=self._user_env(), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=secs + 10)
            text = out.decode("utf-8", "replace")
            # La segunda muestra es la del intervalo (la primera es desde el arranque).
            last = text.split("top - ")[-1].splitlines()
            hdr = next((i for i, l in enumerate(last) if l.strip().startswith("PID")), None)
            if hdr is not None:
                for l in last[hdr + 1:hdr + 13]:
                    parts = l.split()
                    if len(parts) >= 12:
                        row = {"cpu": parts[8], "mem": parts[9], "proceso": " ".join(parts[11:])[:60]}
                        # Quien es de verdad (p. ej. gst-launch-1.0 = una grabacion/captura de pantalla en marcha).
                        if parts[0].isdigit() and not row["proceso"].startswith("steamwebhelper"):
                            try:
                                with open(f"/proc/{parts[0]}/cmdline", "rb") as fh:
                                    row["orden"] = fh.read().replace(b"\0", b" ").decode("utf-8", "replace").strip()[:240]
                                # Quien lo lanzo (hasta 3 niveles): p. ej. gst-launch-1.0 ← python de un plugin de Decky.
                                chain, pid = [], parts[0]
                                for _ in range(3):
                                    with open(f"/proc/{pid}/stat", encoding="utf-8") as fh:
                                        pid = fh.read().rsplit(")", 1)[1].split()[1]
                                    if pid in ("0", "1"):
                                        break
                                    with open(f"/proc/{pid}/cmdline", "rb") as fh:
                                        chain.append(fh.read().replace(b"\0", b" ").decode("utf-8", "replace").strip()[:160])
                                if chain:
                                    row["lanzado_por"] = chain
                            except (OSError, IndexError):
                                pass
                        top.append(row)
            cpu_line = next((l for l in last if l.startswith("%Cpu")), "")
        except Exception as exc:  # noqa: BLE001
            cpu_line = f"(top no disponible: {exc})"
        return {"carga_inicio": start, "carga_fin": loadavg(), "cpu": cpu_line.strip(), "procesos": top}

    async def bench_save(self, data: dict) -> str:
        folder = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "bench")
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, time.strftime("bench-%Y%m%d-%H%M%S.json"))
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)
        return path
