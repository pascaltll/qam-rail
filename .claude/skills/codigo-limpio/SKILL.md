---
name: codigo-limpio
description: Reglas de calidad y refactorización para QAM Rail (causa raíz, quitar antes de añadir, complejidad, pruebas de caracterización). Úsalo al refactorizar o al revisar código antes de dar por bueno un cambio.
---

# Código limpio

Principios de calidad en palabras propias, inspirados en `ub-mode` (sin copiar su texto; ver `docs/decisiones.md`).

## Reglas
1. **Causa raíz, no parche.** Reproduce el fallo, entiende por qué ocurre y corrige eso. Un `try/except` que lo esconde no es arreglo.
2. **Quitar antes de añadir.** Si borrar código resuelve el caso, mejor. Elimina lo muerto cuando lo encuentres.
3. **Pruebas de lo que hace, no de cómo lo hace.** Prueban comportamiento observable; un refactor no debería romperlas.
4. **Refactor de riesgo = caracterización primero.** Escribe pruebas que fijen el comportamiento actual, refactoriza, y las pruebas deben seguir iguales.
5. **Complejidad acotada.** Funciones con complejidad ciclomática alta (más de ~15 como señal, en el proyecto hay casos de 23 a 46) se dividen en piezas con nombre. Lista actual en `HANDOFF.md`: `_pend_run`, `choices`, `_apps_install_task`, `_desk_tag`, `check_manifest`, `Watchdog.check/scan`.
6. **Sin duplicación estructural.** Si copias un bloque por tercera vez, extrae una función.
7. **Nombres claros, módulos con una responsabilidad**, y fronteras limpias entre `main.py` (backend), `py_modules/` (lógica) y `src/` (interfaz).
8. **Idempotencia:** instalar o aplicar dos veces da el mismo resultado.
9. **Commits pequeños y ordenados;** cada uno deja las pruebas en verde.

## Revisión antes de entregar
- Pruebas Python y `pnpm typecheck && pnpm test` en verde.
- Nada de datos del usuario en registros. Nada de archivos temporales o zips en el commit.
- Herramientas de métricas (complejidad, duplicación, mutación): sin confirmar que existan para Python/TS; si se usan, instalarlas fuera del repo y medir antes y después.
