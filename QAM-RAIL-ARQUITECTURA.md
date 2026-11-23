# QAM Rail — plan detallado y arquitectura

Estado: núcleo v0.13.0 + módulo Amigos v0.1.1 (2026-11-05). Los apartados 4.x describen el núcleo hasta 0.9.0; los cambios de 0.9.1–0.11.0 están en el apartado 11 y los de 0.12.0–0.13.0 en el 12 (que manda sobre lo anterior si se contradicen). Autor: Carlos. Plataforma de prueba: Bazzite (Game Mode/Big Picture) con Decky Loader y el plugin Panel de Control (Hooandee, GPL-3.0).

**Leyenda de fiabilidad** usada en todo el documento:
- **[V]** verificado en el equipo de Carlos (captura, consola o salida pegada).
- **[H]** hipótesis: sale de tipos de `@decky/ui` 4.16.5, del código de Panel de Control o de memoria; no comprobado en el equipo.
- **[D]** solo diseño: la interfaz existe pero con datos de ejemplo.

---

## 1. Objetivo

Sustituir el Quick Access Menu (QAM) de Steam por un lanzador propio con estilo Android/Xiaomi:

1. Columna de iconos (riel) pegada al borde derecho; la sección elegida se abre a su izquierda.
2. Apertura más rápida y sin tirones que el QAM nativo.
3. Las funciones que más se usan primero (potencia/TDP, brillo, volumen, conexiones), el resto ordenado por secciones.
4. Lanzador de apps de Steam Big Picture (MiniTube, Recomp Hub) en lugar de "juegos recientes".
5. El QAM original **no aparece nunca** salvo que se pida desde el propio lanzador.
6. Modular: cada tarjeta/sección puede vivir en su propio zip y actualizarse por separado.

Restricciones: plugin Decky nuevo (no se copia código de Panel de Control; solo se llaman sus métodos), fácil de revertir, probado de forma iterativa vía depurador CEF.

---

## 2. Hechos medidos en el equipo

| Dato | Valor | Estado |
|---|---|---|
| Ventana del QAM de Steam | `innerWidth` 855 × 429 (pantalla 901 × 507) | [V] |
| `documentElement.clientWidth` en esa ventana | 1 (no fiable; usar `window.innerWidth`) | [V] |
| Columna de pestañas nativa / contenido | x 0–51 px / x 51–854 px | [V] |
| Paneles inactivos del QAM nativo | Siguen montados (Amigos ≈ 1723 de ≈ 2250 nodos) | [V] |
| Montaje por apertura | No es por apertura (`nodes_added` 1 en aperturas posteriores) | [V] |
| Apertura → 2.º frame | 12–85 ms | [V] |
| Tareas largas tras abrir | 56–241 ms, ≈ 1 s después de abrir (muestras pequeñas; causa sin determinar) | [V] |
| Lectura real de amigos | `friendStore.allFriends` = 120 elementos; 12 en línea | [V] |
| Claves visibles de `friendStore` | `m_CMInterface, m_FriendsUIFriendStore, m_ownedGamesCache, m_Storage, k_strPlayerCacheKey, m_mapOwnedGamesCacheErrors, m_mapPlayerCache` | [V] |
| Botón QAM → panel propio con el piloto | Abre el lanzador y el QAM antiguo ya no aparece en la mayoría de pruebas tras reiniciar | [V] (por reporte del usuario) |
| Alineación del panel al borde derecho | Sigue unos ≈ 15 % del ancho corrido a la izquierda | [V] el fallo; causa [H] |

---

## 3. Arquitectura general

```
┌──────────────────────────── SharedJSContext (aquí corren los plugins de Decky) ────────────────────────────┐
│                                                                                                           │
│  qam-rail (núcleo)                                         qam-rail-friends (módulo, otro zip)            │
│  ├─ index.tsx        definePlugin, window.__qamRail          └─ definePlugin → registry.register(card)      │
│  ├─ manager.ts       busca la ventana del QAM, arranca/para                                               │
│  │                   piloto y (opcional) riel antiguo                                                     │
│  ├─ pilot.tsx        intercepta el QAM y muestra el panel   window.__qamRailModules  (registry.ts)        │
│  ├─ menuPatch.ts     envuelve MenuStore.Open*/Toggle*        ├─ cards: Map<id, CardSpec>                  │
│  ├─ Qam.tsx          riel + secciones + navegación mando     ├─ subs: Set<() => void>                     │
│  ├─ QamGame/Social/Bench.tsx  secciones                      └─ kit  (piezas visuales para módulos)       │
│  ├─ ui.tsx           piezas visuales + dockRight                                                          │
│  ├─ panelBridge.ts   llama al backend de Panel de Control                                                 │
│  └─ bench.ts         orquesta la prueba de rendimiento                                                    │
└───────────────┬──────────────────────────────────────────────────────┬────────────────────────────────────┘
                │ callable (WebSocket de Decky)                         │ DeckyBackend.call("loader/call_plugin_method", "Panel de Control", …) [H]
                ▼                                                       ▼
   Backend Python de qam-rail                              Backend Python de Panel de Control (Hooandee)
   main.py + py_modules/qam_bench.py                       get_tdp_state / set_tdp_watts / …
   ajustes JSON, prueba de rendimiento

      Ventana "QuickAccess_uid2" (la del QAM nativo) ← solo se observa (visibilitychange) y se oculta (clase html.qr-own)
```

Principios:
- **Un solo punto de entrada** para abrir el lanzador (`pilot.openPanel`) y **un solo punto de salida** al QAM de Steam (`pilot.openNative(tab?)`).
- **Degradación segura**: cualquier fallo del piloto lo apaga y el QAM de Steam funciona como siempre.
- **El estado vive donde se usa**: ajustes en `~/homebrew/settings/qam-rail/`, nada de estado oculto en Steam.
- **Datos de Steam solo por vías defensivas**: todo acceso a objetos internos de Steam va con `try/catch` y valores por defecto.

---

## 4. Componentes del núcleo (v0.9.0)

### 4.1 Arranque y ventana del QAM
- `index.tsx`: `definePlugin`; carga ajustes (`get_settings`), crea el `manager` y publica la API de depuración `window.__qamRail`.
- `manager.ts`: localiza la ventana del QAM con reintentos (`findQamTree` → `qamDocumentOf`), instala siempre la sonda de rendimiento y, según ajustes, arranca el piloto (`enabled && own_qam`) o el riel antiguo (`enabled && !own_qam`). Un fallo en `startPilot` se registra y no tumba el plugin (`__qamRailPilotError`).
- `qamDoc.ts`: el árbol de navegación cuyo id empieza por `QuickAccess` identifica la ventana del QAM [V].

### 4.2 Piloto: sustituir el QAM (`pilot.tsx`, `menuPatch.ts`, `pilotLogic.ts`)
Dos vías, en este orden:

1. **Intercepción previa [H]** (`menuPatch.ts`): se envuelven `OpenQuickAccessMenu`, `OpenSideMenu(2)` y `ToggleSideMenu(2)` de cada `MenuStore` encontrado (`SteamUIStore.GetFocusedWindowInstance()`, `Router.WindowStore.GamepadUIMainWindowInstance`, `SteamUIWindows[]`). Si `pass()` es falso se llama a `handle()` en lugar de abrir el QAM de Steam, de modo que su ventana nunca se muestra. Las originales se guardan en un `WeakMap` (el objeto de Steam puede estar sellado) y se restauran en `dispose()`. Se ignoran llamadas repetidas en < 400 ms (un pulso puede llamar varias veces).
2. **Respaldo por visibilidad [V]**: se escucha `visibilitychange` del documento del QAM. Si el QAM nativo llega a abrirse y no estamos en periodo de gracia, se oculta al instante (`html.qr-own { visibility: hidden }`), se llama a `Navigation.CloseSideMenus()` y se abre el panel propio.

Decisión pura (`pilotLogic.decide`) con tests: `ignore | intercept | close`.
- Con el panel abierto, pulsar el botón del QAM **cierra el panel** (no abre el nativo).
- `pass()` es verdadero si el piloto está roto o durante `BYPASS_MS` (4 s) tras `openNative`.

**Única salida al QAM original**: `openNative(tab?)` → fija el periodo de gracia → quita la ocultación → cierra el panel → `Navigation.OpenQuickAccessMenu(tab)` (tras 60 ms).

**Vías de vuelta atrás**: (1) ficha "Volver al QAM anterior" en Más; (2) ajuste `own_qam` en el menú del plugin; (3) `touch ~/homebrew/settings/qam-rail/DISABLE` y reiniciar `plugin_loader` (apaga todo).

### 4.3 Panel propio (`Qam.tsx`)
- Se muestra con `showModal(<PilotPanel/>)` dentro de `ModalRoot` (da el manejo de B/cierre de Steam).
- `ui.stripModalChrome`: quita fondo, borde, sombra, `transform`, `filter`, `contain` y `overflow` de todos los ancestros hasta `body` (estilos en línea con `!important`), para que solo se vea la tarjeta propia. **No se usa `position: fixed`**: en v0.3.3 hizo desaparecer el panel [V].
- `ui.dockRight`: pega el panel al borde derecho con `transform: translate(dx, dy)` medido con `getBoundingClientRect` y una segunda medida que corrige un posible factor de escala. Se repite a 60/200/600/1500 ms y con un `ResizeObserver`. Deja sus medidas en `window.__qamRailDock` y las muestra en una línea gris sobre el panel (`DEBUG = true`).
- **Problema abierto**: el panel queda ≈ 100–135 px a la izquierda del borde. Hipótesis [H]: el borde objetivo se mide en un sistema de coordenadas distinto (zoom de la interfaz de Steam). En v0.9.0 el objetivo es `max(innerWidth, body.right, html.right)`; depende de la próxima captura con la línea de diagnóstico.

### 4.4 Riel y secciones
Riel de 64 px con 8 secciones; la sección activa se abre a la izquierda.

| Sección | Contenido | Estado |
|---|---|---|
| Inicio | TDP + perfiles, brillo, volumen, Bluetooth, Wi‑Fi, HUD, 4 apps | TDP/brillo/volumen/BT reales [H]; Wi‑Fi/HUD/apps [D] |
| Este juego | juego en ejecución (`SteamUIStore.MainRunningApp`), potencia por juego (Panel, scope `game`), OLED, refresco dinámico, refresco, escalado, FPS, HUD | potencia [H]; resto [D] |
| Energía | TDP, Auto‑TDP, refuerzo CPU, reloj GPU, límite de carga, **prueba de rendimiento**, atajos | TDP y prueba reales [H]; resto [D] |
| Pantalla y sonido | brillo, volumen, modo noche, refresco, atajos a Panel | brillo/volumen [H]; resto [D] |
| Conexiones | Bluetooth, Wi‑Fi, modo avión, red, mando, atajos | BT [H]; resto [D] |
| Todas las apps | cuadrícula de 8 apps de ejemplo | [D] |
| Social | Amigos / Avisos / Voz / Música | **Amigos reales por el módulo [V]**; resto [D] |
| Más | atajos a Panel, Decky, Ayuda, módulos instalados, volver al QAM anterior, cerrar | atajos [H] |

### 4.5 Navegación con el mando (v0.9.0)
Modelo de dos zonas, `zone: "rail" | "body"`:

| Entrada | Efecto |
|---|---|
| ↑ / ↓ en el riel | Cambia de icono y la sección se abre al recibir el foco |
| ← en el riel, o **A** sobre un icono | Entra en la sección (primer elemento marcado `data-qr`) |
| Dentro de la sección | ↑ ↓ ← → por geometría de Steam; filas (`Row`) navegan en horizontal |
| **B** dentro de la sección | Vuelve al icono activo del riel (no cierra) |
| **B** en el riel | Cierra el panel (`ModalRoot.onCancel`) |
| → desde el contenido hacia el riel | Si cae en un icono distinto del activo, se redirige al activo (evita cambiar de sección sin querer) |
| Botón QAM con el panel abierto | Cierra el panel |

Marcadores: todo elemento interactivo lleva `data-qr="item"` (también los de módulos). `preferredFocus` en el icono Inicio.
Pendiente de verificar en el equipo [H]: que `stopPropagation` en `onCancel` impida que `ModalRoot` cierre el panel, y que `focus()` DOM mueva el foco de gamepad de Steam.

### 4.6 Controles propios (`ui.tsx`)
`XSlider` (←/→ cambian el valor en `step`, sin animación propia), `Chip`, `Row`, `Icon`, `cardStyle`, `COLORS`, `colorFor`. Brillo: se ignora el eco de `RegisterForBrightnessChanges` durante 400 ms y se limita a un envío cada 60 ms (arregla el salto del deslizador).

### 4.7 Potencia por Panel de Control (`panelBridge.ts`)
No se copia su código: se llaman sus métodos existentes. Vías probadas en orden y recordada la que funcione [H]: `DeckyBackend.call("loader/call_plugin_method", "Panel de Control", método, …args)` (lista de argumentos), la misma con objeto, y `DeckyPluginLoader.callPluginMethod`. Métodos usados: `get_tdp_state` (límites, `watts`, `applied_w`, `presets`) y `set_tdp_watts(watts, scope, appid, context_appid)` con `scope` `global` o `game`. Si Panel no está instalado, la tarjeta lo dice y todo lo demás sigue funcionando. Diagnóstico: `await __qamRail.tdp()`.

### 4.8 Prueba de rendimiento por potencia (`bench.ts`, `QamBench.tsx`, `py_modules/qam_bench.py`)
- Frontend: `pickLevels(min, max, 5)` → por cada nivel: `writeTdp(w)` (Panel), espera 3 s, `bench_level(seconds)`; al final restaura la potencia original (en `finally`) y guarda el resultado con `bench_save` en `~/homebrew/settings/qam-rail/bench/bench-AAAAMMDD-HHMMSS.json`. Cancelable.
- Backend: `qam_bench.run_level(seconds)` lanza N procesos Python (N = núcleos) haciendo SHA‑256 en bucle; `score` = hashes/s totales. Cada 0,5 s muestrea: consumo de batería (`power_now` o `current_now × voltage_now`), frecuencia media de CPU (`scaling_cur_freq`), frecuencia de GPU (`hwmon*/freq1_input`) y temperatura máxima (`hwmon*/temp*_input`).
- Resultado mostrado: rendimiento relativo al mejor nivel, puntos/W (usa el consumo medido o, si no hay, el TDP pedido) y temperatura. La mejor eficiencia sale en negrita.
- **Límites**: solo CPU, no mide GPU ni FPS de juegos (el plugin no puede leerlos). Sin cargador, la medida de consumo mezcla la carga de la batería. Probado el backend aquí; los sensores solo existen en el equipo real.

### 4.9 Ajustes (`main.py`, `backend.ts`)
`settings.json`: `{enabled, open_on, favorites, own_qam}`. Archivos de control en `~/homebrew/settings/qam-rail/`:
- `OWNQAM`: fuerza `own_qam = true`.
- `DISABLE`: fuerza `enabled = false` (apaga riel y piloto).

---

## 5. Sistema de módulos

**Objetivo**: reemplazar tarjetas/secciones sin actualizar el proyecto entero.

**Registro** (`registry.ts`, copiado en cada módulo; `apiVersion = 1`): `window.__qamRailModules = { apiVersion, cards, subs, kit, register(card) }`. Lo crea de forma perezosa quien cargue primero; el orden de carga da igual. `register` devuelve la función de baja.

```ts
interface CardSpec {
  id: string; name: string; version: string;
  mode: "replace" | "append";                 // sustituye la sección o se añade al final
  section: "home"|"game"|"energy"|"display"|"connect"|"apps"|"social"|"more";
  Component: ComponentType<CardProps>;
}
interface CardProps {
  log(m: string): void;
  tap(text: string): void;                    // aviso corto
  openNative(tab?: number): void;             // única vía al QAM de Steam
  kit: Record<string, unknown>;               // Chip, Row, Icon, XSlider, COLORS, cardStyle, colorFor, Focusable…
}
```

**Ciclo de vida**: el módulo es un plugin de Decky normal (`definePlugin`); al cargarse registra su tarjeta y el núcleo se re-renderiza (suscripción). En `onDismount` se da de baja y la sección vuelve a mostrar el diseño del núcleo.
**Compatibilidad**: el módulo comprueba `apiVersion`; si no coincide, no se registra.
**Reglas para módulos**: usar el `kit` del núcleo (no duplicar estilos), marcar lo interactivo con `data-qr="item"`, no abrir el QAM de Steam por su cuenta, no lanzar excepciones (se envuelve cada render).

**Módulo Amigos (qam-rail-friends 0.1.1)** [V lectura de datos]:
- Lee `friendStore.allFriends` cada 5 s (`persona.m_strPlayerName`, `m_ePersonaState`, `m_strGameName`, `steamid.ConvertTo64BitString()`).
- Estados: Jugando / En línea / Ausente / Desconectado. Orden: jugando, en línea, ausente, desconectado, luego alfabético.
- Filtro En línea / Todos, tope de 30 filas con "Ver más". Si la lectura falla, usa datos de ejemplo y lo indica.
- Al pulsar un amigo intenta `Navigation.NavigateToChat(steamid64)` [H].
- Diagnóstico: `__qamRailFriends.probe()`.

