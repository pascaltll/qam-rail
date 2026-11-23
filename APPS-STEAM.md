# Pestaña «Steam» de Apps · apps de escritorio dentro del Modo Juego (diseño, 23-11-2026, para 0.52)

**Objetivo (Carlos):** lanzar desde el QAM las apps que normalmente solo se usan en Modo Escritorio (navegadores, AppImages que gestiona Gear Lever, Flatpaks, etc.), con un menú para **agregar y quitar** sin pasar por «Añadir un juego que no es de Steam», y que en la biblioteca de Steam queden **solo los juegos**.

## 1. Qué se descubre (fuentes, sin ejecutar nada de ellas)
| Fuente | Dónde se lee | Cómo se lanza |
|---|---|---|
| **Flatpak** | `.desktop` de `/var/lib/flatpak/exports/share/applications` y `~/.local/share/flatpak/exports/share/applications` (+ `Exec=flatpak run …`) | `flatpak run <id>` |
| **AppImage con Gear Lever** | Gear Lever deja un `.desktop` por AppImage en `~/.local/share/applications` (Flatpak `it.mijorus.gearlever`) | el `Exec=` del `.desktop` (apunta al AppImage) |
| **AppImage suelto** | `~/Applications`, `~/AppImages`, `~/Descargas`, `~/Games` (archivos ejecutables con firma AppImage: bytes `AI\x02` en el offset 8) | el propio archivo |
| **Apps del sistema / Brew** | `/usr/share/applications`, `~/.local/share/applications` | `Exec=` del `.desktop` |
Todo se lee con el módulo `qam_desktop.py` (Python puro, sin subprocesos para listar, con pruebas): analiza `[Desktop Entry]` (spec freedesktop), quita los códigos `%U %f %F %u…` del `Exec`, ignora `NoDisplay`, `Hidden`, `Terminal=true` y `OnlyShowIn` que no incluya `KDE`; **excluye** Steam, Decky, QAM Rail y utilidades que no tienen sentido en pantalla de juego (instaladores, «Volver al Modo Juego»).

## 2. Grupos
Por `Categories=` del `.desktop`: **Navegadores** (`WebBrowser`), **Multimedia** (`AudioVideo`, `Audio`, `Video`), **Juegos y emuladores** (`Game`, `Emulator`), **Herramientas** (`Utility`, `System`, `Settings`), **Oficina**, **Desarrollo**; el resto en **Otras**. Cada grupo es plegable.

## 3. Agregar y quitar (sin el menú de Steam)
- **Agregar:** una ficha por app descubierta con un interruptor «En Steam». Al activarlo se crea el atajo con `SteamClient.Apps.AddShortcut` (el mismo camino que ya usa «A Steam» en las apps de QAM), con nombre, icono (del tema de iconos o del propio AppImage: `.DirIcon`) y carátula generada si no hay. **Quitar:** el mismo interruptor → `RemoveShortcut`.
- **Registro propio** `apps-steam.json`: `{clave estable → {origen, nombre, exec, appid, grupo}}`. La clave es el id de Flatpak, el nombre del `.desktop` o el hash de la ruta del AppImage. Así se sabe qué atajos son **nuestros**: «quitar» solo toca esos, nunca otros atajos de Carlos.
- **Solo desde el QAM (decisión 23-11):** los atajos se crean únicamente desde aquí. Los que ya existen en Steam los quita Carlos a mano, así la biblioteca queda solo con juegos. **No se oculta nada ni se crea colección**; la pestaña **Steam** del QAM es donde viven las apps.
- **Actualizaciones de la app instalada:** si el AppImage cambia de ruta (Gear Lever actualiza «en sitio» o en paralelo), el atajo se reapunta solo comparando la clave; si desaparece, la ficha pasa a «Ya no está» con botón «Quitar atajo».

