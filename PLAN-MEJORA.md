# QAM Rail · Plan de mejora (2026-11-11, tras v0.36.0)

Objetivo: que el panel sea más fluido, más intuitivo, mejor organizado por situación de juego, cómodo con táctil y con mando, coherente en diseño y temas, y que trabaje bien con Panel de Control (Hooandee) sin copiar su código.

Leyenda: **[V]** medido en el equipo o en el código · **[H]** hipótesis sin verificar.

## 1. Dónde estamos

**Lo que funciona y está medido [V]**
- Desde 9 W el panel cambia de sección en 13–35 ms y va a 115–120 fps; a 7 W, 80–240 ms. El límite a 7 W es del equipo, no de nuestro JS (0 ms atribuidos en los fotogramas lentos).
- Potencia por Panel (un solo controlador compartido), perfiles por juego, Bluetooth por BlueZ, Wi‑Fi por nmcli, chat, música, apps de QAM, diagnóstico con zip.
- 222 pruebas automáticas (27 archivos) + prueba Python de audio.

**Lo que no está verificado [H]**
- **0.35 y 0.36 no se han probado en la consola.** El último zip de diagnóstico es de 0.34. Están sin confirmar: el filtro de altavoces y «Restaurar», los interruptores de rendimiento de Steam, los tipos de juego, el arreglo del chat y la tarjeta única de potencia.

**Problemas que salen al revisar el código [V]**
| Problema | Dato |
|---|---|
| Dos sistemas para lo mismo | «Modos de Inicio» (`homeModes.ts`: Simple/Medio/Exigente por juego) y «Tipo de juego» (`gameKind.ts`, 0.36: Simple/Medio/Exigente). El usuario elige dos veces lo mismo y pueden no coincidir. Lo añadí en 0.36 sin unirlo al que ya había. |
| Un archivo hace de todo | `QamSections.tsx`: 824 líneas, 33 componentes (pantalla, energía, apps, música, sonido). `Qam.tsx`: 608. |
| Dependencias circulares | `QamSections ↔ QamAudio`, `tdpControl ↔ menuEfficiency`. |
| Sondeos repartidos | ~28 `setInterval` en 15 archivos (8 en `QamSocial.tsx`). Cada tarjeta decide su intervalo. |
| Estado repartido | 17 claves de `localStorage` leídas a mano en 17 sitios. Panel se lee con `rpc.state` desde 3 componentes. |
| Sin sistema de diseño | 11 tamaños de letra distintos; ~45 colores escritos a mano fuera de la paleta; estilos en línea en cada componente. |
| Zonas de toque pequeñas | Las fichas «compactas» de 0.36 miden 32 px y hay controles de 28–34 px. Para dedo el mínimo cómodo es ~40 px. |
| Vigilantes sin panel abierto | `displayWatch`, `gameWatch`, `themeEco`, música: 4 temporizadores de fondo independientes. |

## 2. Principios (lo que decide cada duda)
1. **Una situación, un kit.** El panel sabe en qué situación estás y pone 4–6 controles a mano. El resto, a un toque.
2. **Cada cosa en un solo sitio.** Si un control aparece dos veces, uno sobra.
3. **Panel de Control es el motor; QAM Rail es la interfaz.** No se duplica lógica de Panel ni se copia su código (GPL).
4. **Nada sin medir.** Cada fase termina con un zip de diagnóstico y números antes/después.
5. **Táctil y mando valen lo mismo.** Todo control: ≥ 40 px, foco visible, alcanzable con cruceta, misma acción con A que con el dedo.

## 3. Fases

### Fase 0 — Verificar lo que ya hay (1 versión, 0.36.x)
Sin funciones nuevas.
- Probar 0.36 en la consola y mandar el zip (con «Sonido», «Contrato con Steam», «Teclado y efectos del chat», «Potencia del menú»).
- Corregir lo que falle. Quitar lo que Steam no acepte (interruptores de rendimiento sin efecto).
- Prueba de control: caída de sesión al cerrar un juego con QAM Rail **desactivado** en Decky. Si cae igual, queda documentado como fallo de Bazzite/OpenGamepadUI y dejamos de perseguirlo en el plugin.

