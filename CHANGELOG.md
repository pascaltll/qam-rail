# Cambios

## dev.110
- **Registro de foco con el mando, siempre activo (`src/focusLog.ts`, `py_modules/qam_focus.py`).** Cada vez que usas el panel se anota, dentro de los manejadores que ya existen (sin sondeos ni observadores, así que casi no gasta CPU): cada movimiento de la cruceta (de qué control a cuál y hacia dónde, o «sin destino» si no hubo), los cambios de sección y los toques con el dedo. Una sesión por apertura; se manda al backend al cerrar, al ocultarse la ventana y cada minuto, y se guarda en `foco.jsonl` (1 MB, rota). Sirve para encontrar trampas de foco y controles que solo se usan con el dedo (los que el mando nunca alcanzó).
- **Privacidad:** solo etiquetas de controles (24 letras) y su ruta en el DOM; nunca lo que escribes. Las secciones Social y Apps se anotan como «(lista)» (nombres de amigos y de apps). Se apaga creando `foco-off` en `~/homebrew/settings/qam-rail-dev/`.
- **Lectura:** `python3 ~/homebrew/plugins/qam-rail-dev/foco.py` (también en `informe.sh`): imprime dónde la cruceta no tuvo destino y qué controles se tocaron con el dedo pero a los que el mando nunca llegó. Backend: `focus_log` y `focus_summary` en `main.py`. Pruebas: `tests/focusLog.test.ts` y `tests/py/test_focus.py`.
- **Sin confirmar en la Ally:** que el manejador `onBodyDir` reciba todos los movimientos de la cruceta (el riel y las columnas laterales tienen su propia navegación y no se registran todavía) y cuánto pesa en CPU.
- `package.sh` ahora empaqueta también `navtest.py` y `foco.py`.

## dev.109
- **Zonas táctiles de 40 px en controles pequeños, sin mover el diseño** (hallazgo de `captura.py --desborde` sobre dev.106): el «?» de ayuda de cada tarjeta (22 px; el círculo no cambia, la zona de toque es un contenedor de 40 px con margen negativo), los interruptores «Encendido/Apagado» de Wi‑Fi y Bluetooth (28 px), el enlace «Todas ›» de Inicio (20 px) y el de «Emparejar otro ›»/«Otras redes ›» (hasta 40 px). El selector de estado de Amigos («En línea», 26 px) sí crece visualmente a 40 px de alto, con margen negativo para no empujar a los vecinos.
- **`captura.py --recorrido --alcance`:** en cada sección lista los controles del panel que se tocan pero no son una parada del mando (ni son un elemento enfocable propio). Calibrada en la Ally (25-nov, sobre dev.108): sin sus excepciones solo salen los «?» de ayuda (el mando usa Y); con ellas, las 7 secciones salen limpias, riel incluido. Límite: comprueba que cada control es una parada de foco, NO que la cruceta llegue hasta ella en el recorrido espacial (eso lo decide Steam), ni cubre menús, hojas, columna de plugin ni teclado grande.
- **`scripts/navtest.py watch [s]`: grabadora de foco del mando** (cero imágenes, solo lectura, no envía teclas). Mientras recorres el panel con la cruceta lee cada 0,15 s qué control tiene el foco y, al terminar, informa por sección cuántas paradas visitaste y cuáles no, y los saltos de foco raros (>300 px dentro de una sección). Lógica pura probada en `tests/py/test_navtest.py`. Probado en la Ally (25-nov): detecta 33 paradas en Inicio (riel incluido). Descartado: enviar flechas por CEF (`Input.dispatchKeyEvent`) no mueve el foco de Steam (sin foco `.gpfocus` antes ni después). Pendiente y sin confirmar: un recorrido real completo; un mando virtual por `/dev/uinput` automatizaría la prueba, pero crea un dispositivo en el equipo y requiere tu permiso.
- **`navtest.py`, segunda versión tras el primer recorrido real (4 min):** el riel se cuenta aparte (antes sus 7 iconos salían «sin visitar» en cada sección), cruzar al riel ya no es «salto raro», y se mide la posición del foco 0,4 s después de cada cambio (cuando el scroll ya terminó) para avisar de **foco fuera de la vista del panel** y de **foco sobre un elemento oculto** (posición 0,0). También se corrigió que la grabadora perdía la traza si el panel se cerraba.
- Sin confirmar en la Ally: que los márgenes negativos no solapen controles vecinos ni recorten el anillo de foco; falta instalar y repetir `captura.py --recorrido --desborde`.

## dev.108
- **Una sola regla para el texto de los controles de altura fija** (`Label` en `src/ui.tsx`, usada por `Chip`, `Segments` y `ModeChip`): una línea con «…» y `title` con el texto entero; solo las opciones de `Segments` sin icono admiten 2 líneas, centradas. Antes cada componente lo hacía a su manera, y de ahí «Equilibrado 15» partido, «Aspecto OLED» a la izquierda, etc.
- **Zonas táctiles de 40 px (opción A acordada):** `Chip compact` pasa de 32 a 40 px (queda como la normal; solo cambia el relleno) y las opciones de `Segments` de 34 a 40 px (46 px las `tall`, igual que antes). Sin confirmar en la Ally: cuánto crece el panel y si las secciones largas siguen cabiendo (más scroll).
- **«Aspecto OLED» → «OLED»** en el selector de color y en la ayuda (decisión de Carlos). Pruebas actualizadas.
- **`captura.py --recorrido --desborde`:** en cada sección mide los controles reales y lista los que tienen texto cortado con «…», partido en varias líneas (cuenta líneas reales con `Range`) o menos de 39 px de alto. Solo lectura. Probado en la Ally sobre dev.106: confirma «Aspecto OLED» y «ROG Ally mejorado» partidos y los 32/34 px, y encuentra otros objetivos pequeños aún sin tocar: botones «?» de ayuda (22 px), interruptores «Encendido» (28 px), «Todas ›» (20 px), «En línea» (26 px). Los nombres de juegos cortados en Inicio y los nombres de apps en dos líneas en Apps son intencionados.
- Ignorado a propósito: nombre «LetMeReShade» (cortado en Apps) y «Forgeinator 3000» / «Forgeinator 3000 Dev» (dos entradas: versión de desarrollo y de usuario de un lanzador propio).
- Sin confirmar visualmente: falta instalar y recapturar.

## dev.107
- **Botón «Cerrar columna» de los plugins: zona de toque de 48 px.** Medía 30×30 px (lo detectó el nuevo agente `revisor-navegacion` leyendo `src/PluginColumn.tsx`; comprobado en el código). El círculo se ve igual: la zona de toque es un contenedor de 48 px con margen negativo. Con el mando no hay trampa: B ya cierra la columna.
- **Segmentos sin icono (p. ej. COLOR en Pantalla): el texto que se parte en dos líneas queda centrado.** «Aspecto OLED» salía en dos líneas pegado a la izquierda mientras Cine/Vivo/Cómodo iban centrados (visto en `03-display`). Ahora va en un `span` centrado (`Segments` en `src/ui.tsx`). Sigue partiéndose en dos líneas porque son 5 columnas iguales.
- **No tocado, sin confirmar:** los «bajo contraste» que marcó el revisor (opciones no seleccionadas, «Conectar», «Pasar a estable»). La captura del 25-nov 07:42 sale más oscura que las anteriores (el panel se ve atenuado), así que no sirve para medir contraste; hay que recapturar con el panel en primer plano.
- **Nuevo agente `.claude/agents/revisor-navegacion.md`** (haiku, solo lectura): audita el código por controles inalcanzables con la cruceta, trampas de foco, zonas táctiles pequeñas, duplicados de botones y errores evidentes. Sus hallazgos se comprueban antes de actuar (un segundo hallazgo, el banner de ayuda, resultó no ser fallo).
- Sin confirmar visualmente: falta instalar y recapturar la columna de un plugin.

## dev.106
- **Panel: texto de las fichas en una sola línea y más aire bajo las pestañas.** En la captura de la Ally, «Equilibrado 15» se partía en dos líneas y «Equilibrado» se salía de la píldora porque, con la letra con serifa, no cabía en el ancho de la ficha. Ahora el texto de toda ficha va en una línea (con «…» si aún no cupiera) y las fichas compactas usan 4 px de relleno lateral en vez de 8 (`Chip` en `src/ui.tsx`). La frase bajo las pestañas («Sin juego: lo de siempre») tiene 6 px de margen superior (`src/QamHomeModes.tsx`).
- Primera captura tras instalar: la ficha ya no se partía pero decía «Equilibrado…» y perdía los vatios. Ahora los vatios van aparte (nunca se recortan), el nombre se acorta solo si hace falta y la letra de esa ficha baja a 11 px (`src/QamTdp.tsx`).
- **La serifa no es de QAM Rail:** viene del tema «Hooandee Luminous Atlas» (`tokens.css`: `--hla-serif`, usada en `qam.css`), que fuerza esa fuente en el QAM. No se ha tocado.
- Confirmado en la Ally con captura (`captura.py --recorrido --secciones=home`, 25-nov 07:21): la ficha se ve en una línea como «Equilibra… 15» y «Sin juego: lo de siempre» tiene aire bajo las pestañas. La captura compacta recorta el lado izquierdo, así que esa frase se vio solo en parte («…de siempre»).

## dev.105
- **Teclado grande: página de símbolos y botones del mando.** Nueva página «123» (números y signos: `@ # $ % & * ( ) [ ] { } < > / \ ! ? . , : ; ' " ~ |`) con vuelta «ABC»; mando: LT = Mayús, RT = símbolos/letras, L3 = Bloq, LB/RB = cursor ←/→ (los botones llegan por la propiedad `onButtonDown` y por el evento `vgp_onbuttondown`, descartando el duplicado). Lógica pura en `keyboardLayout.ts` (`SYMBOL_ROWS`, `padAction`) con pruebas.
- **Sin confirmar en el equipo:** que Steam entregue LT/RT/L3 a esta página (los códigos 7, 8 y 15 salen de los tipos de @decky/ui). Sin hacer todavía: que la ventana de la app se ajuste para mantener visible el campo enfocado (necesita medirse en la Ally).

## dev.104
- **`steam-cpu.py`: qué página de la interfaz de Steam gasta CPU.** Usa la depuración CEF (puerto 8080) y mide, por página (QuickAccess, MainMenu, Steam Big Picture Mode, SharedJSContext…), el % de tiempo ocupada, cuánto en JavaScript, maquetación y estilos, y los relayouts por segundo. Uso: `python3 ~/homebrew/plugins/qam-rail-dev/steam-cpu.py 10`. `informe.sh` lo ejecuta 6 s y lo añade.
- Aviso: en dev.103 las etiquetas de `steamwebhelper` salen como `[zyg]` para los dos procesos de interfaz (Chromium los lanza desde el zygote y comparten línea de órdenes), así que no distinguen cuál es cuál; para eso sirve `steam-cpu.py`.

## dev.103
- **La grabadora distingue los procesos de steamwebhelper.** Antes salían todos como `steamwebhelper:48%`; ahora `steamwebhelper[gpu]`, `steamwebhelper[rend#27]` (cada ventana de la interfaz de Steam), `[util]` o `[main]`. Sirve para saber CUÁL se come la CPU cuando se abre el panel (el 25-nov se vieron dos procesos entre 100 % y 270 %).

