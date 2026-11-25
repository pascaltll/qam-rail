#!/usr/bin/env python3
"""Captura lo que se ve de la interfaz de Steam (y, si hay herramienta, de la pantalla X) para poder mirar el diseño de verdad.
Solo biblioteca estándar. Usa la depuración CEF de Steam (127.0.0.1:8080), igual que steam-cpu.py.
Uso:  python3 ~/homebrew/plugins/qam-rail-dev/captura.py [filtro] [--x]
  filtro  texto que debe aparecer en el título de la página. Sin filtro: solo «Steam Big Picture Mode», la ventana principal, que ya
          incluye el panel de QAM y la barra lateral (comprobado en la Ally). Las demás páginas (QuickAccess, MainMenu…) están ocultas
          y agotan el tiempo; usa `todas` para intentarlas igualmente.
  --recorrido  con el panel de QAM Rail abierto, pasa por TODAS sus secciones (Inicio, etc.) y captura cada una; al final vuelve a la que estaba.
               Añade --scroll para capturar también lo que queda fuera de la vista en cada sección (hasta 4 trozos). Sin confirmar en la Ally.
  (por defecto) recorta desde el 44 % hasta la derecha (panel y barra) y reduce a 0,6: unas 5 veces menos tokens por imagen al leerlas.
  --completo   pantalla entera a tamaño real (solo si hace falta ver algo fuera del panel o letra muy pequeña).
  --secciones a,b  en --recorrido, solo esas secciones (p. ej. home,energy).
  --desborde   (con --recorrido) en cada sección mide en el panel real los controles (fichas, segmentos, botones) y lista los que tienen el texto
               cortado con «…», partido en más de una línea o menos de 40 px de alto. Solo lectura; imprime etiquetas de controles, nunca lo escrito.
  --x     además intenta una captura de la pantalla X :0 (ImageMagick `import` o `xwd`, si están instalados; sin confirmar en gamescope).
Guarda PNG en ~/qam-capturas/ (se conservan las últimas 40) e imprime las rutas. Puede mostrar lo que hay en pantalla: no la envíes fuera sin mirarla.
No cambia nada en Steam."""
import base64, importlib.util, json, os, re, shutil, subprocess, sys, time, urllib.request
from pathlib import Path

HOST, PORT = "127.0.0.1", 8080
OUT = Path.home() / "qam-capturas"
KEEP = 40
ESPERA = 12  # segundos por intento
PRINCIPAL = "Big Picture"
SIN_INTERFAZ = ("SharedJSContext",)  # contexto sin pantalla: no tiene nada que mostrar


