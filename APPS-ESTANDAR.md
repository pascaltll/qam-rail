# Estándar de apps del QAM · integración de Forgeinator 3000 (propuesta v1, 23-11-2026)

Objetivo: que una app externa (Forgeinator, MiniTube, las siguientes) se **instale, se actualice, avise y se use** desde el QAM con el mismo nivel de calidad que el resto, sin tocar el código de QAM Rail para cada una.

Estado de lo que ya existe (leído en `py_modules/qam_apps.py`, `main.py apps_*`, `QamAppsCard.tsx`):
- Carpeta `~/homebrew/qam-apps/<id>/`, manifiesto `qam-app.json`, instalar desde `.zip` o carpeta, «Añadir carpeta» sin moverla, `install.sh` como usuario (máx. 10 min), `keep` para conservar datos, arte y atajo de Steam, acciones rápidas, desinstalar.
- **No existe todavía:** comprobar versiones en GitHub, instalar desde una release, verificar la descarga, volver atrás si falla, avisos de actualización, ni un lugar único de «Actualizaciones».

---

## 1. Tres clases de cosas en la sección Apps (y por qué no se mezclan)

| Clase | Quién la instala | Quién la actualiza | Cómo se abre |
|---|---|---|---|
| **App de QAM** (Forgeinator, MiniTube) | QAM Rail (este estándar) | QAM Rail, desde GitHub Releases | Lanza su `launch` / atajo de Steam |
| **Plugin de Decky** | Decky (tienda) | Decky; QAM Rail solo avisa y pide confirmar | Columna lateral del panel |
| **Atajo de Steam** (juego no‑Steam suelto) | Steam | — | `RunGame` |

Regla: QAM Rail **no reinventa** lo que Decky ya hace; solo une los avisos en un sitio.

---

## 2. Manifiesto `qam-app.json` · esquema 1

```json
{
  "schema": 1,
  "id": "forgeinator",
  "name": "Forgeinator 3000",
  "version": "3.12",
  "group": "Juegos",
  "description": "Forja ports sueltos en juegos jugables.",
  "launch": "bin/forgeinator",
  "launch_options": "",
  "install": "install.sh",
  "uninstall": "uninstall.sh",
  "data_dirs": ["~/.local/share/forgeinator", "~/.config/forgeinator"],
  "keep": [],
  "update": {
    "provider": "github-release",
    "repo": "pascaltll/Forgeinator",
    "asset": "forgeinator-*.zip",
    "checksum": "SHA256SUMS",
    "channel": "stable"
  },
  "status": "bin/forgeinator --qam-status",
  "actions": [
    { "label": "Abrir", "args": "" },
    { "label": "Buscar juegos", "args": "--qam-search" },
    { "label": "Jugar al último", "args": "--qam-last" }
  ],
  "art": { "capsule": "assets/capsule_portrait_600x900.png", "header": "assets/header_460x215.png",
           "hero": "assets/hero_1920x620.png", "logo": "assets/logo_1280x720.png", "icon": "assets/icon_512.png" },
  "min_qam_rail": "0.50.0"
}
```

Campos nuevos respecto a hoy: `schema`, `group`, `description`, `uninstall`, `data_dirs`, `update`, `status`, `min_qam_rail`.
Todo lo que falte se deduce como hasta ahora (compatibilidad con MiniTube sin tocarlo).

**Regla de datos (la más importante).** El programa se puede **borrar y sustituir entero** en cada actualización. Todo lo del usuario (ajustes, descargas, biblioteca, claves, registros) vive **fuera**, en las rutas XDG de `data_dirs`. `keep` queda solo para apps antiguas. QAM Rail nunca borra `data_dirs`, ni al desinstalar (pregunta aparte: «¿Borrar también tus datos?», por defecto No).

---

## 3. Instalar

Tres vías, una sola tubería:

1. **Desde GitHub** (principal): «Instalar app › Desde GitHub» con `usuario/repo` (o el botón directo de Forgeinator). Lee la última release, elige el asset por el patrón, descarga.
2. **Desde un `.zip`** (selector de archivos o los encontrados en carpetas): como hoy.
3. **Carpeta propia** (desarrollo): «En su sitio», sin mover.