## dev.102
- **Una grabación por app abierta.** Antes la grabadora guardaba solo una copia anterior (`nav-trace.log.old`). Ahora cada grabación se archiva en `trazas/AAAAMMDD-HHMMSS-<app>.log` (se conservan las últimas 25 o 12 MB) y la primera línea lleva el nombre de la app. Si abres otra app con la grabadora encendida, queda una marca «se abrió X» en la grabación en curso.
- `informe.sh` lista las apps abiertas (línea de tiempo) y añade las últimas líneas de las 5 grabaciones más recientes.

## dev.101
- **Errores de la interfaz al registro.** Cualquier error de JavaScript o promesa rechazada en la ventana de Steam o del panel queda en `timeline.log` como `ui.js.error` / `ui.js.rechazo` (mensaje corto, archivo y línea; tope de 12 por minuto; nunca datos del usuario).
- **`informe.sh` más completo:** ahora incluye las ventanas de X (`:0` y `:1`), los átomos de gamescope y de Steam en la raíz, las páginas abiertas de la interfaz de Steam (CEF, puerto 8080), los errores `ui.js.*` y los procesos que más CPU gastan.
- **Inventario de apps sin duplicados:** «ES-DE», «ES DE.AppImage» y «esde.appimage» son una sola app (se comparan sin mayúsculas, guiones ni «.AppImage»); gana Flatpak, luego la que tiene `.desktop` (icono y grupo) y luego el archivo suelto. Las copias de seguridad (`.OLD`, `_old`, `.bak`) ya no salen como apps.

## dev.100
- **Vigilante de apps.** Al abrir una app de escritorio se enciende sola la grabadora de navegación (toques con su efecto, scroll, ventanas que aparecen y desaparecen, parones del lector, carga del navegador); se apaga a los 15 min. Se desactiva creando el archivo `vigilante-off` en la carpeta de ajustes. Nunca anota lo que se escribe.
- **Resultado de abrir una app en el registro de línea de tiempo:** `app.ventana` (cuántos ms tardó en aparecer su ventana) o `app.sin_ventana` (se lanzó pero en ~20 s no apareció ninguna: así se ve qué apps «no abren», como Instagram de Waydroid el 24-nov).
- La grabadora conserva la grabación anterior (`nav-trace.log.old`) en vez de borrarla al empezar otra.
- **`informe.sh`** (en la carpeta del plugin): junta en `~/qam-informe.txt` la versión, los avisos del vigilante y las últimas líneas de cada registro, para pasarlo de una vez.

## dev.99
- **Vigilante del panel fantasma.** El 24-nov, con VacuumTube abierto, pulsar Steam (menú izquierdo) y luego Steam+A dejó la pantalla de Steam desenfocada sin ningún panel visible y sin respuesta: el registro tenía «panel abre» pero nunca «panel cierra», y el overlay seguía puesto. Ahora, mientras el panel figura abierto, se comprueba cada segundo que su elemento existe, está conectado y tiene tamaño dentro de la ventana; tras 4 fallos seguidos se cierran el panel, los menús de Steam y el overlay del backend. El primer fallo queda en el registro como «vigilante: el panel no se ve (motivo)». Es una red de seguridad: la causa exacta del limbo sigue sin confirmar.

## dev.98
- **Autoprueba: nuevo paso «suavidad del desplazamiento».** La página registra cada evento de scroll de la lista (con su hora) y, 300 ms después de soltar, resume: eventos por segundo, salto máximo entre dos eventos y parón más largo. Solo mide, no cambia el comportamiento: sirve de línea base antes de afinar el scroll (pasos de rueda más finos / inercia).

## dev.97
- **La autoprueba apaga «tocar un texto abre el teclado» mientras corre** (solo su paso propio lo fuerza para medirlo). En tu dev.96 el teclado grande se había abierto **32 veces** durante la prueba por los toques en campos de texto de la página; `_libre()` lo cerraba cada vez, pero costaba tiempo y ensuciaba el resultado. «Interferencias» ahora solo salta si de verdad alguien toca la pantalla.
- Resultado de dev.96 en tu equipo: **pantalla completa automática funciona** (⛶ del vídeo, F11, tocar dentro y salir), zoom, scroll, teclado 12/12 (modo `lock` + `remap`), «tocar un texto abre el teclado» bien. Quedan: desplazar con el dedo en un desplegable largo (Firefox) y el experimento de la lista emergente.
- «teclado: mejor combinación» dice «se queda en» cuando la mejor combinación es el modo de antes.

## dev.96
- **La autoprueba no se queda sin resultado.** Se paraba a los **300 s** (el aviso decía «2 minutos»): desde que la batería del teclado repite la matriz de modos, la prueba dura más de 5 minutos y al pasarse perdía **todo** el resultado (`selftest.json` quedaba con el de antes; por eso en tu equipo no avanzaba a las 12:12 ni a las 11:55). Ahora el límite es de 15 minutos, y si se pasa se guardan los pasos que ya hizo.
- **La matriz del teclado es más corta:** si «atajos con Ctrl» ya encontró un modo que funciona, solo se compara cómo salen los símbolos (2 pruebas en vez de 6, ~1 min en vez de ~4).

## dev.95
- **La autoprueba se recupera si se abre el teclado grande o el panel durante la prueba.** En tu equipo, a las 11:50 se abrió el teclado de verdad (alguien tocó el campo de texto de la página; el registro lo muestra: «cursor de texto → teclado grande» sin cerrarse después), el táctil quedó en pausa y todos los pasos siguientes fallaron con «el toque no llegó» (también «vídeo: pantalla completa», por eso no se pudo ver si Firefox pide la pantalla completa). Ahora, antes de cada toque o arrastre, si el táctil está en pausa se cierra el teclado (y, si hace falta, el panel) y se sigue; al final aparece un paso «interferencias» que dice cuántas veces pasó. **Durante la prueba no toques la pantalla** (el aviso «no toques la pantalla» ya sale).
- Pendiente: ver el resultado de «vídeo: pantalla completa» sin interferencias; en `pad.log` se verá «pantalla completa: la ventana 0x… la pide → hecho» si Firefox manda la petición.

## dev.94
- **Teclado grande, mando como el de Xbox:** **Y = espacio**, **Start = Intro**, X = borrar, B = cerrar. Tu segunda foto lo aclaró: en Steam la «opción» (`onOptionsButton`) es el botón **Y** y el «menú» (`onMenuButton`) es **Start**; el texto de la cabecera decía «Start Intro» y «Menú espacio» pero la barra de Steam mostraba «Y INTRO». Estaba al revés y mal rotulado. La barra de ayudas de Steam ya muestra los botones, así que se quita el texto repetido de la cabecera.
- Margen inferior 48 → 68 px: en la foto de dev.93 la barra de Steam aún tapaba la mitad de abajo de la barra espaciadora.

## dev.93
- **Teclado grande: ya no queda tapado por la barra de Steam.** En tu foto la fila de abajo (Ctrl, AltGr, **barra espaciadora** y flechas) quedaba debajo de la barra de ayudas de Steam («MENÚ / ATRÁS»). Ahora el teclado se apoya 48 px más arriba (`STEAM_FOOTER` en `BigKeyboardPage.tsx`; si ves que sobra o falta, es un solo número). Los consejos de los botones de la cabecera pasan de 11 a 13 px.
- Pendiente (diseño tipo Xbox): cuadrícula alineada en vertical, página de símbolos/números, Y = espacio, LT/RT = Mayús/símbolos.

## dev.92
- **Pantalla completa: diagnóstico.** En tu equipo dev.91 conectó («escuchando las peticiones de los navegadores») pero no hubo ninguna línea de petición, así que se anotan ahora **todos los mensajes que llegan a la raíz de X** que no sean la petición esperada (`pad.log`: «pantalla completa: mensaje de 0x…: nombre acción=n …», hasta 40). Con eso se ve si Firefox manda otra cosa, o nada.

## dev.91
- **Pantalla completa automática en navegadores (F11 y botón ⛶ de los vídeos).** Bajo gamescope el navegador pide la pantalla completa a la raíz de X y nadie lo contesta, por eso en tu Firefox fallaban «vídeo: pantalla completa» y «F11» aunque el toque llegaba. Ahora el mando escucha esas peticiones (`py_modules/qam_fswatch.py`, conexión propia a X, solo mensajes `_NET_WM_STATE`) y le pone a la ventana el estado `_NET_WM_STATE_FULLSCREEN`, que es lo que la autoprueba vio que funciona; al pedir salir o alternar, lo quita. Queda anotado en `pad.log` («pantalla completa: la ventana 0x… la pide → hecho») y en la grabadora (`pantalla-completa.peticion`).
- Probado con un Xvfb real (un cliente manda la petición a la raíz como un navegador, se recibe y se aplica el estado). Falta verlo en tu equipo: si no aparece la línea «pantalla completa: escuchando…» o el navegador no manda la petición, lo veré en `pad.log`.

## dev.90
- **Teclado: la autoprueba ya no empeora un modo bueno.** En tu equipo la batería empezó con 11/12 (Ctrl «lock» + símbolos «remap»), la matriz dio 10/12 en las dos combinaciones con «lock» (con ruido: cada modo deja el teclado en un estado distinto) y se guardó «lock + levels», peor que lo que había. Ahora la matriz solo cambia de modo si alguna combinación **mejora** el resultado inicial; si empata o es peor, se queda con el modo de antes (y lo dice: «se queda en … (al empezar 11/12)»).
- **Los fallos del teclado dicen dónde difieren**: «difiere en el carácter 45 (esperado «…», salió «…»; largo 80 → 79)». Antes cortaba a 24 caracteres y «texto largo» parecía igual de bien.
- Reagarre del táctil más rápido y sin falso «parón.lector» tras estar el mando inactivo (espera 0,3 → 0,1 s).
- Resultado de dev.88 en tu equipo (Firefox): **«tocar un texto abre el teclado grande» funciona**: campo de texto 225 ms, cuadro de texto 227 ms, el botón no lo abre. Se reconoce el cursor por su nombre (`qam-text`).
- Sigue fallando en Firefox (pendiente): pantalla completa del vídeo y F11 (el experimento de poner el estado de la ventana sí funciona: falta automatizarlo) y elegir con el dedo en un desplegable largo (la lista no es una ventana de X).

## dev.89
- **Sin cambios de comportamiento: limpieza del código del mando y del diagnóstico**, con red de tests. `PadRunner._read` (complejidad 42 → 10) y `PadRunner.run` (59 → 5) se trocean en funciones pequeñas (`_key_event`, `_abs_event`, `_step`, `_output_tick`, `_text_check`…); `Plugin._forensics` (46 → 19) deja su análisis puro en `py_modules/qam_forensics.py`.
- Tests nuevos: `test_read.py`, `test_step.py`, `test_forensics.py`, `test_main_forensics.py` (el primero que carga `main.py` para probar `_forensics`).
- Medición inicial de calidad: promedio B (6,4), cobertura Python 52 %, 22 funciones con complejidad > 20 (quedan 19), duplicación TS 0,06 %.
- Un fallo al enviar la acción de Select ahora se anota en el log (antes no se capturaba).
- Lo de dev.88 sigue pendiente de probar en el aparato (tocar un texto abre el teclado).