def _ws_class():
    spec = importlib.util.spec_from_file_location("steam_cpu", Path(__file__).with_name("steam-cpu.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.WS


def slug(texto: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", texto or "pagina").strip("-")
    return (s or "pagina")[:40]


def elegir(paginas: list[dict], filtro: str = "") -> list[dict]:
    """Páginas a capturar: sin filtro, la principal; `todas`, cualquiera con interfaz; otro texto, las que lo contengan en el título."""
    if not filtro:
        filtro = PRINCIPAL
    elif filtro.lower() == "todas":
        filtro = ""
    out = []
    for p in paginas:
        titulo = p.get("title") or ""
        if not p.get("webSocketDebuggerUrl") or titulo in SIN_INTERFAZ:
            continue
        if filtro and filtro.lower() not in titulo.lower():
            continue
        out.append(p)
    return out


def plan_scroll(alto_total: int, alto_visible: int, max_pasos: int = 4) -> list[int]:
    """Posiciones de scroll para cubrir una sección más alta que la ventana (siempre incluye 0)."""
    if alto_visible <= 0 or alto_total <= alto_visible:
        return [0]
    pos, y = [0], 0
    while y + alto_visible < alto_total and len(pos) < max_pasos:
        y = min(y + alto_visible - 40, alto_total - alto_visible)  # 40 px de solape para no perder filas
        pos.append(y)
    return pos


def parse_secciones(args: list[str], todas: list[str]) -> list[str]:
    """Valor de --secciones a,b (en el orden pedido, solo las que existen); sin la opción, todas."""
    for a in args:
        if a.startswith("--secciones="):
            pedidas = [x.strip() for x in a.split("=", 1)[1].split(",") if x.strip()]
            return [x for x in pedidas if x in todas]
    return todas


# Mide controles visibles: texto cortado (scrollWidth > clientWidth), texto partido (alto > 1,7 líneas) y alto táctil < 40 px.
JS_DESBORDE = """(()=>{const out=[];
const lineas=(e)=>{const g=document.createRange();g.selectNodeContents(e);return new Set([...g.getClientRects()].filter(x=>x.width>0).map(x=>Math.round(x.top/4))).size};
for(const c of document.querySelectorAll('.qr-chip,[role=button],[data-qr=item]')){
 const r=c.getBoundingClientRect(); if(r.width<8||r.height<8) continue;
 if(c.querySelector('.qr-chip,[role=button],[data-qr=item]')) continue;
 const txt=(c.textContent||'').trim().replace(/\\s+/g,' '); if(!txt) continue;
 const p=[]; let cort=false, part=false;
 for(const e of [c,...c.querySelectorAll('*')]){
  if(e.scrollWidth>e.clientWidth+1 && e.clientWidth>0 && getComputedStyle(e).overflowX==='hidden') cort=true;
  if(!e.children.length && e.textContent.trim() && lineas(e)>1) part=true;
 }
 if(cort) p.push('cortado'); if(part) p.push('partido'); if(r.height<39) p.push('bajo '+Math.round(r.height)+'px');
 if(p.length) out.push({t:txt.slice(0,40),p});
}
return JSON.stringify(out)})()"""


def formatear_desborde(seccion: str, datos: str | None) -> list[str]:
    """Líneas legibles a partir del JSON de JS_DESBORDE (vacío si no hay problemas)."""
    try:
        return [f"  {seccion} — «{d['t']}» — {', '.join(d['p'])}" for d in json.loads(datos or "[]")]
    except (ValueError, KeyError, TypeError):
        return [f"  {seccion} — (no se pudo leer la medición)"]


def clip_compacto(ancho: int, alto: int) -> dict:
    """Región de captura: desde el 44 % de la pantalla hasta la derecha (el panel empieza hacia el 45 %), a escala 0,6."""
    x = int(ancho * 0.44)
    return {"x": x, "y": 0, "width": ancho - x, "height": alto, "scale": 0.6}


def _evaluar(ws, expr: str):
    return ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True}).get("result", {}).get("value")


def recorrido(host, secciones: list[str], con_scroll: bool, capturar, dormir=time.sleep, espera: float = 1.0) -> list[str]:
    """Recorre las secciones del panel con window.__qamRailUI (go/body) y llama a capturar(nombre) tras cada cambio.
    `host` es la conexión CEF donde vive __qamRailUI. Devuelve las rutas guardadas."""
    ui = "window.__qamRailUI"
    original = _evaluar(host, f"{ui}.current()")
    hechas = []
    try:
        for i, sec in enumerate(secciones, 1):
            _evaluar(host, f"{ui}.go({json.dumps(sec)})")
            dormir(espera)
            posiciones = [0]
            if con_scroll:
                dims = _evaluar(host, f"(()=>{{const b={ui}.body();return b?JSON.stringify([b.scrollHeight,b.clientHeight]):null}})()")
                if dims:
                    posiciones = plan_scroll(*json.loads(dims))
            for j, y in enumerate(posiciones):
                if j:
                    _evaluar(host, f"(()=>{{const b={ui}.body();if(b)b.scrollTop={int(y)};return !!b}})()")
                    dormir(0.4)
                ruta = capturar(f"{i:02d}-{slug(sec)}" + (f"-{j + 1}" if len(posiciones) > 1 else ""))
                if ruta:
                    hechas.append(ruta)
            if len(posiciones) > 1:
                _evaluar(host, f"(()=>{{const b={ui}.body();if(b)b.scrollTop=0;return !!b}})()")
    finally:
        if original:
            _evaluar(host, f"{ui}.go({json.dumps(original)})")
    return hechas


def podar(carpeta: Path, mantener: int = KEEP) -> None:
    archivos = sorted(carpeta.glob("*.png"), key=lambda f: f.stat().st_mtime)
    for f in archivos[:-mantener] if mantener else archivos:
        try:
            f.unlink()
        except OSError:
            pass


def captura_x(destino: Path) -> str | None:
    env = dict(os.environ, DISPLAY=os.environ.get("DISPLAY", ":0"))
    try:
        if shutil.which("import"):
            subprocess.run(["import", "-window", "root", str(destino)], env=env, check=True, timeout=15, capture_output=True)
            return str(destino)
        if shutil.which("xwd") and shutil.which("convert"):
            xwd = subprocess.run(["xwd", "-root", "-silent"], env=env, check=True, timeout=15, capture_output=True).stdout
            subprocess.run(["convert", "xwd:-", str(destino)], input=xwd, check=True, timeout=15, capture_output=True)
            return str(destino)
    except (subprocess.SubprocessError, OSError) as e:
        print(f"(captura de la pantalla X falló: {e})")
        return None
    print("(no hay `import` de ImageMagick ni `xwd`+`convert`: sin captura de la pantalla X)")
    return None


def recorrer_todo(paginas: list[dict], WS, marca: str, con_scroll: bool, compacto: bool = False, args: list[str] | None = None) -> None:
    host = principal = None
    for p in paginas:
        if not p.get("webSocketDebuggerUrl"):
            continue
        try:
            ws = WS(p["webSocketDebuggerUrl"])
            es_host = _evaluar(ws, "typeof window.__qamRailUI") == "object"
            es_principal = PRINCIPAL.lower() in (p.get("title") or "").lower()
            host = ws if es_host else host
            principal = ws if es_principal else principal
            if not (es_host or es_principal):
                ws.s.close()
        except OSError:
            continue
    if not host or not principal:
        print("Abre el panel de QAM Rail (con el panel cerrado no existe __qamRailUI) y repite." if not host else "No encuentro «Steam Big Picture Mode».")
        return
    principal.s.settimeout(ESPERA)
    secciones = parse_secciones(args or [], json.loads(_evaluar(host, "JSON.stringify(window.__qamRailUI.sections)") or "[]"))
    clip = None
    if compacto:
        wh = _evaluar(principal, "JSON.stringify([innerWidth, innerHeight])")
        clip = clip_compacto(*json.loads(wh)) if wh else None

    def capturar(nombre: str):
        if "--desborde" in (args or []):
            for linea in formatear_desborde(nombre, _evaluar(principal, JS_DESBORDE)):
                print(linea)
        try:
            datos = principal.call("Page.captureScreenshot", {"format": "png", **({"clip": clip} if clip else {})}).get("data")
        except OSError as e:
            print(f"(sin imagen de {nombre}: {e})")
            return None
        if not datos:
            return None
        ruta = OUT / f"{marca}-{nombre}.png"
        ruta.write_bytes(base64.b64decode(datos))
        return str(ruta)

    print(f"Secciones: {', '.join(secciones)}")
    hechas = recorrido(host, secciones, con_scroll, capturar)
    podar(OUT, 200)
    print("\n".join(hechas) if hechas else "No se capturó nada.")


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    filtro = args[0] if args else ""
    OUT.mkdir(parents=True, exist_ok=True)
    marca = time.strftime("%Y%m%d-%H%M%S")
    paginas = json.load(urllib.request.urlopen(f"http://{HOST}:{PORT}/json/list", timeout=5))
    WS = _ws_class()
    hechas = []
    compacto = "--completo" not in sys.argv
    if "--recorrido" in sys.argv:
        recorrer_todo(paginas, WS, marca, "--scroll" in sys.argv, "--completo" not in sys.argv, sys.argv)
        return
    for p in elegir(paginas, filtro):
        titulo = p.get("title") or p.get("url", "")[:30]
        datos, motivo = None, ""
        for extra in ({}, {"fromSurface": False}):  # 2.º intento: otro modo, por si la página está oculta
            try:
                ws = WS(p["webSocketDebuggerUrl"])
                ws.s.settimeout(ESPERA)
                clip = None
                if compacto and p.get("title") and PRINCIPAL.lower() in p["title"].lower():
                    r0 = ws.call("Runtime.evaluate", {"expression": "JSON.stringify([innerWidth, innerHeight])", "returnByValue": True})
                    wh = r0.get("result", {}).get("value")
                    clip = clip_compacto(*json.loads(wh)) if wh else None
                datos = ws.call("Page.captureScreenshot", {"format": "png", **extra, **({"clip": clip} if clip else {})}).get("data")
                ws.s.close()
            except OSError as e:  # incluye el tiempo agotado
                motivo = str(e)
            if datos:
                break
        if not datos:
            print(f"(sin imagen de {titulo!r}: {motivo or 'respuesta vacía'}; si el panel está cerrado, ábrelo y repite)")
            continue
        ruta = OUT / f"{marca}-{slug(titulo)}.png"
        ruta.write_bytes(base64.b64decode(datos))
        hechas.append(str(ruta))
    if "--x" in sys.argv:
        ruta = captura_x(OUT / f"{marca}-pantalla-X.png")
        if ruta:
            hechas.append(ruta)
    podar(OUT)
    print("\n".join(hechas) if hechas else "No se capturó nada (¿Steam está en marcha con la depuración en :8080?)")


if __name__ == "__main__":
    main()
