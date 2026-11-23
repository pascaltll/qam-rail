# Cómo se trabaja en QAM Rail

## Ramas
| Rama | Para qué |
|---|---|
| `main` | Lo estable. Solo entra lo ya probado en `dev`. De aquí salen las etiquetas `vX.Y.Z` y las releases (canal **estable**). |
| `dev` | El trabajo diario. De aquí salen los zips de desarrollo (canal **dev**, no se publican). |

El CI (`.github/workflows/ci.yml`) corre en las dos ramas y en los pull requests: tsc, vitest, pruebas Python y de scripts, build y empaquetado dev.

## Día a día
```bash
git switch dev
# ... cambios ...
pnpm typecheck && pnpm test && pnpm build
bash scripts/package.sh --dev 5      # qam-rail-dev-X-dev.5.zip
./scripts/install.sh --dev           # instalar en el equipo de pruebas (queda activo; ./scripts/canal.sh estable vuelve)
git push origin dev
```

## Publicar una versión
1. En `dev`: subir la versión en `package.json` y `src/version.ts` (un test exige que coincidan) y anotar el `CHANGELOG.md`.
2. Probar el zip dev en el equipo.
3. Unir a `main` y etiquetar:
```bash
git switch main && git merge --no-ff dev && git push origin main
git tag vX.Y.Z && git push origin vX.Y.Z      # la Release publica zip + SHA256SUMS + scripts
git switch dev && git merge main              # dev sigue al día
```
4. Las instalaciones del canal estable ven la nueva versión en Más › Actualizaciones.

**Beta (opcional):** una etiqueta con guion (`v0.54.0-beta.1`) crea una *pre-release* y solo la ven quienes eligieron el canal Beta. Puede salir de `dev`. Las etiquetas sin guion (estables) solo se publican si están en `main`.

## Canales en el equipo
`qam-rail` (estable, se actualiza por GitHub) y `qam-rail-dev` (se actualiza con zips) conviven; solo uno dibuja el QAM. Ver `QAM-RAIL-ARQUITECTURA.md` §58 y `scripts/canal.sh`.
