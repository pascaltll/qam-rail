---
name: temas
description: Personalización y temas (CSS Loader, Hooandee): quién es dueño de un estilo, cómo convive QAM Rail con los temas y cómo cambiar el aspecto sin pelearse con ellos. Úsalo antes de tocar colores, tipografías o fichas.
---

# Personalización y temas

## Antes de tocar un estilo: ¿de quién es?
- Los temas de CSS Loader (p. ej. «Hooandee Luminous Atlas») cambian tipografía, colores y efectos del QAM. La **serifa** del panel viene de ese tema (`--hla-serif` en su `tokens.css`, aplicada en su `qam.css`), **no de `src/`**.
- Pasos: (1) mira el elemento en la CEF (página «Steam Big Picture Mode») y qué regla lo estiliza; (2) compara con el tema desactivado; (3) si es del tema, no lo «arregles» en `src/`: dilo al usuario y propón (cambiar de tema, opción del tema o excepción acotada).
- El panel de potencia (Potencia en Steam, Brillo, Volumen) es del plugin de Hooandee, no de QAM Rail; las fichas propias están en `src/ui.tsx` (`Chip`, `Segments`), `src/QamTdp.tsx`, `src/QamHomeModes.tsx`.

## Cómo estilamos lo nuestro
- Variables propias (`--qr-…`) y reglas en `src/fx.ts` / `src/railCss.ts`; nada de colores fijos nuevos. Estados `:hover`, `:active`, `.gpfocus` y `:focus` se tratan juntos.
- Texto de fichas: **una línea** y recorte con «…» solo del nombre; los números (vatios) nunca se recortan. Una tipografía más ancha (serifa) rompe fichas estrechas: prueba con el tema puesto.
- Contraste: no cambies colores del tema por tu cuenta; mide con captura y pide decisión al usuario.

## Eficiencia
- Algunos temas traen opción de «eficiencia» que quita efectos caros; con potencia baja se activa sola en temas activos (`src/themeEco.ts`) y se restaura al subir. Solo tocamos opciones que cambiamos nosotros. Nombres exactos por tema: sin verificar.
- Medir con y sin tema: ver skill `rendimiento`.