**Módulos candidatos** (orden sugerido): Avisos (notificaciones), Voz, Música/banda sonora, Apps (atajos no‑Steam reales), Este juego (perfil por juego), Pantalla (colores/OLED/HDR), Sonido (ecualizador), HUD.

---

## 6. Qué se puede leer o controlar hoy

| Función | Vía | Estado |
|---|---|---|
| Brillo | `SteamClient.System.Display.SetBrightness` / `RegisterForBrightnessChanges` | [H] funciona (se ve en la captura el valor 81 %) |
| Volumen | `SteamClient.System.Audio.GetDevices` / `SetDeviceVolume(id, 1, v)` | [H] |
| Bluetooth | `SteamClient.System.Bluetooth.SetEnabled` / `RegisterForStateChanges` | [H] |
| TDP global y por juego | backend de Panel de Control | [H] (se leen 7/15/25 W y límites) |
| Juego en ejecución | `SteamUIStore.MainRunningApp` | [H] |
| Lista de amigos | `friendStore.allFriends` | [V] |
| Lanzar app | `SteamClient.Apps.RunGame(gameid, "", -1, 100)` | [H] (código listo; hoy las apps son de ejemplo) |
| Abrir pestaña del QAM nativo | `Navigation.OpenQuickAccessMenu(tab)` | [H] |
| Abrir pestaña de Panel de Control | `OpenQuickAccessMenu(5260355)` (id de su código) | [H] |
| Refresco, escalado, límite de FPS de Steam | `SteamClient.System.Perf` usa mensajes protobuf en `ArrayBuffer` | **no soportado** aún |
| Notificaciones | `SteamClient.ClientNotifications` entrega `ArrayBuffer` | **no soportado** aún |
| Wi‑Fi | sin API clara en `@decky/ui` | **no soportado** aún |

`QuickAccessTab`: Notifications 0, RemotePlay 1, VoiceChat 2, Friends 3, Settings 4, Perf 5, Help 6, Soundtrack 7, VRBatteries 8, Decky 999.

---

## 7. Instalación y operación

Estructura de un zip: una carpeta con el nombre del plugin (`qam-rail/` o `qam-rail-friends/`) con `plugin.json`, `package.json`, `main.py`, `dist/index.js` (y `py_modules/` en el núcleo).

`install.sh` (junto a los zips):
```
bash install.sh qam-rail-0.9.0.zip qam-rail-friends-0.1.1.zip   # varios a la vez
bash install.sh 0.9.0                                           # atajo para qam-rail
bash install.sh qam-rail-friends 0.1.1                          # <nombre> <versión>
bash install.sh                                                 # SOLO el qam-rail-N.zip más reciente (no instala módulos)
```
Hace copia de seguridad en `backups/`, copia sobre la carpeta instalada y reinicia `plugin_loader` una vez. Los ajustes no se tocan.

**Diagnóstico** (consola de SharedJSContext; en la consola hay que escribir `allow pasting` la primera vez):
| Comando | Para qué |
|---|---|
| `JSON.stringify(__qamRail.patch())` | ¿se interceptó el botón? (`stores`, `patched`, `errors`) |
| `__qamRail.pilotError()` | error de arranque del piloto |
| `JSON.stringify(__qamRail.dock())` | medidas de alineación |
| `JSON.stringify(__qamRail.modalDom())` | cadena de ancestros del panel |
| `await __qamRail.tdp()` | estado de Panel y vía de llamada usada |
| `JSON.stringify(__qamRail.apps("tube\|recomp"))` | apps que ve el lanzador |
| `JSON.stringify(__qamRailFriends.probe())` | qué expone `friendStore` |
| `__qamRail.summary()` / `runs()` | rendimiento de apertura del QAM nativo (sonda) |

**Volver atrás**: reinstalar el zip anterior (`bash install.sh qam-rail-0.8.0.zip`), o `touch ~/homebrew/settings/qam-rail/DISABLE` y reiniciar.

---

## 8. Pruebas

Vitest + happy-dom: 33 pruebas (`apps`, `rail`, `pilotLogic`, `bench`). Cubren lógica pura (decisión del piloto, ordenación de apps, geometría de inversión con las cifras reales 855 / 51 / 803, niveles y resumen de la prueba). **No cubren** nada que dependa de Steam (menús, foco de gamepad, `friendStore`); esas comprobaciones son manuales con las órdenes de la sección 7.

---

## 9. Riesgos y deuda técnica

| Riesgo | Efecto | Mitigación |
|---|---|---|
| Objetos internos de Steam cambian con una actualización | el piloto deja de interceptar o `friendStore` cambia de forma | todo defensivo; el respaldo por visibilidad; datos de ejemplo si falla la lectura |
| Ruta `loader/call_plugin_method` incorrecta [H] | no hay TDP desde el lanzador | 3 vías probadas; mensaje claro; `__qamRail.tdp()` |
| Alineación derecha sin resolver | estética, no funcionalidad | medidas en pantalla; ajuste con la próxima captura |
| Panel de Control y este plugin escriben el TDP a la vez | pisarse | solo se escribe por la vía de Panel (su lógica de conflictos) |
| Licencia | copiar código de Panel obliga a GPL-3.0 | no se copia; si se adapta código, el plugin pasa a GPL-3.0 con atribución |
| Prueba de rendimiento con batería | datos de consumo sesgados | recomendarla con cargador; muestra el TDP pedido como alternativa |
| ~1 s de tareas largas tras abrir el QAM nativo | tirones | el lanzador propio no monta los paneles del QAM nativo; causa exacta sin medir |
| Sin API de Wi‑Fi/Perf/Notificaciones | secciones solo de diseño | investigar los formatos protobuf o usar el backend de Panel |

---

## 10. Hoja de ruta

**Hecho**: plugin y herramientas; piloto con múltiples vías de vuelta atrás; riel/secciones; TDP vía Panel; brillo/volumen/BT; prueba de rendimiento; instalador; sistema de módulos; módulo Amigos real; navegación con el mando (v0.9.0, por verificar).

**Siguiente (orden sugerido)**
1. Cerrar la alineación derecha con la línea de diagnóstico.
2. Verificar la navegación de mando de v0.9.0 y ajustar.
3. Apps reales: atajos no‑Steam MiniTube / Recomp Hub (ya hay lógica en `apps.ts`; `curate()` con anclados por nombre) en un módulo `qam-rail-apps`.
4. Módulo Este juego: perfil por juego real (potencia ya; refresco/escalado/FPS según lo que permita Panel o Steam).
5. Módulos Avisos y Música (decodificar mensajes o usar fuentes alternativas).
6. Medir apertura: comparar con el QAM nativo con `summary()`.
7. Quitar `DEBUG` y empaquetar versión estable.

**Fuera de alcance por ahora**: copiar código de Panel; temas CSS de terceros sobre el panel propio (el panel propio tiene su DOM, un tema hecho para el QAM nativo no se aplica).

---

## 11. Cambios 0.9.1 → 0.11.0 (2026-11-05)

### 11.1 Alineación al borde derecho (0.9.1–0.9.2) [V]
Causa medida con el diagnóstico de geometría (`__qamRail.geom()`): `dockRight` ya colocaba el contenedor a 9 px del borde, pero el contenedor que crea Steam (`DialogContent_InnerWidth`, 609 px) era más ancho que nuestro contenido (486 px fijos) y este quedaba a la izquierda. Solución: el contenedor usa `width: max-content`. Ventana medida: 902 × 508, `devicePixelRatio` 2,13.

### 11.2 TDP compatible con Panel de Control (0.10.0)
Reglas de Panel y cómo se respetan: ver `claude/qam-panel-funciones.md`. Capas:
- `game.ts`: clave estable de juego (`1245620` para Steam, `ns:<nombre>` para atajos no‑Steam) y lector del juego en marcha (`Router.MainRunningApp`, con `SteamUIStore` de reserva).
- `panelBridge.ts`: `rpc.{state, presets, draw, setWatts, applyPreset, follow, resetTelemetry}` sobre `callPanel`.
- `tdpModel.ts` (puro): `buildView` (estado de Panel → vista), `writeTarget` (ámbito y contexto exactos), `explainFailure` (mensajes en español), presets de Panel (integrados + personalizados + ocultos), techo según cargador.
- `tdpControl.ts`: `TdpController` + hook `useTdp`: espera de 200 ms, una orden en vuelo (gana la última), relectura tras escribir, una lectura no pisa lo que mueves, sondeo de consumo opcional cada 3 s, cambio de cargador relee el techo, un cambio pendiente se envía al cerrar el panel.
- **Contexto de escritura = juego que el backend de Panel cree activo** (`state.appid`), no el que ve Steam; evita `stale-context` por carreras al lanzar/cerrar un juego.

### 11.3 Dos modos y riel fijo (0.11.0)
- `mode.ts`: `resolveMode`, `modeToast`, hook `useMode` (lee el juego cada 2 s **solo con el panel abierto**).
- **Riel fijo de 6** en ambos modos: Inicio · Energía · Pantalla y sonido · Conexiones · Apps y social · Más. En modo juego, Inicio muestra un icono de mando.
- Solo cambia el contenido de **Inicio** (`QamHome.tsx`): `HomeNormal` (música, brillo/volumen, potencia compacta, conexiones, 4 apps) y `HomeGame` (cabecera con consumo, potencia con sugerencia, pantalla, brillo/volumen, módulo anclado). Cambio con desvanecimiento de 160 ms (`Fade`), aviso breve, sección abierta y foco intactos (si el foco estaba en el contenido de Inicio, vuelve a su primer elemento).
- A sobre Inicio estando en Inicio con juego abierto alterna Inicio de juego / Inicio normal.
- Un solo sitio por función: brillo y volumen solo en Inicio; «Pantalla y sonido» lleva lo avanzado. «Apps y social» agrupa dos pestañas (Apps / Amigos; el módulo Amigos sustituye la pestaña Amigos).
- Se eliminó la sección «Este juego» (su contenido está en Inicio de juego y en Energía) y las filas de ejemplo de Energía.

### 11.4 Sugerencia de potencia (0.11.0)
Panel aprende por juego a partir de ~30 min repartidos en varios niveles de potencia y devuelve `learned {floor, ceil, seed, enough, reason, minutes, target_minutes}`. En la barra (`PowerBar`): zona translúcida floor–ceil, marca blanca = consumo real, botón «Sugerido N W» (aplica el valor habitual). Sin datos suficientes solo se muestra «Aprendiendo: X de Y min» si hay progreso real; nunca una banda inventada. Energía: detalle y «Olvidar lo aprendido» en dos pasos (`reset_telemetry`; no toca perfiles manuales).

### 11.5 Colores y música
- **Colores** es un plugin aparte de Hooandee (nombre «Colores», RGB). Se detecta en `DeckyPluginLoader.deckyState.publicState().installedPlugins` y se abre con `setActivePlugin("Colores")` + pestaña Decky (999). Si no está instalado, el módulo anclado lo dice. [L] código de Panel; [H] en el equipo.
- **Música**: de momento acceso directo a la pestaña Banda sonora (7). No se inventan controles: `__qamRail.music()` lista lo que expone `SteamClient` sobre música para decidir cómo controlarla.
- Id de la pestaña de Panel de Control = `0x504443` = 5260355 [L: `PDC_QAM_TAB_ID`].

### 11.6 Pruebas
92 pruebas (vitest + happy-dom): modelo de TDP, controlador (tiempos, cola, fallos), modos, sugerencia, y una prueba de humo que monta el lanzador completo con `@decky/ui` y Panel simulados (modos, cambio de modo en vivo, riel, Energía, alternar Inicio, Panel ausente).

### 11.7 Pendiente de verificar en el equipo [H]
- Techo del slider al conectar/desconectar el cargador; escritura global con un juego abierto; ámbito «Este juego».
- Clave `ns:` con un atajo no‑Steam.
- Que aparezca la sugerencia tras ~30 min y que «Sugerido» aplique el valor habitual.
- Colores: detección y apertura. Música: salida de `__qamRail.music()`.
- Solo diseño todavía: modos de pantalla (Nativo / Aspecto OLED / Cine), Wi‑Fi, No molestar, refresco/escalado/FPS, apps (ejemplo).

---

## 12. Cambios 0.12.0 → 0.13.0 (2026-11-05)

### 12.1 Columna de plugins (0.12.0, corregida en 0.13.0)
- `decky.ts` lee `DeckyPluginLoader.deckyState.publicState().plugins` (`name`, `content`, `titleView`, `icon`) y excluye los propios. `PluginColumn.tsx` pinta el `content` original del plugin en una columna de 380 px a la izquierda del panel.
- **0.13.0**: la columna va **superpuesta** (`position: absolute; right: 100%`), el panel ya no cambia de ancho → no se desplaza al abrir/cerrar (antes el anclaje no volvía a su sitio). Al cerrar, el foco vuelve al elemento que la abrió.
- Mando: foco al primer control del plugin; → no sale; **B** cierra. Táctil: botón ✕ o tocar el panel atenuado. Panel y riel quedan `inert` y atenuados. Error del plugin → se cierra y se abre en el QAM anterior (Decky 999).
- Entradas: Apps y social › **Plugins**, filas de plugins frecuentes en Inicio y todos los atajos «Panel de Control» (si Panel está cargado en Decky, se abre en la columna; si no, su pestaña 5260355).

### 12.2 Plugins frecuentes (`pluginUsage.ts`)
Cuenta aperturas por modo en `localStorage`. Sin usos manda una lista por defecto: modo normal = Clash/ToMoon, Animation Changer, Colores; modo juego = Colores, Framegen, Clash. Inicio normal muestra «Plugins frecuentes», Inicio de juego «Plugins para jugar» (3 + botón «Plugins»).

### 12.3 Navegación con el mando
| Entrada | Efecto |
|---|---|
| ↓ en la última fila de una sección | Pasa a la **siguiente sección** (primer elemento) |
| ↑ en la primera fila | Vuelve a la **sección anterior** (último elemento) |
| → en el último elemento de su fila | Vuelve al icono de la sección en el riel (salvo deslizadores, que usan ←/→) |
| **L1 / R1** | Sección anterior/siguiente desde cualquier sitio [H: `onButtonDown` no está en los tipos] |
| B en la sección / en el riel | Igual que antes (riel / cerrar) |
Lógica pura en `nav.ts` (`rowOf`, `neighbor`, `itemOf`) con pruebas.

### 12.4 Táctil
- **Causa principal de la inestabilidad**: la `ref` del contenedor en `pilot.tsx` era una función nueva en cada render; React la volvía a llamar, `dockRight` quitaba y volvía a poner la transformación y creaba otro `ResizeObserver` + 4 temporizadores **cada 2–3 s** (sondeo de modo y de consumo). Ahora `useCallback`: un anclaje por apertura.
- Deslizadores (`XSlider`) y barra de potencia (`PowerBar`) aceptan **arrastre** (`useDrag`: captura de puntero, zona de toque de 28 px, `touch-action: none`, solo avisa si el valor redondeado cambia).
- Botones con `Focusable`: `onActivate` + `onClick` con disparo único (`tap.ts`, 350 ms) para que un toque no active dos veces ni se pierda.

### 12.5 Funciones conectadas (antes solo diseño)
| Función | Vía | Dónde |
|---|---|---|
| Límite de FPS, refresco (Hz), VRR | almacén de rendimiento de Steam (`SystemPerfStore` / clase con `Get()`), setters `SetFPSLimit`, `SetDisplayRefreshRateManualHz`, `SetVRREnabled` | Pantalla › Fluidez; Inicio de juego (fichas FPS/VRR) |
| Escalado (Auto, Entero, Ajustar, Llenar, Estirar) y filtro (Lineal, Píxel, FSR, NIS) + nitidez | `SetSplitScalingScaler`, `SetSplitScalingFilter`, `SetFSRSharpness`/`SetNISSharpness` | Pantalla › Escalado; Inicio de juego (ficha que rota) |
| Looks de color (Nativo, Aspecto OLED, Cine, Vivo, Cómodo) | Panel `apply_color_preset` / `apply_oled_look` (ámbito del juego si tiene perfil propio) | Pantalla › Color; Inicio de juego (ficha que rota) |
| HDR | Panel `set_hdr` (solo si el panel lo soporta) | Pantalla › Color |
| Modo noche + calidez | Panel `set_night` | Inicio normal (ficha) y Pantalla |
| Auto‑TDP | Panel `set_auto_tdp` (solo si `supports_auto_tdp`) | Energía |
| Modo Eco (descargas) | Panel `set_eco(enabled, brillo)` | Energía |
| Batería: %, tiempo, salud, ciclos; límite de carga | Panel `get_battery_state`, `set_charge_limit` | Energía |
| Ventiladores (Auto/Silencio/Equilibrado/Máximo) + rpm y °C | Panel `get_fan_curve_state`, `set_fan_preset`/`set_fan_auto`, `get_fan_state` | Energía |
| Wi‑Fi | `SteamClient.System.Network.SetWifiEnabled`; estado por prueba de conectividad (5 = Wi‑Fi apagado) [H] | Inicio y Conexiones |
| Modo avión | `SteamClient.System.SetAirplaneMode` + `RegisterForAirplaneModeChanges` | Conexiones |
| No molestar | `friendStore.m_FriendsUIFriendStore.Set/GetUserDoNotDisturb` | Inicio y Conexiones |
| Apps reales | atajos no‑Steam (`curate`: MiniTube y Recomp Hub anclados por nombre), `RunGame` | Inicio normal y Apps |
Si algo no existe en el equipo, el control no se dibuja (nunca valores inventados). Diagnóstico nuevo: `JSON.stringify(__qamRail.perf())`, `__qamRail.plugins()`.

