"""Salida de audio y micrófono con PipeWire (wpctl), sin depender de Steam.

`wpctl status` imprime un árbol. Interesan, del bloque «Audio»:
  - Sinks / Sources: los dispositivos reales (la tarjeta, HDMI, Bluetooth).
  - Filters: en Bazzite/SteamOS los altavoces de las portátiles pasan por un FILTRO (ecualizador + limitador) que
    aparece como «[Audio/Sink]». Ese filtro es la salida buena de los altavoces: elegir la tarjeta «en crudo» se lo
    salta y suena más fuerte y distinto (pasó en el Ally con 0.34). Por eso, si hay filtro, la tarjeta en crudo NO
    se ofrece como opción.
La activa se decide por el nodo por defecto real (`wpctl inspect @DEFAULT_AUDIO_SINK@`), no solo por el «*».
"""
import re

_ROW = re.compile(r"^[\s│├└─]*(\*)?\s*(\d+)\.\s+(.+?)\s*(?:\[vol:\s*([\d.]+)(\s+MUTED)?\])?\s*(?:\[(Audio/Sink|Audio/Source|[^\]]*)\])?\s*$")
_HEAD = re.compile(r"^[\s│├└─]*(Devices|Sinks|Sources|Filters|Streams|Sink endpoints|Source endpoints|Clients):\s*$")
_TOP = re.compile(r"^(Audio|Video|Settings|PipeWire)\b")
_ROLE = re.compile(r"loopback|role\.|\.role|echo.?cancel", re.I)


def parse_status(text: str) -> dict:
    """{"salidas", "entradas", "filtros_salida", "filtros_entrada"} con id, nombre, activa (por «*»), volumen, silenciado."""
    out = {"salidas": [], "entradas": [], "filtros_salida": [], "filtros_entrada": []}
    top, sec = None, None
    for line in (text or "").splitlines():
        if _TOP.match(line):
            top, sec = line.split()[0], None
            continue
        if top != "Audio":
            continue
        m = _HEAD.match(line)
        if m:
            sec = m.group(1)
            continue
        if sec not in ("Sinks", "Sources", "Filters"):
            continue
        r = _ROW.match(line)
        if not r:
            continue
        name = r.group(3).strip()
        item = {"id": int(r.group(2)), "nombre": name, "activa": bool(r.group(1)),
                "volumen": float(r.group(4)) if r.group(4) else None, "silenciado": bool(r.group(5))}
        if sec == "Sinks":
            out["salidas"].append(item)
        elif sec == "Sources":
            out["entradas"].append(item)
        elif r.group(6) in ("Audio/Sink", "Audio/Source") and not _ROLE.search(name):
            out["filtros_salida" if r.group(6) == "Audio/Sink" else "filtros_entrada"].append(item)
    return out


def kind_of(name: str, source: bool = False) -> str:
    """Tipo para el icono: auriculares, hdmi, altavoz, micro."""
    n = name.lower()
    if re.search(r"hdmi|displayport|\bdp\b", n):
        return "hdmi"
    if re.search(r"head|auricular|buds|airpods|wh-|wf-|bluez|bluetooth", n):
        return "auriculares"
    if source or re.search(r"mic|micr", n):
        return "micro"
    return "altavoz"


def _collapse(items: list, default_id: int | None) -> list:
    """Un solo nodo por tipo para los que no se distinguen (el gestor de Panel puede crear varios filtros del mismo
    altavoz o micrófono): gana el que está por defecto; si no, el primero. HDMI y Bluetooth se conservan por nombre."""
    out, seen = [], {}
    for it in items:
        key = it["tipo"] if it["tipo"] in ("altavoz", "micro") else (it["tipo"], it["nombre"].strip().lower())
        if key not in seen:
            seen[key] = len(out)
            out.append(it)
        elif it["id"] == default_id or (it["activa"] and not out[seen[key]]["activa"]):
            out[seen[key]] = it
    return out


_EQ = re.compile(r"(\bEQ$|pdc_eq)", re.I)