## dev.88
- **Autoprueba: «tocar un texto abre el teclado grande».** Toca un campo de texto, un cuadro de texto y un botón (con la opción forzada durante la prueba y capturando el aviso, sin abrir el teclado de verdad) y dice cuáles abren el teclado, a los cuántos ms, y **qué cursor ve X bajo el dedo** (`cursor: …`). Si no abre, ese cursor dice por qué (el detector reconoce el cursor de texto por nombre o por forma de I). En Xvfb/Chrome todos los cursores son iguales y no se puede comprobar; en tu equipo dará el dato.
- Plan de «sensación de tablet» y teclado inspirado en Xbox/Steam en `AUTOPRUEBA-NAVEGADOR.md` (sección nueva).

## dev.87
- **Zoom con dos dedos (fallaba en Firefox y en Edge):** el zoom es Ctrl + rueda, y la X del mando no conocía la forma de aplicar Ctrl que la autoprueba guarda (`lock`): solo la tenía la X del teclado. Era la causa de que el zoom no cambiara nada aunque el scroll sí funcionara. Ahora la X del mando carga `kbd-mode.json` al conectar y la autoprueba se la actualiza al cambiar de modo.
- Resultado de dev.86 en tu Edge: 49 de 51 pasos bien. Teclado 12/12, pantalla completa de vídeo y F11, desplegables y menús bien. Solo fallaba el zoom (arreglado arriba). Las transiciones pasan: QAM abre en 38 ms, el táctil vuelve en 171 ms; teclado grande cierra en 445 ms.

## dev.86
- **Teclado: batería completa en «Probar navegador»** (`teclado: batería completa`). Pasa 12 casos y dice, uno a uno, qué esperaba y qué salió: minúsculas y dígitos, MAYÚSCULAS, símbolos (2 grupos), acentos y ñ, letras repetidas, texto largo (80), flechas/Inicio/Fin/Borrar/Supr, Intro en un cuadro de texto, Ctrl+A/C/V, Ctrl+X y pegar, Mayús+flechas; y la velocidad (caracteres/s). La página de prueba tiene ahora un cuadro de texto (`textarea`) para Intro.
- **Si algo falla, prueba solo todas las combinaciones** (Ctrl: keys/slow/lock × símbolos: levels/remap = 6) con la misma batería y se queda con la que más casos pasa (`teclado: mejor combinación`, con la tabla de todas). Queda guardada. Así, en Edge, una sola ejecución dice qué falla y deja puesto el mejor modo.
- **Transiciones: ahora miden el tamaño de la ventana** cada 40 ms tras cerrar el panel o el teclado (mínimo, tamaño final y cuándo vuelve a pantalla completa) y el tamaño de la **página** (px CSS) comparado con el inicial. Marca fallo si la ventana no vuelve a pantalla completa o si la página se queda más pequeña (el navegador no se redibujó).
- **Edge/Chromium encogido en la esquina tras la animación:** el programa encoge y agranda la ventana en pasos de 35 ms; Chromium a veces se queda dibujando al tamaño de un paso intermedio aunque la ventana ya sea de pantalla completa. Al acabar la animación, a ventanas de apps tipo Chromium se les da un cambio de 2 px y vuelta (a los 120 ms) para obligarles a redibujarse. (Ajuste no verificado en tu Edge: la prueba de transiciones dirá si funcionó.)

## dev.85
- **Resultado de dev.84 en tu equipo:** el QAM abre rápido (interfaz 39 ms, overlay 43 ms, táctil se pausa 54 ms) y el teclado grande también (104 / 32 / 120 ms). Dos problemas:
  1. **El táctil tardaba ~2,3 s en volver tras cerrar el teclado** (y el primer toque llegaba a 2,4 s). Causa: el táctil solo se volvía a buscar en una ronda cada 2 s. Ahora, en cuanto el panel o el teclado se cierran, se busca de inmediato. (Con el mando se notaba menos porque su «activo» lanzaba esa búsqueda; con el dedo, que es lo normal en una tablet, esperaba la ronda.)
  2. **La prueba no cerraba el QAM** (usaba `CloseSideMenus`, que no cierra nuestro panel; es un modal). Ahora lo cierra como al pulsar B. Por eso salieron «cerrar no llegó», el overlay arriba y la app sin foco en las otras series: eran consecuencia de ese fallo de la prueba.

## dev.84
- **«Probar transiciones»** (botón nuevo junto a «Probar navegador», mismo apartado): con el navegador delante abre y cierra solo el QAM de Steam y el teclado grande y **cronometra cada paso**. Por vuelta mide: pedir→se ve la interfaz, →sube el overlay, →el táctil se pausa; y al cerrar: →baja el overlay, →el táctil vuelve a agarrarse, →el primer toque que llega a la página; y comprueba que la app sigue delante, a tamaño de pantalla y sin ventanas emergentes sueltas. Pasos: app→QAM→app ×5, app→teclado→app ×5, abrir y cerrar sin esperar (250 ms) ×5 (nada puede quedar a medias) y QAM→teclado→app ×3. Marca «lento» por encima de 700 ms (abrir), 500 (cerrar), 400 (overlay) o 1500 (primer toque). Resultado en `transtest.json`.
- La interfaz ejecuta las órdenes (evento `qam_trans`: `Navigation.OpenQuickAccessMenu`/`CloseSideMenus`, abrir/cerrar teclado grande) y el programa cronometra con los eventos de la caja negra y del registro del mando. `scripts/e2e-selftest.py` con `TRANS=1` prueba la lógica con un QAM simulado.

## dev.83
- **Autoprueba en Edge:** antes la página de prueba se abría con `xdg-open` (el navegador predeterminado, Firefox), así que con Edge delante se cargaba en otro navegador. Ahora, si la app de delante es un Chromium/Edge en Flatpak, la página se abre en ELLA (`flatpak run com.microsoft.Edge <url>`, que reenvía a la ventana ya abierta). Firefox sigue igual.
- **Grabadora para apps sin barra de direcciones (Stremio, VacuumTube):** `toque.efecto` añade `titulo='antes'→'después'` si el título de la ventana cambió tras el toque (al navegar por sus pantallas), además de las ventanas emergentes.

## dev.82
- **Grabadora: ¿está pintado el menú que se abre?** Con dev.81 se vio que al tocar, Firefox crea la ventana del menú (aparece en X a los 35–175 ms), pero tú dices que en pantalla no hay nada. Ahora, 0,35 s después de aparecer una ventana emergente, la grabadora lee su contenido y apunta `ventana.contenido pintado=N colores…`: si tiene un solo color (negro), Firefox no llegó a pintarla; si tiene muchos y no la ves, es gamescope el que no la enseña. `ventana.nueva` añade `capa=n/total` (su posición en la pila de ventanas).

## dev.81
- **La grabadora ve ahora lo que pasa en X cuando tocas** («Grabar navegación» → `nav-trace.log`): `ventana.nueva` / `ventana.cierra` (los menús y desplegables de GTK son ventanas aparte; dice cuántos ms después del toque aparecieron), `toque.efecto` (0,4 s después de cada clic: a qué ventana iba el clic y cuántas ventanas había antes→después) y `ventanas.inicio`. Así, un menú que «no abre» se distingue de uno que abre y se cierra solo, o de un clic que fue a otra ventana.
- **Zoom con dos dedos en Firefox:** el Ctrl falso se ignoraba; ahora se fija con XKB (igual que Ctrl+T) antes de girar la rueda.
- Experimento nuevo `ventanas al abrir la lista`: qué ventanas aparecen y bajo qué ventana queda el puntero.

## dev.80
- **Autoprueba: zoom y scroll en todas las direcciones** (en una página grande de 2600×2600 px): scroll vertical, horizontal, en diagonal y con dos dedos, y zoom con dos dedos (separar acerca, juntar aleja; mide el ancho de la página en px CSS y vuelve al 100 % con Ctrl+0). La prueba tiene un simulador de dos dedos (`Hands`).
- **Experimentos que se ejecutan solos cuando algo falla (`experimento: …`):**
  - Toque en una lista emergente (el desplegable de Firefox, como su menú ☰): en tu Firefox el teclado elegía pero el dedo no. Prueba cuatro formas de pulsar (rápida, con 250 ms de espera, moviendo el puntero dentro de la lista, lenta) y dice cuáles eligen.
  - Pantalla completa: en tu Firefox el botón ⛶ de un vídeo y F11 pedían la pantalla completa y nadie respondía (gamescope no hace de gestor de ventanas). El experimento le pone a la ventana el estado `_NET_WM_STATE_FULLSCREEN` a mano justo después de pedirla, y dice si así entra (y lo quita después).
- El desplegable largo se reinicia a la opción 0 antes de cada prueba (si la fila que se tocaba era la ya elegida, no había cambio y parecía un fallo).

## dev.79
- **Resultados de tu Firefox con dev.78 (pasan 28 de 34):** pop-ups, enlace a pestaña nueva, reproducir/saltar/pausar vídeo y música, y volumen tocando funcionan. Fallaban: arrastrar el volumen, pantalla completa del vídeo, el desplegable largo y F11.
- **Arrastrar controles deslizantes:** un arrastre normal con un dedo es desplazamiento (por diseño); arrastrar un control (volumen, barra de progreso, seleccionar) es **«toca y arrastra enseguida»**. La prueba usaba un arrastre normal para el volumen (fallaba) y, para la barra, uno que por casualidad iba justo detrás de un toque (pasaba). Ahora las dos pruebas usan el gesto correcto («toca y arrastra»).
- **Pantalla completa del vídeo:** la prueba distingue si el toque llegó al botón ⛶, si el navegador lo pidió, si dio error y si tiene la pantalla completa desactivada. Corregido un fallo de la página: en pantalla completa el vídeo empujaba los controles fuera de la pantalla.
- **F11:** cuenta como «entró» si la página crece al ocultarse la barra (en gamescope no tiene por qué ocupar toda la pantalla); si algo cambió pero no llegó, vuelve a pulsar F11 para no dejar el navegador raro (eso rompía el paso de pestañas); el detalle da los tamaños antes y después. El toque de comprobación va en medio de una caja (arriba el navegador enseña su barra).
- **Desplegable largo:** tres pruebas separadas (elegir con el teclado, elegir tocando una opción, desplazar con el dedo y elegir) para saber en cuál falla.

## dev.78
- **Autoprueba ampliada (página con escenas):** además de lo de antes, ahora prueba con tu navegador (1) **pop-ups**: modal con ✕, aviso de cookies («Rechazar») y un anuncio con una ✕ pequeña que aparece al cabo de 1 s, y un enlace que abre pestaña nueva y se cierra con Ctrl+W; (2) **vídeo**: reproducir, saltar tocando la barra, arrastrar la barra, pausar, volumen tocando y arrastrando, **pantalla completa** (tocar los controles dentro y salir tocando ⛶ y con Esc); (3) **música**: lo mismo sin pantalla completa (suena un tono suave unos segundos); (4) **menús**: desplegable largo (desplazar la lista con el dedo y elegir) y menú de la página con scroll; (5) **F11**: pantalla completa del navegador, tocar dentro y salir. El servidor de la prueba sirve un vídeo y un audio propios (con soporte de rangos para poder saltar) y manda a la página qué escena mostrar.
- La página se carga primero con `xdg-open` (en tu Firefox era el único camino que funcionaba) y solo si falla escribe la dirección con el teclado.
- La prueba de scroll e inercia usa la altura real de la caja (con la caja más baja salía de ella y fallaba).
- La página de prueba está en `py_modules/qam_selftest_page.py`.

