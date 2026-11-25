#!/usr/bin/env python3
"""Grabadora de foco del mando: mide si con la cruceta se llega a todos los controles del panel de QAM Rail. Todo en texto (cero imágenes).
Solo biblioteca estándar. Usa la depuración CEF de Steam (127.0.0.1:8080), igual que captura.py. SOLO LEE: no envía ninguna tecla ni botón.
Uso (con el panel de QAM Rail abierto):
  python3 ~/homebrew/plugins/qam-rail-dev/navtest.py watch [segundos]   (por defecto 120)
Mientras corre, recorre el panel TÚ con el mando (cruceta, L1/R1 para cambiar de sección). Al terminar imprime un informe corto:
  - por sección, cuántas paradas de foco visitaste y cuáles no
  - saltos de foco raros (de un control a otro lejano dentro de la misma sección)
  - foco que se queda fuera de la vista del panel (el scroll no lo siguió) o sobre un elemento oculto (sin posición)
Guarda la traza en ~/qam-capturas/nav-AAAAMMDD-HHMMSS.json (solo etiquetas de controles y posiciones; nunca lo que escribes).
Límite: no prueba que el foco SALGA de cada control en cada dirección (eso necesita saber qué pulsaste); sí prueba que se llegó a cada uno."""
import importlib.util, json, sys, time, urllib.request
from pathlib import Path

HOST, PORT = "127.0.0.1", 8080
OUT = Path.home() / "qam-capturas"
SALTO = 300  # px CSS: un paso de foco más largo que esto dentro de una sección se marca como raro


def clave(label: str, ruta: str) -> str:
    """Identidad estable de una parada: etiqueta + ruta en el DOM (no la posición, que cambia con el scroll)."""
    return f"{label}|{ruta}"


RIEL_X = 800  # px CSS: el riel de iconos está a la derecha del contenido (el panel mide 486 px y empieza hacia x=406 + riel a ~839)


def _sec(m: dict) -> str:
    return "riel" if m["x"] >= RIEL_X else m["sec"]


