---
name: programacion
description: Flujo de trabajo de QAM Rail para cambiar código: prueba, CHANGELOG, versión dev.N, empaquetar, instalar y reunir el informe. Úsalo en cualquier cambio que vaya a versionarse o instalarse.
---

# Flujo de trabajo

1. **Entender antes de tocar.** Lee `AGENTS.md`, `HANDOFF.md` y el código implicado. Si el cambio es de riesgo, primero pruebas de caracterización (fijan lo que el código hace hoy).
2. **Prueba primero** cuando sea posible: Python en `tests/py/test_*.py` (se ejecutan como scripts), TypeScript en `tests/*.test.ts` (`pnpm test`, `pnpm typecheck`).
3. **Cambio pequeño** y una sola cosa por versión.
4. **Medir antes y después** si el cambio busca rendimiento o suavidad. Sin medida, no se afirma mejora.
5. **CHANGELOG:** entrada `dev.N` con causa y efecto. Lo no comprobado en el equipo: «sin confirmar».
6. **Commit pequeño en `dev`**, con mensaje claro. No subas zips ni `node_modules`.
7. **Instalar** (solo cuando toca probar): `scripts/package.sh --dev N`, `NO_RESTART=1 scripts/install.sh --dev`. Reiniciar `plugin_loader` recarga la interfaz de Steam: avisa y pide permiso antes. Nunca reinicies Steam, gamescope ni el equipo, ni toques `/usr` o `/etc`.
8. **Reunir datos:** `bash ~/homebrew/plugins/qam-rail-dev/informe.sh` y, para CPU de Steam, `python3 ~/homebrew/plugins/qam-rail-dev/steam-cpu.py 10`.
9. **Cerrar:** actualiza `HANDOFF.md` (estado y pendientes) y, si hubo una decisión, `docs/decisiones.md`.

## Honestidad
- Distingue siempre: probado en pruebas / probado en la Ally / sin confirmar.
- Si algo falla dos veces igual, para y diagnostica la causa; no repitas el mismo intento.
