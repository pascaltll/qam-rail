---
name: rendimiento
description: Cómo medir CPU, lag y fluidez en la Ally con QAM Rail y Steam (steam-cpu.py, captura, informe, scroll) y cómo comparar antes y después. Úsalo ante quejas de lentitud, tirones o consumo.
---

# Rendimiento

**Regla:** sin medida antes y después no hay mejora. Anota siempre las condiciones (versión, con/sin temas, panel abierto o cerrado, qué app).

## Herramientas
- `python3 ~/homebrew/plugins/qam-rail-dev/steam-cpu.py 10` — % de tiempo ocupado por página CEF (JS, maquetación, estilos, layouts/s). **Las métricas son del proceso:** páginas con valores idénticos (≈7 % en reposo) indican que no distinguen la página culpable.
- Tres lecturas estándar: (1) reposo con panel cerrado, (2) panel abierto, (3) sin los temas animados de Hooandee. Compáralas.
- `informe.sh` — todo en un archivo (`~/qam-informe.txt`): CPU de procesos, selftest, vigilante.
- `nav-trace.log` y `trazas/` — CPU por proceso durante una app abierta (una traza por app, 15 min).
- Fluidez del scroll: paso `suavidad` de la autoprueba (eventos por segundo, salto máximo, parón máximo). Línea base dev.98: 120 eventos/s, salto 6 px, parón 16 ms.
- Retraso de navegación: `bp_nav.py grafo` mide ms entre pulsación y cambio de foco (aviso a partir de 300 ms, umbral nuestro).
- Panel propio: banco interno (`QamBench`, `perfBench.ts`) desde la consola CEF con `__qamRail.runs()`.

## Datos conocidos
- ~45 % de CPU de steamwebhelper con Firefox en uso y temas de Hooandee; ~7 % por página en reposo. Falta medir con panel abierto y sin temas (pendiente en `HANDOFF.md`).
- Los temas tienen opción de «eficiencia» (`themeEco.ts`); el nombre exacto de la opción por tema **no está verificado**.

## Método
1. Línea base (≥ 2 medidas, 10 s cada una). 2. Un solo cambio. 3. Misma medida otra vez. 4. Informa números con condiciones: «de X % a Y % (reposo, panel cerrado, con temas)».
No concluyas de una sola medida ni mezcles condiciones. Si la causa es un tema o Steam y no `src/`, dilo (ver skill `temas`).