def sink_names(pactl_short: str) -> dict:
    """{id: nombre interno} de «pactl list short sinks» (id, nombre, …). El nombre dice qué es de verdad
    (alsa_output… = tarjeta, bluez_output… = Bluetooth), aunque la descripción sea la marca de los auriculares."""
    out = {}
    for line in (pactl_short or "").splitlines():
        f = line.split("\t") if "\t" in line else line.split()
        if len(f) >= 2 and f[0].strip().isdigit():
            out[int(f[0])] = f[1].strip()
    return out


def sink_object_ids(pactl_list: str) -> dict:
    """{id de PipeWire: nombre interno} de «pactl list sinks». Los números de «pactl list short» NO son los de wpctl
    (zip del 15‑11: 67519 frente a 149); el id de wpctl es la propiedad «object.id» de cada salida."""
    out = {}
    for block in re.split(r"(?m)^\S.*#\d+\s*$", pactl_list or ""):
        name = re.search(r"(?m)^\s*(?:Name|Nombre):\s*(\S+)", block)
        oid = re.search(r'(?m)^\s*object\.id\s*=\s*"(\d+)"', block)
        if name and oid:
            out[int(oid.group(1))] = name.group(1)
    return out


def eq_target(pw_link: str, names: dict):
    """id del dispositivo real al que el ecualizador de Panel (pdc_eq) manda el sonido, leído de «pw-link -l»."""
    inv = {v: k for k, v in (names or {}).items()}
    inside = False
    for line in (pw_link or "").splitlines():
        if not line.startswith((" ", "\t")):
            inside = line.startswith("effect_output.pdc_eq:")
            continue
        if inside and "|->" in line:
            node = line.split("|->", 1)[1].strip().rsplit(":", 1)[0]
            if node in inv:
                return inv[node]
    return None


def _real_kind(it: dict, names: dict) -> str:
    n = (names or {}).get(it["id"], "")
    if n.startswith("bluez_output"):
        return "auriculares"
    if re.search(r"hdmi|displayport|iec958|spdif", n, re.I):
        return "hdmi"
    return kind_of(it["nombre"])


def choices(st: dict, default_sink: int | None, default_source: int | None, names: dict | None = None, eq_dest: int | None = None) -> dict:
    """Lo que se ofrece para elegir.

    CON el ecualizador de Panel de Control (un sumidero virtual «<equipo> EQ», pdc_eq): Panel lo pone por defecto y
    lo conecta al dispositivo real. El EQ NO es una salida: se ofrecen los dispositivos reales (tarjeta = altavoces,
    Bluetooth, HDMI) y la activa es a la que el EQ manda el sonido. Para cambiar se pone por defecto el dispositivo
    real; Panel lo detecta, reconecta su EQ ahí y vuelve a ponerse delante. (0.47 llamaba «Altavoces» al EQ: con
    auriculares, las dos opciones sonaban por los auriculares y no había forma de volver a los altavoces.)

    SIN él: como antes, el filtro de altavoces de Bazzite sustituye a la tarjeta en crudo."""
    filt = st.get("filtros_salida") or []
    eq = next((f for f in filt if _EQ.search(f["nombre"].strip())), None)
    ins = [{**it, "tipo": "micro", "filtro": True} for it in (st.get("filtros_entrada") or [])]
    ins += [{**it, "tipo": kind_of(it["nombre"], source=True), "filtro": False} for it in (st.get("entradas") or [])]
    if default_source is not None:
        for i in ins:
            i["activa"] = i["id"] == default_source
    if eq is not None:
        outs = [{**it, "tipo": _real_kind(it, names or {}), "filtro": False} for it in (st.get("salidas") or [])]
        eq_default = default_sink == eq["id"]
        dest = eq_dest if eq_default else default_sink
        if eq_default and dest not in [o["id"] for o in outs]:
            # No se pudo leer el enlace: Panel sigue solo a unos auriculares Bluetooth recién conectados; si no, la tarjeta.
            bt = [o for o in outs if o["tipo"] == "auriculares"]
            spk = [o for o in outs if o["tipo"] == "altavoz"]
            dest = bt[0]["id"] if len(bt) == 1 else (spk[0]["id"] if spk else None)
        for o in outs:
            o["activa"] = o["id"] == dest
        n_antes = len(outs) + len(ins) + len(filt)
        outs = [o for o in outs if o["nombre"].strip()]
        ins = _collapse([i for i in ins if i["nombre"].strip()], default_source)
        return {"salidas": outs, "entradas": ins, "ocultos": n_antes - len(outs) - len(ins), "crudo_activo": False,
                "eq": {"id": eq["id"], "nombre": eq["nombre"], "por_defecto": eq_default, "destino": dest, "leido": eq_dest is not None}}
    outs = []
    for it in filt:
        outs.append({**it, "tipo": "altavoz", "filtro": True})
    for it in st.get("salidas") or []:
        k = _real_kind(it, names or {})
        if filt and k == "altavoz":
            continue  # la tarjeta en crudo: ya está su filtro
        outs.append({**it, "tipo": k, "filtro": False})
    if default_sink is not None:
        for o in outs:
            o["activa"] = o["id"] == default_sink
    n_antes = len(outs) + len(ins)
    outs = [o for o in outs if o["nombre"].strip()]
    ins = [i for i in ins if i["nombre"].strip()]
    outs, ins = _collapse(outs, default_sink), _collapse(ins, default_source)
    return {"salidas": outs, "entradas": ins, "ocultos": n_antes - len(outs) - len(ins),
            "crudo_activo": default_sink is not None and default_sink in
            [x["id"] for x in st.get("salidas") or [] if kind_of(x["nombre"]) == "altavoz"] and bool(filt)}


