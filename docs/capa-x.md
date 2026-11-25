# La capa X: qué es y cómo se prueba el navegador

Para quien trabaja en la terminal de la Ally. Resume lo que ya está en `AUTOPRUEBA-NAVEGADOR.md` y en el código (`py_modules/qam_pad.py`, `main.py`); lo que no está comprobado se dice como «sin confirmar».

## Las tres capas del Game Mode

1. **gamescope**: el compositor del Game Mode. Dibuja todo lo que se ve. No es una ventana ni una página: no se «lee», solo se le manda entrada y se le pregunta por sus propiedades.
2. **Capa CEF (la interfaz de Steam)**: Big Picture, el QAM y nuestro panel son páginas web dentro del Chromium de Steam. Se leen y se manejan por **CDP** en `127.0.0.1:8080`. Es lo que usan `captura.py` y `bp_nav.py`.
3. **Capa X (XWayland de gamescope, pantalla `:0`)**: aquí viven las **apps de escritorio** que abre el plugin (Firefox, Edge, VacuumTube, Stremio…). Cada app es una ventana de X. **No hay CEF ni CDP aquí**: un navegador es otro programa y el depurador de Steam no ve sus páginas.

Consecuencia: `bp_nav.py` y `captura.py` (sin `--x`) **no sirven** para probar el navegador. No hay `.gpfocus` ni foco del mando en la capa X.

## Cómo se prueba la capa X

- **Entrada**: ratón y teclado falsos con XTest (`qam_pad.XOut`, usa libX11 y libXtst por `ctypes` sobre `:0`). El táctil se imita con eventos evdev sintéticos (`Finger`, `Hands` para dos dedos) y pasa por el mismo camino que el dedo real (`TouchScroll` → `PadRunner` → XTest).
- **Observación**: propiedades de la ventana raíz (p. ej. `GAMESCOPE_FOCUSED_APP`, `_NET_WM_STATE`), lista de ventanas (`XQueryTree`), y si una ventana está realmente pintada (`ventana.contenido`: ≈6 colores = pintada, 1 = vacía). La grabadora escribe `nav-trace.log`.
- **La prueba**: botón «Probar navegador» (≈3 min, `qam_selftest*.py`, resultado en `~/homebrew/settings/qam-rail-dev/selftest.json`). Una página local en `127.0.0.1` avisa de cada evento y el programa cambia de escena. **El usuario no debe tocar la pantalla mientras corre.**
- **Captura**: `python3 scripts/captura.py --x` usa `import -window root` de ImageMagick (o `xwd` + `convert`). Sin confirmar que salga una imagen útil con gamescope.

## Llegar a la X desde la terminal (sin confirmar)

El plugin toma `DISPLAY` y `XAUTHORITY` del entorno de la sesión de usuario (`main.py`, `_pad_env`), no de su propio proceso. Desde una terminal, `DISPLAY=:0` suele bastar; si dice «cannot open display» o «Authorization required», mira el entorno de Steam (solo lectura):

```
tr '\0' '\n' < /proc/$(pgrep -n steam)/environ | grep -E '^(DISPLAY|XAUTHORITY|WAYLAND_DISPLAY)='
```

Exporta lo que salga y repite.

## Qué usar según lo que pruebas

| Quiero probar | Capa | Herramienta |
|---|---|---|
| El panel de QAM Rail, foco del mando, diseño | CEF | `captura.py`, `bp_nav.py`, `navtest.py` |
| Toque, scroll, teclado, menús, F11, pestañas en el navegador | X | «Probar navegador», `nav-trace.log` |
| Abrir/cerrar QAM o teclado con el navegador delante | las dos | «Probar transiciones» (`transtest.json`) |

## Cuidados

- XTest y el táctil sintético son **entrada real para el sistema**: van a lo que esté delante. Pregunta antes de ejecutar nada que mueva el ratón o escriba en X, y no lo hagas mientras Carlos usa el equipo.
- El interruptor `~/.qam-nav-stop` de `bp_nav.py` **todavía no cubre** la capa X; está en la lista de pendientes.
- No escribas ni registres nunca lo que el usuario teclea (regla del proyecto).
- `tests/py/test_xerr.py` falla con segfault en la Ally desde antes de `dev.105` (levanta su propio Xvfb `:78`); no indica que la X real esté rota. Sin diagnosticar.
- Hallazgos ya conocidos del navegador (Ctrl falso ignorado, menús como ventanas aparte, `<select>`, pantalla completa por `_NET_WM_STATE`…): `AUTOPRUEBA-NAVEGADOR.md`. No los redescubras.