## dev.77
- **Ctrl y Mayús en Firefox (visto en tu autoprueba dev.76):** aun con pausa, Firefox ignoraba los modificadores «falsos»: Ctrl+A salía como «a», «A» como «a», «:» como «;», «_» como «-»; Ctrl+T y las pestañas no funcionaban. Ahora hay tres formas de aplicarlos (`keys` pulsando la tecla del modificador, `slow` con pausa larga, `lock` fijando el estado en el servidor con XKB) y, para los símbolos, otra (`remap`: prestar una tecla libre al carácter, como xdotool). La autoprueba prueba cada una en el navegador de delante, se queda con la primera que funciona y la guarda en `kbd-mode.json`; el teclado de QAM la usa desde entonces. Los pasos «atajos con Ctrl» y «mayúsculas y símbolos» dicen cuál funcionó.
- `scripts/e2e-selftest.py` admite `KMOD`/`KCH` para forzar un modo.

## dev.76
- **La autoprueba ya no depende de la barra de direcciones:** si escribir la dirección (Ctrl+T, luego Ctrl+L) no carga la página en ~11 s —como en tu Firefox con barra reducida, pestañas verticales y Perfect Home como pestaña nueva— la abre con `xdg-open` como el usuario de la sesión. El resultado dice con cuál de los tres caminos cargó.
- Anota en `pad.log` el título de la ventana tras Ctrl+T, tras escribir y tras Return, para ver en qué punto se pierde.

## dev.75
- **Teclado de QAM en el navegador: Ctrl y Mayús llegaban tarde (visto en la autoprueba con Firefox):** al escribir la dirección de prueba salió `thttp;//127.0.0.1;45321/…`: Ctrl+T se escribió como la letra «t» y cada «:» como «;». El modificador y la tecla iban en la misma ráfaga y, con gamescope en medio, Firefox procesaba la tecla antes de enterarse del modificador. Ahora hay una pausa de 12 ms entre modificador y tecla (en un hilo, sin parar el mando ni el táctil). Esto afectaba a cualquier mayúscula, símbolo o atajo (Ctrl+A/C/V, pestañas) desde el teclado de QAM.
- La autoprueba añade el paso «escribir mayúsculas y símbolos» (`Ab:/_9`, tras Ctrl+A) y, si Firefox está en «Restore Session», para con un mensaje claro en vez de escribir a ciegas.

## dev.74
- **La autoprueba ya no depende de la página que tengas abierta:** abre la página de prueba en una **pestaña nueva** (Ctrl+T), reintenta por Ctrl+L si no carga en ~7 s y al terminar **cierra esa pestaña** (Ctrl+W), así tu navegador queda como estaba (antes volvía con Alt+Izquierda).
- **Diagnóstico si «cargar página» falla:** el detalle ahora dice cuántas veces pidió la página el navegador, cuántos eventos mandó y el **título de la ventana** (`_NET_WM_NAME`), para distinguir «no escribió la dirección» de «no llegó a 127.0.0.1» de «cargó pero el JS no avisó».

## dev.73
- **Autoprueba del navegador** (Más › Pruebas y herramientas › «Autoprueba del navegador» › «Probar navegador»): con Firefox/Edge delante y el panel cerrado, abre una página de prueba en `127.0.0.1` y, **por el mismo camino que el dedo y el teclado de QAM** (eventos de táctil sintéticos → `TouchScroll` → XTest; `desktop_key`), comprueba y mide: cargar la página escribiendo la dirección, tocar un botón (con latencia), tocar 5 veces el mismo botón (el fallo de dev.71), desplazar dos cajas lado a lado con el dedo (que se mueva la de debajo del dedo y no la otra: el fallo de dev.72), el sentido del desplazamiento, la inercia, tocar un desplegable, escribir «hola» con el teclado y pestaña nueva / anterior / siguiente / cerrar (Ctrl+T, Ctrl+Re Pág, Ctrl+Av Pág, Ctrl+W). La página avisa a un servidor local de cada evento, así que cada paso sale ✓/✗ con lo que pasó y lo que tardó. Resultado en `selftest.json`; la tarjeta avisa si es de otra versión. Úsala tras cada actualización para ver de golpe qué se rompió.
- `scripts/e2e-selftest.py`: la misma autoprueba contra Chrome/Chromium bajo Xvfb (sin consola ni Firefox), para comprobar al desarrollar que `qam_pad.py` no la rompe. Probado quitando a propósito las correcciones de dev.71 y dev.72: la autoprueba falla justo en esos pasos.
- **Corrección de dev.72 (visto en tu grabación):** llevar el puntero al empezar el scroll hacía que el lector «aprendiera» los ejes mirando ese salto del puntero (`ejes aprendidos … signo -1` a las 04:44:35), lo que podía invertir el desplazamiento. En modo completo ya no se aprenden ejes (con test que falla sin el arreglo).
- `_tread` pasa a `_touch_feed(ts, eventos, ahora)`: lo usan el lector real y la autoprueba.

## dev.72
- **Scroll con el dedo dentro de menús y desplegables (modo táctil completo):** con la pantalla agarrada, gamescope ya no mueve el puntero con el dedo y la rueda iba a lo que hubiera bajo el puntero (donde se tocó por última vez), no bajo el dedo: en el menú ☰ de Firefox, un desplegable o un panel lateral no se desplazaba. Al empezar un arrastre de desplazamiento el puntero se lleva (una vez, sin pulsar) al punto donde empezó el dedo. La grabadora anota `scroll.inicio`.

## dev.71
- **Toques perdidos al volver a tocar el mismo sitio (hallado con la grabadora):** el núcleo de Linux no repite una coordenada igual a la anterior de la ranura, así que un dedo que cae en la misma X (o Y) que el toque anterior llega SIN esa coordenada, y el lector se quedaba sin posición (`inicio=False` en la grabación) y no hacía clic. Pasaba justo al reintentar el mismo botón del navegador, que es cuando «a veces no abre». Ahora cada ranura recuerda su última posición y un contacto nuevo parte de ella. Con tests que fallan con el código anterior.
- Grabadora: `rueda` separa ahora los clics por origen (`dedo` = arrastre, `inercia`, `mando`); antes solo contaba inercia y mando, y el arrastre no salía.

## dev.70
- **Corrección de dev.68 (visto en la grabadora):** el respiro entre mover, pulsar y soltar se hacía con `time.sleep`, y eso paraba el bucle (y la lectura del táctil) ~80 ms por toque: en tu grabación cada toque salía con `toque.enviado ms=80.8`, y de 11 toques seguidos 3 no llegaron a clic —los dedos que caían mientras el bucle dormía se procesaban tarde y con los tiempos aplastados—. Ahora los pasos se encolan con su hora y los ejecuta el bucle sin dormir; el respiro baja a 20 ms (mover→pulsar) y 40 ms (pulsar→soltar). Si el panel o el teclado se abren con un toque a medias, el botón se suelta al instante.
- Grabadora: cada `dedo.arriba` anota ahora `inicio`, `suprime` y `segundo` (para saber por qué un toque no hizo clic), y `toque.enviado` mide `desde_el_dedo_ms` (de levantar el dedo a soltar el clic).

## dev.69
- **Grabadora de navegación** (Más › Pruebas y herramientas › «Grabar navegación»): al encenderla apunta en `nav-trace.log` (en la carpeta de ajustes), con hora al milisegundo: dedo abajo/arriba (duración, si se movió, si fue arrastre), cada clic enviado y lo que tardó, ruedas por medio segundo, paradas del lector de más de 100 ms, ida y vuelta a X cada segundo (con la ventana que tiene el foco), el cursor visto tras cada toque, carga media y CPU/memoria de Edge/Firefox/steamwebhelper/gamescope/mangoapp, teclas enviadas (cuántas y cuánto tardó, **nunca qué**), líneas de `pad.log`, avisos de la caja negra (overlay, panel, teclado). Con la grabadora encendida salen chips «Fue lento · No respondió · No abrió · Scroll mal» que dejan una `MARCA` con la hora para saber qué momento mirar. Se apaga sola a los 15 min; cada grabación empieza limpia; tope 1,5 MB. Apagada no cuesta nada. Para enviarla: `tail -n 400 ~/homebrew/settings/qam-rail-dev/nav-trace.log`.

## dev.68
- **Menús y desplegables del navegador que «a veces no abren» (modo táctil completo):** el toque mandaba mover + pulsar + soltar de golpe; GTK (Firefox, Edge) a veces aún no había visto llegar el puntero cuando ya recibía la pulsación, o la soltaba antes de abrir el menú. Ahora hay 30 ms entre colocar el puntero y pulsar, y 50 ms entre pulsar y soltar (`TAP_GAP_MOVE`/`TAP_GAP_HOLD`). Los arrastres no cambian. [H] causa sin confirmar en el equipo.
- Recordatorio: el teclado al tocar un texto necesita activar «Tocar un texto abre el teclado» (Apps › Escritorio); en `touch-scroll.json` debe salir `"text": true`.

## dev.67
- **Teclado al tocar un texto, en Edge/Chromium:** Chromium crea sus cursores sin nombre, así que la detección por nombre («text») no los veía nunca y el teclado no se abría. Ahora, si el cursor no trae nombre, se reconoce el cursor de texto por su forma (I simétrica, travesaños arriba y abajo, tallo fino). Además se mira hasta 3 veces tras el toque (0,15 · 0,45 · 0,85 s), porque Edge pinta el cursor un poco después. Cada intento fallido se anota en `pad.log` con lo que se vio («tras el toque el cursor no es de texto (sin nombre 11x20 → otra forma)») para ajustar la forma si hace falta. [H] sin probar en el equipo; el cuelgue de Edge sigue sin causa conocida (hacen falta `pad.log` y `timeline.log`).

## dev.66
- Integración con Panel de Control v0.95: se leen también `--pdc-theme-radius-sm` (radio de las tarjetas internas), `--pdc-theme-stroke` (grosor del borde de las tarjetas) y `--pdc-theme-label-transform` (mayúsculas/minúsculas de los títulos). Con «Del tema» el QAM sigue esos valores; sin ellos, todo queda como antes.

## dev.65

- **Esquinas concéntricas:** una tarjeta dentro de otra (la barra «Calidez» dentro de Color, el refuerzo dentro de Sonido…) ya no lleva el mismo radio que la de fuera —con «Redondas» (28) se veía un segundo marco igual de redondo—, sino el radio de fuera menos el margen (`nestedRadius`: 28 → 16, mínimo 10).
- **«Más»:** el nombre «Panel de Control» se cortaba («Panel de…») porque su texto de ayuda era largo (lo introduje en dev.64). Ahora el nombre manda y el texto de ayuda se recorta (y es más corto: «CPU, GPU, mandos»).
- **Apps › Sistema:** el filtro «Todas / Flatpak / AppImage / Sistema» se partía en 3 + 1 (la opción elegida quedaba sola en la segunda fila); con 4 opciones va en una fila.

