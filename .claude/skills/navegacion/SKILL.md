---
name: navegacion
description: Navegación con mando y con el dedo en QAM Rail (foco, botones, gestos, teclado grande, scroll). Úsalo al tocar entrada, foco, gestos o el teclado.
---

# Navegación: mando y táctil

## Mando (mapeo acordado)
- **A** aceptar, **B** atrás/cerrar. En el teclado grande: **Y** espacio, **X** borrar, **Start** Intro, **B** cerrar.
- **LT** Mayús, **RT** símbolos/letras, **L3** Bloq, **LB/RB** cursor ←/→ (dev.105; sin confirmar en la Ally que Steam entregue LT, RT y L3 a la página).
- Cruceta/stick mueven el foco. Todo lo que se toca con el dedo debe poder alcanzarse con la cruceta, y viceversa.

## Reglas
1. **El foco siempre es visible** y nunca se pierde: al abrir un panel el foco entra en él, al cerrarlo vuelve a donde estaba.
2. **Nada que atrape el foco.** Todo panel se puede cerrar con B y también tocando fuera; si el panel desaparece, el foco y el estado (`panel`, `overlay`) deben limpiarse (el vigilante `ghostWatch` es red de seguridad, no excusa).
3. **Gestos táctiles:** desplazar con inercia y sin saltos (la autoprueba `suavidad` mide salto máximo y parón máximo), pulsación larga para el menú de opciones, doble toque solo si no choca con otro gesto.
4. **Deduplica entradas:** un botón puede llegar por `onButtonDown` y por el evento `vgp_onbuttondown`; descarta el duplicado.
5. **Nunca registres lo que el usuario escribe**, solo cuántas teclas y cuánto tardó.
6. **Ventanas X emergentes** (listas desplegables, menús de Firefox) son otra ventana: el puntero cae dentro de ella y la interfaz de Steam no la ve. Es un fallo abierto conocido (ver `HANDOFF.md`).

## Cómo comprobar
- `python3 tests/py/test_*.py` (cada uno) y `pnpm test` para la lógica.
- Autoprueba del navegador en el equipo; el informe (`informe.sh`) la resume. Lo que depende de botones físicos o de Steam se marca «sin confirmar» hasta probarlo en la Ally.
