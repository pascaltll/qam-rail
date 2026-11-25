---
name: pruebas
description: Cómo probar QAM Rail de forma robusta: capas de prueba (lógica, interfaz, Ally), pruebas de caracterización, qué hace una prueba fiable y cómo no engañarse. Úsalo al escribir, cambiar o dar por buena una prueba.
---

# Pruebas robustas

## Capas (de más barata a más cara)
1. **Lógica sin Steam:** Python `tests/py/test_*.py` (cada uno es un script: `for t in tests/py/test_*.py; do python3 $t >/dev/null 2>&1 || echo FAIL $t; done`) y TypeScript `pnpm test` (vitest) + `pnpm typecheck`. Corren en cualquier sitio y deben estar siempre en verde antes de un commit.
2. **Auditorías estáticas:** `tests/navAudit.test.ts` (navegación: zonas tocables, foco). Si añades un patrón nuevo de interfaz, añade su comprobación aquí.
3. **En la Ally:** autoprueba del navegador (`qam_selftest*`, resumen en `informe.sh`), `bp_nav.py` (foco y QAM), `captura.py` (aspecto), `canario.py` (piezas internas de Steam).
Lo que solo se puede ver en la Ally **no** se da por probado con la capa 1: se dice «sin confirmar».

## Qué hace fiable una prueba
- **Falla primero.** Antes de arreglar, comprueba que la prueba nueva falla por la razón correcta; si pasa antes del arreglo, no prueba nada.
- **Sin condiciones permisivas** (`or True`, comparaciones que siempre cumplen, `try/except` que lo traga todo). Una prueba floja es peor que ninguna.
- **Comportamiento, no implementación:** que un refactor sano no la rompa.
- **Caracterización antes de refactorizar** código de riesgo (`_pend_run`, `choices`, `_apps_install_task`, `_desk_tag`, `check_manifest`): fija lo que hace hoy, luego cambia.
- **Determinista:** espera a una condición, no a un `sleep` fijo; sin depender de la hora, el orden o la red. Si una prueba de la Ally es irregular, repítela 3 veces y reporta cuántas pasan.
- **Umbrales con motivo escrito** (p. ej. `suavidad`: salto máximo ≤ 80 px, parón ≤ 250 ms, ≥ 6 eventos). No los aflojes para que pase: cambia la causa o explica por qué cambia el umbral.
- **Un fallo conocido no se esconde:** hoy fallan 2 pasos de la autoprueba («desplegable largo: desplazar con el dedo» y «pulsar en una lista emergente», ventana X emergente). Siguen listados en `HANDOFF.md`.

## Al terminar
- Encadena con `&&` (pruebas && commit) para no versionar nada en rojo.
- Cuenta lo que pasó: «335 de 335», no «pasan». Si no corriste una capa, dilo.
- Nunca escribas en pruebas ni en registros lo que el usuario teclea.
