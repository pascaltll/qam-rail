---
name: diseno
description: Diseño de interfaz para QAM Rail en la ROG Ally (pantalla táctil de ~7" a 1920x1080 y mando). Úsalo al crear o cambiar cualquier pantalla, panel, teclado o icono de src/.
---

# Diseño de interfaz (Ally, táctil + mando)

Principios tomados de la guía de interfaz de Apple (claridad, deferencia al contenido, profundidad) adaptados a una consola de mano. No copies guías de terceros: úsalas como referencia.

## Reglas
1. **Un objetivo táctil es un dedo, no un cursor.** Zonas de toque grandes (punto de partida: 48 px o más por lado, con separación entre vecinas; ajusta midiendo en la Ally, sin confirmar). Los iconos pueden ser pequeños; la zona de toque, no.
2. **Texto legible a brazo de distancia.** Tamaño base alto y contraste fuerte; nada importante solo por color (añade forma o texto).
3. **Respeta lo que Steam dibuja encima.** El borde inferior lo ocupa la barra de avisos de botones (`STEAM_FOOTER`, ~68 px en `src/BigKeyboardPage.tsx`); no pongas controles interactivos debajo de esa línea.
4. **Pocas cosas, claras.** Quita antes de añadir. Una acción principal por pantalla; lo avanzado, un nivel más adentro.
5. **Dentro del QAM de Steam:** la barra lateral es angosta y vive dentro de la interfaz de Steam (CEF). No uses ventanas del sistema ni alertas del navegador; cierra siempre bien lo que abres (ver `ghostWatch` en `src/pilot.tsx`).
6. **Respuesta inmediata.** Todo toque o botón da una señal visible (estado pulsado/foco) en menos de un cuadro; lo lento muestra progreso, no se congela.
7. **Coherencia con los temas.** Usa las variables de color/tema existentes; nada de colores fijos nuevos.

## Cómo comprobar
- Mira el resultado de verdad: captura de la interfaz con `python3 ~/homebrew/plugins/qam-rail-dev/captura.py [filtro] [--x]` (guarda PNG en `~/qam-capturas/`; léelos con Read) y revísala antes de dar el cambio por bueno. Si no puedes verlo, dilo: «sin confirmar visualmente».
- Pruebas de lógica en `tests/*.test.ts`; la autoprueba del navegador para los gestos.