### 12.6 Distribución por modo (0.13.0)
- **Inicio normal**: potencia (compacta) → brillo | volumen → Wi‑Fi · Bluetooth · No molestar · Noche → plugins frecuentes → apps → banda sonora.
- **Inicio de juego**: juego + W en uso → potencia completa con sugerencia → Pantalla (FPS, VRR, escalado, color) → brillo | volumen → plugins para jugar.
- **Energía**: potencia + lo aprendido → Auto‑TDP · Modo Eco → batería → ventiladores → prueba / Panel.
- **Pantalla y sonido**: Fluidez (FPS, refresco, VRR) → Escalado → Color (looks, noche, HDR) → ecualizador / pestaña original.
- **Conexiones**: 4 fichas reales → Remote Play, ajustes, mandos.
- **Apps y social**: Apps · Plugins · Amigos. **Más**: Panel, notificaciones, ayuda, módulos, QAM anterior, cerrar.

### 12.7 Pruebas
110 pruebas: 16 de humo (modos, columna de plugins, error de plugin, plugins frecuentes en juego, Pantalla con almacén de Steam simulado y sin él, Energía, Conexiones) + lógica (`nav`, `tap`, `pluginUsage`, `readPerf`, `looks`, `colorTarget`, `batteryLine`).

### 12.8 Pendiente de verificar en el equipo [H]
Almacén de Steam encontrado (`__qamRail.perf().found`); que `inert` bloquee el mando en el panel con la columna abierta; L1/R1; ↓/↑ entre secciones sin que Steam mueva además el foco; estilos de los plugins dentro de la columna; Wi‑Fi (lectura); arrastre en los deslizadores.

### 12.9 Aún sin implementar
Controles de reproducción de la banda sonora (API desconocida), notificaciones de Steam (protobuf), CPU/GPU (SMT, boost, núcleos, reloj GPU: se usan desde Panel en la columna), edición de fichas ancladas (Y) y orden por modo configurable, acciones de amigos (chat/invitar), prueba de GPU/FPS, ecualizador propio, LED de la consola, perfiles por juego (listar/borrar).

---

## 13. Cambios 0.14.0 (2026-11-05)

### 13.1 Navegación (manda sobre 12.3)
| Entrada | Efecto |
|---|---|
| Cruceta dentro de una sección | Solo se mueve **dentro** de ella; en los bordes no sale (ni al riel ni a otra sección) |
| **LB / RB** | Sección anterior/siguiente, desde cualquier sitio; mantiene la zona (contenido → primer elemento de la nueva) |
| **B** en la sección | Al riel (↑↓ cambian de sección, ← o A entra) |
| B en el riel | Cierra |
- LB/RB llegan por el prop `onButtonDown` y, de respaldo, por el evento DOM `vgp_onbuttondown` (se ignora el duplicado en 150 ms).
- **Foco del mando**: `takeFocus(el)` pide el foco al nodo de navegación de Steam (`TakeFocus`, buscado en el estado de React del `Focusable`); `element.focus()` no movía el foco de Steam. Se usa en riel, contenido, retorno al cerrar un plugin y **entrada en la columna de plugins** (reintenta hasta que `.gpfocus` esté dentro). [H] estructura interna.
- **Toque en un icono que «volvía» a la sección anterior**: Steam movía el foco al icono tocado y el guardián lo redirigía al icono activo (antiguo). Ahora, durante 800 ms tras un toque, el foco que mueve Steam no cambia de sección.
- **Menos parpadeo**: la potencia y los estados de Panel se pintan al instante con la última respuesta (caché) y se refrescan detrás.

### 13.2 Todo por juego, con Steam como base
Regla única: **sin juego = lo de Steam** (modo normal); **con juego = lo de ese juego**. Un juego sin ajuste propio usa lo de Steam; cualquier cambio con el juego abierto crea su perfil.
| Ajuste | Dónde se guarda | Volver a «como en Steam» |
|---|---|---|
| Potencia (TDP) | Panel, perfil del juego (`set_tdp_watts` con ámbito juego; Panel crea el perfil al editar) | «Como en Steam» en la tarjeta (`set_tdp_follow_global(true)`) |
| Fluidez (FPS, refresco, VRR), escalado, filtro, nitidez | **El lanzador** (`displayProfiles.ts`, `localStorage`): Steam no expone su «perfil por juego» de forma fiable | «Como en Steam» en Fluidez |
| Color (looks, Aspecto OLED) y HDR | Panel, perfil del juego (`set_color_follow_global(false)` antes de escribir) | «Como en Steam» en Color |
| Sonido (ecualizador, preset, nivelar volumen) | Panel, perfil del juego (`set_audio_follow_global(false)` antes de escribir) | «Como en Steam» en Sonido |
- `displayWatch.ts`: vigilante (cada 3 s, con o sin el panel abierto) que al entrar en un juego aplica su perfil (o el de Steam) y lo reafirma a los 2,5 s; al salir aplica el de Steam. Fuera de juego mantiene al día el perfil de Steam (incluso si se cambia desde el QAM nativo).
- **Escalado sin juego**: se muestra apagado («Se ajusta para cada juego»).
- **Potencia**: con juego la tarjeta es «Potencia de este juego» (sin selector Global/Juego); si aún sigue a Steam: «Igual que en Steam · muévela para fijar la de este juego». Sin juego: «Potencia en Steam».
- **Perfil de este juego** (Inicio de juego): qué es propio (potencia, pantalla, color, sonido) y «Todo como en Steam» en dos pasos.
- **Sonido** (Pantalla y sonido): ecualizador sí/no, presets (Plano, Voces/FPS, Graves, Cine, Música, «<equipo> mejorado»), nivelar volumen, salida (altavoz/auriculares). Las bandas se editan en Panel (columna).

### 13.3 Diagnóstico nuevo
`JSON.stringify(__qamRail.profiles())` (perfiles de pantalla guardados) · `JSON.stringify(__qamRail.social())` (qué expone Steam para chat, voz y Remote Play Together).

### 13.4 Pruebas
116: perfiles de pantalla (Steam/juego, olvidar, diff), vigilante (entrar/salir de juego), `takeFocus`, Pantalla sin juego (escalado apagado) y con juego (perfil propio, color crea perfil), TDP por juego y «Como en Steam».

## 14. Zona social: análisis y propuesta (pendiente de implementar)

### 14.1 Qué hay en Steam (según tipos de `@decky/ui`; [H] hasta ver `__qamRail.social()`)
- **Amigos**: `friendStore.allFriends` [V], `GetFriendsInGame(appid)`, `favoriteFriends`, estado propio `SetUserPersonaState`, No molestar.
- **Chat 1:1 y grupos**: objetos `CChat` (`m_rgChatMessages`, `m_cUnreadChatMessages`, `m_bFriendIsTyping`, `SendChatMessage`, `BIsVoiceAllowed`, `ToggleVoiceChat`) y vistas `CChatView`. El acceso a la tienda de chats (`g_FriendsUIApp.ChatStore`) no está tipado: se confirma con la sonda.
- **Voz**: `CChat.ToggleVoiceChat()`, `BVoiceActive()`; silenciar micro/altavoz y salas de voz de grupo dependen de `VoiceStore` (sin tipar).
- **Remote Play Together**: `SteamClient.RemotePlay.CreateInviteAndSession(steam64, …)`, `CancelInviteAndSession`, eventos de invitado iniciado/parado, `BRemotePlayTogetherGuestSupported`.

### 14.2 Propuesta de diseño
- **Barra de voz persistente**: con una llamada o sala activa, franja fija arriba del panel (en todas las secciones): con quién, micro sí/no, sonido sí/no, colgar.
- **Amigos** (pestaña de Apps y social): primero «Jugando a este juego», luego jugando, en línea y el resto; no leídos con globo. A abre el chat; X acciones rápidas (llamar, invitar al juego, Remote Play Together, perfil).
- **Chat en columna ancha** (mismo mecanismo que los plugins, a la izquierda): historial, «escribiendo…», teclado de Steam para responder, respuestas rápidas, botón de llamada. B la cierra y vuelve al amigo.
- **Grupos**: lista de grupos con sus salas de voz (entrar/salir) y texto.
- **Jugar juntos** (modo juego): amigos que pueden unirse, invitar a Remote Play Together, invitados conectados con su mando y su calidad.

---

## 15. Cambios 0.15.0 (2026-11-05)

### 15.1 Riel de 7 y columna lateral genérica
Riel: Inicio · Energía · Pantalla y sonido · Conexiones · **Apps** · **Social** · Más (Social lleva un globo con los mensajes sin leer).
`SideColumn` (en `PluginColumn.tsx`) aloja a la izquierda, a 380 px, cualquier contenido grande: un plugin de Decky, la conversación con un amigo o un grupo.
- Foco del mando: `autoFocus` + `navRef` (props de Steam sin tipar) + `takeFocus` en el primer control, con reintentos hasta que `.gpfocus` esté dentro. El panel queda con `childFocusDisabled` + `inert` mientras la columna está abierta, para que el mando no pueda volver a él.
- **B cierra la columna** esté donde esté el foco (sección o raíz del panel) y el foco vuelve al elemento que la abrió.
- Rejillas de apps y plugins sin `flow-children`: la cruceta se mueve en las cuatro direcciones.

### 15.2 Páginas que abren los plugins
`navGuard.ts`: mientras el panel está abierto, los métodos de navegación de Steam (`Navigate`, `NavigateToExternalWeb`, `NavigateToSteamWeb`, `NavigateToChat`…) se envuelven para **cerrar el panel antes de navegar**. Así Decky Clash (proxies/conexiones en el navegador), la tienda o los ajustes de Decky quedan a la vista. Se restaura al cerrar.
Apps › Plugins: «Actualizaciones (N)» (lee `publicState().updates` y `hasLoaderUpdate`), «Tienda» (`/decky/store`), «Ajustes de Decky» (`/decky/settings`). [H] rutas.

### 15.3 Social
Principio: **el panel muestra listas** (elegir rápido con la cruceta); **lo que necesita espacio se abre en la columna**; **la voz activa siempre está a la vista**.
| Pieza | Contenido | API |
|---|---|---|
| Cabecera | Tu avatar, nombre y estado (En línea / Ausente / Invisible, rota con A) | `m_FriendsUIFriendStore.SetUserPersonaState` [H] |
| Pestaña Amigos | Juegan a tu juego → Jugando → En línea → Ausentes → Desconectados (plegados). No leídos primero; icono de llamada si estás en voz con él | `friendStore.allFriends` [V] |
| Pestaña Chats | Conversaciones recientes con el último mensaje («Tú: …») y sin leer | `ChatStore.GetFriendChat(id)` → `m_rgChatMessages`, `m_cUnreadChatMessages` [H] |
| Pestaña Grupos | Grupos con en línea, sin leer y «en voz» | `ChatStore.m_mapChatGroups` (o `GetChatRoomGroupsInFriendsList`) [H] |
| Pestaña Jugar juntos (con juego) | Amigos que también juegan; invitar por Remote Play Together; invitados conectados (quitar) | `SteamClient.RemotePlay.CreateInviteAndSession/CancelInviteAndSession` + eventos [H] |
| Columna de amigo | Llamar/Colgar, Invitar al juego, Perfil; burbujas (las tuyas a la derecha) con hora; «está escribiendo…»; respuestas rápidas (👍, ¡Voy!, Un momento, ¿Jugamos?, gg); campo con el teclado de Steam + Enviar | `SendChatMessage`, `ToggleVoiceChat`, `BIsVoiceAllowed`, `m_bFriendIsTyping` [H] |
| Columna de grupo | Salas de voz (entrar) y «Abrir el chat del grupo» en Steam | salas del grupo [H] |
| Barra de voz | Arriba en todas las secciones con una llamada activa: con quién, micro, sonido, colgar | `VoiceStore` (nombres candidatos) [H] |
Todo es defensivo: lo que no exista en el cliente se oculta o abre lo de Steam. El antiguo módulo `qam-rail-friends` ya no sustituye esta sección (se puede desinstalar).

### 15.4 Pruebas
124: Social (grupos por estado, desconectados plegados, globo en el riel, chats, columna con mensajes, «escribiendo», respuesta rápida, llamada, Jugar juntos con invitación), lógica social pura (orden, estados, BBCode), cierre al navegar, Decky en Apps › Plugins.

---

## 16. Cambios 0.16.0 → 0.17.0 (2026-11-05)

### 16.1 Social con la API real (0.16.0)
Ver `claude/qam-social-steam-api.md`. Texto del mensaje en `strMessage`; historial con `LoadChatLogs()`; `OnActivate/OnDeactivate` al abrir/cerrar; `OnTyping`; voz con `VoiceChatStore` (`InitiateFriendChat`, `OnUserEndVoiceChat` / `m_exportsVoiceInterface.EndVoiceChat`, `ToggleMicMuting`, `ToggleOutputMuting`), llamadas entrantes (aceptar/rechazar) y aviso inmediato `RegisterForVoiceChatActiveStateChange`; grupos desde `currentChatRoomGroups`.

### 16.2 Rendimiento: medir sin DevTools (0.17.0)
- **Registro siempre activo** (`perfLog.ts`): `open` (botón → primer fotograma), `switch` (cambio de sección → pintado), `column`, `longtask` (> 50 ms en la ventana del panel), `input` (foco en un campo de texto) y `close` con **motivo** (botón QAM, B en el riel, tocar fuera, navegación, QAM nativo, botón Cerrar; si no hay motivo propio: «steam», y si fue justo tras tocar un campo de texto se indica). Cada evento lleva la potencia aplicada. Archivo: `diag/perf-log.jsonl` (cada 20 s y al cerrar; rota a 2 MB). Backend: `perf_append`, `diag_write`.
- **Prueba de fluidez** (`perfBench.ts`, Más › Rendimiento y diagnóstico): niveles con peso en los bajos (p. ej. 3, 5, 7, 9, 15 W; rápida: 3, 9, 15). Por nivel: cambio de sección (mediana/p95, 7 secciones × 2), fotogramas en reposo (2 s) y desplazando (1,2 s) con fps, p95 y % lentos (> 33 ms), columna abrir/cerrar, velocidad de JS (bucle fijo), coste de `readFriends`, `readPerf`, `runningGame`, plugins, latencia de Panel y tareas largas. Restaura la potencia (global, o la del juego / «como en Steam») y guarda `diag/perf-bench-<fecha>.json`.
- **Diagnóstico de amigos sin consola** (`diagSocial.ts` = script 2 como módulo): Explorar, Teclado 30 s, Voz 45 s → `diag/amigos-diagnostico.json`.

### 16.3 Menos trabajo de fondo
- Lectura de amigos compartida (`friendsCached`): globo del riel, lista, columna y barra de voz ya no recorren cada uno los ~120 amigos.
- Globo de no leídos: `FriendChatStore.GetFriendsWithUnreadMessages` (sin recorrer amigos).
- Barra de voz en reposo: solo `IsVoiceChatActive` + llamadas en espera; los amigos se leen solo con voz.
- Ajustes de Steam: una lectura compartida entre tarjetas.

### 16.4 DevTools tras reiniciar Decky
El destino SharedJSContext cambia al reiniciar `plugin_loader`/Steam: recargar la página del depurador y volver a elegir SharedJSContext; si no aparece, desactivar y activar «Permitir depuración CEF remota» en Ajustes de Decky › Desarrollador. Ya no es necesario para los diagnósticos (ver 16.2).

---

## 18. Cambios 0.19.0 (2026-11-05)

### 18.1 Causa de la lentitud (registro 12:03–12:41)
Sesiones **bimodales, no por TDP**: rápidas (abrir 80–100 ms, sección 15–35 ms, incluso a 8 W) y lentas (abrir 700–1000 ms, sección 150–600 ms, incluso a 15–20 W). Las lentas venían **después de ir al QAM antiguo**: el botón del QAM se interceptaba aunque el QAM antiguo estuviera abierto, abríamos el nuestro encima y el antiguo seguía abierto y oculto (`visibility:hidden`), trabajando detrás.
**Arreglo**: si el QAM antiguo está visible y nuestro panel no está abierto, el botón pasa a Steam (lo cierra, como siempre); la siguiente pulsación abre el nuestro. Por la vía de respaldo (QAM antiguo abierto por otra vía) se cierra de verdad (`CloseSideMenus`) antes de abrir el nuestro. El evento `open` anota «QAM antiguo abierto al abrir».

### 18.2 Potencia compartida
Un solo `TdpController` (contador de referencias) para todas las tarjetas: lo que se mueve en Inicio se ve al instante en Energía (antes cada tarjeta tenía el suyo y Energía, montada en segundo plano, se quedaba con el valor viejo). El consumo en vivo se sondea al intervalo más corto que pida una tarjeta visible.

### 18.3 Chat
- Columna de amigo: lee **solo** a ese amigo (`readFriendById`, antes los 120 cada 1,5 s) y no repinta si nada cambió (firmas `friendsSig` / `msgsSig`); igual en listas de amigos y grupos.
- Mensajes con BBCode de Steam (`bbcode.tsx`): emoticonos y stickers como imagen del CDN de la comunidad [H], imágenes, invitaciones a jugar, negrita/cursiva/subrayado, código, citas, spoilers; un mensaje que es solo un sticker/emoticono va sin burbuja. Fuentes de emoji añadidas a la pila de fuentes.

