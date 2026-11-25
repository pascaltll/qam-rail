---
name: navegacion-big-picture
description: Navegar, ver y probar Steam Big Picture sin tocar la pantalla (CDP en 127.0.0.1:8080): abrir/cerrar el QAM, leer el foco del mando, explorar el grafo de foco y detectar nodos sin salida, aristas sin vuelta y retrasos. Úsalo al buscar fallos de navegación, lag o render.
---

# Navegación y pruebas en Big Picture

Herramientas del repo (solo biblioteca estándar, ver `scripts/`):
- `bp_nav.py paginas | foco | qam estado|abrir|cerrar | teclas | grafo [--pasos=N] [--max-seg=S] | parada`
- `captura.py [--recorrido] [--completo]` para ver el resultado (compacto por defecto).
- `steam-cpu.py [s]` para CPU por página; `informe.sh` para reunirlo todo.

## Orden de trabajo
1. **Comprobar la base**: `bp_nav.py paginas` (¿hay «Steam Big Picture Mode» y `SharedJSContext`? ¿endpoint de navegador en `/json/version`?) y `bp_nav.py teclas` (¿las flechas por CDP mueven el foco? si no, `grafo` no sirve y hay que usar un mando virtual uinput).
2. **Abrir el panel sin ayuda**: `bp_nav.py qam abrir`; comprueba con `qam estado` y una captura. Si «NO se cumplió», no inventes: reporta qué dijo la orden. Al terminar, `qam cerrar`.
3. **Explorar**: `bp_nav.py grafo --pasos=80` con el panel abierto. Lee el resumen y el JSON de `~/qam-grafo/`.
4. **Interpretar** (verifica antes de afirmar):
   - *Sin salida*: nodo donde ninguna flecha mueve el foco → trampa real o foco que depende de otra tecla; mira si B sale.
   - *Sin vuelta*: A —Derecha→ B pero B —Izquierda→ C. Muchas son normales en listas; revisa solo las de botones o controles.
   - *Lento*: más de 300 ms entre pulsación y cambio de foco → mide con `steam-cpu.py` mientras ocurre.
   - Lo que no se visitó no está probado como inalcanzable: solo es «no recorrido».
5. **Ver lo que falla**: captura de la pantalla en cada nodo problemático y `revisor-visual` si son varias.

## Reglas
- Todo lo de esta ruta está **sin confirmar en la Ally** hasta que se ejecute: di qué comando corriste y qué salió.
- `grafo` mueve el foco real: no lo lances con una app o juego en primer plano que reciba teclas, ni con el usuario usando la consola.
- Etiquetas y capturas pueden incluir nombres de amigos o apps: se quedan en el equipo; no se envían a otro servicio sin revisarlas.
- No reinicies Steam ni `plugin_loader` para probar; si hace falta, pide permiso.
- Alternativas ya existentes por si se quiere más: Playwright MCP (`--cdp-endpoint`) o Chrome DevTools MCP (`--browser-url`) contra `http://127.0.0.1:8080`; no están probados con el Chromium de Steam.

## Seguridad al automatizar
- **Interruptor**: `bp_nav.py parar` crea `~/.qam-nav-stop`; con él puesto no sale ninguna tecla ni `qam abrir|cerrar` (un archivo ilegible también cuenta como parado). **Un agente nunca ejecuta `armar` ni borra ese archivo**: solo una persona lo reactiva. Si una orden dice «PARADO», informa y detente; no lo esquives.
- **Registro**: cada orden queda en `~/qam-grafo/ledger/<sesión>.ndjson` (hora, orden, `ok`, ms, pulsaciones, error). `ok` solo significa que la orden terminó sin excepción, no que la prueba pasara: léelo junto a la salida.
- **`foco` dice si se ve**: «tapado», «parcial» o «fuera» (cuadrícula 3×3 con `elementFromPoint`) es un fallo de diseño aunque el foco esté bien colocado. Si avisa de que `document.activeElement` no coincide, fíate de `.gpfocus`. Si avisa de «contenedor», el foco no está en un control.
- `foco` busca `.gpfocus` en todas las páginas CEF (en un Steam Deck con SteamOS vivía en la del menú rápido, no en «Big Picture»; en Bazzite sin confirmar).
- `grafo --max-seg` acota el tiempo (por defecto 120 s) y guarda lo explorado si lo paran.
