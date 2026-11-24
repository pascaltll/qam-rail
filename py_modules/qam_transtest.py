"""Prueba de transiciones (dev.84): app de escritorio ↔ panel QAM ↔ teclado grande, cronometrado.

Con el navegador delante (misma página de prueba que la autoprueba) abre y cierra el QAM de Steam y el teclado grande una y otra vez, y por cada vuelta mide:
  · pedir → se ve la interfaz (evento del panel/teclado) y → sube el overlay (STEAM_OVERLAY)
  · pedir cerrar → baja el overlay, → el táctil vuelve a agarrarse y → el primer toque que llega a la página
  · estado final: la app sigue siendo la ventana de delante, con el tamaño de pantalla, sin ventanas emergentes sueltas
Las órdenes de abrir/cerrar las ejecuta la interfaz (evento `qam_trans`); aquí solo se mide lo que llega a `sink` (la caja negra y el registro del mando).
"""
import asyncio
import time

import qam_selftest as st


class TransTest(st.SelfTest):
    # umbrales (ms) por encima de los cuales una transición se marca como lenta
    LIM = {"abrir": 700, "cerrar": 500, "toque": 1500, "overlay": 400}

    def __init__(self, runner, keys, typ, log=None, title=None, opener=None, act=None, sink=None, wid=0, **kw):
        super().__init__(runner, keys, typ, log=log, title=title, opener=opener, **kw)
        self.act = act                 # async act(nombre): le pide a la interfaz que abra/cierre el QAM o el teclado
        self.sink = sink if sink is not None else []   # (t, evento, datos): lo rellena main
        self.wid = wid
        self.base_wins = 0
        self.base_geo: dict = {}

    # ---- ayudas
    def _find(self, i: int, pred):
        for t, ev, d in self.sink[i:]:
            if pred(ev, d):
                return t
        return None

    async def _wait(self, i: int, pred, timeout: float):
        end = time.monotonic() + timeout
        while True:
            t = self._find(i, pred)
            if t is not None:
                return t
            if time.monotonic() >= end:
                return None
            await asyncio.sleep(0.02)

    @staticmethod
    def _ms(a, b):
        return None if a is None or b is None else round((a - b) * 1000)

    def _estado(self) -> dict:
        """Cómo ha quedado la pantalla: ¿la app sigue delante, a pantalla completa y sin ventanas sueltas?"""
        x = self.r._x
        try:
            fw = x.focus_window()
            wins = x.windows()
            mine = next((w for w in wins if w[0] == self.wid), None)
            if not self.wid:   # sin ventana conocida (pruebas sin Steam): no se juzga el foco ni el tamaño
                return {"foco": True, "tam": None, "ventanas": len(wins)}
            return {"foco": fw == self.wid, "tam": (mine[3], mine[4]) if mine else None, "ventanas": len(wins)}
        except Exception as e:  # noqa: BLE001
            return {"error": repr(e)}

    async def _muestrea(self, seg: float = 1.6) -> dict:
        """Tras cerrar el panel: cada 40 ms el tamaño de la ventana de la app, hasta `seg`. Dice si volvió a pantalla completa y cuándo (o si se quedó encogida)."""
        x = self.r._x
        t0 = time.monotonic()
        serie = []
        while time.monotonic() - t0 < seg:
            try:
                w = next((w for w in x.windows() if w[0] == self.wid), None)
                if w:
                    serie.append((round((time.monotonic() - t0) * 1000), w[1], w[2], w[3], w[4]))
            except Exception:  # noqa: BLE001
                pass
            await asyncio.sleep(0.04)
        if not serie:
            return {}
        llena = [m for m in serie if m[3] >= self.W - 2 and m[4] >= self.H - 2]
        ult = serie[-1]
        t_ok = None
        for k in range(len(serie)):   # primer instante desde el que ya se queda a pantalla completa
            if all(m[3] >= self.W - 2 and m[4] >= self.H - 2 for m in serie[k:]):
                t_ok = serie[k][0]
                break
        return {"final": f"{ult[3]}x{ult[4]}@{ult[1]},{ult[2]}", "completa_ms": t_ok, "min": f"{min(m[3] for m in serie)}x{min(m[4] for m in serie)}", "llena": bool(llena)}

    async def _toque(self, desde: float, limite: float = 4.0):
        """Toca el botón de la página cada 120 ms hasta que llegue un clic: ms desde `desde` (o None)."""
        x, y = self.scr("b1")
        i = self.probe.mark()
        end = time.monotonic() + limite
        while time.monotonic() < end:
            await self.tap(x, y, 0.05)
            e = await self.probe.wait(i, "click", lambda d: d.get("id") == "b1", 0.12)
            if e:
                return round((e["t"] - desde) * 1000)
        return None

    async def _vuelta(self, nombre: str, abrir: str, cerrar: str, ev_abre: str, ev_cierra: str, k: int) -> dict:
        r: dict = {}
        i = len(self.sink)
        t0 = time.monotonic()
        await self.act(abrir)
        t_ui = await self._wait(i, lambda e, d: e == ev_abre, 4.0)
        t_ov = await self._wait(i, lambda e, d: e == "overlay" and d.get("on") is True, 3.0)
        t_pa = await self._wait(i, lambda e, d: e == "pad" and "en pausa" in str(d.get("t", "")), 3.0)
        r.update(abre_ui=self._ms(t_ui, t0), abre_overlay=self._ms(t_ov, t0), toque_pausa=self._ms(t_pa, t0))
        await asyncio.sleep(1.2)
        j = len(self.sink)
        t1 = time.monotonic()
        await self.act(cerrar)
        t_cui = await self._wait(j, lambda e, d: e == ev_cierra, 4.0)
        t_off = await self._wait(j, lambda e, d: e == "overlay" and d.get("on") is False, 3.0)
        t_gr = await self._wait(j, lambda e, d: e == "pad" and "agarrada" in str(d.get("t", "")), 4.0)
        r.update(cierra_ui=self._ms(t_cui, t1), cierra_overlay=self._ms(t_off, t1), toque_vuelve=self._ms(t_gr, t1))
        m = asyncio.ensure_future(self._muestrea(1.4))   # a la vez que se espera el primer toque
        r["primer_toque"] = await self._toque(t1)
        r["muestra"] = await m
        await asyncio.sleep(0.3)
        r["estado"] = self._estado()
        g = self._last_geo()
        r["pagina"] = (int(g.get("iw", 0)), int(g.get("ih", 0)))
        return r

    def _juzga(self, nombre: str, rs: list) -> None:
        malos, notas = [], []
        for k, r in enumerate(rs, 1):
            for campo, lim, txt in (("abre_ui", "abrir", "abrir"), ("abre_overlay", "overlay", "overlay al abrir"), ("cierra_ui", "cerrar", "cerrar"),
                                    ("cierra_overlay", "overlay", "overlay al cerrar"), ("primer_toque", "toque", "primer toque")):
                v = r.get(campo)
                if v is None:
                    malos.append(f"vuelta {k}: {txt} no llegó")
                elif v > self.LIM[lim]:
                    notas.append(f"vuelta {k}: {txt} {v} ms (lento)")
            e = r.get("estado", {})
            if e.get("foco") is False:
                malos.append(f"vuelta {k}: la app perdió el foco")
            if e.get("tam") and (e["tam"][0] < self.W - 4 or e["tam"][1] < self.H - 4):
                malos.append(f"vuelta {k}: la ventana quedó {e['tam'][0]}x{e['tam'][1]} (pantalla {self.W}x{self.H})")
            m = r.get("muestra") or {}
            if m and (not m.get("llena") or m.get("completa_ms") is None):
                malos.append(f"vuelta {k}: la ventana NO volvió a pantalla completa (final {m.get('final')}, mínimo {m.get('min')})")
            elif m and m.get("completa_ms") and m["completa_ms"] > 700:
                notas.append(f"vuelta {k}: tardó {m['completa_ms']} ms en volver a pantalla completa (lento)")
            pg = r.get("pagina")
            if pg and self.base_geo and (pg[0] < self.base_geo[0] - 4 or pg[1] < self.base_geo[1] - 4):
                malos.append(f"vuelta {k}: la PÁGINA quedó {pg[0]}x{pg[1]} px CSS (antes {self.base_geo[0]}x{self.base_geo[1]}): el navegador no se redibujó a pantalla completa")
            if self.base_wins and e.get("ventanas", 0) > self.base_wins:
                malos.append(f"vuelta {k}: quedaron {e['ventanas'] - self.base_wins} ventana(s) suelta(s)")

        def med(c):
            v = sorted(x[c] for x in rs if x.get(c) is not None)
            return f"{v[len(v) // 2]}" if v else "–"
        det = (f"medianas ms: abrir {med('abre_ui')} · overlay {med('abre_overlay')} · táctil se pausa {med('toque_pausa')} | "
               f"cerrar {med('cierra_ui')} · overlay {med('cierra_overlay')} · táctil vuelve {med('toque_vuelve')} · primer toque {med('primer_toque')}")
        todo = malos + notas
        self.res(f"transición: {nombre}", not malos, det + (" — " + "; ".join(todo[:6]) if todo else ""))

    # ---- pasos
    async def run(self) -> dict:
        t_all = time.monotonic()
        W, H = self.r._x.screen_size()
        self.W, self.H = W, H
        self.ts = st.q.TouchScroll((0, W), (0, H), (W, H))
        self.ts.full = self.ts.force_full = True
        self.ts.tr = self.r._tr
        self.r._ts["selftest"] = self.ts
        await self.probe.start()
        try:
            if await self.s_cargar(W, H) and await self.s_calibrar(W, H):
                self.base_wins = len(self.r._x.windows())
                g = self._last_geo()
                self.base_geo = (int(g.get("iw", 0)), int(g.get("ih", 0)))
                for step in (self.t_qam, self.t_teclado, self.t_rapido, self.t_alterno):
                    try:
                        await step()
                    except Exception as e:  # noqa: BLE001
                        self.res(step.__name__[2:], False, f"error: {e!r}"[:120])
        finally:
            try:
                for a in ("qam_close", "kb_close"):
                    await self.act(a)
                await asyncio.sleep(0.6)
                if self.opened:
                    await self.keys("w", ["ctrl"])
                    await asyncio.sleep(0.3)
            except Exception:  # noqa: BLE001
                pass
            try:
                self.r._ts.pop("selftest", None)
                self.r._pend_run(time.monotonic(), force=True)
            except Exception:  # noqa: BLE001
                pass
            await self.probe.stop()
        bad = [s for s in self.steps if s["ok"] is False]
        return {"ok": not bad and bool(self.steps), "kind": "trans", "steps": self.steps, "secs": round(time.monotonic() - t_all), "eventos": len(self.sink)}

    async def t_qam(self) -> None:
        rs = [await self._vuelta("qam", "qam_open", "qam_close", "ui.panel.abre", "ui.panel.cierra", k) for k in range(5)]
        self._juzga("app → QAM → app (5 vueltas)", rs)

    async def t_teclado(self) -> None:
        rs = [await self._vuelta("teclado", "kb_open", "kb_close", "ui.kb.abre", "ui.kb.cierra", k) for k in range(5)]
        self._juzga("app → teclado grande → app (5 vueltas)", rs)

    async def t_rapido(self) -> None:
        """Abrir y cerrar sin esperar (250 ms): al acabar todo debe quedar cerrado y la app responder (no puede quedar el overlay arriba)."""
        mal = []
        for k in range(5):
            await self.act("qam_open")
            await asyncio.sleep(0.25)
            await self.act("qam_close")
            await asyncio.sleep(1.8)
            i = len(self.sink)
            ov = [d.get("on") for _t, e, d in self.sink if e == "overlay"][-1:]
            e = self._estado()
            ms = await self._toque(time.monotonic(), 2.5)
            if ms is None:
                mal.append(f"vuelta {k + 1}: la app no respondió al toque")
            if ov and ov[0] is True:
                mal.append(f"vuelta {k + 1}: el overlay quedó arriba")
            if e.get("foco") is False:
                mal.append(f"vuelta {k + 1}: la app perdió el foco")
            del i
        self.res("transición: abrir y cerrar el QAM sin esperar (5 veces)", not mal, "todo quedó cerrado y la app respondió" if not mal else "; ".join(mal[:5]))

    async def t_alterno(self) -> None:
        """QAM y teclado seguidos: cerrar uno y abrir el otro a la vez (lo que pasa al tocar «Teclado» desde el panel)."""
        mal = []
        for k in range(3):
            await self.act("qam_open")
            await asyncio.sleep(1.0)
            await self.act("qam_close")
            await asyncio.sleep(0.35)
            await self.act("kb_open")
            await asyncio.sleep(1.0)
            await self.act("kb_close")
            await asyncio.sleep(1.5)
            e = self._estado()
            ms = await self._toque(time.monotonic(), 2.5)
            if ms is None:
                mal.append(f"vuelta {k + 1}: la app no respondió al toque")
            if e.get("foco") is False:
                mal.append(f"vuelta {k + 1}: la app perdió el foco")
        self.res("transición: QAM → teclado → app (3 veces)", not mal, "bien" if not mal else "; ".join(mal[:5]))