### 18.4 Diagnóstico en un archivo
Más › Rendimiento y diagnóstico › «Juntar todo en un .zip» (`diag_bundle`): copia `diag/` y `bench/` a `~/qam-rail-diagnostico-<fecha>.zip` (dueño: el usuario de Decky). Carpeta de origen: `~/homebrew/settings/qam-rail/diag/`.

---

## 19. Cambios 0.20.0 (2026-11-05) — datos del equipo [V]
- **Equipo**: ROG Ally (TDP por `firmware-attr:asus-armoury`), Bazzite, cliente Steam 1792618285, CEF Chrome 126.
- **Prueba de fluidez** (`perf-bench-2026-11-05T09-46-52.json`): 7 W → JS 309 ms, sección 83/385 ms, 60 fps irregulares, columna 334 ms, Panel 229 ms, 32 tareas largas (3,1 s). 9–30 W → JS 34–48 ms, sección 13–16 ms (p95 24–36), 115–120 fps, columna 29–39 ms, Panel ~125 ms, 0 tareas largas. Conclusión: el límite está en el equipo a 7 W; desde 9 W la interfaz es fluida.
- **Potencia mínima** (`potencia-minima.json`): `limits.min` 7, `request_min` 3; pedir 3/4/5 W → aplicado 7 W (`constrained`, `live_min`) con PL2/PL3 subidos a 15 W. **Cambio**: el slider empieza en `limits.min`.
- **Teclado** (`amigos-diagnostico.json`): escribir y pulsar Enter en el chat no cierra el panel (0.18+ correcto).
- **Sesión lenta tras usar el teclado** (registro, 20 W, 12:46): bloqueos continuos hasta pasar por el QAM antiguo. Hipótesis: teclado de Steam activo detrás. **Cambio**: `keyboard.ts` quita el foco del campo y pide ocultar los teclados (`BrowserAndBackstackInstances[i].m_refKeyboard`) al cerrar el chat y el panel; el evento `open` anota «campo de texto con foco» para confirmarlo.
- Pendiente: «Amigos › Explorar» (estructura de grupos) y «Decky» (instalar desde la tienda).

## 20. Cambios 0.21.0 (2026-11-05) — informe unificado, pruebas nuevas y apariencia de Panel

**Por qué**: el zip traía solo la última prueba de amigos (cada botón creaba un QRX2 nuevo y sobrescribía `amigos-diagnostico.json`) y mezclaba ficheros viejos con nuevos.

**Informe unificado** (`main.py` + `diagStore.ts`)
- `diag_section(key, datos, resumen?)` guarda una sección de `diag/informe.json` = `{secciones: {clave: {fecha, version, datos}}, historial: [máx 30]}`. Cada prueba sustituye solo su sección; los pasos de amigos son `amigos.explorar / .teclado / .voz / .enviar`.
- `diag_bundle(resumen)` zip = `resumen.json` (estado al juntar) + `informe.json` + `indice.txt` (sección → fecha/versión) + `perf-log.jsonl`. Conserva los 3 zips más recientes en la carpeta personal.
- Migración: los `.json` sueltos de versiones anteriores pasan al informe (versión «anterior») y se mueven a `diag/antiguos/`.
- `diag_index`, `diag_clear` para la pantalla.

**Pruebas nuevas** (`diagTests.ts`, Más › Pruebas y diagnóstico)
- *Entorno*: versión, plugins de Decky, juego, potencia (Panel), modo de bajo consumo, apariencia, memoria JS, nodos del panel, resumen del registro.
- *Contrato con Panel*: llama a cada método de lectura que usa QAM Rail (`get_tdp_state`, `get_power_draw`, audio, batería, ventiladores, color, HDR, noche, eco, `get_ui_prefs`…), mide la latencia y comprueba los campos de los que dependemos (`limits.min`, `ownership.status`, `auto_config`…).
- *Contrato con Steam*: existencia de ~27 funciones internas (SteamClient, settingsStore, ChatStore/VoiceChat, NotificationStore, DFL.Navigation, Decky) + setters del almacén de rendimiento + 4 ajustes de cliente + árbol QuickAccess.
- *Tema*: lo leído en cada ventana, preferencia de acento y temas de CSS Loader.
- *Ejecutar todo* (≈ 1,5 min): entorno, contratos, tema, potencia mínima, Decky, amigos·explorar, fluidez rápida → zip. Variante «sin tocar la potencia». Teclado/voz siguen manuales.

**Apariencia sincronizada con Panel** (`appearance.ts`, `QamAppearance.tsx`) [H en el equipo]
- Contrato público de Panel (solo lectura, sin su código): propiedades CSS en `:root` puestas por el tema activo de CSS Loader — `--pdc-theme-accent` (r,g,b), `-surface`, `-surface-raised`, `-hairline`, `-outline`, `-text`, `-text-muted`, `-on-accent`, `-selected-fill`, `-radius-md` — y la preferencia `pdc:accent` (localStorage compartido; respaldo `get_ui_prefs`). `"default"` = acento del tema; sin tema, azul `#4ea1ff`.
- Extensión propia: `--qrail-<mismo nombre>` manda sobre `--pdc-theme-*` (un tema puede vestir QAM Rail aparte).
- Modos: **Como Panel** (por defecto: fondo/tarjetas/texto/borde fino del tema o el aspecto base de Panel, casi negro), **Solo su acento** (diseño propio + acento de Panel), **QAM Rail** (naranja original).
- `COLORS`, `cardStyle` y `small` son getters de la paleta viva. Lectura diferida 450 ms tras abrir y solo si cambia la firma de los `<style>` de CSS Loader (evita recalcular estilos a 7 W). Si la paleta cambia con el panel abierto, las secciones se vuelven a montar (clave `id:versión`).
- Temas instalados: CSS Loader es plugin «legacy» → `DeckyBackend.call("loader/call_legacy_plugin_method", "CSS Loader", "get_themes", {})`.

Pruebas: 158 (nuevas `appearance.test.ts`, `diagTests.test.ts`; `version.ts` debe coincidir con package.json). Backend probado con un `decky` falso (secciones, migración, zip, poda, vaciar).

## 21. 0.21.1 (2026-11-05) — teclado lento en el chat [V datos 14:14]
- **Datos** (`qam-rail-diagnostico-20261105-141416.zip`): `keydown→input` 2–5 ms (nuestro manejo de tecla es rápido), pero con el chat abierto hay tareas largas de 120–150 ms cada 0,3–3 s y una de ~145 ms justo al enfocar el campo (aparece el teclado de Steam, mismo proceso). Fluidez: 7 W sección 114 ms/JS 300 ms/columna 908 ms; 16–25 W 16–18 ms, 120 fps. Contrato Panel 12/12; Steam 33/35 (`DFL.Router.MainRunningApp` era ruta mal puesta en la prueba; `SetNISSharpness` no existe en esta versión de Steam).
- **Bug encontrado**: tras la prueba de fluidez el controlador de potencia seguía creyendo 25 W (Panel estaba en 15): el registro etiquetaba todo como 25 W. → `refreshTdpNow()` tras fluidez y potencia mínima.
- **Cambios**: `MessageList` memo (escribir ya no repinta ni reinterpreta BBCode de los 40 mensajes); `typing()` a Steam como mucho cada 3 s; con una conversación abierta se pausan la lista de 120 amigos de fondo y el contador de no leídos (`chatOpened/chatIsOpen`); evento `key` en el registro = tecla → pintado (1 de cada 3), visible como «tecla … ms» en el resumen por potencia.
- Tema: Luminous Atlas activo no publica `--pdc-theme-*`; `pdc:accent` sin valor. «QAM Rail Amigos 0.1.1» sigue instalado (sin uso desde 0.15): desinstalar.

## 22. 0.22.0 (2026-11-05) — pruebas por situación, atribución, rejillas, música anclada, eficiencia de temas
- **Datos 0.21.1** (zip 14:25): tecla→pintado 7–20 ms (ráfagas ≤ 57 ms): escribir ya es nuestro coste mínimo. Siguen tareas largas de 100–220 ms con el chat abierto → falta saber si son de Steam (teclado) o nuestras.
- **Situación** (`situation.ts`): clave `escritorio|juego` + `-tv` (ancho físico > 1928 px = externa/4K) + `-cargador`. Cada evento del registro lleva `s`; el resumen agrupa por «W · situación». Secciones por situación: `fluidez@…`, `entorno@…`, `juego@…` (no se pisan). `sectionLabel()` las nombra.
- **Atribución** (`perfLog.observeLongTasks`): Long Animation Frames (CEF 126) → por fotograma lento `own` (ms de scripts de QAM Rail, por URL `/plugins/QAM Rail/`), `lay` (estilo+maquetación+render) y `d` (2 scripts más caros: plugin de Decky o archivo de Steam). Respaldo `longtask`. **Saltos de pantalla** (`layout-shift`) como eventos `shift` con el nodo → para cazar el parpadeo. Resumen: «nuestros N %», «N saltos».
- **Prueba «Con juego»** (`testGame`): FPS del juego (Panel `get_kiosk_live`) con el panel abierto, fluidez del panel normal y con el juego congelado (`pause_theme_game(appid,3000)` renovado cada 1 s, luego `resume_theme_game`), FPS después. Entra en «Ejecutar todo» (se salta sin juego).
- **Entorno**: situación, funciones de `SteamClient.System.Display` (nombres) y `msgLimits` del almacén de rendimiento (para la TV/4K).
- **Rejillas** (`nav.gridTarget` + `GridNav`): navegación propia en plugins/apps: abajo/arriba = fila vecina, icono más cercano; laterales en la fila; bordes se quedan; arriba/abajo fuera de la rejilla lo decide la sección. Arregla el salto al extremo.
- **Entrar en la sección con A**: `focusBody` comprueba a los 90 ms que el foco llegó y reintenta (Inicio se quedaba en el riel); al entrar por arriba `scrollTop = 0`. Al enfocar un elemento de la primera fila la sección vuelve arriba (la tarjeta de potencia quedaba medio oculta).
- **Música anclada**: `MusicCard dock` → sonando/en pausa queda fija abajo de Inicio (`position: sticky`), también en Inicio con juego (`onlyActive`). Otras secciones no.
- **Eficiencia de temas** (`themeEco.ts`) [H]: en temas ACTIVOS de CSS Loader busca una opción cuyo nombre case con eficiencia/ahorro/rendimiento…; a ≤ 9 W aplicados la activa (`set_patch_of_theme` vía `loader/call_legacy_plugin_method`, kwargs `themeName/patchName/value`) recordando el valor previo; al subir lo devuelve. Solo toca lo que cambió. Vigila `onPowerChange` y cada 30 s `get_tdp_state`. Interruptor en Más › Apariencia. La prueba «Tema» guarda las opciones de cada tema para verificar el nombre real.
- `refreshTdpNow()` ya no borra la última lectura sin panel (evita «Leyendo…» al abrir).

## 23. 0.23.0 (2026-11-05) — apps de QAM, modos de Inicio, música navegable, temas propios
- **Datos 0.22.0** (zip 15:24): tecla→pintado mediana 20 ms. Con juego (CTR Nitro-Fueled por script, 15 W, cargador): panel 120 fps tanto normal como con el juego congelado → a 15 W congelar no aporta; FPS del juego `null` (se anota ahora `sinFpsPorque`). Fluidez juego 7 W: sección 89 ms/columna 310 ms; 19–30 W 15–17 ms. LoAF: 134 fotogramas lentos, `own` = 0 ms y casi sin scripts > 5 ms: el coste es Steam/maquetación, no nuestro JS. Saltos: Energía («Modo Eco», «Más») y Inicio («Leyendo P…», ajustes rápidos) al llegar datos; Social = teclado de Steam. Tema Hooandee trae «Modo de rendimiento [No/Yes]» (lo detecta el modo eficiencia); Luminous Atlas no.
- **Bug**: el backend quitaba «@» de las claves (`fluidezjuego-cargador`). Arreglado + migración al leer.
- **Sin saltos**: `Keep` (ui.tsx) reserva el alto de la vez anterior mientras se leen datos (tarjeta de potencia, extras de Energía); Auto‑TDP aparece desactivado hasta saber si se admite.
- **Música anclada navegable**: el reproductor (`data-qr-dock`) no cuenta para «última fila»; abajo desde la última fila → reproductor; arriba desde él → último elemento; el contenedor deja `scrollPaddingBottom` = alto del reproductor.
- **Apps de QAM** (`py_modules/qam_apps.py`, `main.py apps_*`, `qamApps.ts`, `QamAppsCard.tsx`): carpeta `~/homebrew/qam-apps/<id>/` (junto a plugins de Decky). Manifiesto `qam-app.json` (id, name, version, launch, launch_options, install, keep, art{capsule,header,hero,logo,icon}, actions[]) o deducido (lanzador .sh, versión de `__init__.py`/CHANGELOG, arte por nombre). Instalar/actualizar desde .zip (busca en Descargas/Games/Escritorio o selector de archivos de Decky), conserva `keep` (ytmini.json, .venv, logs), ejecuta `install.sh` como el usuario (máx. 10 min, log en `qam-install.log`), añade a Steam (`SteamClient.Apps.AddShortcut` + `SetCustomArtworkForApp` 0 cápsula/1 hero/2 logo/3 header + `SetShortcutIcon`) [H], acciones rápidas (`apps_run` con argumentos del lanzador), desinstalar (y quitar el atajo). «Añadir carpeta…» registra una existente (p. ej. ~/Games/steam-ytmini) sin moverla. Probado con steam-ytmini-0.51.1.zip (deducción, install.sh real, conservar ajustes, arte, desinstalar). Manifiesto propuesto para MiniTube: `qam-app.ytmini.json`.
- **Modos de Inicio** (`homeModes.ts`, `QamHomeModes.tsx`): barra arriba de Inicio. Con juego: 🔥 Exigente / ⚖️ Intermedio / 🕹️ Retro (cada juego recuerda el suyo; por defecto retro si el nombre parece emulador o `.sh`). Sin juego: 🏠 Escritorio / 🎬 Película / 👥 Amigos / 📺 TV (TV automático con pantalla externa). «Editar» en la fila de plugins: eliges los plugins de Inicio de ESE modo (orden de elección); «Automático» vuelve a los más usados + sugeridos del modo.
- **Temas propios** (experimental): Medianoche, OLED, Bosque, Sakura, Retro CRT, Papel (claro) en Más › Apariencia (`appearance.OWN_THEMES`, modo `own:<id>`).

## 24. 0.24.0 (2026-11-05) — navegación por filas, pruebas por tipo de juego, apps en el cajón
- **Datos 0.23.0** (zip 16:54, DBZ BT3 con cargador): panel 120 fps con y sin juego congelado; FPS del juego no disponibles con el panel abierto: `get_kiosk_live` → `no_game_focus` (gamescope no mide el juego mientras Steam tiene el foco).
- **Principios de navegación** (Android TV «Navigation for TV», Apple HIG «Focus and selection», patrones TV de Compose): eje claro (filas verticales, elementos en horizontal), movimiento predecible y siempre igual, foco siempre visible, grupos de foco con elemento recordado, B recupera el foco (vuelve al riel), sin trampas.
- **Implementación** (`nav.visualRows` + `nav.listTarget`, `Qam.onBodyDir`): la sección entera se navega como lista de filas. Filas = elementos que se solapan en vertical ≥ 50 %. Arriba/abajo → fila vecina, volviendo al elemento recordado de esa fila (memoria por contenido de fila) o al más cercano en horizontal; izquierda/derecha dentro de la fila; bordes quietos; deslizadores conservan izquierda/derecha; reproductor anclado = última fila. Steam ya no decide por cercanía dentro de las secciones (GridNav pasa a ser solo contenedor).
- **Pruebas por tipo de juego**: situación `juego.simple|medio|exigente` (según el tipo elegido para ese juego en Inicio; modos renombrados a Simple/Medio/Exigente) + `-tv` + `-cargador`. Cada sección con @ guarda las **5 últimas** (`anteriores`), cada una con su versión; índice con «×N» y versiones. Pantalla de pruebas guiada: «Probar ahora» (1 situación y tipo de juego, 2 medir, 3 zip), «Lo guardado» agrupado por situación, «Pruebas avanzadas y registro» plegado.
- **Apps de QAM en el cajón**: aparecen primero en Apps y en la fila de apps de Inicio con su icono (`apps_icons` data URL) y se abren con su lanzador directamente (`apps_run`, con entorno de la sesión: `XDG_RUNTIME_DIR`, D-Bus para `systemd-run --user`), sin pasar por Steam; se ocultan los atajos de Steam con el mismo nombre. Instalación en segundo plano (`apps_install` + `apps_job`, pasos visibles) desde .zip, **desde carpeta** (copia el repo sin .git/.venv/logs/zips) o **usar carpeta** (enlaza el repo de desarrollo). Resultado y error (con traza) en la sección «apps» del informe. Botón «Abrir». Probado con el repo y el zip de MiniTube.