def analizar(paradas: dict, muestras: list) -> dict:
    """paradas: {sección: [{id,label,x,y}]}; muestras: cambios de foco [{t,sec,id,label,x,y}] en orden. Devuelve visitadas y saltos."""
    # el riel se separa de cada sección (si no, sus 7 iconos salían «sin visitar» en todas)
    agrupadas: dict[str, list] = {}
    for sec, lista in paradas.items():
        for p in lista:
            agrupadas.setdefault("riel" if p["x"] >= RIEL_X else sec, []).append(p)
    paradas = agrupadas
    vistas: dict[str, set] = {s: set() for s in paradas}
    for m in muestras:
        vistas.setdefault(_sec(m), set()).add(m["id"])
    secciones = {}
    for sec, lista in paradas.items():
        ids = {p["id"] for p in lista}
        visit = vistas.get(sec, set()) & ids
        secciones[sec] = {"total": len(ids), "visitadas": len(visit), "no_visitadas": [p["label"] for p in lista if p["id"] not in visit]}
    saltos = []
    for a, b in zip(muestras, muestras[1:]):
        if _sec(a) != _sec(b) or a["sec"] != b["sec"] or a["id"] == b["id"]:  # cruzar al riel o cambiar de sección no es un salto raro
            continue
        dist = round(((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2) ** 0.5)
        if dist > SALTO:
            saltos.append({"sec": a["sec"], "de": a["label"], "a": b["label"], "dist": dist})
    fuera, sinpos = [], []
    for m in muestras:
        if not m.get("asentado"):
            continue
        if m["x"] == 0 and m["y"] == 0:
            sinpos.append({"sec": m["sec"], "label": m["label"]})
        elif m["y"] + m.get("h", 0) < m.get("rt", -10**6) or m["y"] > m.get("rb", 10**6):
            fuera.append({"sec": m["sec"], "label": m["label"], "y": m["y"]})
    return {"secciones": secciones, "saltos": saltos, "fuera_de_vista": fuera, "sin_posicion": sinpos, "muestras": len(muestras)}


def formatear(r: dict) -> list:
    out = [f"Foco: {r['muestras']} cambios registrados."]
    for sec, d in r["secciones"].items():
        marca = "OK" if d["visitadas"] == d["total"] else "FALTAN"
        extra = f" — sin visitar: {', '.join(d['no_visitadas'][:8])}{'…' if len(d['no_visitadas']) > 8 else ''}" if d["no_visitadas"] else ""
        out.append(f"  {sec}: {d['visitadas']}/{d['total']} {marca}{extra}")
    if r["saltos"]:
        out.append(f"Saltos raros (>{SALTO} px): {len(r['saltos'])}")
        out += [f"  {s['sec']}: «{s['de']}» → «{s['a']}» ({s['dist']} px)" for s in r["saltos"][:8]]
    else:
        out.append("Sin saltos raros.")
    if r.get("fuera_de_vista"):
        out.append(f"Foco fuera de vista (ya asentado): {len(r['fuera_de_vista'])}")
        out += [f"  {f['sec']}: «{f['label']}» (y={f['y']})" for f in r["fuera_de_vista"][:6]]
    if r.get("sin_posicion"):
        out.append(f"Foco sin posición (elemento oculto): {len(r['sin_posicion'])}")
        out += [f"  {f['sec']}: «{f['label']}»" for f in r["sin_posicion"][:4]]
    return out[:30]


# Paradas de foco = controles propios que reciben el foco del mando (hojas: sin otra parada dentro). Id = etiqueta + ruta en el DOM.
JS_PARADAS = """(()=>{const raiz=document.querySelector('[style*="width: 486px"]'); if(!raiz) return null;
const sel='.Focusable,[tabindex],[data-qr=item],.qr-chip,button'; const out=[];
const ruta=e=>{const p=[];for(let n=e;n&&n!==raiz;n=n.parentElement){const i=[...n.parentElement.children].indexOf(n);p.push(n.tagName.toLowerCase()+':'+i)}return p.reverse().join('>')};
for(const e of raiz.querySelectorAll(sel)){ const r=e.getBoundingClientRect(); if(r.width<8||r.height<8) continue;
 if(e.querySelector(sel)) continue; if(getComputedStyle(e).visibility==='hidden') continue;
 const l=(e.getAttribute('aria-label')||e.textContent||'').trim().replace(/\\\\s+/g,' ').slice(0,28)||'(sin texto)';
 out.push({id:l+'|'+ruta(e),label:l,x:Math.round(r.left),y:Math.round(r.top)});}
return JSON.stringify(out)})()"""

JS_FOCO = """(()=>{const raiz=document.querySelector('[style*="width: 486px"]'); const e=document.querySelector('.gpfocus'); if(!e||!raiz||!raiz.contains(e)) return null;
const ruta=n0=>{const p=[];for(let n=n0;n&&n!==raiz;n=n.parentElement){const i=[...n.parentElement.children].indexOf(n);p.push(n.tagName.toLowerCase()+':'+i)}return p.reverse().join('>')};
const r=e.getBoundingClientRect(); const l=(e.getAttribute('aria-label')||e.textContent||'').trim().replace(/\\\\s+/g,' ').slice(0,28)||'(sin texto)';
const q=raiz.getBoundingClientRect(); return JSON.stringify({id:l+'|'+ruta(e),label:l,x:Math.round(r.left),y:Math.round(r.top),h:Math.round(r.height),rt:Math.round(q.top),rb:Math.round(q.bottom)})})()"""


def _ws_class():
    spec = importlib.util.spec_from_file_location("steam_cpu", Path(__file__).with_name("steam-cpu.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.WS


def _evaluar(ws, expr: str):
    return ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True}).get("result", {}).get("value")


def grabar(segundos: float, intervalo: float = 0.15) -> dict:
    WS = _ws_class()
    paginas = json.load(urllib.request.urlopen(f"http://{HOST}:{PORT}/json/list", timeout=5))
    principal = host = None
    for p in paginas:
        if not p.get("webSocketDebuggerUrl"):
            continue
        titulo = p.get("title") or ""
        if titulo == "Steam Big Picture Mode":
            principal = WS(p["webSocketDebuggerUrl"])
        elif titulo == "SharedJSContext":
            host = WS(p["webSocketDebuggerUrl"])
    if not principal:
        sys.exit("No encuentro «Steam Big Picture Mode».")
    for w in (principal, host):
        if w:
            w.s.settimeout(10)

    def seccion() -> str:
        return (_evaluar(host, "window.__qamRailUI&&window.__qamRailUI.current()") if host else None) or "?"

    paradas: dict = {}
    muestras: list = []
    ultimo, t0, prox, cerrado = None, time.time(), 0.0, False
    print(f"Grabando {int(segundos)} s: recorre el panel con el mando (cruceta, L1/R1 para cambiar de sección). Ctrl-C para terminar antes…", flush=True)
    try:
        while time.time() - t0 < segundos:
            t = time.time() - t0
            try:
                if t >= prox:  # las paradas visibles se refrescan cada 2 s (el scroll y las secciones las cambian)
                    prox = t + 2
                    datos = _evaluar(principal, JS_PARADAS)
                    if datos is None:  # panel cerrado: se espera a que se reabra (lo grabado hasta ahora no se pierde)
                        if not paradas:
                            sys.exit("El panel no está abierto (no encuentro su contenedor).")
                        if not cerrado:
                            print(f"  (t={int(t)} s: el panel se cerró; espero a que lo abras de nuevo)", flush=True)
                        cerrado = True
                    else:
                        cerrado = False
                        sec = seccion()
                        for p in json.loads(datos):
                            paradas.setdefault(sec, {})[p["id"]] = p
                foco = None if cerrado else _evaluar(principal, JS_FOCO)
                if foco:
                    f = json.loads(foco)
                    if f["id"] != ultimo:
                        ultimo = f["id"]
                        muestras.append({"t": round(t, 2), "sec": seccion(), **f})
                    elif muestras and not muestras[-1].get("asentado") and t - muestras[-1]["t"] >= 0.4:
                        muestras[-1].update(f, asentado=True)  # el scroll ya terminó: esta es la posición real del foco
            except OSError as e:  # tiempo agotado o conexión caída: se sigue con lo que hay
                print(f"  (t={int(t)} s: {e})", flush=True)
            time.sleep(intervalo)
    except KeyboardInterrupt:
        print("  (parado con Ctrl-C)")
    return {"paradas": {s: list(d.values()) for s, d in paradas.items()}, "muestras": muestras}


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] != "watch":
        sys.exit(__doc__)
    seg = float(sys.argv[2]) if len(sys.argv) > 2 else 120
    traza = grabar(seg)
    r = analizar(traza["paradas"], traza["muestras"])
    OUT.mkdir(parents=True, exist_ok=True)
    ruta = OUT / f"nav-{time.strftime('%Y%m%d-%H%M%S')}.json"
    ruta.write_text(json.dumps({**traza, "informe": r}, ensure_ascii=False, indent=1))
    print("\n".join(formatear(r)))
    print(f"Traza: {ruta}")


if __name__ == "__main__":
    main()