VOL_MAX = 2.0  # 200 %: tope del refuerzo por software


def clamp_vol(v, mx: float = VOL_MAX) -> float:
    """Volumen pedido (0..mx). Un valor ilegible o NaN cae a 1.0 (normal) en vez de romper o dejar 0."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return 1.0
    if f != f:
        return 1.0
    return max(0.0, min(mx, f))


def inspect_id(text: str) -> int | None:
    """id del nodo en la salida de «wpctl inspect» (primera línea: «id 56, type PipeWire:Interface:Node»)."""
    m = re.search(r"^\s*id\s+(\d+)", text or "", re.M)
    return int(m.group(1)) if m else None


def parse_sinks(pactl_list: str) -> dict:
    """{nombre: {estado, vol (%), mudo}} de «pactl list sinks». Un bloque por salida («Sink #N»); dentro, el estado va
    ANTES del nombre, así que se lee el bloque entero."""
    out = {}
    for block in re.split(r"(?m)^\S.*#\d+\s*$", pactl_list or ""):
        name = re.search(r"(?m)^\s*(?:Name|Nombre):\s*(\S+)", block)
        if not name:
            continue
        st = re.search(r"(?m)^\s*(?:State|Estado):\s*(\S+)", block)
        mu = re.search(r"(?m)^\s*(?:Mute|Silencio|Silenciado):\s*(\S+)", block)
        vo = re.search(r"(?m)^\s*(?:Volume|Volumen):.*?(\d+)%", block)
        out[name.group(1)] = {"estado": st.group(1) if st else None, "vol": int(vo.group(1)) if vo else None,
                              "mudo": bool(mu and re.match(r"yes|s[ií]", mu.group(1), re.I))}
    return out


def trace_diff(prev: dict | None, now: dict) -> list:
    """Qué cambió entre dos muestras (para no guardar 40 copias iguales)."""
    if prev is None:
        return ["inicio"]
    ch = []
    if prev.get("defecto") != now.get("defecto"):
        ch.append(f"salida por defecto: {prev.get('defecto')} → {now.get('defecto')}")
    if prev.get("destino_eq") != now.get("destino_eq"):
        ch.append(f"destino del ecualizador: {prev.get('destino_eq')} → {now.get('destino_eq')}")
    a, b = prev.get("sinks") or {}, now.get("sinks") or {}
    for n in sorted(set(a) | set(b)):
        x, y = a.get(n), b.get(n)
        if x is None or y is None:
            ch.append(f"{n}: {'aparece' if x is None else 'desaparece'}")
            continue
        for k, lab in (("vol", "volumen"), ("mudo", "silencio"), ("estado", "estado")):
            if x.get(k) != y.get(k):
                ch.append(f"{n}: {lab} {x.get(k)} → {y.get(k)}")
    if prev.get("flujos") != now.get("flujos"):
        ch.append(f"flujos: {prev.get('flujos')} → {now.get('flujos')}")
    return ch


# ---- Refuerzo por fuente (0.61): sube solo lo que suena de apps (vídeo, música, juegos), no los sonidos del sistema ----
BOOST_MAX = 200
# Quién suena «a nivel de sistema»: avisos de Steam y del escritorio. Por nombre de app / binario o por rol del flujo.
_SYSTEM_APPS = re.compile(r"^(steam|steamwebhelper|gamescope|libcanberra|canberra|speech-dispatcher|spd-say|notify-send|plasmashell|"
                          r"kwin.*|kded.*|gnome-shell|open ?gamepad.*|xdg-desktop-portal.*|decky.*|qam.*|pipewire.*|wireplumber)$", re.I)
_SYSTEM_ROLES = {"event", "notification", "a11y", "alert", "dialog", "test"}


def parse_sink_inputs(pactl_list: str) -> list:
    """Flujos de «pactl list sink-inputs»: [{id, app, binario, nombre, rol, vol (%), mudo, pausado}]."""
    out = []
    for block in re.split(r"(?m)^(?=\S.*#\d+\s*$)", pactl_list or ""):
        head = re.match(r"\S.*#(\d+)\s*$", block, re.M)
        if not head:
            continue

        def prop(key):
            m = re.search(r'(?m)^\s*' + re.escape(key) + r'\s*=\s*"(.*)"\s*$', block)
            return m.group(1) if m else ""
        vo = re.search(r"(?m)^\s*(?:Volume|Volumen):.*?(\d+)%", block)
        mu = re.search(r"(?m)^\s*(?:Mute|Silencio|Silenciado):\s*(\S+)", block)
        co = re.search(r"(?m)^\s*(?:Corked|Pausado|En pausa):\s*(\S+)", block)
        yes = re.compile(r"yes|s[ií]", re.I)
        out.append({"id": int(head.group(1)), "app": prop("application.name") or prop("application.process.binary") or "?",
                    "binario": prop("application.process.binary"), "nombre": prop("media.name"), "rol": prop("media.role").lower(),
                    "vol": int(vo.group(1)) if vo else None, "mudo": bool(mu and yes.match(mu.group(1))),
                    "pausado": bool(co and yes.match(co.group(1)))})
    return out


def is_anonymous(s: dict) -> bool:
    """Flujos internos (cadena del ecualizador, «Game output», «Virtual Headphone Surround»…): sin app ni binario. Por ellos pasa
    TODO el audio, avisos de Steam incluidos, así que nunca se tocan."""
    return not (s.get("binario") or "").strip() and (s.get("app") or "?") == "?"


def is_system_stream(s: dict) -> bool:
    return is_anonymous(s) or bool(_SYSTEM_APPS.match((s.get("app") or "").strip()) or _SYSTEM_APPS.match((s.get("binario") or "").strip())
                or (s.get("rol") or "") in _SYSTEM_ROLES)


def boost_on(s: dict, ov: dict) -> bool:
    """¿Se refuerza este flujo? Lo decide el usuario por app (ov[app]); si no, por defecto todo menos los sonidos del sistema."""
    if is_anonymous(s):
        return False
    v = (ov or {}).get(s.get("app"))
    return bool(v) if isinstance(v, bool) else not is_system_stream(s)


def clamp_pct(v, default: int = 100) -> int:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    if f != f:
        return default
    return int(max(100, min(BOOST_MAX, round(f / 10) * 10)))


def plan_boost(streams: list, pct: int, ov: dict, applied: dict) -> list:
    """[(id, %)] que hay que fijar ahora. «applied» {id: %} lo que ya se puso (se actualiza): cada flujo se toca una vez por nivel,
    para no pelear con una app que cambie su propio volumen. A 100 % solo se devuelve a lo que antes se reforzó."""
    todo, live = [], {s["id"] for s in streams}
    for k in [k for k in applied if k not in live]:
        del applied[k]
    for s in streams:
        want = pct if boost_on(s, ov) else 100
        prev = applied.get(s["id"])
        if prev is None and want == 100:
            continue  # flujo nuevo y sin refuerzo: no se toca
        if prev == want:
            continue
        applied[s["id"]] = want
        todo.append((s["id"], want))
    return todo
