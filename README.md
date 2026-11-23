# QAM Rail

> Plugin de Decky para Bazzite / Modo Juego (ROG Ally, Steam Deck). Experimental: probado sobre todo en una ROG Ally.

Convierte el QAM de Steam (Game Mode / Big Picture, Decky) en una **barra lateral de iconos** estilo
Android/Xiaomi. Plugin nuevo escrito desde cero (GPL-3.0); de Panel de Control (GPL-3.0) solo se usaron ideas y se usa por RPC.

## Qué hace
- Al abrir el QAM solo se ve la **columna de iconos** (las pestañas nativas de Steam siguen ahí, ninguna función se pierde).
- Mover la cruceta a otro icono abre su sección (ajustable: solo con A o Derecha).
- **B** dentro de la sección vuelve al riel; **B** en el riel cierra el QAM (como siempre).
- El icono de este plugin (cuadrícula) abre **Apps**: favoritas (X para fijar) y recientes, incluye atajos no-Steam.

## Instalar
1. Descarga `qam-rail-X.zip` y `SHA256SUMS` de [Releases](https://github.com/pascaltll/qam-rail/releases) y comprueba: `sha256sum -c SHA256SUMS --ignore-missing`.
2. En la consola:
```bash
unzip qam-rail-X.zip -d ~/homebrew/plugins/
sudo systemctl restart plugin_loader
```

### Actualizar
Con `scripts/install.sh` (cópialo a una carpeta tuya):
```bash
./install.sh --check            # ¿hay versión nueva?
./install.sh --latest           # baja la última estable de GitHub, verifica el SHA-256 e instala (con copia de seguridad)
./install.sh --latest --beta    # admite betas
./install.sh --version 0.51.1   # una versión concreta
./limpiar.sh                    # muestra qué zips viejos sobran; --aplicar los archiva; --borrar los elimina
```
Las apps de QAM se actualizan desde el propio QAM (Apps › «Actualizar a X»).

## Desarrollo
```bash
pnpm install && pnpm typecheck && pnpm test && pnpm build   # interfaz
python3 tests/py/test_apps.py; python3 tests/py/test_updates.py; python3 tests/py/test_desktop.py   # backend
bash scripts/package.sh                                      # qam-rail-X.zip + SHA256SUMS
```
Documentación de diseño: `QAM-RAIL-ARQUITECTURA.md`, `APPS-ESTANDAR.md` (estándar de apps de QAM), `APPS-STEAM.md`.
Licencia: GPL-3.0.

## Si algo sale mal
- Ajuste dentro de Apps → «Riel activado» (apagado = QAM normal).
- Desde terminal: `touch ~/homebrew/settings/qam-rail/DISABLE` y reiniciar `plugin_loader`.
- Diagnóstico (consola CEF de la pestaña de Decky): `window.__qamRail.diag()`.

## Estado de verificación
Ver `claude/qam-rail-ficha.md` en el proyecto. Resumen: lógica y compilación probadas aquí con un QAM simulado;
**nada probado todavía en Steam real**.