Tubería (igual para instalar y actualizar), con un paso atrás en cada fallo:

| Paso | Qué ocurre | Si falla |
|---|---|---|
| 1. Descargar | Solo `https://github.com/<repo>/releases/download/…`, límite de tamaño, a `qam-apps/.staging/<id>/` | Se borra lo descargado; la app instalada no se toca |
| 2. Verificar | SHA‑256 contra el asset `SHA256SUMS` de la release | Se rechaza; mensaje «la descarga no coincide» |
| 3. Preparar | Descomprimir con la protección contra rutas peligrosas que ya existe (`safe_members`) | Se borra el staging |
| 4. Cambiar | `<id>/` → `<id>.previous/`; staging → `<id>/` (renombrado atómico) | Se restaura `.previous` |
| 5. `install.sh` | Como usuario, máx. 10 min, registro en `qam-install.log` | Se restaura `.previous` y se anota |
| 6. Probar | Si el manifiesto trae `status`, se ejecuta una vez: debe responder JSON | Se restaura `.previous`; la versión queda marcada como «mala» y no se reintenta sola |
| 7. Cerrar | Se conserva `.previous` hasta la **siguiente** actualización (volver atrás con un toque) | — |

Seguridad: nunca se ejecuta nada de lo descargado antes de verificarlo; `install.sh` es lo único que corre y lo escribe el autor de la app, así que la **primera** instalación de una app nueva pide confirmar («Esta app ejecuta su propio instalador»). Sin `sudo`. Sin tokens en el registro.

---

## 4. Actualizaciones

- **Dónde se mira:** `GET https://api.github.com/repos/<repo>/releases/latest` (y `/releases` si el canal es `beta`). Sin cuenta: 60 consultas por hora y equipo; se usa `If-None-Match` con el ETag guardado (una respuesta 304 no gasta cuota [H]).
- **Cuándo:** al abrir el panel si pasaron más de **6 h** desde la última mirada, y un botón «Buscar ahora». Nunca con el panel cerrado ni en segundo plano continuo (norma de 0.49.4: nada de sondeos con el panel cerrado).
- **Comparación:** `version` del manifiesto instalado frente a la etiqueta de la release (`v3.13` → `3.13`), numérica por partes. Una versión marcada como mala no se ofrece.
- **Acción:** «Actualizar a 3.13» → tubería del apartado 3. Al terminar: «Forgeinator 3.13 instalada · Volver a 3.12».
- **Notas de la versión:** el cuerpo de la release (recortado a 600 caracteres) en la ficha, sin enlaces ejecutables.
- **Sin red / GitHub 403:** se dice una vez («No se pudo mirar GitHub») y se reintenta a las 6 h, sin tarjeta roja permanente.
- **La app también puede actualizarse sola** (plan E2 de Forgeinator): si lo hace, debe escribir su nueva versión en `status`; QAM Rail la lee y no ofrece algo ya instalado.

---

## 5. Avisos

Un solo modelo, tres lugares, ninguno insistente.

| Origen | Qué avisa |
|---|---|
| QAM Rail | Hay versión nueva de una app de QAM; una instalación falló; una actualización se aplicó |
| Decky | Plugins con actualización pendiente y versión nueva de Decky (ya lo lee `deckyStore`) |
| La app (`status`) | Hasta 3 avisos propios: `{id, titulo, texto, nivel: info|aviso, accion?}` (p. ej. «12 juegos con versión nueva») |

Dónde se ven:
1. **Punto con número** en el icono «Apps» del riel (suma de actualizaciones + avisos de apps).
2. **Tarjeta «Novedades»** arriba de Apps, solo si hay algo; cada fila con su botón y un «Ahora no» (se oculta esa versión 7 días).
3. **Una fila** en Inicio («2 actualizaciones») que lleva a la tarjeta anterior. Sin toasts propios; solo si el usuario lo activa, un aviso de Steam al detectar una versión nueva (una vez por versión).

Reglas: nunca más de 3 avisos de una app; un aviso descartado no vuelve hasta que cambie la versión; ningún aviso bloquea el mando.

