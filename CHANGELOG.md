# Cambios

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
