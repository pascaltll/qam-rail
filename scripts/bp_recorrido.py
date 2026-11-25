#!/usr/bin/env python3
"""Recorre las secciones del panel con la cruceta (por CDP), con scroll cuando se atasca. Usa bp_nav.py (mismo interruptor de parada).
Uso: python3 scripts/bp_recorrido.py [segundos_por_sección=90] [sec1,sec2,…] [--desplegar] [--desde="texto"] [--abajo]
Solo flechas: nunca A/Intro. Salta Izquierda/Derecha sobre controles data-qr-h (deslizadores/segmentos): cambian valores reales.
Guarda un JSON por sección en ~/qam-grafo/recorrido-<fecha>/. Las etiquetas pueden contener nombres de amigos o apps: no lo envíes fuera sin mirarlo."""
import sys, json, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bp_nav as b

OPUESTA = b.OPUESTA
_args = [a for a in sys.argv[1:] if not a.startswith("--")]
_flags = [a for a in sys.argv[1:] if a.startswith("--")]
SEC_CAP_S = float(_args[0]) if _args else 90
SOLO = _args[1].split(",") if len(_args) > 1 else None
DESPLEGAR = "--desplegar" in _flags  # abre los plegados (Avanzado, Pruebas y herramientas, grupos «▸ ver») y los vuelve a plegar al terminar
ABAJO = "--abajo" in _flags  # prueba Abajo y los lados antes que Arriba (para explorar una mitad sin salirse hacia arriba por un camino de ida)
DESDE = next((f.split("=", 1)[1] for f in _flags if f.startswith("--desde=")), None)  # da el foco a un control (por el principio de su texto) antes de explorar
UI = "window.__qamRailUI"

if ABAJO:
    b.DIRS = tuple(sorted(b.DIRS, key=lambda d: d == "Up"))


def norm(raw):
    """Id del nodo sin y/alto: el mismo control con otro scroll es el mismo nodo."""
    if not raw:
        return None
    p = raw.split("|")
    return "|".join(p[:3]) + "|" + p[3].split(",")[0]