### Contrato de `status`
`<launch> --qam-status` imprime **una línea JSON** en menos de 2 s y sale con 0:
```json
{"version":"3.12","running":false,"notices":[{"id":"updates","title":"12 juegos con versión nueva","level":"info","action":"--qam-updates"}],"last_played":"BT4 Tag Team"}
```
Sin `status`, la ficha muestra solo versión y estado instalada/ejecutándose.

---

## 6. Rediseño de la sección Apps

Hoy: dos fichas planas (Apps | Plugins), una rejilla de iconos, una tarjeta «Apps de QAM» con todo apilado y «Instalar» plegado.
Propuesta: **tres segmentos** (una sola parada del mando, ←/→ cambian) y fichas con jerarquía.

```
┌ Apps ──────────────────────────────────────┐
│ [ Mis apps ●2 ] [ Plugins ●1 ] [ Steam ]    │  ← Segments
│ ┌ Novedades ───────────────────────────┐  │  ← solo si hay algo
│ │ Forgeinator 3.13 · notas…  [Actualizar]│  │
│ │ 1 plugin con versión nueva   [Ver]     │  │
│ └───────────────────────────────────────┘  │
│ ┌ Forgeinator 3000        v3.12 ────────┐  │
│ │ [icono] Juegos · jugaste hace 2 h      │  │
│ │ [  Abrir  ] [Buscar juegos] [  ⋯  ]    │  │  ← fila de acciones
│ └───────────────────────────────────────┘  │
│ ┌ MiniTube              v0.51.1 ────────┐  │
│ │ [  Abrir  ] [Mini] [⏯]    [  ⋯  ]      │  │
│ └───────────────────────────────────────┘  │
│ [ + Instalar app ]                          │
└─────────────────────────────────────────────┘
```

- **Mis apps:** una ficha por app, agrupadas por `group` (Juegos, Multimedia, Herramientas). Con más de 6 apps, los grupos se pliegan.
- **Plugins:** la rejilla de iconos de hoy + la tarjeta de Decky; los que tienen actualización van arriba con punto.
- **Steam:** los atajos de la biblioteca (lo que hoy hace `AppGrid`), con Y = fijar.
- **«⋯» (o Y sobre la ficha):** Añadir a Steam, Volver a la versión anterior, Ver notas, Desinstalar (con «¿Borrar también tus datos?»).
- **Instalar app** abre una hoja con las tres vías (GitHub · .zip · carpeta) y una línea de seguridad.
- Estados de ficha, siempre visibles y con el mismo orden: *Instalada · Actualización · Instalando (barra) · Error (con «Ver registro») · En ejecución*.

### Mando (obligatorio, con prueba automática)
- Cada ficha = **2 filas**: (1) la ficha entera, A abre; (2) las acciones como chips sin ninguna barra en la fila (regla de la auditoría).
- Y = menú «⋯»; B vuelve al riel; LB/RB cambian de sección como en el resto.
- Ningún control solo por tacto; todo ≥ 40 px.

---

## 7. Lista de calidad que debe cumplir toda app de QAM

**Lo de la app (Forgeinator)**
- [ ] `qam-app.json` esquema 1, con `id` estable (no cambia nunca) y `version` igual a la etiqueta de la release.
- [ ] Release en GitHub con el `.zip`, `SHA256SUMS` y notas en español.
- [ ] El programa **no escribe dentro de su carpeta**; datos en XDG; migración desde la ruta vieja con copia y sin borrar.
- [ ] `--qam-status` (JSON en < 2 s) y las acciones rápidas que declara.
- [ ] `install.sh` idempotente, sin `sudo`, sin red obligatoria, que sale con código ≠ 0 si falla.
- [ ] `uninstall.sh` opcional; nunca toca `data_dirs`.
- [ ] Arte completo (cápsula, cabecera, hero, logo, icono) para el atajo de Steam.
- [ ] Mando completo: A/B/Y, sin trampas de foco; arrancar bien dentro de Game Mode y con el panel cerrado al lanzar.
- [ ] Informes de error sin secretos (plan E3).
- [ ] Licencia (GPL‑3.0) y `THIRD_PARTY.md`.