### Fase 1 — Una sola «Situación» (0.37)
Une `homeModes` + `gameKind` + `situation.ts` en un módulo `situacion.ts`.
- **Con juego:** Simple · Medio · Exigente (por juego, recordado). **Sin juego:** Escritorio · Multimedia · TV.
- Modificadores automáticos: enchufado / batería, pantalla externa.
- La situación decide tres cosas a la vez: el **kit de Inicio**, el **preset** (FPS, vatios, reescalado) y la **clave de las pruebas**.
- En Inicio: una sola fila «Juego · Exigente · batería ▾». Desaparece la tarjeta «Tipo de juego» separada.
- Presets como tabla de datos editable (`presets.ts`), no como `if` en el código. Lo aprendido por Panel manda sobre la tabla.

| Situación | Enchufado | Batería | Batería ahorrando |
|---|---|---|---|
| Simple | 60 FPS · ~8 W | 60 FPS · ~7 W | 30 FPS · ~6 W |
| Medio | 60 FPS · ~12 W | 60 (50) FPS · ~11 W | 30 FPS · ~8 W |
| Exigente | ≥ 40 FPS · ~18 W | 40 FPS · ~14 W + FSR | 30 FPS · ~11 W + FSR |

Los vatios son estimaciones [H]: se ajustan con tus zips.

### Fase 2 — Sinergia con Panel de Control (0.38)
- **Un almacén de Panel** (`panelStore.ts`): una lectura compartida de `get_tdp_state`, color, audio, batería, ventiladores; las tarjetas se suscriben. Sustituye `usePanel` suelto y las 3 lecturas de `rpc.state`.
- **Capacidades al arrancar:** qué métodos tiene esta versión de Panel. Lo que no existe no se dibuja. El «Contrato con Panel» pasa a ser la misma tabla.
- **Auto‑TDP con suelo y techo por situación** [H]: Panel acepta mín./máx. en `set_auto_tdp_config`. Exigente = suelo 12 W; Simple = techo 10 W. Sustituye a adivinar vatios fijos.
- **Reparto claro:** QAM Rail = lo rápido (4–6 controles). Panel en la columna = lo fino (curvas, bandas del ecualizador, CPU/GPU). Cada tarjeta nuestra lleva un «Ajuste fino ›» que abre **esa** página de Panel, no la portada [H: depende de si Panel admite abrir una página concreta].
- **Temas:** un solo contrato de variables (`--pdc-theme-*` + adaptadores como Luminous Atlas). Proponer a Hooandee publicar esas variables de forma estable.

### Fase 3 — Fluidez (0.39)
- **Un planificador** (`ticker.ts`): un solo temporizador que reparte los sondeos por prioridad; se para con el panel cerrado, se espacia en ahorro y se calla durante la calma. Sustituye los ~28 `setInterval`.
- **Montar solo lo visible:** las secciones no visitadas no se montan; las visitadas se conservan sin sondear.
- **Abrir en dos tiempos:** primero riel + Inicio con lo guardado en caché; los datos vivos llegan después sin mover nada (`Keep` en todas las tarjetas).
- **Presupuesto** (se mide en cada versión, falla la prueba si se pasa):

| Medida | ≥ 9 W | 7 W |
|---|---|---|
| Abrir | ≤ 120 ms | ≤ 300 ms |
| Cambiar de sección | ≤ 35 ms | ≤ 120 ms |
| Saltos de pantalla al llegar datos | 0 | 0 |
| Trabajo con el panel cerrado | ≤ 1 temporizador | ≤ 1 temporizador |

