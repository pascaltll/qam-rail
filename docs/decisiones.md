# Decisiones cerradas

Lo que ya se decidió y no se reabre sin un motivo nuevo (medición o fallo reproducido). Añade una línea con fecha al decidir algo.

- 2026-11: Repo `pascaltll/qam-rail`, trabajo en `dev`, versiones `0.54.0-dev.N`; cada una con entrada en `CHANGELOG.md`. La estable y la de desarrollo conviven (`qam-rail` y `qam-rail-dev`); `scripts/canal.sh estable` revierte.
- 2026-11: La grabadora/vigilante nunca guarda lo que el usuario escribe. Se desactiva con el archivo `vigilante-off`.
- 2026-11: Una traza por app abierta (15 min) en `trazas/`, máximo 25 archivos / 12 MB.
- 2026-11: Inventario de apps: Flatpak + AppImages (Gear Lever) + sistema; se excluyen juegos de Steam y Steam; se ocultan copias `.old/.bak/.tmp/.part`.
- 2026-11: El panel fantasma se vigila en la interfaz (`ghostWatch`): 4 comprobaciones malas seguidas cierran el panel.
- 2026-11: `ub-mode` (unclebob) solo como principios de calidad; su texto no se copia (sin licencia visible; el proyecto es GPL-3.0).
- 2026-11: Claude Code coordina y escribe; otros agentes solo leen (ver `AGENTS.md`).
- 2026-11: No se suben zips ni `node_modules` al repo. No se reinicia Steam/gamescope/equipo sin preguntar.
