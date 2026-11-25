---
name: depuracion
description: Depuración sistemática de QAM Rail: reproducir, aislar, una hipótesis, medir, arreglar la causa raíz y comprobar. Úsalo ante cualquier fallo, lag o comportamiento raro antes de proponer un arreglo.
---

# Depuración sistemática

No propongas un arreglo hasta tener la causa. Orden fijo:

1. **Reproducir.** Qué pasó, cuándo, con qué versión (`ultima-version`), qué app abierta. Sin reproducción, solo hay sospechas: dilo.
2. **Reunir datos, no opiniones.** `bash ~/homebrew/plugins/qam-rail-dev/informe.sh`, `timeline.log` (eventos `app.*`, `ui.*`, `panel.*`, `ui.js.*`), `pad.log`, trazas en `trazas/`, capturas con `captura.py`. Lee solo las secciones que hagan falta.
3. **Aislar.** Reduce hasta el caso mínimo: ¿pasa sin el tema de Hooandee? ¿sin la app? ¿solo con el panel abierto? Un cambio de variable cada vez.
4. **Una hipótesis, escrita, que se pueda desmentir.** «Si la causa es X, entonces al hacer Y debería ver Z.»
5. **Verificar solo esa hipótesis** (medir, no suponer). Si no sale, descártala y escribe la siguiente. No mezcles dos arreglos.
6. **Arreglar la causa**, no el síntoma. Prueba que falle antes y pase después (caracterización si es código de riesgo).
7. **Comprobar sin regresión:** pruebas en verde y, si es visual o de rendimiento, medir de nuevo en la Ally.

## Comprueba primero el instrumento
Lecciones de este proyecto:
- Una captura **anterior a la instalación** del build mostró el arreglo viejo: compara la hora de la captura con la de `dist/index.js` instalado.
- El recorte compacto cortaba el borde del panel y casi todo salió «dudoso»: si los datos parecen raros, sospecha de la herramienta de medir antes que del código.
- Los agentes baratos (Haiku) dan pistas, no hechos: confirma leyendo el código o con una segunda medida.
- Los tamaños de ventana raros (1676x942 / 1867x1050) siguen sin explicar: no los trates como fallo ni como normales hasta medirlos.

## Reglas de parada
- Si el mismo intento falla **dos veces**, para: cambia de enfoque o pregunta; no repitas.
- Nada de «de paso» (limpiezas o refactors mezclados con el arreglo).
- Nunca reinicies Steam, gamescope o el equipo para probar sin permiso.

## Cómo informar
Una línea por cosa: **causa** (probada / probable / sin confirmar), **qué cambió**, **cómo se comprobó** (prueba, Ally, captura) y **qué falta**. Los fallos conocidos y abiertos viven en `HANDOFF.md`.