### Fase 4 — Código más claro (0.40, sin cambios visibles)
- Partir por sección: `sections/home`, `energy`, `display`, `connect`, `apps`, `social`, `more`; cada tarjeta en su archivo.
- Capas con una sola dirección: `steam/` y `panel/` (acceso) → `model/` (puro, probado) → `ui/` (piezas) → `sections/`. Quitar los 2 ciclos.
- `store.ts`: un solo acceso a `localStorage`, con claves tipadas y migración.
- Regla en las pruebas: ningún archivo de más de 300 líneas, ningún ciclo.

### Fase 5 — Sistema de diseño, táctil y mando (0.41)
- **Fichas de diseño** (`tokens.ts`): 5 tamaños de letra (11, 12, 13, 15, 22), 4 separaciones (4, 8, 12, 16), 3 radios, colores solo de la paleta. Se quitan los ~45 colores a mano.
- **6 piezas y ninguna más:** Tarjeta, Fila de interruptor, Segmentos (elegir 1 de N), Deslizador, Fila plegable, Icono‑botón. Cada sección se compone solo con ellas.
- **Táctil:** mínimo 40 px en todo (las fichas de 32 px de 0.36 se convierten en Segmentos de 40 px de alto con texto pequeño). Deslizar con inercia, arrastre en todos los deslizadores, pulsación larga = «Ajuste fino».
- **Mando:** revisión sección por sección con una prueba automática (`dockReach` generalizado): todo control se alcanza con cruceta, ninguna trampa, B siempre vuelve. Leyenda inferior coherente. X = acción secundaria, Y = fijar en Inicio.
- **Orden de cada tarjeta:** estado arriba a la derecha, control principal, lo avanzado plegado.

### Fase 6 — Temas (0.42)
- Tres capas que no se pisan: **tema** (Panel / adaptador / propio) → **personalización** (acento, esquinas, espacio) → **ahorro** (quita desenfoque y animación).
- Adaptadores como datos (`themes/*.json`), no como código: añadir un tema nuevo = un archivo.
- Vista previa en vivo en Apariencia y prueba de contraste (texto ≥ 4,5:1) para cada tema.
- Cristal y fondos del tema solo en «Fluido»; en «Ahorro» versión plana automática.

### Después
Pendientes de portar por orden de valor: Wi‑Fi con contraseña, destino de los avisos, Remote Play Together funcional, solicitudes de amistad, efectos del chat (cuando el zip diga el formato).

## 4. Orden y por qué
0 → 1 → 2 → 3 → 4 → 5 → 6.
- La **0** va primero: hay dos versiones sin probar y construir encima es arriesgado.
- La **1** antes que el resto porque quita la duplicidad que más confunde y define qué se enseña en cada situación.
- La **2** antes de la 3 porque el almacén de Panel ya elimina buena parte de los sondeos.
- La **4** (reordenar código) antes de la **5** (rediseño): rediseñar un archivo de 824 líneas es donde más errores he cometido.

## 5. Estado (2026-11-11, v0.38.0)
- **Fase 0, verificado con el zip de las 23:39 (0.37)** [V]: contrato con Panel 12/12 y con Steam 34/34; sonido bien (una salida «ROG Ally EQ», 6 nodos ocultos: `game_output`, `voice_output`, `browser_output`, `music_output` son sumideros de Bazzite, no de Panel); sin caídas de sesión nuevas (los reinicios son encendidos). Fluidez con Metro: 7 W → 229 ms por sección; 19 W → 21 ms.
- **Hallazgo:** Steam solo ofrece límite de FPS 30/60/120 a 120 Hz: «Exigente = 40 FPS» se quedaba en 30. Desde 0.38 se pone la pantalla a 80 Hz y el límite a 40 (`hzFor`).
- **Fase 1 hecha:** una sola elección de tipo (0.37); 0.38 añade «App» (navegador, YouTube/MiniTube, música, lanzador: Inicio como el escritorio, kit Multimedia, pruebas en `app`), quita el modo «Amigos» y renombra «Película» a «Multimedia».
- **Pendiente de fase 1:** que los números de cada preset se puedan cambiar desde el panel.
- **Efectos del chat:** existen `GetChatRoomEffectSettings` / `ChatRoomEffectSettings`; falta ver un mensaje con efecto (la prueba leyó 0 mensajes: hay que abrir antes el chat que lo tenga).