def main() -> None:
    WS = b._ws_class()
    host = b.conectar(WS, "SharedJSContext")
    ws, _ = b.conectar_foco(WS)
    if not host or not ws:
        print("No encuentro SharedJSContext o «Steam Big Picture Mode»: abre el panel (qam abrir).")
        return
    b.VARIANTE["v"], b.VARIANTE["emu"] = "keydown", True
    H = lambda js: b.evaluar(host, js)

    def panel_rect():
        # Rect del cuerpo del panel (no el del <form>, que no coincide). Riel a la izquierda desde x=146.
        return json.loads(H(f"(()=>{{const r={UI}.body().getBoundingClientRect();return JSON.stringify([146,r.y-2,r.right+2,r.bottom+2])}})()"))

    def en_panel(rect):
        # Dentro del cuerpo del panel (aunque esté fuera de la vista por el scroll) o, si no, dentro del rectángulo (riel y filas superiores).
        dentro = H(f"(()=>{{const bd={UI}.body();const l=[...bd.ownerDocument.querySelectorAll('.gpfocus')];const e=l[l.length-1];return e?bd.contains(e):null}})()")
        if dentro:
            return True
        r = b.evaluar(ws, "(()=>{const l=[...document.querySelectorAll('.gpfocus')];const e=l[l.length-1];if(!e)return null;const r=e.getBoundingClientRect();return JSON.stringify([r.x+r.width/2,r.y+r.height/2])})()")
        if not r:
            return None
        x, y = json.loads(r)
        return rect[0] <= x <= rect[2] and rect[1] <= y <= rect[3]

    def sobre_ajuste():
        return bool(b.evaluar(ws, "(()=>{const l=[...document.querySelectorAll('.gpfocus')];const e=l[l.length-1];return !!(e&&e.closest('[data-qr-h]'))})()"))

    def candidatos():
        js = f"""(()=>{{const f={UI}.body();const all=[...f.querySelectorAll('[class*="Focusable"],button,[data-qr="item"]')];
const leaf=all.filter(e=>!all.some(o=>o!==e&&e.contains(o)));
return JSON.stringify(leaf.map(e=>{{const r=e.getBoundingClientRect();return [(e.innerText||e.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ').slice(0,24),Math.round(r.width),Math.round(r.height)]}}).filter(a=>a[1]>0&&a[2]>0))}})()"""
        return json.loads(H(js) or "[]")

    def dims():
        return json.loads(H(f"JSON.stringify([{UI}.body().scrollHeight,{UI}.body().clientHeight,{UI}.body().scrollTop])"))

    PLEGABLES = "(t=>/^(Avanzado|Pruebas y herramientas)/.test(t)||t.includes('▸ ver'))"

    def desplegar():
        """Abre con click() las cabeceras plegables de la lista cerrada. Devuelve los textos (principio) para volver a plegarlas."""
        js = f"""(()=>{{const bd={UI}.body();const ok={PLEGABLES};const out=[];
for(const e of bd.querySelectorAll('[data-qr="item"]')){{const r=e.getBoundingClientRect();const t=(e.innerText||'').trim().replace(/\\s+/g,' ');
if(r.width>0&&ok(t)){{e.click();out.push(t.slice(0,24))}}}}return JSON.stringify(out)}})()"""
        return json.loads(H(js) or "[]")

    def plegar(marcas):
        """Vuelve a plegar lo que se desplegó. Abierta, la cabecera de un Fold solo dice su título (la pista desaparece);
        la de un grupo de apps dice «▾ ocultar»."""
        for m in marcas:
            js = f"""(()=>{{const bd={UI}.body();const m={json.dumps(m)};
const fold=/^(Avanzado|Pruebas y herramientas)/.exec(m);const clave=fold?fold[1]:m.split(' ▸')[0].slice(0,18);
for(const e of bd.querySelectorAll('[data-qr="item"]')){{const r=e.getBoundingClientRect();const t=(e.innerText||'').trim().replace(/\\s+/g,' ');
if(r.width>0&&t.startsWith(clave)&&(fold?t===clave:t.includes('▾ ocultar'))){{e.click();return true}}}}return false}})()"""
            H(js)
            time.sleep(0.4)

    def tomar_foco(texto):
        js = """((txt)=>{const els=[...document.querySelectorAll('[data-qr="item"]')];
const el=els.find(e=>e.getBoundingClientRect().width>0&&(e.innerText||'').trim().replace(/\\s+/g,' ').startsWith(txt));if(!el)return 'no encontrado';
const k=Object.keys(el).find(k=>k.startsWith('__reactFiber$'));let f=k?el[k]:null;const nodo=v=>v&&typeof v==='object'&&typeof v.TakeFocus==='function';
for(let i=0;f&&i<6;i++,f=f.return){if(nodo(f.stateNode)){f.stateNode.TakeFocus();return 'ok'}let h=f.memoizedState;
for(let j=0;h&&typeof h==='object'&&j<24;j++,h=h.next){const v=h.memoizedState;if(nodo(v)){v.TakeFocus();return 'ok'}const c=v&&typeof v==='object'?v.current:null;if(nodo(c)){c.TakeFocus();return 'ok'}}}
el.focus();return 'focus() del DOM'})(%s)""" % json.dumps(texto)
        return b.evaluar(ws, js)

    def recorrer(sec):
        marcas: list[str] = []
        try:
            return _recorrer(sec, marcas)
        finally:
            plegar(marcas)  # deja los plegados como estaban (también si hubo error)

    def _recorrer(sec, marcas):
        H(f"{UI}.go({json.dumps(sec)})")
        time.sleep(1.5)
        H(f"{UI}.body().scrollTop=0")
        time.sleep(0.5)
        if DESPLEGAR:
            marcas.extend(desplegar())
        if marcas:
            time.sleep(1.0)
        rect = panel_rect()
        g = b.Grafo()
        esc, salt, cambios, noregresa = {}, set(), [], []
        if DESDE:
            print(f"  {sec}: foco a «{DESDE}» → {tomar_foco(DESDE)}")
            time.sleep(0.8)
        raw = [b.firma(b.foco(ws))]
        if raw[0] is None:
            b.mover_y_medir(ws, "Down", None)
            raw[0] = b.firma(b.foco(ws))
        if raw[0] is None:
            return {"seccion": sec, "error": "sin foco al entrar"}
        if not en_panel(rect):
            return {"seccion": sec, "error": "el foco no está dentro del panel al entrar", "foco": norm(raw[0])}
        t0 = time.monotonic()
        pasos = 0
        scrolls = 0

        def mover(d):
            antes = raw[0]
            na = norm(antes)
            if d in ("Left", "Right") and sobre_ajuste():
                salt.add(na)
                return na, 0
            desp, ms = b.mover_y_medir(ws, d, antes)
            if desp == antes or desp is None:
                return na, 0
            if norm(desp) == na:  # mismo elemento con otra posición (el cuerpo se desplazó): no es un movimiento
                raw[0] = desp
                return na, 0
            if H(f"{UI}.current()") != sec:
                cambios.append((na, d, H(f"{UI}.current()")))
                H(f"{UI}.go({json.dumps(sec)})")
                time.sleep(0.8)
                return na, 0
            if not en_panel(rect):
                esc[(na, d)] = norm(desp)
                vuelta, _ = b.mover_y_medir(ws, OPUESTA[d], desp)
                if vuelta != antes:
                    noregresa.append((na, d, norm(vuelta)))
                    raw[0] = vuelta
                    raise b.Parado("no pude volver al panel tras salir")
                return na, 0
            raw[0] = desp
            return norm(desp), ms

        try:
            while time.monotonic() - t0 < SEC_CAP_S and pasos < 400:
                actual = norm(raw[0])
                g.nodos.setdefault(actual, {})
                acc, d = b.decidir(g, actual)
                if acc == "fin":
                    sh, ch, st = dims()
                    if st + ch >= sh - 2 or scrolls >= 12:
                        break
                    H(f"{UI}.body().scrollTop={int(st + ch * 0.75)}")
                    scrolls += 1
                    time.sleep(0.6)
                    for k in [k for k, v in g.aristas.items() if k[1] == "Down" and v[0] is None]:  # tras el scroll, un «Abajo» sin destino se reintenta
                        if k[0] not in {n for n, _ in esc}:
                            del g.aristas[k]
                    continue
                nuevo, ms = mover(d)
                pasos += 1
                if acc == "probar":
                    g.aristas[(actual, d)] = (None if nuevo in (None, actual) else nuevo, ms)
                if nuevo is not None:
                    g.nodos.setdefault(nuevo, {})
        except b.Parado as e:
            noregresa.append(("PARADO", str(e), None))
        r = b.resumen(g)
        marcados = {n for n, _ in esc} | salt
        sin_salida = [n for n in r["sin_salida"] if n not in marcados]
        visit = {n.split("|")[2] for n in g.nodos}
        cand = candidatos()
        faltan = [c[0] for c in cand if c[0] not in visit and c[0] and not any(c[0].startswith(v) or v.startswith(c[0]) for v in visit if v)]
        sh, ch, st = dims()
        H(f"{UI}.body().scrollTop=0")
        return {"seccion": sec, "desplegados": list(marcas), "nodos": r["nodos"], "aristas": r["aristas"], "pasos": pasos, "scroll": {"alto": sh, "visible": ch, "scrolls": scrolls},
                "candidatos": len(cand), "no_visitados": faltan, "sin_salida": sin_salida, "sin_vuelta": r["sin_vuelta"], "lentas": r["lentas"],
                "salen_del_panel": [[n, d, o] for (n, d), o in esc.items()], "saltadas_por_ajuste": sorted(salt), "cambios_de_seccion": cambios, "no_regresa": noregresa,
                "aristas_lista": [[n, d, a, ms] for (n, d), (a, ms) in g.aristas.items()]}

    original = H(f"{UI}.current()")
    secs = SOLO or json.loads(H(f"JSON.stringify({UI}.sections)"))
    out = Path.home() / "qam-grafo" / ("recorrido-" + time.strftime("%Y%m%d-%H%M%S"))
    out.mkdir(parents=True, exist_ok=True)
    b.foco_emulado(ws, True)
    try:
        for s in secs:
            b.exigir_activo()
            try:
                res = recorrer(s)
            except b.Parado as e:
                print("PARADO:", e)
                break
            (out / f"{s}.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
            if "error" in res:
                print(f"{s}: {res['error']}")
            else:
                print(f"{s}: {res['nodos']} nodos/{res['aristas']} aristas de {res['candidatos']} controles · sin salida {len(res['sin_salida'])} · sin vuelta {len(res['sin_vuelta'])} · no visitados {len(res['no_visitados'])}")
    finally:
        b.foco_emulado(ws, False)
        H(f"{UI}.go({json.dumps(original)})")
    print("guardado en", out)


if __name__ == "__main__":
    main()
