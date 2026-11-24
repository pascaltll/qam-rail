# Autoprueba del navegador y lo que enseñó (dev.74 – dev.97)

Sirve para ver, tras cada actualización, qué se rompió al usar una app de escritorio en Game Mode (gamescope): toques, scroll, teclado, menús, vídeo, pantalla completa, pestañas. Botón «Probar navegador» (≈3 min; **no toques la pantalla mientras corre**). Resultado en `~/homebrew/settings/qam-rail-dev/selftest.json` y, línea a línea, `grep autoprueba pad.log`.

## Cómo funciona
- Una página de prueba la sirve un servidor local (127.0.0.1) y avisa de cada evento (`/ev`); el programa cambia de escena con `/cmd`.
- Los toques se generan como eventos evdev sintéticos (`Finger`, `Hands` para dos dedos) y pasan por el mismo camino que el táctil real (`TouchScroll` → `PadRunner` → XTest). Antes se calibra página↔pantalla con dos toques.
- Pasos: clic, mismo sitio ×5, scroll, inercia, texto, Ctrl y símbolos, desplegables, pop-ups, vídeo y música (play, saltar, arrastrar, volumen), menús, scroll vertical/horizontal/diagonal/dos dedos, zoom, F11, pestañas. Si algo falla corren `experimento: …` que buscan qué hace falta.
- Se abre la página con `xdg-open` como usuario de la sesión (en Edge Flatpak: `flatpak run <id> <url>`). Escribir la dirección en la barra no es fiable.

## Hallazgos (Firefox en gamescope)
1. **El Ctrl falso se ignora** (XTest). Funciona fijarlo en el servidor con `XkbLockModifiers` (`mod_mode=lock`). Símbolos (`:`, `/`, `_`): prestar un keycode libre con `XChangeKeyboardMapping` (`char_mode=remap`). La prueba elige y guarda el modo en `kbd-mode.json`.
2. **Arrastrar controles** (volumen, barra de progreso, selección): un arrastre normal es scroll por diseño; el gesto es **«toca y arrastra enseguida»** (segundo toque en <0,35 s y 70 px).
3. **Menús del navegador (☰, barra de arriba):** son ventanas aparte de X (override-redirect) que aparecen 35–175 ms tras el toque. Con el menú abierto, el toque en otro botón solo cierra el menú (comportamiento normal de Firefox). Dos toques rápidos abren y cierran.
4. **Desplegable `<select>`:** el teclado elige, los clics de XTest no; no aparece como ventana de X.
5. **Pantalla completa** (⛶ del vídeo y F11): gamescope no responde a la petición del navegador. **Resuelto en dev.91**: `qam_fswatch.py` escucha en la raíz de X los mensajes `_NET_WM_STATE` (máscara `SubstructureNotify`; Firefox sí los manda) y pone o quita `_NET_WM_STATE_FULLSCREEN` en la ventana. Verificado en el equipo (dev.96): ⛶ del vídeo, F11, tocar dentro y salir con ⛶, Esc y F11 pasan. `pad.log`: «pantalla completa: la ventana 0x… la pide/deja → hecho».
6. **Zoom con dos dedos** = Ctrl + rueda. Era que la X del mando no conocía el modo de Ctrl guardado (`kbd-mode.json`); arreglado en dev.87 y confirmado.
7. El filtro multitáctil del kernel descarta coordenadas repetidas: `Finger`/`Hands` lo imitan.
8. Un menú «que no abre» puede ser una ventana creada pero no pintada: `ventana.contenido` de la grabadora dice si está pintada (≈6 colores) o vacía (1 color).

9. **«Tocar un texto abre el teclado grande»** (dev.88): se reconoce el cursor de texto por su nombre (`qam-text`, `text`) o, sin nombre, por su forma. En el equipo abre a los ~225 ms y el botón no lo abre.
10. **La prueba se estropeaba sola** (dev.92–96): (a) con ese modo activo, cada toque de la prueba en un campo abría el teclado grande de verdad y ponía el táctil en pausa (32 veces en una ejecución); dev.97 apaga el modo durante la prueba y `_libre()` cierra el teclado/panel si algo lo abre; (b) el tope de 300 s tiraba todo el resultado (ahora 900 s con parciales); (c) la matriz de modos del teclado podía empeorar un modo bueno (ahora solo cambia si mejora el resultado inicial, y si Ctrl ya funciona solo compara los símbolos). Si Firefox muestra «Restore Session» la prueba se detiene: toca «Start New Session».
11. **Desplegable largo en Firefox:** elegir tocando una opción pasó en dev.96 (con una ventana emergente de X visible); desplazar con el dedo y elegir sigue sin funcionar. En la batería del teclado hay un fallo suelto a ~450 caracteres/s (un espacio adelantó una letra); con el teclado grande no ocurre (una tecla cada vez).

## Grabadora (`nav-trace.log`, «Grabar navegación»)
Eventos: `dedo.*`, `toque.enviado`, `toque.efecto` (ventana bajo el puntero, nº de ventanas antes→después, cambio de título), `ventana.nueva/cierra` (con ms desde el toque y capa), `ventana.contenido`, `scroll.inicio`, `rueda`, `parón.lector`, marcas (`No abrió`, `No respondió`, `Scroll mal`). Úsala pulsando la marca justo al fallar.

## Prueba de transiciones (dev.84)
Botón «Probar transiciones»: abre/cierra el QAM y el teclado grande con el navegador delante y cronometra (interfaz, overlay, táctil que vuelve, primer toque) más estado final (foco, tamaño, ventanas sueltas). Resultado: `transtest.json`.

## Plan: sensación de tablet y teclado tipo Xbox (investigado en dev.88)
**Teclado (referencias):** el teclado «Gamepad» de Windows 11 usa X = borrar, Y = espacio, Menú = Intro, LT = página de símbolos y números, y teclas alineadas en vertical para moverse con la cruceta. El de Steam deja los botones configurables (L1 borrar, R1 espacio, gatillo izquierdo Mayús en Big Picture) y añade flechas ↑/↓ con Mayús. Desde dev.94: X borrar, **Y espacio**, **Start Intro** (en Steam la «opción» es la Y y el «menú» es Start), B cerrar; el teclado deja 68 px sobre la barra de ayudas de Steam.
Propuesta (falta): LT = Mayús (mantener), RT = símbolos/números, LB/RB = mover el cursor ← →, L3 = Bloq Mayús; filas alineadas en vertical; teclado más compacto con página de símbolos y números como en el móvil; vista previa del texto arriba.
**Tablet:** (1) tocar un texto abre el teclado sin depender del modo completo (prueba en dev.88); (2) scroll por píxeles con inercia (hoy la rueda de X va a saltos: valuators XInput2 o muchos clics pequeños); (3) zoom con pellizco más suave; (4) mantener pulsado = clic derecho / menú contextual; (5) doble toque = zoom a texto; (6) arrastrar desde el borde para el QAM o volver; (7) cerrar el teclado al tocar fuera; (8) pantalla completa automática (⛶ y F11 en Firefox).

## Pendiente
Desplegable largo con el dedo (Firefox); cuadrícula alineada y página de símbolos del teclado; scroll táctil suave con inercia; toque con menú abierto sobre otro botón (cerrar y reenviar); scroll más fino (la rueda de X va a saltos); Edge, VacuumTube y Stremio con esta batería; transiciones app ↔ QAM; medición de calidad (radon/coverage): `PadRunner._pend_run`, `choices`, `_apps_install_task` y `_desk_tag` siguen con complejidad >20.