## 4. Lanzamiento y mando (lo delicado en Modo Juego) [H]
- Gamescope muestra la ventana de la app a pantalla completa. Para **navegadores** y apps con ventana: opciones de lanzamiento por tipo (`--kiosk`/`--start-fullscreen` solo donde la app lo documenta; nunca se inventan).
- **Mando:** Steam Input necesita un diseño de «Escritorio» (ratón con el stick y A = clic). No hay forma fiable de fijarlo por código; se **muestra una ayuda** («Mantén ⊞/Steam y usa el mando como ratón») y se deja el diseño de Steam por defecto. Pregunta abierta para probar en el equipo: si `SteamClient.Input` permite asignar la plantilla «Escritorio» al atajo.
- Al lanzar se cierra el panel y 400 ms después se lanza (misma regla que 0.25: evita cuelgues).
- **Una sola instancia:** si la app ya está abierta, se vuelve a su ventana en vez de abrir otra (Flatpak/AppImage con `--single-instance` solo si la app lo soporta).

## 5. Interfaz (cabe en el rediseño de Apps de 0.52)
Pestaña **Steam** en el segmento de Apps → buscador por letra (Y) → grupos plegables → ficha: `[icono] Nombre · origen (Flatpak / AppImage / sistema)` y dos filas: (1) `[Abrir]`, (2) `[En Steam ✓]` `[⋯]`. «⋯»: Ver ruta, Reapuntar, Ocultar de la lista. **Dos filas por ficha, ninguna barra en la fila de chips** (regla de la auditoría de mando). Botón «Buscar apps nuevas» (relee las carpetas; nunca en segundo plano con el panel cerrado).

## 6. Seguridad y límites
- Solo se **lanza** lo que ya está en el equipo; no se descarga nada.
- El `Exec` se pasa como lista de argumentos (sin shell) y se rechazan `Exec` con redirecciones o `;`/`&&`.
- Un `.desktop` ilegible o con codificación rara se omite y se cuenta («3 entradas omitidas» en el informe).
- Presupuesto: leer ~300 `.desktop` ≤ 150 ms; nunca en el hilo de la interfaz (backend, con caché de 10 min y botón de releer).

## 7. Orden de trabajo
| Paso | Contenido |
|---|---|
| 0.52 (a) | `qam_desktop.py` + pruebas (analizador, códigos `%`, exclusiones, grupos, firma AppImage). Backend `desktop_scan`. |
| 0.52 (b) | Pestaña Steam: lista por grupos, interruptor «En Steam» (AddShortcut/RemoveShortcut con registro propio), «Abrir». |
| 0.52 (c) | Icono/carátula, reapuntado, «Ya no está». |
| 0.53 | Ayuda del mando de Escritorio; prueba si `SteamClient.Input` admite la plantilla; opciones de lanzamiento por tipo. |

## 8. Preguntas abiertas
1. ~~Carpetas de AppImages~~ → resuelto: la de Gear Lever por defecto (`~/AppImages` [H]; se lee de su configuración si existe).
2. ~~Navegadores~~ → resuelto: **pantalla completa por defecto**.
3. ~~Ocultar de la biblioteca~~ → resuelto: no se oculta; Carlos quita a mano los atajos antiguos.

## 9. Teclado y mando en navegadores (decisiones 23-11; todo [H] hasta probarlo en el equipo)
- **Mando como Edge/Xbox:** Microsoft indica la plantilla de Steam Input «Gamepad with Mouse Trackpad» para Edge en SteamOS. Sin plantilla propia el mando no se reconoce en el navegador; Edge Flatpak además necesita lectura de `/run/udev` (`flatpak override --filesystem=/run/udev:ro`). Plan: al agregar un navegador, mostrar esa ayuda y comprobar el permiso; asignar la plantilla por código queda por probar.
- **Teclado en pantalla:** Steam+X lo abre; enlace profundo `steam://open/keyboard?XPosition=&YPosition=&Width=&Height=&Mode=` y `steam://close/keyboard` (lo usa SDL con `SDL_OpenURL`).
- **Sección de acceso rápido al teclado en el QAM:** botón que abre/cierra el teclado con esos enlaces. Probar en el equipo qué vía lo dispara desde el plugin (`SteamClient.URL`/`Navigation`, o ejecutar `steam steam://open/keyboard` en el backend).
- **Teclado al tocar un campo de texto:** en apps de escritorio Steam no lo abre solo; solo es viable con un puente por app (p. ej. extensión/flag del navegador) → fase posterior, no prometido.
- **Pantalla completa:** Chromium/Edge `--start-fullscreen` (o `--kiosk`); Firefox no tiene flag fiable, depende de gamescope.