## dev.64

- **Menos paradas de mando muertas o repetidas:** Conexiones ya no trae la fila «Remote Play · próximamente» (era una parada sin función); en Apps › Plugins, el aviso de «sin plugins» es solo texto. **Más:** «Mandos (remapeo)» y «Panel de Control» abrían lo mismo, ahora es una sola entrada («CPU, GPU, mandos, perfiles»); «Pruebas y diagnóstico» y «Prueba de CPU por vatios» van dentro de un plegable «Pruebas y herramientas» (una parada en vez de dos), y «QAM de Steam» pasa a Sistema, con los demás ajustes del sistema.
- **Abiertas ahora:** «Tocar texto abre el teclado» pasa de chip ancho a interruptor con nota (mismo estilo que el resto), y se explica cuándo funciona.

## dev.63

- **Los avisos de Steam ya no suben con el refuerzo.** dev.62 subía también los flujos internos de Bazzite («Game output», «Music output», «ROG Ally EQ», «Virtual Headphone Surround»…), que no tienen nombre de app y por los que pasa todo el audio, avisos de Steam incluidos. Ahora esos flujos no se tocan nunca, y «Open Gamepad UI» (sonidos de interfaz) viene como sonido del sistema. Una sola vez, al arrancar, se devuelve a 100 % lo que dejaron dev.61/62 (altavoces y flujos internos).
- `audio-boost.json` se escribe de forma atómica (en dev.62 pudo quedar cortado a medias si Decky recargaba durante la escritura; un archivo ilegible se trata como «sin refuerzo»).

## dev.62

- **El refuerzo de volumen ahora es por fuente, no por dispositivo:** sube solo lo que suena de apps (vídeo, música, juegos) y deja como están los avisos del sistema (los de Steam y el escritorio), que con el refuerzo del dispositivo de dev.61 sonaban demasiado fuertes. Un vigilante (cada 2 s, solo mientras haya refuerzo) fija el volumen de cada flujo nuevo; lo toca una vez por flujo y nivel, así no pelea con una app que cambie su propio volumen. «Qué sube: N de M ›» abre la lista de apps para elegir cuáles suben (se recuerda por app; los avisos de Steam y del escritorio vienen apagados). Al arrancar, una sola vez, devuelve a 100 % el volumen de los altavoces que dejó dev.61. `audio-boost.json` guarda el nivel y las elecciones.
- **Tarjeta «Sonido» reordenada:** por dónde suena → volumen de apps → ecualizador de Panel → micrófono (lo que menos se toca, al final). Cada bloque con su encabezado; la lista de apps está plegada para no alargar el panel ni sumar paradas de mando.

## dev.61

- **Refuerzo de volumen (100–200 %):** en la tarjeta «Sonido» hay una barra nueva que sube el nivel del dispositivo por encima de lo normal, para cuando el ecualizador de Panel de Control deja el sonido bajo. Con el ecualizador delante es independiente de la barra de volumen de Steam (esa mueve el EQ; esta, el dispositivo real). Sin ecualizador, mover el volumen de Steam puede devolverlo a 100 %. No aparece con auriculares/Bluetooth (llevan su propio volumen y se oyen de cerca). Por encima de ~160 % avisa de que puede distorsionar. El backend admite hasta 200 % (antes 150 %; el micrófono sigue en 150 %).
- Colores de estado y escala de radios como tokens (`COLORS.ok/warn/danger/info`, `RADIUS`), sin cambios visibles.

## dev.60

- **Táctil completo, más fino:** el clic cae donde **acaba** el dedo (antes, donde empezó: cerrar una pestaña era difícil); **mantener 0,45 s abre el menú contextual en ese momento**, sin esperar a soltar; **seleccionar = toque y, enseguida, arrastrar** (como el trackpad); dos toques seguidos = doble clic (palabra); un toque que solo frena la inercia no hace clic.
- **Dos dedos tocando un instante = teclado grande** (en «scroll» y en «completo»).
- **Tocar un campo de texto abre el teclado (opcional):** chip «Tocar texto abre el teclado» (en modo completo, apagado por defecto). Mira el cursor que X muestra justo tras el toque y, si es el de texto, abre el teclado. Ojo: el cursor de texto también sale sobre el texto normal de una página, así que a veces abrirá el teclado sin necesidad; se cierra con B.
- **Desplazamiento más de tableta:** menos fricción en la inercia, y `px` en `touch-scroll.json` (por defecto 34) para ajustar cuánto recorre el dedo por cada paso de rueda. Nuevo `scripts/firefox-touch.sh`: pone Firefox en modo táctil (barra de pestañas y botones grandes) y la rueda al 60 %, para que cada paso sea más fino (`--quitar` lo deshace).

## dev.59

- **Táctil completo (opcional):** el chip de Inicio pasa a **Táctil: no → scroll → completo**. En «completo» agarramos la pantalla táctil mientras haya una app de escritorio delante (se suelta al instante si se abre el panel o el teclado grande, y el núcleo la suelta sola si el plugin se cierra) y la traducimos nosotros, así gamescope ya no manda además su propio clic/arrastre —que era lo que seleccionaba texto a la vez que se desplazaba—: **toque = clic**, **mantener quieto 0,45 s = clic derecho**, **mantener y arrastrar = seleccionar/arrastrar de verdad**, **arrastrar = desplazar con inercia** (un toque que solo frena la inercia no hace clic), dos dedos = zoom/desplazar. Mientras está agarrada, Steam no recibe el toque (por ejemplo el deslizamiento desde el borde); el botón Steam sigue funcionando. `pad.log`: «táctil: agarrada/soltada», «toque → clic», «mantener → clic derecho», «mantener + arrastrar → selección» (máx. 40 líneas).

## dev.58

- **Táctil con dos dedos:** separar/juntar los dedos = zoom del navegador (Ctrl + rueda, un paso cada ~46 px); mover los dos dedos juntos = desplazar. El gesto se decide una vez (tras ~22 px) para que un desplazamiento no acabe en zoom, y tras un gesto de dos dedos el dedo que queda no arrastra hasta que sueltes todo. Un dedo sigue desplazando con inercia como en dev.56.

- **Scroll táctil — permiso:** el log de dev.57 mostró la causa: `/dev/input/event5` (la pantalla táctil) es `root:input` 660 y el plugin corre como tu usuario, así que no podía leerla («Permission denied»). Nuevo `scripts/touch-permiso.sh`: instala una regla de udev con `uaccess` para las pantallas táctiles (solo lectura, se aplica al momento y sobrevive a reinicios; `--quitar` la retira). `install.sh` la instala una vez si falta.

## dev.57

- **Scroll táctil, diagnóstico:** `pad.log` anota ahora «táctil: activo» o «táctil: en pausa — motivo» (ajuste apagado, o panel/teclado grande figurando abiertos) cada vez que cambia, y cualquier error al buscar la pantalla táctil, que ya no puede parar el lector del mando. La detección se comprobó con el bloque real de la pantalla del Ally (`NVTK0603:00 0603:F200`, `event5`).

## dev.56

- **Scroll táctil en apps de escritorio:** arrastrar con un dedo mueve la rueda (≈ un clic cada 34 px, con inercia al soltar; un toque nuevo la detiene). gamescope solo convierte el toque en clics del puntero, por eso no se desplazaba. Se leen las pantallas táctiles en solo lectura (sin agarrarlas: Steam y el panel siguen recibiendo el toque igual) y solo con una app de escritorio delante y sin panel ni teclado grande abiertos. La pantalla del Ally es vertical y gamescope la gira, así que la correspondencia ejes del táctil → pantalla se **aprende sola** comparando el dedo con el puntero; `pad.log` anota los dispositivos y los ejes aprendidos (líneas «táctil: …»). Interruptor «Scroll táctil» en Inicio › Abiertas ahora (activado por defecto). [H] sin probar en el equipo; el arrastre también sigue moviendo el puntero con el botón pulsado, así que en algunas páginas puede seleccionar texto a la vez.
- **Escribir en Instagram / Facebook (Firefox):** el teclado grande ya no «devuelve» el foco a la app en cada tecla si ya lo tiene (ella o una ventana hija suya). Esa orden de foco repetida hace que la página vea «ventana enfocada» una y otra vez y webs como Instagram o Facebook cierran o vacían su buscador. [H] pendiente de confirmar; si sigue igual, el `desktop-tag.log` ya dice `foco=` en cada tecla.

## dev.55

Revisión general (código, diseño, toque).

- **Código limpio:** retirado el código muerto verificado (16 funciones/exportaciones de TypeScript sin ningún uso y 6 imports de Python sin usar). Sin cambios de comportamiento.
- **Apps de escritorio con icono:** cada fila del menú «Apps del equipo» muestra el icono de la app (el de su `.desktop`; si no tiene, la inicial de siempre). Se piden **solo para las filas visibles**, en lotes de 16, con icono pequeño (64/48 px, ≤200 KB) y caché en el backend y en la interfaz: los grupos plegados no cuestan nada y un icono ya pedido no se vuelve a pedir. Nueva llamada `desktop_icons`; los iconos vectoriales (`scalable`) también se encuentran ahora.
- **Zona «Abiertas ahora» de Inicio rediseñada:** tarjeta con el mismo título y estilo que el resto, fichas con el icono grande y un punto verde, «Volver a Steam» como ficha de acento, y los ajustes (mando ratón, puntero, animación, teclado, reparar) en dos filas ordenadas bajo «Escritorio».
- **Teclado grande:** fondo siempre opaco (también con temas de cristal) y sombra superior; la fila «Cerrar teclado» pasa a un botón «✕ Cerrar» dentro de la línea de vista previa, así el teclado es ~40 px más bajo y tapa menos la barra de búsqueda.
- **Toque:** respuesta inmediata al apoyar el dedo en cualquier ficha o botón (se hunde un poco y se aclara, antes solo animaba al soltar), sin retardo de doble toque ni resaltado gris del sistema. Es una regla global, así que vale para todas las zonas.

## dev.54

- Diagnóstico del teclado grande en Firefox: cada línea «tecla … → ventana … ok=True» de `desktop-tag.log` lleva ahora `foco=0x…` (la ventana de X que tiene el foco de teclado justo después de devolvérselo a la app). Si no es la de la app ni una hija suya, las letras no llegan a la caja de texto aunque salga `ok=True`.

## dev.53

- **Música rota tras recargar la interfaz:** confirmado en el equipo que, tras una recarga de Steam/Decky (p. ej. instalar un zip) con la música sonando, la música deja de sonar y solo avanza el contador; en PipeWire no hay stream de Steam. Un reinicio de la sesión lo arregla; relanzar solo la interfaz no. Ahora, al detectar el ritmo raro (2 ventanas seguidas), el plugin **primero intenta reabrir el audio con pausa + play** y, si vuelve a fallar, pausa y avisa de que hay que reiniciar Steam. [H] la reapertura no está confirmada; si no funciona, el reinicio de sesión sigue siendo la única salida. Regla práctica mientras tanto: pausa la música antes de instalar o recargar.

