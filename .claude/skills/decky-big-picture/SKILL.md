---
name: decky-big-picture
description: Índice del desarrollo para plugins de Decky en Steam Big Picture (Bazzite/ROG Ally): qué skill usar para entorno, desarrollo, navegación, pruebas, diseño, temas, rendimiento y depuración. Úsalo al empezar cualquier trabajo en este proyecto.
---

# Desarrollo en Big Picture: por dónde empezar

Lee primero `AGENTS.md` y `HANDOFF.md`. Luego carga solo el skill que toque:

| Necesito… | Skill |
|---|---|
| Entender el entorno (Decky, Bazzite, CEF, rutas, reinicios) | `decky-bazzite` |
| Flujo de cambio: prueba → CHANGELOG → versión → instalar | `programacion` |
| Reglas de mando, foco y gestos | `navegacion` |
| Ver y recorrer la interfaz por CDP, grafo de foco, abrir el QAM | `navegacion-big-picture` |
| Hacer o revisar una pantalla | `diseno` |
| Colores, tipografías, CSS Loader/Hooandee | `temas` |
| Escribir o juzgar pruebas | `pruebas` |
| Lentitud, CPU, tirones | `rendimiento` |
| Un fallo que no se entiende | `depuracion` |
| Refactor y calidad | `codigo-limpio` |

## Herramientas del repo (`scripts/`)
`captura.py` (ver el resultado) · `bp_nav.py` (foco, QAM, grafo) · `steam-cpu.py` (CPU por página) · `informe.sh` (todo en un archivo) · `canario.py` (¿siguen las piezas internas de Steam tras una actualización?) · `package.sh` / `install.sh` / `canal.sh`.

## Bucle de trabajo
1. `canario.py` si Steam o Decky se actualizaron. 2. Reproducir y medir (`depuracion`, `rendimiento`). 3. Cambio pequeño con prueba (`pruebas`). 4. Ver el resultado (`captura.py` + `revisor-visual`; `revisor-navegacion` para foco). 5. Registrar en `CHANGELOG.md` y `HANDOFF.md`.

## Lo que nunca cambia
Distingue siempre «probado en pruebas / probado en la Ally / sin confirmar». No registres lo que el usuario escribe. No reinicies Steam, gamescope ni el equipo, ni toques `/usr` o `/etc`, sin permiso. Agentes externos: solo lectura.
