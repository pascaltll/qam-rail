# Traspaso de la conversación (25-nov-2026, dev.104)

Estado al pasar el trabajo del chat de claude.ai a Claude Code en la propia Ally. Léelo junto con `CLAUDE.md`.

## Dónde estamos
- Versión instalada y probada en el equipo: **0.54.0-dev.104** (rama `dev`, `acc9bcf` o posterior).
- Autoprueba del navegador (dev.104): **52 de 54 pasos bien**. Ya no aparecen las «interferencias» de dev.96. El paso nuevo «suavidad del desplazamiento» da: 141 eventos en 1176 ms (120/s), salto máximo 6 px, parón máximo 16 ms → el scroll con el dedo es fino a nivel de eventos.
- Teclado: batería completa 12/12, ~577 caracteres/s, modo `mod=lock` + símbolos `remap`.
- CPU de Steam en reposo (6 s, `steam-cpu.py`, con los temas de Hooandee): ~7 % por página, sin JS ni maquetación relevantes; solo ~9 recálculos de estilo/s en «Steam Big Picture Mode». El 45 % visto antes fue con Firefox en uso. Pendiente medir con el panel abierto y sin temas animados.

## Fallos abiertos (de más a menos importante)
1. **Panel fantasma / limbo** (24-nov 17:55 con VacuumTube: Steam → menú izquierdo → Steam+A). dev.99 añade un vigilante que cierra el panel si su elemento no se ve 4 s seguidos; falta confirmar que dispara. Buscar `vigilante: panel fantasma` en `timeline.log`/`pad.log`. Hay estados incoherentes (`panel=true overlay=0`, `foco=null`) el 25-nov 04:26 y 04:48.
2. **«Desplegable largo: desplazar con el dedo y elegir»** falla («no se eligió nada»). El `<select>` abre una ventana X emergente (616x856) y el puntero cae dentro de ella.
3. **«Experimento: pulsar en una lista emergente»**: fallan las 4 variantes (A–D). Es el mismo asunto que el 2.
4. **`qam:ytmini` sin ventana** (22 s) dos veces (18:26 y 03:45): el mini-reproductor propio no muestra su ventana.
5. Firefox: la marca de ventana tarda 0,7–1,4 s, y una vez 13 s (18:57). «Ventana cerrada por fuera» aparece al cerrarse Firefox (normal si lo cierra el usuario).

## Cosas medidas que NO son fallos
- `CanCreateUserNamespace() ... EPERM` al lanzar Firefox Flatpak desde systemd-run: habitual, Firefox funciona.
- «clases conocidas []» en la primera apertura de una app: las aprende después.
- Tamaños de ventana 1676x942 / 1867x1050 en `estado`: probablemente la animación de encoger al abrir el teclado grande (sin confirmar). Sería fallo si tras cerrar el teclado la ventana no vuelve a 1920x1080.

## Lo que pidió el usuario y falta (por orden)
1. Teclado grande robusto: acoplado abajo usando todo el ancho, con un hueco («burbuja») para los avisos de botones de Steam (~68 px, `STEAM_FOOTER` en `src/BigKeyboardPage.tsx`), página de símbolos/números, y que la ventana de la app se ajuste para que el campo enfocado siga visible (como `adjustResize`). LT=Mayús, RT=símbolos, LB/RB cursor ←/→, L3=Bloq; Y=espacio, Start=Intro, X=borrar, B=cerrar ya están.
2. Escenas nuevas de la autoprueba: mando reconocido por el navegador (`navigator.getGamepads()`, tipo Xbox Cloud Gaming), captchas (arrastrar deslizador, puzle, rejilla de imágenes, mantener pulsado, girar, tab), chat con LLM (campo abajo; el teclado debe mover/ajustar la página).
3. Inventario de apps: unificar fuentes (Flatpak, AppImages de Gear Lever en `~/AppImages` y `~/Applications`, apps del sistema), orden, sin juegos de Steam ni Steam. Ya hay deduplicación (dev.101) y se ocultan copias `.OLD`; faltan acciones «abrir / agregar al cajón» para AppImage y mejor agrupación (muchas caen en «Otras»).
4. Tacto de tableta: scroll con inercia, zoom, pulsación larga = clic derecho, doble toque para zoom, gestos de borde, cerrar el teclado al tocar fuera.
5. Depuración: detectar apps colgadas (ping `_NET_WM_PING`), botón/combo «marcar fallo ahora», comparar capturas de la ventana antes/después de un toque.
6. Refactor pendiente de funciones complejas: `_pend_run` (CC 23), `choices` (46), `_apps_install_task` (35), `_desk_tag` (30), `check_manifest` (30), `Watchdog.check`/`scan` (27).

## Cómo se trabaja (resumen del flujo)
- Cambios pequeños, pruebas antes (`tests/py/test_*.py`, `pnpm test`), entrada en `CHANGELOG.md`, `scripts/package.sh --dev N`, instalar con `NO_RESTART=1 scripts/install.sh --dev`, reiniciar con `sudo systemctl restart plugin_loader` (avisando: recarga la interfaz de Steam), probar y reunir con `bash ~/homebrew/plugins/qam-rail-dev/informe.sh`.
- Lo no comprobado en el equipo se escribe como «sin confirmar».

## Herramientas de agentes (25-nov)
- `AGENTS.md` es la memoria común; `CLAUDE.md` y `GEMINI.md` lo importan. Skills en `.claude/skills/`. Decisiones cerradas en `docs/decisiones.md`.
- `scripts/captura.py` (empaquetado desde la próxima versión): PNG de las páginas de la interfaz de Steam por CEF :8080; `--x` intenta la pantalla X. Probado en la Ally (25-nov): la página «Steam Big Picture Mode» captura panel y barra; QuickAccess/MainMenu están ocultas y agotan el tiempo.