**Lo de QAM Rail (lo que hay que construir)**
- [ ] Tubería de instalación con verificación y vuelta atrás (apartado 3).
- [ ] Comprobación en GitHub con ETag y 6 h de margen (apartado 4).
- [ ] Modelo de avisos y punto en el riel (apartado 5).
- [ ] Rediseño de Apps (apartado 6) dentro del presupuesto: abrir ≤ 120 ms y cambiar de segmento ≤ 35 ms con ≥ 9 W.
- [ ] Pruebas: lógica pura (comparar versiones, elegir asset, verificar suma, avisos) + auditoría de mando de la sección + una prueba de humo con una release simulada.
- [ ] Cada fallo del backend se anota en el informe de diagnóstico, sección `apps`.

---

## 8. Orden de trabajo propuesto

| Versión | Contenido |
|---|---|
| 0.50 | Esquema 1 del manifiesto (lectura con valores por defecto) + tubería con staging, verificación y vuelta atrás, sobre `.zip` local. Pruebas de la tubería. |
| 0.51 | Comprobar GitHub (ETag, 6 h) + «Instalar desde GitHub» + «Actualizar a X» + «Volver a X». Prueba con una release simulada. |
| 0.52 | Rediseño de Apps (segmentos, fichas, «⋯», Novedades) + punto en el riel + fila en Inicio. |
| 0.53 | `--qam-status` y avisos de la app; unir plugins de Decky en «Novedades»; revisión de mando de toda la sección. |

Forgeinator, en paralelo: E2 (datos fuera del programa, `qam-app.json` esquema 1, `--qam-status`) y la primera release publicada a mano en GitHub.

---

## 9. Decisiones abiertas

1. **Dónde vive Forgeinator:** el estudio del 22‑11 propuso quedarse en `~/Games/recomp-hub` con «Añadir carpeta»; el plan E2 lo pasa a instalar desde releases con datos en XDG. Este estándar supone lo segundo. ¿Se mantiene la carpeta vieja como migración única?
2. **Aviso de Steam** al haber versión nueva: ¿activado por defecto o solo el punto del riel?
3. **Canal beta:** ¿lo quieres desde el principio o solo `stable`?
4. **Verificación:** SHA‑256 de la release (lo propuesto) o además firma (minisign). La firma añade trabajo para el autor de cada app.
5. **¿Pestaña «Steam» dentro de Apps** o los atajos siguen mezclados con «Mis apps»?

## Decisiones de Carlos (23‑11)
1. **Dónde vive:** Forgeinator se instala como app de QAM en `~/homebrew/qam-apps/`.
2. **Avisos de actualización:** solo dentro del QAM (punto en el riel, «Novedades», fila en Inicio); sin toast de Steam.
3. **Canales:** probablemente estable + beta (sin decidir).
4. **Verificación:** SHA‑256 como mínimo; firma por decidir (ver ventajas/desventajas abajo).
5. **Pestaña «Steam»:** sí. Reúne navegadores y apps que se agregan a Steam, para que en la biblioteca de Steam solo queden los juegos.

### Firma vs. solo SHA‑256
- **SHA‑256 (SHA256SUMS en el release):** detecta descargas corruptas o incompletas. No protege si alguien controla el release (el hash viaja en el mismo sitio). Cero gestión de claves.
- **Firma (minisign/Ed25519 o Sigstore):** demuestra que el autor firmó el archivo; un release manipulado en GitHub no pasa. Requiere guardar la clave privada, que el QAM lleve la pública (rotarla = actualizar el QAM) y una dependencia mínima (verificación Ed25519 en Python, sin instalar nada).
- **Recomendación:** empezar con SHA‑256 (0.50–0.51) y dejar el campo `signature` opcional en el manifiesto; añadir minisign cuando haya otros usuarios o apps de terceros.

## Estado (23‑11, v0.50.0)
Hecho en 0.50: manifiesto esquema 1 con comprobación (`check_manifest`), preparación aparte con SHA‑256, confirmación de la primera instalación, cambio atómico con `.previous`, `install.sh` con código de salida, prueba de `status`, vuelta atrás automática y manual, versión «mala», desinstalación que respeta `data_dirs`. Detalle en `claude/qam-rail-arquitectura.md` §52. Pestaña «Steam» (apps de escritorio): `claude/qam-apps-steam.md`.
Siguiente: 0.51 (GitHub: ETag, 6 h, instalar/actualizar desde release, canal estable/beta).
