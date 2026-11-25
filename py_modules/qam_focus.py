"""Registro de foco con el mando: lo que hace la cruceta en el panel (de qué control a cuál, hacia dónde, cuándo no hay destino), los cambios
de sección y los toques con el dedo. La interfaz manda una sesión por apertura del panel; aquí se valida, se guarda con rotación y se resume.
Solo etiquetas de controles y posiciones en la lista: NUNCA lo que escribe el usuario ni nombres de personas (las listas de amigos y apps se anonimizan).
Se desactiva creando el archivo `foco-off` en la carpeta de ajustes."""
import json
import os

CLAVES = {"k", "t", "s", "f", "fl", "d", "to", "tl"}
TIPOS = {"m", "s", "t"}          # m = movimiento con la cruceta · s = cambio de sección · t = toque con el dedo
MAX_EV = 600                     # eventos por sesión
MAX_TXT = 60
LISTAS = {"social", "apps"}      # secciones cuyas etiquetas son nombres de amigos o de apps


def anonimizar(sec: str, etiqueta: str) -> str:
    return "(lista)" if sec in LISTAS else etiqueta


def _txt(v) -> str:
    return str(v)[:MAX_TXT]


def limpiar(sesion):
    """Una sesión válida {v, t0, ev:[…]} con solo tipos simples y claves conocidas; None si no hay nada que guardar."""
    if not isinstance(sesion, dict) or not isinstance(sesion.get("ev"), list):
        return None
    ev = []
    for e in sesion["ev"]:
        if not isinstance(e, dict) or e.get("k") not in TIPOS:
            continue
        item = {}
        for k, v in e.items():
            if k not in CLAVES:
                continue
            item[k] = round(float(v), 2) if k == "t" and isinstance(v, (int, float)) and not isinstance(v, bool) else _txt(v)
        if "t" not in item:
            item["t"] = 0.0
        ev.append(item)
        if len(ev) >= MAX_EV:
            break
    if not ev:
        return None
    t0 = sesion.get("t0")
    return {"v": _txt(sesion.get("v", "")), "t0": float(t0) if isinstance(t0, (int, float)) else 0.0, "ev": ev}


def guardar(ruta: str, sesion, max_bytes: int = 1_000_000) -> bool:
    """Añade una línea JSON; al pasar de max_bytes se conserva el 60 % más reciente."""
    if sesion is None:
        return False
    try:
        if os.path.exists(ruta) and os.path.getsize(ruta) > max_bytes:
            with open(ruta, "r", encoding="utf-8") as fh:
                lineas = fh.readlines()
            with open(ruta, "w", encoding="utf-8") as fh:
                fh.writelines(lineas[int(len(lineas) * 0.4):])
        with open(ruta, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(sesion, ensure_ascii=False, separators=(",", ":")) + "\n")
        return True
    except OSError:
        return False


def leer(ruta: str) -> list:
    out = []
    try:
        with open(ruta, "r", encoding="utf-8") as fh:
            for l in fh:
                try:
                    s = json.loads(l)
                except ValueError:
                    continue
                if isinstance(s, dict) and isinstance(s.get("ev"), list):
                    out.append(s)
    except OSError:
        pass
    return out


def resumen(sesiones: list) -> dict:
    """Agrega las sesiones: movimientos, dónde la cruceta no tuvo destino y qué controles solo se usaron con el dedo."""
    movs = 0
    sin: dict = {}
    alcanzados: set = set()
    toques: dict = {}
    secs: dict = {}
    for s in sesiones:
        for e in s.get("ev", []):
            k = e.get("k")
            if k == "m":
                movs += 1
                alcanzados.add((e.get("s", ""), e.get("f", "")))
                if e.get("to"):
                    alcanzados.add((e.get("s", ""), e["to"]))
                else:
                    key = (e.get("s", ""), e.get("fl", ""), e.get("d", ""))
                    sin[key] = sin.get(key, 0) + 1
            elif k == "s":
                secs[e.get("to", "")] = secs.get(e.get("to", ""), 0) + 1
            elif k == "t":
                key = (e.get("s", ""), e.get("f", ""), e.get("fl", ""))
                toques[key] = toques.get(key, 0) + 1
    solo = sorted(({"s": s, "fl": fl, "n": n} for (s, i, fl), n in toques.items() if (s, i) not in alcanzados), key=lambda x: -x["n"])
    sind = sorted(({"s": s, "fl": fl, "d": d, "n": n} for (s, fl, d), n in sin.items()), key=lambda x: -x["n"])
    return {"sesiones": len(sesiones), "movimientos": movs, "sin_destino": sind, "solo_tactil": solo, "secciones": secs}


def formatear(r: dict) -> list:
    if not r["sesiones"] or not (r["movimientos"] or r["solo_tactil"]):
        return ["Sin datos de foco todavía: usa el panel con el mando y vuelve a mirar."]
    nom = {"U": "arriba", "D": "abajo", "L": "izquierda", "R": "derecha"}
    out = [f"Foco con el mando: {r['sesiones']} sesión(es), {r['movimientos']} movimientos."]
    if r["sin_destino"]:
        out.append("La cruceta no tuvo destino (puede ser el borde natural, o una trampa):")
        out += [f"  {x['s']}: «{x['fl']}» + {nom.get(x['d'], x['d'])} ×{x['n']}" for x in r["sin_destino"][:10]]
    if r["solo_tactil"]:
        out.append("Tocados con el dedo pero a los que el mando nunca llegó (¿alcanzables?):")
        out += [f"  {x['s']}: «{x['fl']}» ×{x['n']}" for x in r["solo_tactil"][:10]]
    return out[:30]
