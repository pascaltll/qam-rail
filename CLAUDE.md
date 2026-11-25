# QAM Rail — guía para Claude Code

Plugin de Decky (GPL-3.0) que convierte el QAM de Steam en una barra lateral de iconos con lanzador de apps, panel de teclado/táctil y herramientas para apps de escritorio. Se desarrolla en una ROG Ally con Bazzite (Game Mode, gamescope). Repo: `pascaltll/qam-rail`, rama de trabajo **`dev`**. El usuario (Carlos) habla español: responde en español.

## Estructura
- `src/` interfaz (TypeScript/React para Decky). `main.py` backend del plugin. `py_modules/` módulos Python (`qam_pad` mando/táctil, `qam_desktop` inventario de apps, `qam_trace` grabadora, `qam_selftest*` autoprueba del navegador, `qam_fswatch`, `qam_forensics`, `qam_blackbox`).
- `tests/*.test.ts` (vitest) y `tests/py/test_*.py` (se ejecutan como scripts, cada uno por separado).
- `CHANGELOG.md` una entrada por versión `dev.N`; `AUTOPRUEBA-NAVEGADOR.md`, `QAM-RAIL-ARQUITECTURA.md` explican el diseño.

## Comandos
- Pruebas Python: `for t in tests/py/test_*.py; do python3 $t >/dev/null 2>&1 || echo FAIL $t; done`
- Tipos y pruebas TS: `pnpm typecheck` · `pnpm test` · compilar: `pnpm build`
- Zip de desarrollo: `scripts/package.sh --dev N` → `qam-rail-dev-<versión>-dev.N.zip` (otra carpeta y otro nombre que la estable).

## En el equipo (Ally)
- Plugin instalado: `~/homebrew/plugins/qam-rail-dev/`. Ajustes y registros: `~/homebrew/settings/qam-rail-dev/`.
- Reiniciar el cargador de plugins: `sudo systemctl restart plugin_loader` (la versión instalada está en `ultima-version`).
- Registros: `pad.log` (mando/táctil/pantalla completa), `timeline.log` (JSON: apertura de apps `app.ventana`/`app.sin_ventana`, panel, errores `ui.js.*`), `desktop-tag.log`, `desktop-run.log`, `keyboard.log`, `nav-trace.log` y `trazas/` (una grabación por app abierta, 15 min cada una; se desactiva creando `vigilante-off`), `selftest.json`.
- Un solo comando para reunir todo: `bash ~/homebrew/plugins/qam-rail-dev/informe.sh` → `~/qam-informe.txt`.
- CPU por página de la interfaz de Steam (CEF, puerto 8080): `python3 ~/homebrew/plugins/qam-rail-dev/steam-cpu.py 10`.
- X: pantalla `:0` (XWayland de gamescope). Steam depura por CEF en `127.0.0.1:8080`.

## Reglas acordadas
- Antes de refactorizar código de riesgo, escribe pruebas de caracterización. No cambies comportamiento medido sin medir antes y después.
- Cada versión nueva: entrada en `CHANGELOG.md`, pruebas pasando, commit pequeño en `dev`. Las entradas explican causa y efecto; lo no comprobado en el equipo se dice como «sin confirmar».
- La grabadora y los registros NUNCA guardan lo que el usuario escribe (solo cuántas teclas y cuánto tardó).
- No reinicies Steam, gamescope ni el equipo, ni toques `/usr`, `/etc` o ajustes del sistema, sin preguntar. No borres nada fuera del repo.
- `ub-mode` (unclebob) se adoptó solo como principios de calidad, sin copiar su código (licencia desconocida; el proyecto es GPL-3.0).
- No subas zips ni `node_modules` al repo.

## Cosas conocidas (sin resolver)
- Steam gasta ~45 % de CPU en reposo con los temas de Hooandee; abrir el panel añade un pico. Falta medir con `steam-cpu.py` con/sin temas.
- Posible bloqueo: pulsar Steam (menú izquierdo) y luego Steam+A con una app abierta dejó un «panel fantasma»; dev.99 añadió un vigilante que cierra el panel si no se ve.
- Pendiente: suavidad del scroll con el dedo (paso `suavidad` de la autoprueba como línea base), escenas de autoprueba para captchas/chat/mando en el navegador, teclado grande más robusto (acoplado abajo con hueco para los avisos de Steam), detección de apps colgadas.