## 25. 0.25.0 (2026-11-06) — arranque de Steam, reinicios, apertura de apps, eficiencia a 7–8 W
- **Datos 0.24.0** (zips 16:06/16:08, Bomberman 64 a 7 W, sin cargador): abrir 170–355 ms, primera visita a cada sección 150–400 ms, tareas largas 300–470 ms; panel en reposo 114 fps. **Con el juego congelado el panel bajó a 58 fps** → congelar a 7 W empeora (descartado). FPS del juego: `no_game_focus`. El registro no muestra los reinicios (solo huecos): faltaba instrumentarlos.
- **Arranque** (`boot.ts`): listo = usuario conectado (`friendStore.currentUserSteamID`), `settingsStore`, ventana enfocada de `SteamUIStore` y documento completo; asentado = 12 s después. Hasta entonces el botón QAM abre el QAM de Steam (`pass()` en pilot) y no arrancan los vigilantes (perfiles de pantalla, música, eficiencia de temas). Evento `boot` en el registro.
- **Migas y reinicios** (`crumbs.ts`, `main.py session_*`, `diag_crumb`): migas escritas al instante (abrir/cerrar panel con motivo, columna abierta y qué plugin, lanzar app, impulso). `session_begin` al asentarse: si la sesión anterior no se cerró limpia, guarda en «reinicios» (6 últimos): migas previas, PID de steam antes/después, segundos desde la última miga, `console_log(.previous).txt` de Steam, `journalctl --user` y del sistema (steam/gamescope/segfault/oom/decky…), `coredumpctl list`. Nota: el paso a Escritorio también cuenta como cierre no limpio.
- **Lanzar apps**: primero se cierra el panel y 400 ms después se lanza (antes `RunGame` con el modal abierto + cierre simultáneo coincidía con cuelgues). Apps de QAM con atajo en Steam se lanzan por Steam (gamescope les da foco); sin atajo, con su lanzador.
- **Eficiencia a ≤ 8 W** (`menuEfficiency.ts`): `set_ui_active(true/false)` de Panel al abrir/cerrar (Auto‑TDP no reacciona ni aprende con el menú); **impulso del menú** opcional (Energía › «Menú a potencia baja»): sube a 9 W con el panel abierto y restaura al cerrar solo si sigue en 9 W (si el usuario cambia la potencia, manda la suya); pendiente guardado en localStorage y restaurado al arrancar. Modo ligero: sin transiciones/animaciones (`data-qrail-root`), lecturas de fondo al doble de intervalo. **Secciones precalentadas** en ratos libres (requestIdleCallback, vecinas primero, se pausa con entrada del usuario).

## 26. 0.26.0 (2026-11-07) — análisis de reinicios, forense mejorada, fondo del tema
- **Zip 16:48 (0.25.0), 6 «reinicios»**: 2 son **encendidos de la consola** (uptime ≈ 60 s), 3 son **Steam reiniciado** sin acción del panel en los minutos previos (último uso 3–49 min antes), 1 es **solo la interfaz recargada** (mismo PID de steam) a las 16:42:11, 1 min después de abrir Panel de Control en la columna y al abrir el panel. Pistas fuertes: **orca (lector de pantalla) en bucle de cuelgues** (SIGSEGV en libatk-bridge/atspi, «restart counter 5») y `screenreader.vdf` cargado justo antes de la recarga de 16:42; **volcado de assert de Steam** `/tmp/dumps/assert_20261107163615_31.dmp` (Steam se cayó a las 16:36:15). La forense de 0.25 estaba tapada: 160 líneas de «pipewire: out of buffers», ventana mal centrada y `console_log.previous` antiguo (02-11); coredumpctl sin permisos.
- **Forense 0.26**: ventana desde 90 s antes de la última miga hasta ahora; sin ruido conocido y sin repetidas; `evidencias` (orca/core/dump/assert/segv/webhelper/oom/killed…) de journal de usuario y sistema; logs de Steam filtrados por fecha (`console_log`, `console-linux`, `webhelper`, `cef_log`); lista de volcados en `/tmp/dumps` y `Steam/dumps`; estado de `orca` (`systemctl --user show`); campo `tipo` (encendido / Steam reiniciado / solo interfaz).
- **Tema** (`appearance.findThemeBackground`, `surfaceStyle`, `main.theme_explore`): se busca la capa de fondo de Big Picture (elementos y ::before/::after que cubren ≥ 70 % con background-image; prefiere url, luego degradados repetidos) y se continúa en riel, cuerpo y columna con la misma imagen **fija a la pantalla** bajo un velo del color del panel (72–86 %); sin tokens del tema, el color del panel sale del color base del fondo (oscurecido). Modo ligero: solo velo. Interruptor «Fondo del tema» en Apariencia. La prueba «Tema» guarda `tema-archivos`: candidatos de fondo y, de los temas activos, theme.json, archivos, variables CSS, colores más usados, url() y el CSS (para diseñar adaptaciones por tema, p. ej. Luminous Atlas: Grafito, Cartografía, difuminado alto, partículas).

## 27. 0.27.0 (2026-11-07) — redes, semáforo de pruebas, modos pulidos, adaptador de tema, arranque
- **Zip 18:08**: el «reinicio» de 17:10 fue un encendido; las migas muestran «abrir panel / cerrar panel: QAM nativo apareció» cada segundo a las 17:10:30–35 → el **respaldo de visibilidad de pilot abría nuestro panel aunque el arranque no estaba asentado** y el QAM de Steam lo cerraba (el «poquito de QAM antiguo»). Arreglado: `onVis` respeta `bootSettled()`; margen tras listo 12 → 6 s; cada pulsación durante el arranque deja una miga con segundos desde la carga y qué faltaba. El volcado `assert_…_29.dmp` aparece en cada arranque de Steam (normal). orca ya inactivo.
- **Redes** (`network.ts`, `QamNetwork.tsx`, `main.wifi_*`): Bluetooth con `SteamClient.System.Bluetooth` (estado por `RegisterForStateChanges`; conectados / emparejados con audio primero / cerca por señal; Connect, Disconnect, Pair+Connect, SetAdapterDiscovering 30 s, SetEnabled). Wi‑Fi con `nmcli` desde el backend (radio, red activa, visibles con señal/seguridad/guardada, `connection up` a guardadas; nuevas → Ajustes de Steam). Prueba «Redes» (solo lectura) en «Medir todo».
- **Semáforo**: cada paso de «Medir todo» guarda su estado (`diag_mark` → `informe.estados`); «Probar ahora» muestra el último resultado con luces (verde/ámbar/rojo/gris) y «N/M bien».
- **Barra de modos**: control segmentado centrado, segmentos iguales, foco como anillo interior de 2 px (antes contorno exterior cortado), juegos ordenados Simple → Medio → Exigente.
- **Adaptadores de tema** (`appearance.THEME_ADAPTERS`, `readAdapter`, `normalizeColor`): Luminous Atlas inyecta `tokens.css` en bigpicture (la ventana del panel). Se usan sus variables: `--hla-paper-deep` (fondo), `--hla-folio-surface` (tarjetas), `--hla-text`, `--hla-muted`, `--hla-line` (bordes), `--hla-brass` (acento), `--hla-ink` (sobre acento), motivo `--hla-motif-qam-1..4` (sin velo, pegado al panel) y `--hla-serif` (tipografía). Cambian solos con «Color del tema»/«Motivo del fondo». Tema explorado: 76 archivos, incluye `panel-theme.json` + `panel-extension.js` (extensión para Panel de Control) y `qam.css`; `theme_explore` ahora también trae los .json.
- Lista de lo que falta portar: `claude/qam-portar-pendiente.md`.

## 28. 0.28.0 (2026-11-07) — Bluetooth por BlueZ, salida de juegos, arranque, música
- **Zip 18:33**: «Redes» → `SteamClient.System.Bluetooth` **no existe** en esta versión de Steam (Connect/Pair/SetEnabled «falta») — por eso la tarjeta decía «Steam no ofrece el Bluetooth» y el interruptor no hacía nada. Wi‑Fi (nmcli) OK. Hubo una recarga de interfaz (mismo PID) a las 18:27 tras abrir MiniTube por su lanzador a las 18:18 (9 min antes, sin relación clara).
- **Bluetooth por BlueZ** (`main.bt_state/bt_action/bt_scan`, `network.bzKind/sortBz`): `bluetoothctl show`, `devices [Paired|Connected]`, `info` solo de emparejados (icono → tipo), `power on/off`, `connect`, `disconnect`, `pair`+`trust`+`connect`, `--timeout N scan on` en segundo plano. Tarjeta y mosaico rápido usan BlueZ cuando Steam no trae su API. La prueba «Redes» registra BlueZ y dónde aparece «Bluetooth» en SteamClient/window.
- **Salida de un juego** (`gameWatch.ts`, `main.post_game_sample`): al salir (sondeo 2 s), 10 s midiendo la ventana de Big Picture (fps, fotogramas > 50 ms, peor), LoAF con atribución, potencia aplicada al salir y después (Panel vuelve a la de Steam), y `top` (carga, %CPU y 12 procesos que más consumen). Sección `salida@<situación>` (5 últimas) + migas «salir/entrar del juego» y los cambios de perfil de pantalla.
- **Arranque**: el botón QAM abre nuestro panel en cuanto Steam está **listo** (usuario + ventana), sin el margen; el margen de 6 s solo retrasa lo de fondo. Antes de iniciar sesión sigue el QAM de Steam (no hay usuario ni tiendas).
- **Música**: biblioteca de bandas sonoras (`app_type` 8192, `appStore.allApps`), 4 carátulas en Inicio cuando no suena nada; tocar abre su página `/library/app/<appid>` [H]. Reproductor con carátula del álbum y botones dibujados (aleatorio, anterior, play/pausa grande, siguiente, repetir/una). Prueba «Música»: qué expone Steam (SteamClient.Music y globales) y los álbumes, para integrar reproducción directa de pistas.

## 29. 0.29.0 (2026-11-07) — optimización tras regresión, Bluetooth compacto, carátulas, modo, cristal, leyenda
- **Zip 19:17 (0.28.0)**: regresión clara. Fluidez 7 W: cambio 117 ms (0.22: 63), reposo 43 fps (0.22: 54), columna 983 ms; 19 W: 21 ms (0.22: 14). Uso real a 10 W: abrir 664–861 ms (antes ~100), cambio de sección mediana 197 ms; 258 tareas largas, 36 % estilo/maquetación, 0 ms atribuidos a nuestro JS (los scripts de < 5 ms no se listan). Con música por auriculares BT el audio se cortaba.
- **Causas atacadas**: (1) `readAlbums()` recorría `appStore.allApps` (miles de apps) en cada repintado del reproductor (1/s con la posición) → caché 2 min + mapa por appid; (2) el precalentado de secciones (0.25) montaba todo en segundo plano → quitado; (3) Bluetooth: `bluetoothctl info` de cada emparejado en cada lectura (7+ procesos cada 6 s) → tipo cacheado y lectura cada 10 s.
- **Bluetooth**: máximo 3 (conectados + emparejados, audio primero) y 3 cercanos; «Conectando…/Emparejando…» con puntos animados; «Todos en Ajustes ›» → `/settings/bluetooth`; Wi‑Fi: 3 redes + «Todas en Ajustes ›» → `/settings/internet` [H rutas].
- **Carátulas**: las bandas sonoras casi nunca tienen carátula de biblioteca (salían rotas) → cabecera de tienda `cdn.cloudflare.steamstatic.com/steam/apps/<appid>/header.jpg` (apaisada), 3 álbumes, icono de nota si falla.
- **Modo de Inicio**: fila tipo tarjeta (icono en círculo, «Modo · Escritorio» + para qué sirve, «Cambiar»); al tocar se despliegan los modos como chips normales.
- **Tema propio «Cristal»** (experimental): superficies translúcidas `rgba` + `backdrop-filter: blur(24px) saturate(170%)` + brillo superior y borde fino; a ≤ 8 W sin desenfoque y casi opaco.
- **Leyenda inferior**: «Elegir», «Cerrar panel/Cerrar columna», LB/RB «Sección anterior/siguiente» (`onOKActionDescription`, `onCancelActionDescription`, `actionDescriptionMap`).
- **«Screen reader enabled» en la leyenda** = el lector de pantalla de Steam está ACTIVADO: es lo que lanza orca (que se cuelga en bucle) y además anuncia cada cambio de foco (coste en cada movimiento). Se desactiva en Ajustes de Steam › Accesibilidad.

## 30. Versión 0.30.0 (2026-11-07)

- **Reinicio al abrir el panel con un juego arrancando** (zip 19:31: «entrar al juego» → «abrir panel» 2 s después → volcado de Steam 12 s después). Ventana de arranque de 12 s (`gameWatch.ts`: `RegisterForGameActionStart` + detección del juego nuevo): durante ella el botón QAM abre el QAM de Steam y deja la miga «botón QAM con el juego arrancando».
- **Niveles de potencia unificados** (`powerTiers.ts`): ahorro ≤ ecoW, fluido ≥ fluidW. Sugerido 8/9 W (medido: 7 W = 170–240 ms por cambio; 9 W = 20–35 ms); +1 W con el tema Cristal y +2 W con pantalla externa/4K [H]. El modo ligero (`lowPower`), la eficiencia de los temas (`themeEco`) y el impulso del menú usan los mismos umbrales. Tarjeta «Potencia del menú» en Energía (Sugerido / a mano).
- **En ahorro el panel gasta menos**: sin animaciones ni desenfoque, sondeos al doble de intervalo, reproductor sin repintar cada segundo (cada 5 s o al cambiar de pista).
- **Cristal**: el reproductor anclado tiene su propio fondo (`dockSurface`) con desenfoque y más opaco; en los demás temas lleva el color del panel debajo.
- **Música**: «Detener» (Steam no trae Stop: pausa + posición 0 + oculta el reproductor hasta que vuelva a sonar); «Álbumes ›» con el reproductor activo para cambiar de álbum (abre su página de Steam; Steam no deja empezar un álbum desde fuera); portadas cuadradas con cadena de alternativas (las de Steam por `appStore`, vertical local, `store_item_assets` del CDN nuevo, cabecera antigua). Las bandas sonoras nuevas (Expedition 33) no tienen imágenes en `steam/apps/<id>/` del CDN antiguo.
- **Bluetooth**: estado compartido (`bzSnapshot/bzRefresh/bzDo` en `network.ts`) entre el interruptor rápido y la tarjeta; cambio optimista y relectura a 0,6/2/5 s; backend con las 3 listas en paralelo y `rfkill unblock` antes de encender.
- **Diagnóstico**: paso «Procesos en segundo plano» (con la orden completa de cada proceso: en la salida de Metro se vieron `gst-launch-1.0` ~40 % CPU y `opengamepad-ui` ~26 %); sonda del lector de pantalla y niveles de potencia en «Entorno»; la prueba de Música guarda las carátulas probadas.

## 31. Versión 0.31.0 (2026-11-07): las caídas son de la sesión gráfica

- **Hallazgo (zip 20:37):** al cerrar Metro 2033 Redux (20:32:39, `Apps.TerminateApp`) el webhelper registra `Fatal IO error 11 … on X server :0` y a los 3 s arranca un gamescope-session nuevo (otro PID; OpenGamepadUI y Steam se relanzan). La de las 19:31 (al arrancar el mismo juego) tiene el mismo patrón. No es Steam solo: cae **toda la sesión** (gamescope/Xwayland) y el volcado de Steam es una consecuencia.
- **Sospechoso a revisar:** `gst-launch-1.0 pipewiresrc path=169 … width=32,height=18 ! fdsink` consume ~43 % de CPU todo el rato: captura la pantalla de gamescope en miniatura (típico de una sincronización de luces con la pantalla). gamescope ya registraba `push_pipewire_buffer: Already had a buffer?!`. Plugins candidatos: Colores, Picture in Picture, Decky Sunshine. El paso «Procesos» guarda ahora quién lo lanzó (`lanzado_por`).
- **Forense:** `tipo` distingue «toda la sesión de juego se reinició (gamescope/Xwayland)»; `sesion_grafica` (X perdido, gamescope arrancó, fin del juego), `gamescope_anterior` (últimas líneas del gamescope que murió) y el texto de los volcados `assert_*.dmp`.
- **Calma** (`calm.ts`): 25 s al lanzar un juego y 15 s al cerrarlo. El botón QAM abre el de Steam, el tema no se toca (se aplaza), el perfil de pantalla se reafirma al final (antes a los 2,5 s), y la medición de salida queda desactivada por defecto.
- **Aislar fallos** (Diagnóstico): apagar por separado el panel con juego, los perfiles de pantalla, la eficiencia del tema, el reproductor, la medición de salida y el registro; también «Apagar todo». Las migas de la sesión dicen qué estaba apagado.
- **Música:** se pausa sola al desconectar unos auriculares (desde el panel o fuera) y si el contador corre más de 2,5× el reloj (salida de audio perdida). El reproductor anclado es una sola fila de botones; los otros álbumes van aparte, en la fila «Cambiar de álbum».
- **Color del tema:** con un adaptador de tema (Luminous Atlas) el acento del tema manda sobre el elegido en Panel (riel, barras y selección). La prueba «Tema» guarda lo que daría el modo Panel aunque se use otro.

## 32. Versión 0.32.0 (2026-11-07): OpenGamepadUI y la música