## dev.52

- **Música «acelerada» sin sonido:** con tus datos del 23-11 (sin ningún stream de Steam en PipeWire; solo los canales de Bazzite en `Corked`) queda claro que Steam pierde su salida de audio y su contador corre solo. El detector de ritmo raro (más de 3× el reloj en ventanas de 6 s), que desde 0.33 solo anotaba, vuelve a **pausar la música** cuando lo ve en dos ventanas seguidas (un salto manual de la barra no lo dispara). La miga dice que hay que reiniciar Steam para que reabra el audio. [H] sin probar en el equipo.

## dev.51

- `pad.log` anota siempre los combos (Steam+Y, Y→Steam, Select+Y, Steam+A); el tope de botones sueltos sube de 60 a 150 (con 60 el log se llenaba en minutos y no quedaba rastro de las pruebas).

## dev.50

- **Select + Y abre/cierra el teclado grande** sin pasar por el botón Steam (así no aparece un instante el menú de Steam). Select ya no manda Esc al pulsarlo sino al soltarlo, y solo si no se usó con Y. Steam + Y sigue valiendo.
- **Puntero al doble de tamaño** (64 px en lugar de 32).
- Pruebas de Python puestas al día con el puntero hueco y con LB/RB (Ctrl+Re Pág / Ctrl+Av Pág).

## dev.49

- **Steam + Y no abría el teclado:** en tu `pad.log` Steam avisa de su botón *después* de la Y («308 pulsado/soltado, 316 pulsado/soltado»), así que el backend nunca veía a Steam pulsado con la Y y no salía `kb.combo`. Ahora también cuenta Y seguida de Steam en menos de 1 s (la Y ya habrá mandado Ctrl+L a la app; es un efecto menor). Steam + Y en el orden contrario sigue valiendo.
- **Teclado «sin overlay» tras cerrarlo con B:** la ruta del teclado volvía a montarse (entrada vieja del historial de Steam) con el overlay apagado y no se veía. Si la ruta aparece sin haberla abierto nosotros, sale de ella sola.
- **LB/RB en los navegadores:** pasan de Ctrl+Mayús+Tab / Ctrl+Tab a Ctrl+Re Pág / Ctrl+Av Pág (también cambian de pestaña en Firefox y Edge). En tu log, al pulsar LB Steam se llevó el foco y abrió su barra a la vez; sospecha (sin confirmar) de que Steam reaccione a Ctrl+Tab.
- **Puntero Xbox más fiel:** gota hueca de trazo blanco, anillo central y triángulo junto a la punta (la mano la rellena de blanco translúcido). El tema sube a versión 3 y se regenera solo.

## dev.48

- **Puntero Xbox en forma de gota invertida** (círculo con la punta arriba a la izquierda; la zona activa del clic está en la punta), como el del Xbox; la mano lleva un anillo y el cursor de texto sigue siendo la barra. El tema guardado lleva ahora un número de versión (`version`): al cambiar el dibujo se regenera solo, sin borrar nada a mano.
- **Teclado grande rediseñado:** filas escalonadas como un teclado real (Tab, Bloq, Mayús, Intro y ⌫ en su sitio), teclas más grandes, flechas siempre visibles junto a la barra espaciadora (se repiten al mantener), «Más» con atajos (Todo, Copiar, Pegar…) y Esc/Inicio/Fin/Re Pág/Av Pág/Supr; chivato de los botones del mando en la línea de vista previa. Mismo mando: X borra, Menú espacio, Start Intro, B cierra.

## dev.47

- **Puntero Xbox desde el propio plugin** (chip «Puntero Xbox» en la franja de apps abiertas; apagado por defecto): en vez de pedirle a cada app que lea un tema (Firefox/Edge Flatpak no lo hacían), el backend cambia en el servidor X la imagen de los cursores de la app por nombre (`XFixesChangeCursorByName`: «default», «pointer», «text»…); gamescope dibuja lo que X le da. Se repite cada 0,3 s con una app delante (cada cursor nuevo se cambia una vez). Al apagarlo, las apps ya abiertas lo conservan hasta reabrirlas. El tema se genera solo en `settings/…/cursors`. Prueba con Xvfb: `tests/py/test_cursor_skin.py`. [H] que gamescope refresque el dibujo al cambiar la imagen.

## dev.46

- **Causa probable de que el QAM se colgara tras cerrar una app por fuera (`flatpak kill`) y de las pantallas negras:** cuando una ventana que seguimos desaparecía, la primera petición de X sobre ella (`XGetGeometry`, `XResizeWindow`, `XSetInputFocus`) hacía que Xlib llamara a `exit()` y matara **todo el backend** del plugin (reproducido en el banco: el proceso sale con código 1). Ahora hay un manejador de errores de X que no hace nada y la petición simplemente falla. Prueba: `tests/py/test_xerr.py`.
- **Apps cerradas por fuera:** el vigilante (cada ~3 s con apps abiertas) olvida las ventanas que ya no existen y quita de la capa base de gamescope el número de la app si era su última ventana (`desktop-tag.log`: «ventana cerrada por fuera»; línea de tiempo: `ventana_cerrada_fuera`).

## dev.45

- **Teclado grande con el mando: Steam + Y** abre el teclado desde cualquier app de escritorio y lo cierra si ya está abierto (el backend lo avisa con el evento `qam_kb`; no manda nada a la app). Y sola sigue siendo la barra de direcciones. Cerrar con B ya no vuelve atrás dos veces. Abrirlo al tocar un campo de texto: pendiente (hace falta saber qué campo tiene el foco; se estudia AT-SPI).
- `cursor-xbox.sh`: la ruta de iconos ahora incluye `/run/host/user-share/icons` (la que ve el sandbox de Flatpak) y hay `--diag` para ver qué carpeta ve cada app. [H] sin verificar.

## dev.44

- **Al descargar el plugin (actualizar o reiniciar Decky) se limpia la capa base de gamescope y el overlay** de las apps que abrimos; antes quedaban apuntando a una app sin dueño y Steam podía quedarse debajo con la pantalla negra. Registrado en `desktop-tag.log` («descarga del plugin»). Causa del negro sin confirmar; es la hipótesis que mejor encaja con que ocurra justo tras instalar una dev con una app abierta.

## dev.43

- **Apps del equipo mejor organizadas**: secciones Abiertas · Favoritas (las agregadas a QAM) · Recientes (últimas 5 abiertas) y debajo los grupos, **plegables** (más de 5 apps arrancan plegados; se recuerda lo que despliegas). Cada app sale una sola vez; en las secciones de arriba la fila indica su grupo.
- Los navegadores (Firefox, Edge…) ya no pasan por el ajuste de ventana a pantalla completa: ya arrancan a su tamaño.

## dev.42

- Stremio arranca a pantalla completa: ~3,5 s tras abrir se le manda **F11** una sola vez por ventana (`desktop-tag.log`: «pantalla completa automática»). Sin verificar; si lo pone al revés, avisa.

## dev.40

- **Teclado grande más pequeño** (~⅓ menos): teclas de 32 px, y atajos + navegación (Tab, flechas, Inicio…) plegados bajo «Más».
- **Mando fluido**: X/secundario = borrar, Start = Intro, Menú = espacio, B = cerrar; el foco empieza en medio del teclado; ⌫ y flechas se repiten al mantener (ratón/dedo). Cada botón del mando deja una línea en keyboard.log para ajustar el mapeo.
- **Puntero estilo Xbox**: `scripts/cursor-xbox.sh` crea el tema Xcursor «qam-xbox» (círculo, mano y texto) y lo aplica a Firefox/Edge Flatpak (`--quitar` lo revierte). Prueba: sin verificar en gamescope.
- **Apps a pantalla completa**: tras abrir/mostrar, la ventana de cualquier app de escritorio se ajusta al tamaño de la pantalla. (dev.41: se quita `--fullscreen` a Stremio, que lo rechaza y no arranca.)

## 0.54.0

Apps › pestaña «Steam»: apps de escritorio del equipo (Flatpak, AppImage, sistema).

