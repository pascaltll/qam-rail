# Cambios

## 0.54.0

Apps › pestaña «Steam»: apps de escritorio del equipo (Flatpak, AppImage, sistema).

- «Abrir» lanza la app **como el usuario de la sesión** (Decky corre como root: `runuser` + `DISPLAY`/`XDG_RUNTIME_DIR`/D-Bus) y espera 1,5 s; si se cierra con error, el aviso dice por qué (última línea de su salida, `desktop-run.log`).
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