- **La caída al cerrar un juego (zip 21:24):** Metro se cierra a las 21:19:02 y a las 21:19:03 el proceso principal de la sesión (`opengamepad-ui`, Godot, sesión `gamescope-session-plus ogui-steam`) termina con sus mensajes de salida («leaked at exit», «Unreferenced static string»). Al cerrarse, la sesión entera se relanza. El panel llevaba 33 s cerrado. El volcado de Steam dice `Assert( nGameID.AppID() != k_nGameIDSteamWebHelper ): ../clientdll/systemperfmanager.cpp:561`: es el gestor de rendimiento de Steam en la caída, no código del plugin. El forense marca ahora `opengamepadui_se_cerro`.
- **gst-launch-1.0 (~42 % CPU) lo lanza el plugin Colores** (`lanzado_por`): captura la pantalla a 32×18 de forma continua.
- **Música:** el detector de «contador corriendo» daba falsos positivos (pausaba al cerrar el panel). Ahora mide sobre ventanas de 6 s y solo pausa a más de 3×. La desconexión de auriculares se confirma en dos lecturas seguidas de BlueZ.
- **Calma sin QAM de Steam por defecto:** durante la calma el botón abre nuestro panel; el QAM de Steam en la carga es una opción («QAM de Steam mientras carga»).
- **Prueba «Música · controles, cruceta y estrés»** (al final de la batería): pausas solas durante toda la batería, velocidad del contador (1,0 = bien), play/pausa/siguiente/anterior, posición quieta en pausa y si la cruceta alcanza todos los botones del reproductor anclado y sale hacia arriba.
- **Aislar fallos rediseñado:** filas de interruptor (texto a la izquierda, interruptor a la derecha; la fila entera se activa con A), agrupadas en «Al arrancar o cerrar un juego» y «Funciones de fondo».

## 33. Versiones 0.33–0.34 (2026-11-07)

- **Música (0.33):** Steam da la posición en **milisegundos**. Se mostraba como segundos: de ahí el contador «acelerado», y el detector de salida perdida pausaba la música cada 6 s (las pausas al navegar). Ahora `toSeconds()`, y el detector solo anota. La prueba de música da ×0,99.
- **Sonido (0.34):** `py_modules/qam_audio.py` interpreta `wpctl status` (salidas y micrófonos, la activa, volumen, silencio); backend `audio_state`, `audio_set_default`, `audio_mute`, `audio_volume`. Tarjeta «Sonido» en Pantalla y sonido (fichas con icono: altavoces / auriculares / HDMI; micro con silencio y volumen). Prueba Python en `tests/py/test_audio.py`.
- **Rendimiento avanzado (0.34, experimental):** `readExtras()` busca en `perfStore` por patrón tearing, media resolución, sin límite y nivel del overlay; solo se muestra lo que tiene valor y setter, y tras cambiarlo se relee. «Contrato con Steam» guarda `perfAvanzado` (setters y claves reales).
- **Potencia del menú (0.34):** `menuStats.ts` acumula (en localStorage, entre sesiones) el tiempo de cambio de sección y de apertura por vatio y por situación (sin juego / con juego). `learnFrom()` sugiere el vatio desde el que va fluido cuando hay medidas lentas por debajo; manda sobre lo de fábrica (acotado a ±3 W). La tarjeta muestra una barra con las zonas y la potencia actual, −/+ para el límite y «Impulso al abrir» (ahora activado por defecto).
- **Diseño (0.34):** animación al pulsar (`fx.ts`: hundir y rebotar, icono que salta, halo del acento; se anula en ahorro); iconos dibujados para el Wi‑Fi (abanico de 4 niveles + candado), los dispositivos Bluetooth, las pestañas de Amigos y el estado de cada amigo (mando, punto, luna, aro); títulos de tarjeta en versalitas; fichas inactivas con el color de pista (antes invisibles dentro de una tarjeta); sin el «Encendido/Apagado» repetido en Conexiones.
- **Apariencia (0.34):** pantalla propia en Más con tres tarjetas: Colores (modo + temas propios en rejilla), Personalizar (acento, esquinas, espacio, animación) y Tema de Panel de Control (fondo y eficiencia como interruptores). `withPrefs()` aplica acento/esquinas encima de cualquier tema; la densidad cambia el relleno y la separación de las tarjetas.
- **Pruebas (0.34):** «Pruebas sueltas» con todos los pasos de la batería (luz de cada uno, `runOneStep`), pasos nuevos «Sonido» y «Potencia del menú», y una guía «Cómo medir con un juego».
- **Remote Play (0.33):** prototipo de interfaz en Conexiones › Remote Play (sin funcionalidad). **Amigos:** selector de estado con icono y explicación.
- **Teclado:** la sonda de 0.33 no encontró ningún método para mostrar el teclado (`teclado: []`); el atajo se oculta si no hay forma.

## 34. Versión 0.35.0 (2026-11-08): sonido seguro y orden de Energía / Pantalla y sonido

- **Fallo de 0.34 en el audio:** en el Ally (Bazzite), los altavoces suenan por un **filtro** de PipeWire (ecualizador y limitador, sección «Filters», `[Audio/Sink]`). 0.34 solo leía «Sinks» y ofrecía la tarjeta en crudo («Ryzen HD Audio Controller Analog Stereo»): al elegirla se saltaba el filtro y sonaba más fuerte y raro. Ahora `qam_audio.choices()` ofrece el filtro como «Altavoces» y oculta la tarjeta en crudo; la activa sale del nodo por defecto real (`wpctl inspect @DEFAULT_AUDIO_SINK@`); `crudo_activo` avisa y «Restaurar» llama a `audio_reset` (`wpctl clear-default`, o `set-default` al filtro). La prueba «Sonido» guarda el texto de `wpctl status`. [H] nombre real del filtro sin ver aún.
- **Sonido:** una sola tarjeta. El ecualizador de Panel va arriba y debajo lo del sistema (aviso, salida solo si hay ≥ 2 de verdad, micrófono). Fuera «Sonido avanzado» repetido.
- **Pantalla y sonido:** el riel lleva ahora un icono de pantalla con altavoz (el sol parecía brillo). Orden: Fluidez → Escalado → Color → Rendimiento → Sonido. La tarjeta «Rendimiento» reúne el nivel del overlay, «Baja latencia» y «Overlay también en Steam» (nombres reales del contrato: `SetLowLatencyModeEnabled`, `SetShowPerfOverlayOverSteamEnabled`, `SetPerfOverlayLevel`) y el enlace a Steam. «Límite de FPS» no se añade: ya está en Fluidez como «Sin límite».
- **Energía:** una sola barra de potencia. Las zonas del panel (ámbar = ahorro, verde = fluido) van como una tira bajo la barra de Panel; lo aprendido de este juego, dentro de la misma tarjeta; la antigua «Potencia del menú» queda como «Ahorro del panel», sin barra (límite −/+, Sugerido e Impulso).

## 35. v0.36.0 — Modo juego ordenado, tipos de juego, audio sin duplicados, chat
- **Sin «Como en Steam»**: con juego todo se guarda en ese juego (`ScopeBadge` solo dice «Este juego»; `GameProfileCard` → «Guardado en este juego», sin botón de reset).
- **Energía**: una tarjeta de potencia (barra + tira de zonas + presets compactos + `PowerModes` Manual/Auto‑TDP/Descargas + `LearnRow` con barra de progreso + `PanelSaver` plegable «Fluidez del panel»). «Modo Eco» pasa a «Descargas» y solo fuera de juego (repetía el preset Eco).
- **Tipo de juego** (`gameKind.ts`, `GameKindCard`): Simple/Medio/Exigente → FPS y vatios según cargador y «Ahorrar batería» (exigente ≥40 FPS; medio 60→30 ahorrando; simple 60→30; exigente sin cargador usa FSR). Vatios [H] estimados; lo aprendido de Panel manda. En Energía y, compacto, en Inicio de juego.
- **Pantalla**: Fluidez compacta (VRR como chip con icono + refresco en una fila); «Avanzado» plegado con el rendimiento de Steam.
- **Audio** (`qam_audio.choices`): un solo «altavoz» y un solo «micro» (colapsa filtros duplicados que crea el gestor de Panel), sin nombres vacíos, `ocultos` en el diagnóstico. Micrófono: fila plana (botón silencio + barra).
- **Chat**: el mensaje propio aparece al instante (pendiente) y el autoscroll sigue al último mensaje (antes dependía de `msgs.length`, tope 40). Etiquetas BBCode desconocidas vacías se pintan «✨ Efecto». Prueba nueva «Teclado y efectos del chat» (`chatProbe`, sección `chatEfectos`).
- **Apps**: pestañas con icono, tarjeta «Apps de QAM» con avatar, chips compactos con icono, iconos con sombra.
- Tests: 222 (nuevos en `tests/v036.test.ts`).

## 36. v0.37.0 (2026-11-11) — Plan de mejora, fase 1: una sola elección de tipo de juego
- Plan completo en `claude/qam-plan-mejora.md` (fases 0–6).
- **Duplicidad quitada:** «Modo de Inicio» con juego y «Tipo de juego» (0.36) eran dos elecciones con los mismos nombres. Ahora es una: se guarda en `homeModes.perGame` (`KIND_MODE`, `kindOfMode`); `gameKind.kindOf/setKind` leen y escriben ahí; lo elegido en 0.36 se adopta una vez. `onHomeModesChange` avisa a Inicio, Energía y pruebas.
- **Inicio de juego:** la tarjeta «Tipo de juego» es el único selector (sustituye a la barra de modos con juego); al tocar aplica el preset y cambia el kit de plugins. Sin elegir, sugiere por nombre (emuladores → Simple).
- **Energía con juego:** tarjeta «Preset · <tipo>» con el resumen, «Aplicar» y «Ahorrar batería» (sin selector repetido).
- `situation.ts` usa el mismo tipo para la clave de las pruebas. Tests: 225 (`tests/v037.test.ts`).
- Sin verificar en el equipo: 0.35, 0.36 y 0.37.

## 37. v0.38.0 (2026-11-11) — zip 23:39 (0.37) y apps abiertas
- **Zip 23:39 [V]:** contratos 12/12 y 34/34. `wpctl status` real del Ally: filtros `ROG Ally` (44, sistema), `effect_input.spatializer`, sumideros de Bazzite `game_output` / `voice_output` / `browser_output` / `music_output` (loopback) y `ROG Ally EQ` (130, el ecualizador de Panel, por defecto). `choices()` deja una salida y oculta 6. Sin caídas de sesión nuevas. `fps_limit_options` = [30, 60, 120, 0] a 120 Hz; refresco manual 40–120 Hz.
- **40 FPS:** `gameKind.hzFor(meta, min, max)` → si la meta no está entre las opciones, se pone el refresco (80 Hz) y 700 ms después el límite.
- **Tipo «App»** (`KINDS`, `APP_NAME` en homeModes): navegador, YouTube/MiniTube, música, lanzadores (Firefox y «hub» aparecían como juegos en las migas). Inicio usa `HomeNormal` con el selector arriba (`GameKindAuto`), kit de plugins «Multimedia» (id `pelicula`), preset 60 FPS · ~8 W, situación de pruebas `app`.
- **Modos sin juego:** Escritorio · Multimedia · TV. «Amigos» quitado (lo guardado cae en Escritorio).
- **Efectos del chat:** el sondeo guarda también `GetChatRoomEffectSettings()`.
- Tests: 230.

## 38. v0.39.0 (2026-11-11) — fase 2: Auto‑TDP por tipo y almacén de Panel
- **Auto‑TDP por tipo** (`panelExtra.setAutoTdpConfig` → `set_auto_tdp_config(target_fps, initial_tdp, scope, appid, context_appid, min_tdp, max_tdp)`, firma leída en la API de Panel): `planFor` devuelve `floor`/`ceil` (Simple ≤ 12 W, Medio ≤ 18 W, Exigente ≤ máx.; ahorrando batería techo = partida + 3; App sin rango). `GameKindCard.apply` configura y enciende el Auto‑TDP; si Panel no lo admite o falla, vatios fijos. Preferencia `qam-rail:kind-auto` («Vatios automáticos», por defecto sí). [H] sin probar en el equipo.
- Dato del zip 23:39: `auto_limits` 7–25 W (30 con cargador); `auto_config` de Metro: meta 40 FPS, partida 17 W; aprendido 15–20 W.
- **`panelStore.ts`**: entrada por clave con suscriptores, lecturas simultáneas unidas, `DEDUPE_MS` 500, `prime()` desde `TdpController.refresh`. `usePanel` se apoya en él (`refresh()` manual fuerza).
- Tests: 237 (`tests/panelStore.test.ts`).

## 39. v0.40.0 (2026-11-12) — FPS comprobados, reescaladores de Panel 0.88, foco de Inicio
- **Prueba de Carlos con 0.39:** el Auto‑TDP se enciende, pero el juego seguía a 60 FPS (la meta de 40 no quedaba); al abrir el panel el foco caía en «Simple» (primer control de Inicio) y parecía que el tipo se había cambiado.
- **`fpsTarget.applyFpsTarget`**: lee opciones → si falta la meta, `hzFor` + `SetDisplayRefreshRateManualHz(false, hz)` → sondea hasta 3 s a que `fps_limit_options` la incluya → `SetFPSLimit(false, meta)` → comprueba. Reserva `fallbackFps` (la más baja ≥ meta) y refresco restaurado. Sección `preset` en el informe.
- **Panel 0.88 (código nuevo, solo API leída):** reescaladores por juego (OptiScaler FSR/XeSS, HelixSR), generación de fotogramas (Mako/LSFG), `SetFPSLimit(external, v)` igual que el nuestro, y ruta moderna `gamescope_app_target_framerate` cuando `disable_refresh_rate_management` es true (no es el caso del Ally). `openUpscalersFor(appid)` existe dentro de Panel pero no es RPC.
- **`UpscalerCard`** (`panelExtra`: `upscalerGame`, `upscalerLive`, `upscalerConfigure`, `upscalerChoice`, `buildLabel`): entre Escalado y Color, solo con juego y si Panel responde.
- **Inicio:** `HomeGame` y `HomeNormal` ponen el selector de tipo debajo de la tarjeta de potencia.
- Tests: 244 (`tests/v040.test.ts`).

## 40. v0.41.0 (2026-11-12) — reescalador informativo y planificador único (fase 3)
- **Prueba de Carlos con 0.40:** cambiar la generación de fotogramas con el juego abierto → Panel lo rechaza (el reescalador se configura antes de iniciar el juego). `UpscalerCard` pasa a solo lectura (`upscalerFacts`); se quita `upscalerConfigure`.
- **`ticker.ts`**: `tickEvery(fn, ms, {exact, name})` sustituye a `window.setInterval` en hooks (usePanel/usePerf), mode, displayWatch, gameWatch, themeEco, AppsPanel, QamAudio, QamNetwork, QamNotices y QamSocial. Un `setInterval` de 250 ms; `MAX_PER_TICK` 3; ×2 en ahorro (`setTickerSlow(lowPower)` desde index) salvo `exact` (animación de puntos, chat y sala abiertos, voz ocupada). `tickerStats()` en `entorno.planificador`.
- Tests: 248 (`tests/ticker.test.ts`).

## 41. v0.42.0 (2026-11-12) — fase 3: abrir en dos tiempos, presupuesto, FPS que desaparecía
- **Zip 01:13 (0.41) [V]:** ver plan. Panel instalado sigue en 0.86 (sin reescaladores). `preset` de 0.40: `fps: null`.
- **`readPerf`:** `fps` ya no exige que `fps_limit` esté en `fps_limit_options`.
- **`ui.Deferred`** (sobre `Keep`): monta a los 30 ms y mantiene el alto reservado 700 ms. `HomeGame`: cabecera, potencia, brillo/volumen → diferido (tipo, pantalla rápida, plugins). `HomeNormal`: potencia, brillo/volumen, fichas → diferido (tipo de app, plugins, apps). `QamAppsCard` con `Keep`.
- **`budget.ts`** + paso `presupuesto` en las pruebas (usa `recentEvents()` de la última hora y `tiers().fluidW`).
- Sondeo de modo marcado `exact` en el planificador (no se aplaza).
- Tests: 252 (`tests/v042.test.ts`).

## 42. v0.43.0 (2026-11-12) — FPS por la vía moderna, juego «visto hace poco», propuesta de reorganización
- **Zip 01:42 (0.42) [V]:** `msgLimits.disable_refresh_rate_management: true` → `readPerf` no daba `fps` ni `refresh` (vía antigua). Ajustes de cliente: `gamescope_disable_framelimit` = true, `gamescope_app_target_framerate` = 60 (`settingsStore.GetClientSetting(n)` → `[valor, setter]`). Potencia: pedido 10 W, aplicado 12 W (`constrained`, `live_min`) con cargador.
- **`steamPerf`**: `modernFps(maxHz)`, `MODERN_FPS`, `setClientSettingsReader` (pruebas); `perfWrite.fps` elige la vía según `disable_refresh_rate_management`. `applyFpsTarget` no cambia (encuentra 40 entre las opciones).
- **`game.runningGameSticky` / `stickyPick`** (`STICKY_MS` 6000): lo usan `useMode` y `situation`; `gameWatch` lo alimenta cada 2 s. Salir de un juego tarda hasta ~6 s en reflejarse en el modo.
- **PowerCard:** la línea de detalle («En uso … W») siempre ocupa su hueco. Chip «Volver al Inicio de <juego>».
- Diagnóstico: `gamescope_enable_app_target_framerate` añadido a los ajustes de cliente que se leen.
- Propuesta de reorganización: `claude/qam-reorganizacion.md`. Tests: 255.