- «Abrir» lanza la app dentro de la **sesión del usuario** con `systemd-run --user` (Decky corre como root y su servicio hacía fallar el sandbox de Firefox: «CanCreateUserNamespace EPERM»; el log real de Carlos) y espera 1,5 s; si se cierra con error, el aviso dice por qué (última línea de su salida, `desktop-run.log`).
- Cada app se abre en su propia unidad (`qam-desk-<hash>`): «Abrir» pasa a «Cerrar» mientras está abierta (`desktop_running`, `desktop_stop`; se refresca cada 6 s con la pestaña abierta).
- **Ventana visible en Game Mode:** gamescope solo muestra ventanas con la propiedad X `STEAM_GAME`; tras abrir (~20 s) se pone `STEAM_GAME=1` a las ventanas nuevas (grandes) de la app con `xwininfo`/`xprop`. [H] probado a mano con Firefox por Carlos (herramientas presentes); el automático sin verificar.
- **Menú de la app** (mantener pulsado ~0,65 s en táctil, o X con el mando, sobre un icono del cajón/Inicio o una fila de Apps › Steam): Mostrar · Minimizar (quita `STEAM_GAME`: Steam vuelve a verse y la app sigue abierta) · Cerrar (SIGTERM a la unidad) · Forzar cierre (SIGKILL). Las abiertas llevan «●» en el cajón. `desktop_minimize`, `desktop_kill`.
- El menú también sale en las apps de QAM (MiniTube…): su manifiesto puede declarar `controls` (`show`, `minimize`, `close`, `kill` → argumentos del lanzador); MiniTube lleva `open`/`mini`/`close`/`kill`. `apps_control(id, acción)`.
- **Capa base de gamescope (dev.9):** Steam elige qué app se ve con la propiedad raíz `GAMESCOPECTRL_BASELAYER_APPID` (p. ej. `413091, 769`: la primera con ventana gana; 769 = Steam). Cada app de escritorio lleva su propio número en `STEAM_GAME` (`app_gameid`) y se antepone a esa lista (Steam queda de reserva; el QAM sigue encima). Se reafirma cada ~3 s tras abrir; Minimizar/Cerrar/Forzar la quitan. [H] sin verificar en el equipo.
- **Interfaz de Steam sobre la app (dev.10):** el volcado de Carlos mostró que con un juego y el QAM abierto la ventana «Steam Big Picture Mode» lleva `STEAM_OVERLAY=1` (con Firefox, 0): es lo que hace que gamescope dibuje la interfaz de Steam encima. Al abrir el panel con una app de escritorio abierta se pone a 1 (`desktop_overlay`) y al cerrarlo vuelve al valor anterior. [H] sin verificar; el fondo de Steam puede tapar la app mientras el panel está abierto.
- **Apps de QAM con ventana X (dev.11):** Forgeinator (pygame) arrancaba pero gamescope no mostraba su ventana. Al abrir una app de QAM sin argumentos (`apps_run`) se marca igual que las de escritorio (clave `qam:<id>`: `STEAM_GAME` propio + capa base); el menú Minimizar/Cerrar/Forzar la quita. Las ventanas de Steam/mangoapp/gamescope nunca se marcan.
- **Marcado por PID (dev.12):** el log de Carlos mostró que Forgeinator, ya abierto, no tenía «ventanas nuevas» (no se marcó) y que la tarea de Forgeinator se llevó las ventanas de un Firefox abierto a la vez (peleaban por la capa base). Las apps de QAM se reconocen ahora por el PID de la ventana (`_NET_WM_PID` ∈ procesos con su carpeta), también si ya estaban abiertas; una ventana marcada por una app no la toca otra (`_claims`).
- **Menú y «●» en todas las apps de QAM (dev.13):** las que no declaran `controls` (Forgeinator) tienen ahora opciones nativas: Mostrar (abre si está cerrada), Minimizar, Cerrar (SIGTERM a sus procesos) y Forzar cierre (SIGKILL). Los procesos se reconocen por su carpeta (ruta real, la dada y `qam-apps/<carpeta>/`: Bazzite enlaza /home → /var/home). `apps_running` marca «●» en el cajón.
- **Apps sin la caja de instalación (dev.14):** se quita la tarjeta «Apps de QAM» de debajo de la rejilla. Las opciones de cada app (actualizar, volver a la anterior, añadir a Steam, acciones rápidas, desinstalar) salen del menú largo / X › «Opciones…». Al final de la rejilla hay un mosaico «Tienda» (un `+`): por ahora instalar desde .zip, carpeta o «en su sitio»; después, la lista de apps pensadas para Big Picture.
- **Apps de QAM con la pantalla de la sesión (dev.15):** `apps_run` lanzaba con el entorno de Decky (sin `DISPLAY` ni `XAUTHORITY`): Forgeinator (pygame) corría sin poder abrir ventana — por eso nunca hubo nada que marcar (`/proc/<pid>/environ` sin DISPLAY, ninguna ventana con su PID). Ahora se le pasan `DISPLAY`, `XAUTHORITY` y `WAYLAND_DISPLAY` del gestor `systemd --user` y, si Decky es root y la app tiene menú nativo, se lanza como el usuario de la sesión (`runuser`).
- **Apps abiertas a mano en el menú de Apps y cierre de las que escapan (dev.16):** una app de escritorio abierta desde Apps › Steam sin agregarla a QAM aparece mientras esté abierta como icono con «●» en el cajón (Inicio y Apps) con su menú (Mostrar/Minimizar/Cerrar/Forzar). «Abierta» ya no depende solo de la unidad: también cuenta una ventana marcada viva (apps que delegan en otro proceso, como KDE Connect, terminan su unidad al instante). Cerrar y Forzar cierre envían además SIGTERM/SIGKILL a los procesos dueños de sus ventanas marcadas (nunca PIDs < 100). `desktop_running` devuelve también nombre e icono.
- **Mando como ratón (dev.26, ajustado en dev.27):** con una app de escritorio delante (y no el menú de Steam), el mando hace de ratón y teclado como en un navegador de Xbox: stick izquierdo = cursor, derecho = desplazar, A = clic, X = clic derecho, L3 = clic central, B = atrás, Y = barra de direcciones, LB/RB = pestaña anterior/siguiente, cruceta = flechas (con repetición), LT/RT = Re Pág/Av Pág, Start = Intro, Select = Esc, R3 = zoom 100 %. Nuevo `py_modules/qam_pad.py`: lee los nodos `js` de `/proc/bus/input/devices` y envía con XTest por ctypes (probado contra Xvfb; el mapeo y la lectura, con eventos simulados). Interruptor «Mando: ratón / normal» en la franja de Inicio; registro en `pad.log`. **Rendimiento (dev.27):** dev.26 comprobaba el primer plano cada 0,3 s lanzando `runuser`+`systemctl`+`xprop`; ahora lee `GAMESCOPE_FOCUSED_APP` de la propiedad de X con una conexión propia, sin procesos, y duerme sin apps de escritorio abiertas. [H: que el mando llegue a esos nodos con Steam Input activo; que Steam no mueva ya el cursor por su cuenta (se vería doble)]
- **Caja negra: línea de tiempo y vigilante (dev.39):**
  - `timeline.log` (JSON, una línea por evento, 300 KB): panel abre/cierra, teclado (grande y de Steam) abre/cierra/falla, overlay on/off **con el motivo** (panel, teclado), apps abrir/mostrar/minimizar/cerrar/volver a Steam, mando activo/inactivo y Steam+A (la petición del QAM), y un `estado` cada vez que cambia el foco, la capa base, el overlay o el tamaño de la ventana de delante.
  - **Vigilante** (1 s con apps o interfaz abiertas, 4 s si no; sin lanzar procesos): anota `anomalia` + `contexto` (los últimos 12 eventos) para: `app_oculta_sin_ui` (la app queda debajo de Steam sin interfaz nuestra), `overlay_sin_ui`, `ventana_pequena`, `teclado_sin_overlay` y `qam_no_aparece` (Steam+A sin panel en 2,5 s). Lo único que se arregla solo es `ventana_pequena` (ventana a pantalla completa).
  - **Reparar** (chip en la franja de apps abiertas, `desktop_repair`): salida de emergencia; ventanas a pantalla completa y overlay a 0 si lo subimos nosotros. No cierra apps.
  - Nada de lo escrito llega a ningún registro (prueba). `scripts/logs.sh` incluye `timeline.log`. Pruebas en `tests/py/test_blackbox.py`.
- **Teclado grande: único teclado, más completo, y registros (dev.38):**
  - Se quita el teclado pequeño del QAM; la franja de apps abiertas tiene un solo chip «Teclado» (abre el grande).
  - Teclas grandes, barra espaciadora ancha, **Ctrl** y atajos (Todo, Copiar, Pegar, Cortar, Deshacer, Dirección, Pestaña +, Cerrar pestaña), Inicio/Fin y Re/Av Pág. Aviso rojo en la línea de vista previa si algo falla.
  - **Privacidad:** el registro (`desktop-tag.log`) ya no anota lo que escribes (antes salía cada carácter, podía ser una contraseña): solo «N carácter(es)» y las teclas con nombre. `keyboard.log` anota abrir/cerrar y fallos.
  - `scripts/logs.sh` → `~/qam-logs-<fecha>.tgz` con todos los registros, versiones, estado de gamescope y ventanas **sin títulos** (podrían ser páginas que visitas). Prueba en `tests/sh/test_scripts.sh`.
- **Teclado grande sobre la app (dev.37, experimento):** ruta propia `/qam-rail/teclado` (transparente, teclado abajo, sin la fila de juegos de Steam) para ver la app por encima del teclado. Entrada: franja de apps abiertas → «Teclado grande» (cierra el panel y lo abre); «Cerrar teclado» o B vuelven. Las teclas usan el mismo `desktop_key` (confirmado en el equipo: Firefox recibe lo escrito). [H] que Steam deje la ruta transparente; si no, queda el teclado del panel. Prueba en `tests/bigKeyboard.test.ts`.
- **Teclado propio del panel (dev.36):** Steam dibuja su teclado sobre su pantalla de inicio (la fila de juegos tapa la app), así que se añade un teclado en español dentro del QAM: franja de apps abiertas → «Teclado». Mayús, Bloq, AltGr, Espacio, ⌫, Intro, Tab, Esc, flechas y Re/Av Pág; una línea muestra lo escrito porque la app queda tapada. Backend `desktop_key`: pone el foco de X en la ventana de la app de delante y escribe con XTest (busca la tecla y el nivel de cada carácter: ñ, ¿, @, €…). [H] que gamescope deje mover el foco con el panel abierto; cada pulsación queda en `desktop-tag.log` (`tecla … ok=`). Pruebas en `tests/qamKeyboard.test.ts` y `tests/py/test_anim.py`.
- **Sin redimensionar con el overlay subiendo (dev.35):** en el registro, la caída de Steam del 12:15 coincide con que la animación de dev.32 seguía redimensionando Firefox cuando subió el overlay del teclado (el 12:13, sin solape, funcionó). Ahora `desktop_overlay(True)` cancela la animación en curso: termina a pantalla completa y no se redimensiona con el overlay arriba. [H] causa de la caída no confirmada; es un solape evitable. Prueba en `tests/py/test_anim.py`.
- **Teclado de Steam sobre las apps (dev.34):** `SteamUIStore.ActiveWindowInstance.VirtualKeyboardManager.ShowVirtualKeyboard` sí abre el teclado (confirmado en el equipo con `keyboard.log`), pero quedaba debajo de la app. Ahora se sube `STEAM_OVERLAY=1` mientras `m_bIsVirtualKeyboardShowing` es verdadero y se baja al ocultarse (tope 5 min; si no se puede leer, a los ~2 s). Pruebas en `tests/v0501.test.ts`. [H] que lo escrito llegue a la app.
- **Mando: Steam + botón ya no hace clic en la app (dev.33):** al abrir el QAM con el botón Steam (316) y A, el A llegaba a la app como clic izquierdo. Ahora los botones pulsados con Steam sostenido (y 0,5 s después de soltarlo) se ignoran. Prueba en `tests/py/test_anim.py`.
- **Animación al volver de QAM, mando y teclado (dev.32):**
  - **Animación:** al cerrar el panel, la app aparece al 78 % (gamescope respeta el tamaño y la centra) y crece hasta pantalla completa en ~0,2 s. Interruptor «Animación: sí/no» en la franja de apps abiertas (`desktop_anim`). Siempre acaba a pantalla completa, también si algo falla. [H] fluidez en Edge/Firefox por el redibujado.
  - **Mando:** `pad.log` ya no se llena con el «Permission denied» de `event10` (se anota una vez); anota cada botón (primeros 60) con su dispositivo y detecta la **doble entrada** (el mismo botón por `event15` y `event20`), que cuenta una sola vez.
  - **Teclado de Steam:** «Teclado en pantalla» prueba además los gestores de teclado de la interfaz de Steam y anota cada intento y la lista de métodos en `keyboard.log`, para saber por dónde se abre. [H] sin confirmar que alguna vía lo abra.
  - Pruebas en `tests/py/test_anim.py`.