### v0.39.0 — fase 2, primera parte
- **Vatios automáticos por tipo:** el preset ya no fija vatios míos; configura el Auto‑TDP de Panel (`set_auto_tdp_config`: meta de FPS, punto de partida, mínimo y máximo) y lo enciende. Rangos: Simple hasta 12 W, Medio hasta 18 W, Exigente hasta el máximo; ahorrando batería el techo baja. Interruptor «Vatios automáticos» en Energía › Preset. Motivo: Metro llega a 40 FPS con menos de lo que estimé.
- **Almacén de Panel** (`panelStore.ts`): una lectura por clave compartida entre tarjetas; lo que lee el controlador de potencia sirve a las 4 tarjetas que pedían `get_tdp_state` por su cuenta.
- **Pendiente de fase 2:** capacidades de Panel al arrancar, «Ajuste fino ›» a la página concreta de Panel, contrato de temas.
- **Aparcado para el final** (decisión de Carlos): reproducir los efectos del chat.

### v0.40.0 — fase 2, segunda parte
- **Meta de FPS comprobada** (`fpsTarget.ts`): pone el refresco que haga falta, espera a que Steam ofrezca la meta, la aplica y comprueba; si no se puede, deja el refresco como estaba y usa la opción más baja que cumpla. El resultado va al aviso y a la sección `preset` del informe. (En 0.39 se quedaba en 60 sin decir nada.)
- **Reescaladores de Panel 0.88** (`UpscalerCard` en Pantalla, con juego): estado, calidad, nitidez y generación de fotogramas de lo instalado (`get_upscalers_game`, `get_upscaler_live`, `configure_upscaler`); instalar y lo fino, en Panel. Con Panel 0.86 (el instalado al medir) la tarjeta no aparece.
- **Inicio de juego:** «Tipo de juego» va debajo de la potencia; al abrir, el foco ya no cae en «Simple».

### v0.41.0 — fase 2 cerrada, empieza la fase 3
- **Reescalador solo informativo:** Panel rechaza cambios con el juego abierto (se configura antes de iniciarlo). La tarjeta muestra lo que tiene el juego (compilación, estado, calidad, nitidez, generación de fotogramas, resolución real y FPS) y un acceso a Panel.
- **Fase 2 cerrada** con: Auto‑TDP por tipo, almacén de Panel, FPS comprobados, reescaladores. Queda fuera (depende de Hooandee): abrir una página concreta de Panel y variables de tema estables.
- **Fase 3, primer paso — planificador único** (`ticker.ts`): 24 sondeos de 10 archivos pasan a un solo temporizador que reparte (máx. 3 tareas por pulso de 250 ms) y va a mitad de ritmo en ahorro. Quedan aparte el controlador de potencia y el volcado del registro. `entorno.planificador` en el zip dice cuántas tareas hay y cuántas se aplazaron.
- **Siguiente en fase 3:** abrir en dos tiempos, presupuesto medido (abrir ≤ 120 ms, sección ≤ 35 ms desde 9 W) como prueba que falla si se pasa.