## 43. v0.44.0 (2026-11-12) — reorganización: riel de 7, Rendimiento, conexiones mínimas, ayuda con Y
- **Riel:** Inicio · Rendimiento (`energy`) · Imagen y sonido (`display`) · Conexiones · Apps · Social · Más. Se quita `notices` (pestaña de `SocialSection`: props `notices`, `unseen`; el globo suma no leídos y avisos).
- **Rendimiento:** `GameKindCard` (Preset en tres celdas: meta, vatios, pantalla) → `EnergyTdp` → `DisplaySection part="perf"` (Límite de FPS, Escalado, Reescalador) → `EnergyExtras part="battery"` → línea «Guardado en este juego» → `Fold` «Avanzado» (`EnergyExtras part="fans"`, `SteamExtras`, Panel). **Imagen y sonido:** brillo/volumen + `DisplaySection part="image"` (Color, Sonido). `PanelSaver` pasa a Más › Apariencia; la prueba de CPU, a Más › Pruebas; ajustes/mandos/teclado/ayuda, a Más › Sistema.
- **Conexiones:** `WifiCard` y `BluetoothCard` con `HeadSwitch` propio; solo red en uso + guardadas (`knownNets`) y dispositivos emparejados; «Otras redes ›» / «Emparejar otro ›» abren Ajustes de Steam. Wi‑Fi con estado compartido y optimista (`wfSnapshot/wfSubscribe/wfRefresh/wfRadio/wfConnect/wfApply`), confirmación a 0,7/2/5 s; `wifi_state` lee en paralelo. La ficha rápida de Inicio usa el mismo estado. Remote Play: fila «próximamente».
- **Ayuda:** `help.ts` (12 entradas), `Card help="…"` → `data-qr-help`; Y (botón 4) o el «?» abren una hoja al pie; B o Y la cierran. Leyenda: «¿Qué es esto?».
- **Chip activo:** clase `qr-chip` con variables y `!important` (contra estilos de Steam), negrita y marco. **Cristal:** panel 0,74, desenfoque 44 px. **Apps de QAM:** instalación plegada.
- **`gameKind.planFor`:** rangos Simple 7–10 · Medio 10–15 · Exigente 15–máx. (ahorrando 7–8 · 8–12 · 12–18); `hz` del preset (enchufado 2× FPS; batería = FPS, mínimo 40 Hz); `applyFpsTarget(…, prefHz)` solo donde hay refresco manual.
- Tests: 259 (`tests/v044.test.ts`; humo reescrito para la estructura nueva).

## 44. v0.45.0 (2026-11-12) — arreglos tras probar 0.44
- **Límite de FPS:** `Options` cortaba a `max=6` y «Sin límite» (la 8.ª opción de la vía moderna) quedaba fuera. Nuevo `perRow` (filas de 4, todas las opciones, ordenadas con «Sin límite» al final).
- **VRR:** `toggleVrr` escribe y a los 0,8 s relee; si no cambió, avisa y deja en las migas `vrr: pedido … ahora … juego <nCurrentGameID> perfil <nActiveProfileGameID>`. Hipótesis [H]: Panel solo escribe VRR cuando el perfil activo de Steam es el del juego; el FPS moderno es ajuste de cliente (global) y por eso sí funciona.
- **Color en «Pantalla de este juego»:** Panel devuelve `active_preset` null si algún campo del color (efectivo, tras ajustes propios del juego o modo noche) no coincide con el look. Se recuerda el último pedido por juego (`lastLook`) para no quedarse en «Personalizado» y avanzar al siguiente look; el aviso dice cuándo Panel no lo ve igual. Migas `color: pedido X → Panel ve Y`.
- **«Pantalla de este juego»:** fichas con icono (FPS, VRR, escalado, color) y ayuda (?).
- **Social:** pestañas en rejilla de columnas iguales (`Chip stack`, icono arriba y globo `badge`); con 5 pestañas en fila se aplastaban.
- **Auto‑TDP de Panel (leído en `py_modules/auto_tdp.py`):** no es aprendizaje por refuerzo: es un controlador por reglas (escalada). Con FPS ≥ meta estable 8 s baja 1 W; si FPS < meta−2 sube 2 W y espera 12 s; la memoria (`auto_tdp_learning.py`) guarda los vatios estables y usa la mediana tras 12 muestras como punto de partida. Baja al mínimo si el juego aguanta la meta sin esfuerzo (límite de FPS igual a la meta) o si el mínimo configurado es bajo; solo mide FPS medios, no tirones.
- Tests: 262.

## 45. v0.46.0 (2026-11-14) — tras probar en la TV
- **Datos del zip (13‑11):** BT4 con cargador y `auto_config` de Panel en meta 30 FPS / máx. 9 W (restos de un preset «ahorrando» del 12‑11); el límite de FPS moderno es un ajuste de CLIENTE (global), no de juego.
- **Causa probable de «todos los juegos a 30 FPS»:** `displayWatch` actualizaba el perfil «Steam» con los valores vigentes aunque acabara de salir de un juego (o aún no lo detectara, hasta 3 s), y un juego sin perfil propio no guardaba lo suyo: el 30 de uno se heredaba. Ahora: dentro de un juego lo que cambie se guarda solo en ese juego; el perfil de Steam solo se actualiza fuera de juego y 30 s después de un cambio de juego; almacén nuevo `qam-rail:display-profiles2` (parte limpio).
- **Modo del preset** (`gameKind.MODES`): Auto (ahorra solo sin cargador) · Ahorro (40 FPS, rangos de ahorro, también enchufado) · 30 FPS (FPS y vatios mínimos) · Pleno (sin ahorro de batería). Sustituye «Ahorrar batería», que solo salía sin cargador. La tarjeta muestra el límite de FPS actual.
- **TV/mando:** la barra de potencia acelera (1→2→3 W por pulsación si se mantiene el ritmo) y parte del último objetivo; botones VRR dicen «VRR activado/apagado».
- Tests: 267.

## 46. v0.47.0 (2026-11-14) — piezas del mapa de mejora y sonido
- Mapa completo y decisiones: `claude/qam-mapa-mejora.md`.
- **`ui.Segments`** (barra de posiciones): un solo `Focusable` (`data-qr-h`), izquierda/derecha mueven la marca y aplican al parar (350 ms; 600 en tipo y modo), A = siguiente, toque = aplicar. `Options` la usa por dentro (FPS con «∞», escalado, filtro, color, ventiladores, overlay, perfiles de sonido). También tipo de juego, modo del preset y `HomeModeBar` (iconos de línea, sin desplegable).
- **Sonido:** `SoundCard` = salida («Suena por», iconos) → micrófono → ecualizador (interruptor) → perfiles → nivelar. `audioTv.ts`: `tvTarget` (puro) y `checkTvAudio` (1,5 s tras abrir el panel): si la salida HDMI acaba de aparecer, pasa el sonido a ella; preferencia `qam-rail:audio-tv-auto`. Zip 13‑11: en la TV la salida seguía en «ROG Ally EQ»; el micro estaba silenciado al 19 % y su barra no lo activaba (ahora sí; el botón dice «Micro»/«Silenciado»).
- Tests: 271 (`tests/v047.test.ts`).

## 47. v0.48.0 (2026-11-14) — el tipo solo adapta el panel; FPS siempre manuales
- **Zip 23:36 (0.47):** `preset` = tipo exigente → 40 FPS y 18 W puestos al elegir el tipo (lo que Carlos notó como parpadeo y bajada por sorpresa). Micro: sigue «19 % · silenciado» tras moverlo.
- **`GameKindCard`:** elegir tipo solo llama a `setKind` (kit de Inicio y clave de pruebas). La tarjeta de Rendimiento pasa a «Vatios sugeridos · <tipo>»: no aplica nada hasta «Aplicar vatios»; nunca toca FPS, refresco ni escalado (`applyFpsTarget` ya no se usa desde la interfaz); la meta del Auto‑TDP es el límite de FPS del usuario. Modos: Auto · Ahorro · Mínimo · Pleno (solo rango de vatios).
- **`Segments`:** A confirma lo marcado (antes pasaba a la siguiente: «∞» + A = 30); lo pendiente se aplica al perder el foco o desmontarse; Color usa `lastLook` como valor cuando Panel dice «personalizado».
- **Micrófono:** además de `wpctl`, `SteamClient.System.Audio.SetDeviceVolume(id, 0, v)` [H]; a los 1,5 s se relee y, si no quedó, se avisa. Migas `audio: micro …`.
- Tests: 273.

## 48. v0.49.0 (2026-11-14) — sonido: el ecualizador de Panel no es una salida
- **Cómo trabaja Panel (leído en `py_modules/audio/pipewire.py`, sin copiar):** crea UN sumidero virtual `pdc_eq` («<equipo> EQ», filter-chain), lo pone por defecto y lo enlaza a un dispositivo real («downstream»: `alsa_output…` o `bluez_output…`). Si el sumidero por defecto pasa a ser un dispositivo real, Panel lo adopta como destino y vuelve a ponerse delante; sigue solo a unos auriculares Bluetooth recién conectados. Los demás canales virtuales (`ROG Ally`, `spatializer`, `game/voice/browser/music_output`) son de Bazzite, no de Panel.
- **Fallo de 0.35–0.48:** `choices()` trataba «ROG Ally EQ» como «Altavoces» y ocultaba la tarjeta real. Con auriculares: «Altavoces» (el EQ → auriculares) y «Auriculares» sonaban por el mismo sitio, y no se podía volver a los altavoces.
- **Ahora** (`qam_audio.choices`, `sink_names`, `eq_target`; `main.audio_state` lee además `pactl list short sinks` y `pw-link -l`): con el EQ presente se ofrecen los dispositivos reales (tipo por nombre interno: `bluez_output` = auriculares aunque la marca no se reconozca); la activa es el destino del EQ; elegir = poner por defecto el dispositivo real. Campo `eq {por_defecto, destino, leido}`. Sin EQ, como antes. [H] sin probar en el equipo: formato de `pw-link -l` y que los id de `pactl` coincidan con los de `wpctl`.
- Interfaz: tras elegir, 4,5 s sin repintar; «Restaurar el sonido del sistema» si ninguna salida queda activa.
- Abierto: audio entrecortado por Bluetooth (también con el panel cerrado, a 18 W, con Colores desactivado y con el EQ apagado).

## 49. v0.49.1 → 0.49.6 (2026-11-14/15) — diagnóstico de audio con datos reales
- **0.49.1:** prueba «Sonido · seguimiento 20 s» (`audio_trace` en `main.py`, `parse_sinks`/`trace_diff` en `qam_audio.py`, paso en `diagTests.ts`): anota cambios de ruta, volúmenes por salida, flujos, `pw-top`, perfil Bluetooth, reinicios de `filter-chain` y el registro de audio.
- **Hallazgos (zips 15‑11):** el nodo de los auriculares y el del ecualizador marcan 0 errores en `pw-top`; el ecualizador de Panel se reinicia en cada cambio de ruta y al reiniciar Steam/Decky (recrea el dispositivo y su volumen); los auriculares van en **LDAC** y el Wi‑Fi en 2,4 GHz canal 1; la tarjeta de los altavoces estuvo al 1 % mientras los auriculares eran el destino (origen sin identificar); con la TV, el EQ iba a HDMI y la interfaz marcaba «Altavoces».
- **0.49.2/0.49.3:** apagar Bluetooth y Wi‑Fi también con `rfkill block` y comprobación a 0,8–1 s (antes solo BlueZ / NetworkManager); la prueba guarda códec, Wi‑Fi y nº de reinicios del EQ.
- **0.49.4 — causa del entrecortado (confirmada por el usuario: «va más fluido»):** `AudioControls` leía el estado cada 6 s; cada lectura lanza 5 procesos contra PipeWire. Ahora 20 s y el backend guarda 4 s (`_audio_cache`, se borra al escribir). Regla: **sin sondeos de audio con el panel cerrado ni más rápidos de 20 s**.
- **0.49.5:** micrófono = `ToggleRow` + `XSlider` a todo ancho (antes barra al costado, inalcanzable); VRR y refresco en filas separadas (un control que captura ←/→ junto a otro en la misma fila era una trampa de foco); la prueba registra también el volumen del EQ.
- **0.49.6 — fallo de identificación (TV):** `pactl list short sinks` da índices que NO son los de `wpctl` (67519 frente a 149); el destino del EQ se buscaba por esos números, no coincidía y se suponía «altavoces». Ahora `sink_object_ids` lee `object.id` de `pactl list sinks` (o `wpctl inspect` de respaldo). Prueba nueva en `tests/py/test_audio.py`.
- **Abierto:** volumen bajo en altavoces (falta la prueba con altavoces como destino); origen del 1 % en la tarjeta real; confirmar si LDAC/2,4 GHz influyen cuando el panel está cerrado.

## 50. Auditoría de navegación con mando (2026-11-23)
- `tests/navAudit.test.ts` monta el lanzador completo (con y sin juego), recorre las 7 secciones del riel y busca: (1) **trampa horizontal** (un control con `data-qr-h`, que consume ←/→, en la misma fila que otro control); (2) `role=button` fuera de un enfocable (inalcanzable con el mando); (3) enfocables anidados. Incluye casos sintéticos para comprobar que la auditoría detecta lo que debe. 278 pruebas en total.
- Límite conocido: es estructural (happy‑dom no tiene geometría); no sustituye probar con el mando en la consola.
- Modelo de navegación en `Qam.tsx` (`onBodyDir`) y `nav.ts` (`listTarget`): filas visuales; ←/→ dentro de la fila; en los bordes no sale; los controles `data-qr-h` se quedan con ←/→.
- Estándar de apps y rediseño de Apps: `APPS-ESTANDAR.md` (`claude/qam-apps-estandar.md`).

## 51. v0.49.7 (2026-11-23) — Color atascado con el mando, volumen del dispositivo real

- **Síntoma (Carlos):** en «Imagen y sonido», la cruceta ↑/↓ dejaba de responder en Color.
- **Causa (reproducida en Chrome real, `tests/geo/`):** `applyLook` sustituía el estado de color por la respuesta de Panel. Si la respuesta no traía `supported`/`presets` (p. ej. `apply_oled_look`), `looks()` quedaba vacío, la tarjeta pasaba a «Este equipo no permite ajustar el color» y el selector enfocado desaparecía: el mando se quedaba sin foco. La geometría de filas (↑/↓) era correcta.
- **Arreglos:** `panelExtra.mergeColor` (la respuesta se une a lo sabido) y `usePanel.set` une cualquier respuesta parcial de Panel (HDR, noche, ventiladores, audio… tenían el mismo patrón). Red de seguridad en `Qam.tsx`: un `MutationObserver` recupera el foco (mismo índice) si el control enfocado desaparece con el mando en uso.
- **Arnés de geometría real** (`tests/geo/`): `vite build` con `@decky/ui` simulado + Chrome headless (playwright) → recorre ↑/↓ de cada sección con rectángulos reales. Uso: `node <vite>/bin/vite.js build -c tests/geo/vite.config.mjs && python3 tests/geo/run.py` (`run.py full|partial` prueba Color). Resultado: filas correctas en las 7 secciones; «Brillo | Volumen» y «Modo noche | HDR» comparten fila (los dos deslizadores no se alcanzan con ←/→ entre sí: pendiente).
- **Volumen bajo de altavoces [H]:** con el EQ de Panel delante, el volumen que se mueve es el del EQ; el del dispositivo real (alsa) se quedaba en 1 %–40 %. `audio_set_default` sube a 100 % el dispositivo real (no Bluetooth) si está < 90 % y le quita el silencio. Sin verificar en el equipo.
- Tests: 281.