- **Actualizaciones: certificados SSL (dev.31):** la causa real de que no aparecieran actualizaciones era `CERTIFICATE_VERIFY_FAILED` (el Python de Decky no trae certificados raíz). Las peticiones a GitHub (comprobar y descargar) ahora usan el paquete de certificados del sistema (`/etc/pki/tls/certs/ca-bundle.crt`, `/etc/ssl/certs/…`) o certifi, siempre con verificación activada.
- **Desinstalar app: ya no dice «desinstalada» si la carpeta sigue (dev.30):** `apps_uninstall` borraba con `ignore_errors` y daba por buena la desinstalación aunque quedara la carpeta (y se perdía su registro). Ahora comprueba que la carpeta ya no existe; si no, conserva el registro, devuelve el motivo («No se pudo desinstalar …») y lo anota en `updates.log` junto con el resultado del script de desinstalación. Prueba en `tests/py/test_appupd.py`.
- **Actualizaciones de apps: ya no fallan en silencio (dev.29):** «Buscar actualización» en las Opciones de una app decía solo «Buscando…» y luego nada: un error de red, «al día» y «hay una nueva» se veían igual. Ahora avisa del resultado («Forge: hay una versión nueva (3.18)», «está al día (v3.15)», «No se pudo comprobar: …»), deja el error a la vista en la tarjeta y cada comprobación queda en `updates.log` (app, versión, `force`, estado, última versión, error). Prueba de extremo a extremo `tests/py/test_appupd.py`: con caché de antes de la release y `force`, el backend devuelve «update 3.15 → 3.18». [H: la causa en el equipo de Carlos; si es de red/certificados, saldrá en `updates.log`]
- **Rendimiento al abrir el panel con apps abiertas (dev.28):** al abrir el QAM con Firefox/Edge abiertos se lanzaban unas 18 órdenes del sistema a la vez (la franja, la fila de apps y el modo overlay pedían cada uno `desktop_running`, de seis procesos, la mitad `runuser … systemctl show-environment` repetidos). Ahora: la sesión del usuario se guarda 60 s (`_user_session`), `desktop_running` se comparte entre peticiones simultáneas y vale 1,5 s (abrir/cerrar/minimizar/forzar lo invalida), la interfaz comparte la petición en vuelo (`loadRunning`), y el overlay recuerda la ventana de Steam (antes recorría `xwininfo -root -tree` cada vez) y ya no lee el valor previo. Las operaciones lentas (>250 ms) se anotan en `desktop-tag.log` como «lento: …» y el overlay lleva su duración. Prueba nueva `tests/py/test_perf.py`. [H: cuánto se nota en el equipo]
- **Apps abiertas en Inicio (dev.25):** con alguna app de escritorio abierta, Inicio muestra arriba una franja «Apps abiertas» (tocar el nombre la muestra) y «Volver a Steam» (las deja abiertas pero fuera de pantalla). Los botones Subir/Bajar y el teclado que llevaba esta versión se quitaron en dev.27: con el panel abierto la app no se ve, así que no servían.
- **Apps tapadas por la interfaz de Steam (dev.24):** confirmado en el equipo: con la app abierta, `STEAM_OVERLAY` de la ventana de Steam se quedaba en 1 y gamescope dibujaba Steam encima (la app seguía corriendo, con sonido); al ponerlo a 0 la app aparecía. Causa: al cerrar el panel se restauraba el valor leído al abrirlo, que ya era 1 (lo pone Steam al abrir el QAM). Ahora al cerrar siempre vuelve a 0.
- **Edge no aparecía al abrirlo (dev.23):** desde dev.20 una app «en marcha» (por `flatpak ps`) solo se «volvía a mostrar»; si estaba viva pero sin ventana (Edge/Chromium con «seguir en segundo plano», o cerrado con su propia X) no se mostraba nada. Ahora, si no hay ventana que mostrar, se lanza de nuevo (el navegador reenvía a su proceso y abre una ventana), con una unidad aparte si la nuestra seguía activa. Queda anotado en `desktop-tag.log` («en marcha sin ventanas»). [H: causa sin confirmar en el equipo]
- **Mando: bajar desde la barra de filtro (dev.22):** en Apps › Steam la cruceta se quedaba en Todas/Flatpak/AppImage/Sistema y no bajaba a las apps. Red de seguridad: si arriba/abajo no tiene destino en el modelo de filas, va al elemento más cercano en esa dirección, y lo anota en las migas de sesión («mando: abajo sin destino desde…») para diagnosticar la causa real. [H: causa sin confirmar]
- **Prueba de navegación (dev.21):** el recorrido ahora también prueba izquierda y vuelve a filas con algo sin visitar (en dev.20 solo bajaba y daba por «inalcanzables» las columnas izquierdas de filas de dos columnas). Solo mide el modelo de filas de QAM Rail, no el foco nativo de Steam.
- **«Mostrar» una app ya abierta (dev.20):** con la app abierta pero minimizada, o abierta fuera de QAM Rail (Firefox seguía sonando sin verse), «Mostrar» no hacía nada porque solo se marcaban ventanas nuevas. Ahora vuelve a marcar sus ventanas (las que ya reclamó o las que casan por clase con el nombre) y a poner la capa base. Prueba nueva en Diagnóstico: «Navegación con el mando» (recorre la pestaña abierta con la cruceta y guarda qué se alcanza).
- **Apps del equipo, rehecha (dev.19):** ya no salen los accesos a juegos de Steam (`steam_app_N`, `steam steam://…`, `-applaunch`): están en la biblioteca. Cada app es UNA parada del mando (antes eran 3–4 chips por app): A abre o muestra, X o mantener pulsado abre el menú (Mostrar/Minimizar/Cerrar/Forzar, Agregar/Quitar de QAM, tamaño y táctil de navegadores). Las abiertas van arriba en «Abiertas» con «●»; grupos en orden fijo (Navegadores, Multimedia, Juegos y emuladores, Herramientas, Oficina, Desarrollo, Otras).
- **Navegadores, arreglos (dev.18):** las opciones no se notaban porque un navegador ya abierto reenvía a su instancia y descarta las opciones: ahora cerrar/matar usa `flatpak kill <id>` y el menú tiene «Reiniciar para aplicar». Firefox: zoom y táctil por `user.js` del perfil (`layout.css.devPixelsPerPx`, `dom.w3c_touch_events.enabled`), ya no `GDK_DPI_SCALE`. Chromium/Edge: opción «Pantalla completa / Con pestañas» (`--start-maximized`). Las apps Flatpak en marcha según `flatpak ps` aparecen en Apps aunque no las abriera QAM Rail (ventana de Edge no detectada). [H: efecto en Firefox sin verificar]
- **Ajustes de lanzamiento de navegadores (dev.17):** en el menú de un navegador (Chromium/Edge/Firefox): tamaño de la interfaz 100–200 % y táctil sí/no, guardados por app (`desktop-opts.json`) y aplicados al abrirla de nuevo. Chromium: `--force-device-scale-factor` y `--touch-events=enabled`; Firefox no tiene opción de línea de órdenes: `GDK_DPI_SCALE` y `MOZ_USE_XINPUT2` (con `--env=` en Flatpak) [H: el efecto en Firefox sin verificar]. La ventana ocupa siempre la pantalla en Game Mode: el «tamaño» es el zoom.
- Diagnóstico de ventanas: `desktop-tag.log` (qué ventanas vio, resultado de `xprop`, líneas `capa base +/-`).
- «Agregar a QAM» pone la app en Apps (y en la fila de Inicio) de este panel, con su icono, y se abre desde ahí. **No se crea nada en Steam.** `desktop-pins.json`.
- Flatpak: se quitan las marcas `@@u`/`@@`/`--file-forwarding` del `Exec` (sin archivos no hacen falta).
- Navegadores Chromium con `--start-fullscreen`; Firefox no (no hay opción fiable).
- Filtro por origen, grupos por categoría, dos filas por app para el mando.
- Backend: `desktop_plan`, `desktop_run`, `desktop_pins`, `desktop_pin_set`.
- [H] Sin verificar en el equipo: que la ventana de la app se vea en Game Mode al lanzarla así (gamescope).

## 0.53.0

Canales estable / dev: dos copias de QAM Rail a la vez.

- **Estable** (`qam-rail`): se actualiza desde GitHub (como hasta ahora). **Dev** (`qam-rail-dev`, nombre «QAM Rail Dev»): se actualiza con zips y `install.sh --dev`; sin updater de GitHub; ajustes propios (`settings/qam-rail-dev`). Las apps (`~/homebrew/qam-apps`) se comparten.
- Solo una dibuja el QAM; la otra queda en pausa (no toca el QAM ni arranca nada de fondo) y su panel de Decky ofrece «Activar». Con dev instalada, manda dev.
- Cambio de canal: desde el QAM (Más › «Versión instalada», pide confirmación y reinicia Decky) o por terminal: `./canal.sh estable|dev|estado`.
- Red de seguridad: si dev no llega a arrancar bien 2 veces seguidas, el panel vuelve solo a la estable y lo avisa con un aviso de Decky.
- `package.sh --dev [N]` genera `qam-rail-dev-X-dev.N.zip` (carpeta, nombre y versión de dev; no toca `SHA256SUMS`). `install.sh --dev` (o pasar un zip dev) lo instala al lado de la estable y lo deja activo.
- Nuevo `scripts/canal.sh`; se publica en la release junto a `install.sh`.
- Corrección (dev.2): el nombre del plugin va incrustado en el bundle (`@decky/api` conecta con el backend por ese nombre), así que `package.sh --dev` ahora **recompila** con «QAM Rail Dev» y comprueba el nombre antes de empaquetar. En dev.1 el bundle seguía llamándose «QAM Rail», hablaba con el backend de la estable y las dos copias se quedaban en pausa (el QAM no abría).

## 0.52.0
- **QAM Rail se actualiza desde el QAM:** Más › Actualizaciones (buscar, instalar con confirmación, «Volver a X», canal estable/beta). Verifica SHA-256 (obligatorio), guarda copia (últimas 3), cambia la carpeta por renombrado y reinicia Decky.
- `scripts/instalar.sh`: primera instalación en un dispositivo nuevo (revisa Decky, Panel de Control, `wpctl`, `bluetoothctl`, `nmcli`, `flatpak`…; `--doctor` solo revisa).

## 0.51.2
- `scripts/install.sh --latest [--beta] | --version X | --check`: actualiza desde GitHub Releases con SHA-256 obligatorio, copia de seguridad y solo las últimas 5 copias.
- `scripts/limpiar.sh`: ordena la carpeta de trabajo (zips viejos → `_archivo/`, primero solo muestra el plan).
- Pruebas de ambos scripts en CI (`tests/sh/test_scripts.sh`).

## 0.51.1
- Escáner de apps de escritorio (`qam_desktop.py`, backend `desktop_scan`): Flatpak, AppImage de Gear Lever o sueltos (marca `AI\x02`), apps del sistema; agrupadas por categoría, sin ejecutar nada y con `Exec` de shell rechazados. La interfaz llega en 0.52.
- `package.json`: repositorio `pascaltll/qam-rail`.

## 0.51.0
- Actualizaciones de apps de QAM desde GitHub Releases: consulta con ETag como mucho cada 6 h y solo con el panel abierto (botón «Buscar ahora»), canal estable/beta según el manifiesto, descarga solo desde hosts de GitHub (HTTPS), verificación obligatoria con `SHA256SUMS` y la misma tubería con vuelta atrás. Nada se instala solo.

## 0.50.1
- Licencia GPL-3.0-only.
- «Teclado en pantalla» (Más) siempre visible: método interno de Steam, luego `steam://open/keyboard` en el cliente y, al final, `steam -ifrunning` desde el backend. Por verificar en el equipo.
- Repositorio listo para GitHub: CI, release con `SHA256SUMS`, `.gitignore`.

## 0.50.0
- Estándar de apps de QAM (manifiesto esquema 1) y tubería de instalación: staging, SHA-256, descompresión segura, confirmación, intercambio atómico, prueba de estado y reversión automática.

## 0.49.7
- Color ya no se atasca con ↑/↓ en «Imagen y sonido».
- Regla de volumen al 100 % en altavoces (por verificar en el equipo).

Historial anterior: ver `QAM-RAIL-ARQUITECTURA.md`.