### v0.42.0 — fase 3, segunda parte (zip 01:13 de la 0.41)
- **Medido con 0.41 [V]:** contratos 12/12 y 34/34; planificador con 7 tareas y 2 aplazadas en 1265 pulsos; fluidez sin juego: 7 W → 58 ms por sección, 19 W → 14 ms. Uso real con LIMBO a 11–12 W: abrir 74–403 ms (dos aperturas de 311 y 403 ms, fuera del tope), sección 30 ms de mediana; 33 saltos de pantalla, parte del teclado de Steam y parte nuestros (Inicio de juego, tarjeta de Apps).
- **Fallo encontrado:** el control de FPS desaparecía cuando el límite actual no estaba entre las opciones de Steam (pantalla a otro refresco); por eso el preset no pudo poner los FPS (`fps: null`). Arreglado en `readPerf`.
- **Abrir en dos tiempos** (`Deferred`): Inicio pinta primero potencia, brillo y volumen; tipo de juego, pantalla rápida, plugins y apps se montan tras el primer fotograma, con el alto reservado.
- **Presupuesto** (`budget.ts`, prueba «Presupuesto de fluidez»): abrir ≤ 120 ms y sección ≤ 35 ms desde el umbral fluido (300 y 120 ms por debajo), 0 saltos nuestros; lo del teclado y la leyenda de Steam no cuenta. Sección `presupuesto` en el zip.
- **Siguiente:** revisar con el próximo zip si abrir con juego entra en el tope; si no, aligerar la tarjeta de potencia de Inicio de juego.

### v0.43.0 — zip 01:42 de la 0.42
- **Medido [V]:** abrir con juego 50–128 ms (mediana 88, dentro del tope; antes 311–403); sección 41 ms (tope 35); 16 saltos nuestros (línea «En uso» de la potencia, tarjeta de Apps).
- **Causa real de los FPS:** el Ally tiene `disable_refresh_rate_management: true`: Steam ya no usa `SetFPSLimit`, sino los ajustes de cliente `gamescope_disable_framelimit` y `gamescope_app_target_framerate`. `steamPerf.modernFps` y `perfWrite.fps` usan esa vía; la lista ofrece 30, 40, 45, 50, 60, 90, 120 y «Sin límite». [H] que Steam acepte cualquier valor: se comprueba releyendo.
- **Modo escritorio con juego abierto:** Steam dio «sin juego» un instante al abrir (01:18, con la potencia de Metro puesta). `runningGameSticky`: un juego visto hace menos de 6 s se mantiene. Además, botón «Volver al Inicio de <juego>» cuando se está viendo el Inicio normal con un juego abierto.
- **Metro a 10 W sin perder FPS:** Panel dice `constrained / live_min`: pedido 10 W, aplicado 12 W. Con el cargador el equipo no baja de ~12 W.
- **Propuesta de reorganización** de todas las funciones: `claude/qam-reorganizacion.md` (pendiente de tu visto bueno).

### v0.44.0 — reorganización aplicada (fase 5, primera parte)
- **Decidido por Carlos:** juntar potencia, FPS, escalado y batería en «Rendimiento»; Avisos dentro de Social; Remote Play visible como «próximamente»; ventiladores plegados.
- **Riel de 7:** Inicio · Rendimiento · Imagen y sonido · Conexiones · Apps · Social · Más.
- **Conexiones mínimas y al instante:** Wi‑Fi y Bluetooth solo con lo ya conocido, interruptor propio que cambia al tocar, enlaces a Ajustes de Steam para lo nuevo; sin búsqueda.
- **Ayuda con Y** (y «?» para el dedo) en 12 tarjetas (`help.ts`).
- **Botón activo inequívoco**, Cristal más denso, tarjeta Preset en tres celdas, instalación de apps plegada.
- **Rangos de vatios por tipo:** Simple 7–10 · Medio 10–15 · Exigente 15–máx. (ahorrando: 7–8 · 8–12 · 12–18).
- **Refresco de pantalla en el preset:** enchufado, el doble de los FPS; en batería, igual que los FPS. Solo se aplica donde Steam deja elegir el refresco; en el Ally de Carlos lo decide Steam según el límite de FPS.
- Sin probar en la consola.

## 6. Decisiones que necesito de ti
1. ~~Situaciones sin juego~~ → resuelto: Escritorio · Multimedia · TV, sin «Amigos»; las apps abiertas cuentan como Multimedia.
2. ¿Fase 4 (reordenar código, sin cambios visibles) te parece bien como versión propia, o prefieres mezclarla con el rediseño?
3. ¿Hablas con Hooandee? Dos peticiones ayudarían mucho: variables de tema estables y abrir una página concreta de Panel.
