---
name: decky-bazzite
description: Conocimiento de entorno para QAM Rail: plugin de Decky en Bazzite (sistema inmutable), la interfaz de Steam por CEF, rutas, reinicios, parches de menú y qué no tocar. Úsalo al instalar, depurar por CEF o tocar el arranque del plugin.
---

# Decky + Bazzite + CEF

Lo marcado **[H]** es hipótesis o dato de documentación que aún no se comprobó en este equipo.

## Dónde está cada cosa (Ally)
- Plugin dev: `~/homebrew/plugins/qam-rail-dev/`; ajustes y registros: `~/homebrew/settings/qam-rail-dev/`. Estable: `qam-rail`. Canal activo con `scripts/canal.sh`.
- Servicio de Decky: `plugin_loader`. `sudo systemctl restart plugin_loader` **recarga la interfaz de Steam**: avisa y pide permiso.
- Instalar: `scripts/package.sh --dev N` (N = número real, nunca la letra) y `NO_RESTART=1 scripts/install.sh --dev`. Copia de seguridad previa en `scripts/backups/`. El `sudo` lo teclea el usuario.

## Bazzite es inmutable
- No toques `/usr` ni `/etc`; no uses `rpm-ostree install` salvo petición expresa (pide reinicio). Para herramientas: Homebrew, distrobox o instalar en el HOME **[H]**.
- La CEF de Steam escucha **solo en 127.0.0.1:8080** en Bazzite; sirve para scripts locales (`steam-cpu.py`, `captura.py`, `bp_nav.py`). Si falla, revisa que exista `.cef-enable-remote-debugging` en `~/.steam/steam/` y que nada más use el puerto 8080 **[H, de la documentación de Decky]**.

## Páginas CEF (`/json/list`)
- «Steam Big Picture Mode»: ventana principal; **contiene el panel de QAM y la barra lateral** (comprobado en la Ally). Aquí se captura y se lee el foco.
- «SharedJSContext»: sin interfaz; aquí vive el JS de los plugins (`window.SteamUIStore`, etc.).
- `QuickAccess_uid2`, `MainMenu_uid2`, `notificationtoasts_uid2`: páginas ocultas; `Page.captureScreenshot` agota el tiempo. Las métricas por página son del proceso, no individuales.

## Cómo se engancha el plugin
- `src/menuPatch.ts` envuelve `OpenQuickAccessMenu`/`OpenSideMenu`/`ToggleSideMenu` de `MenuStore` para abrir el panel propio en lugar del QAM de Steam; cuál usa el botón físico **no está comprobado**.
- Foco del mando: clase `.gpfocus` (la usa Steam); `Focusable` de `@decky/ui`. Teclas/mando: `onButtonDown` y el evento `vgp_onbuttondown` (descartar el duplicado). Códigos de LT/RT/L3 sin confirmar.
- API de depuración en consola CEF: `window.__qamRail` (diag, geom, apps…) y `window.__qamRailUI` (sections, go, current, body) mientras el panel está abierto.
- Vigilantes: `ghostWatch` (panel fantasma), `watchErrors` (errores JS → `ui.js.*`), vigilante de apps en `main.py`.

## Temas (CSS Loader / Hooandee)
- Los temas cambian tipografía y colores del QAM por CSS (p. ej. la serifa viene del tema «Hooandee Luminous Atlas», no de `src/`). Antes de «arreglar» un aspecto, averigua si es del tema o de QAM Rail. Con temas animados Steam gasta más CPU: mide con y sin ellos.

## No hacer
- No reiniciar Steam, gamescope ni el equipo sin permiso; no borrar fuera del repo; no guardar lo que el usuario escribe.
- No dar por buena una prueba que dependa de Steam sin ejecutarla en la Ally: decir «sin confirmar».