## 52. v0.50.0 (2026-11-23) — apps de QAM: manifiesto esquema 1 y tubería de instalación
Detalle del estándar en `claude/qam-apps-estandar.md`; la pestaña «Steam» (apps de escritorio) está diseñada en `claude/qam-apps-steam.md` (para 0.52).
- **Manifiesto esquema 1** (`qam_apps.read_manifest/check_manifest`): `schema, group, description, uninstall, data_dirs, update{provider:github-release,repo,asset,checksum,channel}, status, min_qam_rail` con valores por defecto (las apps antiguas, como MiniTube, siguen funcionando). `check_manifest` da **errores** (rutas fuera de la carpeta de la app —`launch/install/uninstall/status/art`—, `update` mal formado, `data_dirs` fuera de la carpeta personal, esquema más nuevo, `min_qam_rail` mayor) que impiden instalar, y **avisos**. `~` se expande con la carpeta personal del usuario (`decky.DECKY_USER_HOME`), no la del proceso (Decky corre como root).
- **Tubería** (`py_modules/qam_pipeline.py` + `main._apps_install_task`): preparar aparte en `qam-apps/.staging/` (SHA‑256 con `SHA256SUMS` o suma conocida; límites de archivos/tamaño/ratio; rechaza rutas peligrosas y enlaces simbólicos) → comprobar manifiesto → **confirmar** (solo la primera instalación de una app con instalador propio; sin respuesta en 120 s se cancela) → cambio atómico (la versión instalada pasa a `.previous/<id>`; la «anterior» de antes se conserva hasta que termina bien) → `install.sh` (10 min, código ≠ 0 = fallo) → prueba de `status` (JSON en 8 s) → registro. Cualquier fallo después del cambio **vuelve a la versión anterior** (o quita lo hecho si era la primera) y marca la versión como **mala** (no se reintenta sola; «Forzar» la permite). Al arrancar se limpian restos de `.staging`.
- **Backend nuevo:** `apps_install(source, confirmed, sha256, force)`, `apps_confirm(ok)`, `apps_rollback(id)` (ir y volver), `apps_uninstall(id, purge_data)` (ejecuta `uninstall` si hay; **no** toca `data_dirs` salvo `purge_data`, y solo dentro de la carpeta personal); `apps_list` añade `has_previous, previous_version, bad_versions, last_error, installed_at, check`.
- **Interfaz** (provisional hasta el rediseño de 0.52): fila de confirmación («Esta app ejecuta su propio instalador»), chip «Volver a <versión>», avisos con «descarga verificada» y qué versión se restauró.
- **Pruebas:** `python3 tests/py/test_apps.py` (versiones, SHA‑256, manifiesto, zip hostil, preparar/cambiar/volver, flujo completo con `decky` simulado: confirmar/cancelar, suma incorrecta, actualizar, instalador roto, `status` roto, versión mala, manifiesto peligroso, rollback, purga de datos, limpieza) + `tests/v050.test.ts`. 285 tests de interfaz.
- Pendiente (0.51): comprobar GitHub (ETag, 6 h), instalar/actualizar desde release, canal estable/beta.

## 53. v0.50.1 (2026-11-23) — licencia GPL-3.0, teclado en pantalla, repositorio para GitHub
- **Licencia:** GPL-3.0-only (decisión de Carlos). `LICENSE` con el texto completo; `package.json` y README actualizados.
- **Teclado en pantalla** (`keyboard.toggleKeyboard`, `main.keyboard_url`): Más › Sistema › «Teclado en pantalla» (ya no se oculta). Orden: método interno de Steam (`m_refKeyboard`) → enlace profundo `steam://open/keyboard` / `steam://close/keyboard` por `SteamClient.URL.ExecuteSteamURL` o `System.OpenURL` → respaldo del backend (`steam -ifrunning <url>` como el usuario; Decky corre como root, se usa `runuser -u`). [H] sin probar en el equipo; la sonda de 0.33 no encontró método interno. Abrirlo solo al tocar un campo de texto de apps de escritorio no es viable de forma general.
- **Repositorio:** `.gitignore`, `CHANGELOG.md`, `.github/workflows/ci.yml` (tsc + vitest + pruebas Python + build) y `release.yml` (al crear una etiqueta `v*`, `scripts/package.sh` genera `qam-rail-X.zip` + `SHA256SUMS`, el mismo formato que usará la actualización desde GitHub de 0.51). Sin datos personales ni secretos en el código.
- **Pestaña Steam (diseño):** solo se agrega desde el QAM, no se oculta nada; carpeta de Gear Lever; navegadores a pantalla completa; mando con la plantilla «Gamepad with Mouse Trackpad». Ver `claude/qam-apps-steam.md` §9.
- Tests: 289 (`tests/v0501.test.ts`).

## 54. v0.51.0 (2026-11-23) — actualizaciones de apps desde GitHub Releases
- **`py_modules/qam_updates.py`** (puro, red inyectada): `pick_release` (canal estable ignora prereleases; beta las incluye; borradores nunca; la más nueva por versión), `pick_assets` (el .zip que casa con `update.asset`, sin `-src-`, y `SHA256SUMS`), `check_app` (caché por app en `updates.json`: ETag + `checked_at`; **como mucho cada 6 h** salvo «Buscar ahora»; un 304 conserva lo guardado), `https_ok` (solo HTTPS a `github.com`, `api.github.com`, `objects/release-assets.githubusercontent.com`, sin usuario en la URL), `download` (tope 600 MiB).
- **Backend:** `apps_check_updates(force)` (solo avisa; se llama al abrir la tarjeta de Apps, es decir, con el panel abierto) y `apps_update(id)`: descarga a `.staging/dl-*`, verifica con `SHA256SUMS` (**sin sumas no se instala**), y entra en la tubería de 0.50 (cambio atómico, `install.sh`, prueba de `status`, vuelta atrás y «versión mala»). La descarga comprueba el host también tras redirecciones.
- **Interfaz:** botón «Actualizar a X (beta)» en la ficha de la app y «Buscar ahora» en Instalar. Nada se instala solo.
- **Pruebas:** `tests/py/test_updates.py` (canales, borradores, ETag/6 h/force, 304, hosts, tope) + `tests/v051.test.ts`; flujo completo comprobado con `decky` y red simulados (comprobar → actualizar → v2.0 verificada; sin SHA256SUMS rechaza). 291 tests de interfaz. [H] sin probar contra GitHub real desde la consola.
- **No cubre aún:** auto-actualización del propio QAM Rail (se instala con `install.sh`/zip), aviso en el riel (0.52).

## 55. v0.51.1 (2026-11-23) — repositorio y escáner de apps de escritorio
- **Repositorio:** `github.com/pascaltll/qam-rail` (GPL-3.0). `package.json` con `repository/homepage/bugs`; README con instalación desde Releases y desarrollo.
- **`py_modules/qam_desktop.py`** (0.52 a): lee `.desktop` de Flatpak (`/var/lib/flatpak/exports…`, `~/.local/share/flatpak/exports…`), de `~/.local/share/applications` (donde Gear Lever deja los suyos) y `/usr/share/applications`, y AppImages sueltos de `~/AppImages` y `~/Applications` (marca `AI\x01/\x02` en el offset 8 tras la cabecera ELF [H: carpeta por defecto de Gear Lever]). `Exec` → lista de argumentos sin `%U…`; con `; & | < > $ ( ) \``  se rechaza (no se lanza). Se ignoran `NoDisplay`, `Hidden`, `Terminal=true`, `OnlyShowIn` sin KDE, Steam, Decky, QAM Rail, «Volver al Modo Juego». Grupos por `Categories` (Navegadores, Multimedia, Juegos y emuladores, Oficina, Desarrollo, Herramientas, Otras). Claves estables: id de Flatpak · nombre del `.desktop` · hash de la ruta del AppImage. Mismo nombre en varias fuentes: gana Flatpak > AppImage > sistema.
- **Backend:** `desktop_scan(force)` (hilo aparte, caché 10 min, informa `omitidas/motivos/ms`). `qamApps.desktopScan` + tipo `DesktopApp`. Sin interfaz todavía.
- **Pruebas:** `tests/py/test_desktop.py` (analizador, `Exec` hostil, reglas, magia AppImage, escaneo completo hermético). CI las ejecuta.
- Siguiente (0.52 b): pestaña Steam con interruptor «En Steam» (`AddShortcut/RemoveShortcut` + `apps-steam.json`), «Abrir», teclado y navegadores a pantalla completa.

## 56. v0.51.2 (2026-11-23) — repositorio publicado, actualización y limpieza
- **Repositorio:** `github.com/pascaltll/qam-rail` (público, GPL-3.0), primer commit `c28b0c1` en `main`; CI verde (tsc + vitest + pruebas Python + pruebas de scripts + build). La etiqueta `v0.51.2` (que dispara el release con el zip, `SHA256SUMS` e `install.sh`) no se pudo subir desde la sesión de Claude: hay que hacerlo desde la consola de Carlos (`git tag v0.51.2 && git push origin v0.51.2`).
- **`scripts/install.sh`** (sustituye al anterior, mismas opciones locales): `--check`, `--latest [--beta]`, `--version X`. Elige la release (estable ignora prereleases y borradores), baja solo de `github.com` por HTTPS, **exige SHA-256** (sin `SHA256SUMS` o con suma distinta no instala), copia de seguridad antes de instalar y solo se conservan las últimas `KEEP_BACKUPS` (5). `QAM_RELEASES_FILE` permite probar sin red.
- **`scripts/limpiar.sh`:** por defecto solo muestra el plan; `--aplicar` mueve a `_archivo/` los `qam-rail-X.zip` viejos (conserva 3), `-src-` (1), diagnósticos (3), módulo Amigos, exploradores sueltos y copias de la arquitectura; `--borrar` elimina `_archivo/` con confirmación. Nunca toca `install.sh`, `qam-rail/`, `qam-app*.json`, `backups/`, `nuevo/`.
- **Pruebas:** `tests/sh/test_scripts.sh` (9 comprobaciones: canal estable/beta, versión concreta, poda de copias, suma falsa no instala, limpieza no toca lo protegido). Bug corregido en el camino: la función de limpieza del `trap EXIT` devolvía 1 con `set -e` y hacía fallar `--check`.
- Flujo habitual: cambios → `git push` → CI → etiqueta `vX.Y.Z` → release → en la consola `./install.sh --latest`.

## 57. v0.52.0 (2026-11-23) — QAM Rail se actualiza solo desde el QAM; primera instalación
- **Decisión:** avisar y actualizar **con un toque**, nunca en silencio: el plugin sustituye el QAM de Steam y reinicia Decky, así que una actualización automática sin que Carlos lo sepa podría dejarle sin panel. La comprobación sí es automática (al abrir Más › Actualizaciones, como mucho cada 6 h; «Buscar actualización» fuerza); instalar pide confirmación («Decky se reinicia unos segundos»).
- **`py_modules/qam_self.py`:** `stage` (descomprime con los límites de la tubería; exige una sola carpeta `qam-rail` con `plugin.json`, `package.json`, `main.py`, `dist/index.js` y la versión esperada), `swap` (copia de seguridad en `settings/qam-rail/backups`, últimas 3; la nueva se copia a `.qam-rail.nuevo` junto al plugin y se cambia por renombrado; si falla se deja la anterior), `restore` (copia más reciente; consume esa copia).
- **Backend:** `self_info`, `self_check(force)` (usa `qam_updates` con `asset: qam-rail-[0-9]*.zip`, que excluye `-src-`), `self_update` (descarga solo de GitHub, **SHA256SUMS obligatorio**, verifica, prepara, cambia y `_restart_decky_later(3)`: `sh -c "sleep 3; systemctl restart plugin_loader"` desligado de la sesión; Decky corre como root), `self_rollback`, `self_set_channel` (`self-update.json`). Solo actúa si la carpeta se llama `qam-rail`.
- **Interfaz:** `QamSelfUpdateCard` en Más (estado, «Buscar actualización», «Actualizar a X», «Volver a X», Estable/Beta; confirmación que avisa del reinicio) + ayuda `actualizar`.
- **Primera instalación (`scripts/instalar.sh`):** una línea con `curl … releases/latest/download/instalar.sh | bash`. Revisa: imprescindible (`curl unzip python3 sha256sum`, no root), Decky (`~/homebrew/plugins`, servicio `plugin_loader`; pista Bazzite: `ujust setup-decky` [H]), recomendado (plugin Panel de Control por `plugin.json`, `wpctl`, `bluetoothctl`, `nmcli`, `rfkill`, `flatpak`, Steam en marcha) y luego instala con `install.sh --latest` (de al lado o de la misma release). `--doctor` solo revisa. Dónde queda todo: plugin `~/homebrew/plugins/qam-rail`; ajustes `~/homebrew/settings/qam-rail`; apps `~/homebrew/qam-apps`.
- **Dependencias reales:** duras = Decky Loader; blandas (se oculta o avisa esa parte) = Panel de Control (potencia, color, sonido, Auto‑TDP), PipeWire/`wpctl`, BlueZ, NetworkManager, flatpak. QAM Rail no copia código de Panel (solo lo llama).
- **Pruebas:** `tests/py/test_self.py` (preparar, copia, poda, vuelta atrás), integración con `decky` y red simulados (comprobar → actualizar → volver; sin SHA256SUMS rechaza), `tests/v052.test.ts` (293 en total), y `instalar.sh` instalado de extremo a extremo con un usuario sin privilegios y un release simulado. [H] sin probar en la consola real: que `systemctl restart plugin_loader` desde el backend (root) se ejecute y que `DECKY_PLUGIN_DIR` sea `~/homebrew/plugins/qam-rail`.


## 58. Canales estable / dev (0.53)

**Problema.** Probar versiones nuevas en el mismo equipo donde se usa el QAM a diario. Estable = la que se actualiza sola desde GitHub; dev = la que se prueba antes con zips.

**Diseño.** Dos plugins de Decky a la vez, construidos del mismo código:

| | Estable | Dev |
|---|---|---|
| Carpeta / nombre | `plugins/qam-rail` / «QAM Rail» | `plugins/qam-rail-dev` / «QAM Rail Dev» |
| Actualización | GitHub Releases (§53–§57) | zip + `install.sh --dev`; el backend rechaza `self_check/update/rollback` |
| Ajustes | `settings/qam-rail` | `settings/qam-rail-dev` (separados) |
| Versión | `0.53.0` | `0.53.0-dev.N` |

Compartido: `~/homebrew/qam-apps` (mismo esquema de manifiestos) y la carpeta `settings/qam-rail-canal/` con `activo` («estable» o «dev») y `aviso`.

**Quién dibuja.** `qam_channel.active()`: la bandera si apunta a algo instalado; sin bandera, dev si está instalada. `install.sh` con un zip dev escribe `dev`; `canal.sh` y el botón del QAM escriben lo pedido. El frontend de cada plugin pide `channel_info()`; si `me != active` no llama a `manager.apply`, no arranca registro de rendimiento, vigilancias de fondo, sesión ni el global `__qamRail`, y su panel de Decky muestra `ChannelPaused` (botón «Activar»). Sin respuesta del backend se comporta como siempre (activo).

**Cambio.** `channel_switch` escribe la bandera y reinicia Decky (`systemctl restart plugin_loader` desligado, 3 s), como la auto-actualización. Terminal: `./canal.sh [estado|estable|dev]`.

**Red de seguridad.** Al arrancar el backend de dev siendo activo se cuenta un arranque en `settings/qam-rail-dev/arranques-sin-confirmar`; el frontend lo pone a 0 con `channel_ok()` 20 s después de asentarse Steam. Con 2 arranques seguidos sin confirmar, el siguiente deja la bandera en `estable` (si la estable existe), escribe un aviso y el panel de dev queda en pausa; la estable muestra el aviso una vez (toast). Sin estable instalada no hay a dónde volver y no se cambia nada.

**Lección (dev.1 → dev.2) [V en el equipo].** `@decky/api` incrusta `plugin.json.name` en el bundle (alias `@decky/manifest` de rollup) y con él conecta cada `callable` con su backend. Cambiar solo el `plugin.json` del zip no basta: el bundle dev seguía conectado al backend «QAM Rail» (estable), `channel_info` devolvía `me=stable` y las dos copias se creían en pausa → el panel no abría. Ahora `rollup.config.js` acepta `QAM_MANIFEST_DIR`, `package.sh --dev` recompila con «QAM Rail Dev» (apartando y restaurando `dist/`) y comprueba el nombre del bundle antes de empaquetar (y que el estable no lleve el de dev). CI ejecuta `package.sh --dev 1`.

**Pendiente de verificar en el equipo [H].** Que Decky acepte dos plugins con nombres distintos a la vez; que `DECKY_PLUGIN_SETTINGS_DIR` sea por carpeta (`settings/qam-rail-dev`); que `callable` apunte al backend de cada plugin; que el aviso (toast) salga tras el reinicio.

**Pruebas.** `tests/py/test_channel.py` (activo, cambio, red de seguridad), `tests/sh/test_scripts.sh` (instalar dev al lado, `--dev`, `canal.sh`), `tests/v053.test.ts` (lógica de la UI).

## 59. Pestaña «Steam» de Apps (0.54)

**Qué es.** Tercera pestaña de Apps (`src/QamDesktopApps.tsx`) con las apps de escritorio que ya escanea `qam_desktop.scan` (0.51.1): Flatpak, AppImage y del sistema.

**Backend.** `desktop_plan(key)` devuelve `argv/exe/args/dir/icon_path/fullscreen/browser`; `desktop_run(key)` lanza sin shell, sesión nueva y sin esperar; `desktop_reg_get/set` mantienen `apps-steam.json` (clave de la app → `{appid,name,source,added}`), el registro de los atajos NUESTROS. Solo se quita lo que está ahí: nunca otros atajos del usuario.

**Frontend.** `src/qamDesktop.ts` (lógica pura probada: `filterApps`, `groupApps`, `steamState` no/si/perdida, `noteFor`; y las llamadas a SteamClient: `AddShortcut`, `SetShortcutIcon`, `RemoveShortcut`, `RunGame`). Regla de navegación: dos filas por tarjeta (nombre / acciones), sin barras en una fila de chips.

**Decisiones.** Chromium con `--start-fullscreen`; Firefox sin opción (no hay una fiable). El mando como ratón se resuelve con la plantilla de Steam Input «Gamepad with Mouse Trackpad» en el atajo (indicado en la ayuda); el Flatpak de Edge necesita lectura de `/run/udev`.

**Pendiente [H].** Probar en el equipo `AddShortcut` con ejecutables de Flatpak, iconos, `RunGame` del atajo creado y «Volver a Steam».

**Pruebas.** `tests/py/test_desktop.py` (`_t054`), `tests/v054.test.ts`.
