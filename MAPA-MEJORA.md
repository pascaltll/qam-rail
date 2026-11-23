# QAM Rail · Mapa de mejora de Inicio, Rendimiento, Imagen y sonido y los modos (2026-11-14, tras v0.46.0)

Revisión control por control del código de 0.46.0 y de tu zip de la TV (13-11). Alcance: los **modos de juego**, **Inicio**, **Rendimiento** (antes Energía) e **Imagen y sonido** (el icono de la pantalla), más la **situación TV**. Es una propuesta: nada de esto está hecho. Lo marcado [H] es hipótesis sin comprobar en la consola.

## 1. Diagnóstico

### 1.1 Los modos: hoy hay seis cosas que se llaman parecido

| # | Qué es | Dónde está | Opciones |
|---|---|---|---|
| 1 | Situación sin juego | Inicio (fila «Modo · Cambiar») | Escritorio · Multimedia · TV |
| 2 | Tipo de juego | Inicio (4 fichas) | Simple · Medio · Exigente · App |
| 3 | Modo del preset | Rendimiento › Preset | Auto · Ahorro · 30 FPS · Pleno |
| 4 | Vatios automáticos | Rendimiento › Preset (interruptor) | sí / no |
| 5 | Modo de potencia | Rendimiento › Potencia | Manual · Auto‑TDP · Descargas |
| 6 | Atajos de la barra | Rendimiento › Potencia | Sugerido · Eco · Equilibrado · Máx |

Problemas:
- **4 y 5 son el mismo interruptor de Panel** (encender o apagar su Auto‑TDP), en dos tarjetas distintas.
- **3 y 6 compiten**: «Ahorro» (modo) y «Eco» (atajo) bajan los vatios por caminos distintos; el último que tocas gana, sin avisar.
- **La palabra «Auto» significa cuatro cosas**: modo del preset, Auto‑TDP, escalado «Auto» y ventiladores «Auto».
- **El tipo (2) ocupa una fila entera de Inicio** y se elige una vez por juego. Además, tocarlo aplica el preset entero (FPS y vatios) sin vuelta atrás.
- **La situación (1) usa emojis** y un desplegable; todo lo demás usa iconos de línea y fichas.

### 1.2 Inicio

| Situación | Lo que hay (de arriba abajo) | Problema |
|---|---|---|
| Juego | Nombre + W · tarjeta de potencia completa (barra, 3–4 atajos, nota, «aprendido») · brillo y volumen · tipo de juego · Pantalla de este juego (4 fichas) · plugins · música | La tarjeta de potencia completa es de Rendimiento, no un resumen. Con vatios automáticos la barra no sirve y sigue ocupando la primera pantalla. No se ven los FPS reales. |
| Sin juego | Fila de modo · potencia compacta · brillo y volumen · 4 interruptores · plugins · apps · música | Bien de contenido. La fila de modo necesita dos toques (abrir, elegir). |
| TV | Igual que «sin juego» o «juego» | Ver 1.5: nunca se activó. |

### 1.3 Rendimiento (con juego)

Orden actual: Preset (3 celdas, «Aplicar», interruptor, 4 modos, nota) → Potencia (barra, atajos, nota, 3 modos, aprendido) → Límite de FPS (8 fichas + VRR) → Escalado (5 + 3 fichas + nitidez) → Reescalador → Batería → línea «Guardado en este juego» → Avanzado.

- **Unas 35 paradas del mando** antes de llegar a «Avanzado» (contadas en el código: cada ficha es una parada). En la TV, sin táctil, eso es lo que se hace pesado.
- **Dos tarjetas para una sola decisión** (Preset y Potencia): la primera dice lo que quiere, la segunda lo que hay.
- **Escalado y Reescalador** se tocan poco y ocupan media pantalla.
- **Batería** aparece igual enchufado que sin cargador.
- **«Guardado en este juego: potencia, pantalla…»** informa pero no se puede hacer nada con ello.

### 1.4 Imagen y sonido

Orden actual: brillo y volumen → Color (looks en fichas de texto, Modo noche, HDR, calidez) → Sonido (ecualizador, presets, nivelar, salida, micrófono).

- **Imagen y sonido van seguidos, sin separación.**
- **Los looks de color son palabras** («Vivo», «Cálido»…): no se ve lo que hacen hasta aplicarlos.
- **La salida de sonido está al fondo** y es lo primero que hace falta al conectar la TV o unos auriculares.
- **El micrófono siempre visible**, aunque no haya llamada.

### 1.5 TV: lo que dice tu zip

- **El panel no supo que estabas en la TV.** Decide «TV» si la pantalla mide más de 1920 px de ancho. Tu TV iba a 1920 × 1080, igual que la pantalla del Ally: el zip dice `tv: false`. Por eso no salió ni el modo TV ni su kit.
- **Todo se escribe para la pantalla interna.** Steam tiene límites aparte para la externa (en tu zip: FPS 15 / 30 / 60, refresco 40–60 Hz). El preset calcula refrescos de 80 o 120 Hz que una TV de 60 Hz no tiene.
- **El brillo no hace nada en una TV** y ocupa media fila de Inicio.
- **Steam ofrece «ajustar bordes»** (`EnableUnderscan`, `SetUnderscanLevel` salen en tu zip) y no lo usamos [H: sin probar].

## 2. Idea central: dos preguntas, no seis modos

1. **¿Qué es esto?** → el **tipo** (Simple · Medio · Exigente · App). Se elige una vez por juego. Pasa a ser una **etiqueta junto al nombre del juego** («Medio ▾»), no una fila.
2. **¿Cómo quiero jugar ahora?** → el **objetivo**: una sola barra de 4 posiciones, ordenada de menos a más consumo:

```
 ◀  30 FPS  ·  Ahorro  ·  Equilibrado  ·  Pleno  ▶        [ Según cargador: sí ]
```

- Es **una sola parada del mando**: izquierda y derecha cambian de posición. Con el dedo, se toca la posición.
- «Según cargador» sustituye al modo «Auto»: enchufado elige Equilibrado; en batería, Ahorro. Si mueves la barra a mano, se apaga solo.
- El objetivo decide FPS, rango de vatios y reescalado. Los atajos Eco / Equilibrado / Máx de la barra de vatios **desaparecen con juego** (los sustituye el objetivo); sin juego se quedan.
- **Vatios**: un solo interruptor «Automáticos | Fijos» dentro de la tarjeta de rendimiento. Desaparecen «Vatios automáticos» del preset y «Manual / Auto‑TDP» de la potencia.
- **Deshacer**: cambiar tipo u objetivo muestra un aviso con «Deshacer» durante 5 s.

Vocabulario fijo (una palabra, un significado):

| Palabra | Significa | Deja de usarse para |
|---|---|---|
| Objetivo | 30 FPS · Ahorro · Equilibrado · Pleno | «modo del preset», «Eco» |
| Tipo | Simple · Medio · Exigente · App | «modo de juego» |
| Situación | Juego · App · Escritorio · Multimedia · TV | «modo de Inicio» |
| Vatios automáticos / fijos | Auto‑TDP de Panel sí o no | «Manual», «Auto‑TDP» |
| Según cargador | El objetivo cambia solo | «Auto» |
| Descargas | Potencia mínima sin juego | «Modo Eco» |

## 3. Propuesta por pantalla

Leyenda: ✅ se queda · ➡️ se mueve · 🔁 cambia de forma · 🗜️ se pliega · ❌ se quita · ➕ nuevo

### 3.1 Inicio con juego

```
┌──────────────────────────────────────────────┐
│ 🎮 Metro 2033            [Medio ▾]           │  cabecera: nombre + tipo
│ 40 FPS · 12 W · 🔌 enchufado                 │  en vivo
├──────────────────────────────────────────────┤
│ ◀ 30 FPS · Ahorro · [Equilibrado] · Pleno ▶  │  objetivo (aquí cae el foco al abrir)
├──────────────────────────────────────────────┤
│ ☀ Brillo ▬▬▬▬○──      🔊 Volumen ▬▬▬○───     │
├──────────────────────────────────────────────┤
│ [FPS 40] [VRR sí] [Escala Auto] [Color Vivo] │  4 teselas con icono y estado
├──────────────────────────────────────────────┤
│ Plugins para jugar  ○ ○ ○ ›                  │
└──────────────────────────────────────────────┘
```

| Elemento | Decisión | Por qué |
|---|---|---|
| Cabecera con FPS, vatios y batería en vivo | ➕ | Hoy solo salen los vatios. Panel ya da los FPS. Con batería: «dura unas 2 h». |
| Tipo de juego | 🔁 etiqueta «Medio ▾» en la cabecera | Se elige una vez; libera una fila. |
| Barra de objetivo | ➕ primer control | Es la decisión de cada sesión. |
| Tarjeta de potencia completa | ❌ de Inicio | Vive en Rendimiento. Con vatios **fijos** queda una barra compacta bajo el objetivo; con automáticos, nada. |
| Brillo y volumen | ✅ | En TV, el brillo se cambia por «Salida de sonido» (ver 3.4). |
| Pantalla de este juego | 🔁 4 teselas iguales a las de Wi‑Fi / Bluetooth | Misma pieza en todo Inicio: icono arriba, nombre y estado debajo. |
| Plugins, música | ✅ | |

Resultado: de ~17 paradas del mando a ~10, y la primera pantalla cabe sin desplazar.

### 3.2 Inicio sin juego

| Elemento | Decisión | Por qué |
|---|---|---|
| Fila «Modo · Cambiar» (desplegable con emojis) | 🔁 barra de 3 posiciones con iconos de línea: Escritorio · Multimedia · TV | Un toque en vez de dos; mismo componente que el objetivo. |
| Potencia compacta + Eco / Equilibrado / Máx | ✅ | Sin juego no hay objetivo. |
| «Descargas» | ➡️ quinta tesela de Inicio sin juego | Hoy está dentro de Rendimiento, donde nadie la busca. |
| Brillo, volumen, interruptores, plugins, apps, música | ✅ | |

### 3.3 Rendimiento

```
┌ Rendimiento de Metro 2033 ─────── ● guardado ┐
│  40 FPS        12 W         2 h 10 min        │  lo que hay ahora
│  meta 40       rango 10–15  batería 64 %      │  lo que pide el objetivo
│ ◀ 30 FPS · Ahorro · [Equilibrado] · Pleno ▶  │
│ Vatios   [ Automáticos | Fijos ]              │
│ ▬▬▬▬▬▬▬○────────  (solo si son fijos)         │
│ ✓ Aprendido · zona 15–20 W        [Olvidar]   │
├ Límite de FPS ────────────────────────────────┤
│ ◀ 30 · [40] · 45 · 50 · 60 · 90 · 120 · ∞ ▶  │  una parada
│ Refresco variable (VRR)          [ activado ] │
├───────────────────────────────────────────────┤
│ Escalado            Auto · Lineal           › │  plegado
│ Reescalador         FSR 3 · Calidad         › │  plegado
│ Batería             Limitar carga al 80 %   › │  plegado
│ Avanzado            ventiladores, overlay…  › │  plegado
└───────────────────────────────────────────────┘
```

| Elemento | Decisión | Por qué |
|---|---|---|
| Tarjetas «Preset» y «Potencia» | 🔁 una sola: «Rendimiento de <juego>» | Una decisión, una tarjeta: arriba lo que hay, debajo lo que pides. |
| Botón «Aplicar» | ❌ | La barra de objetivo aplica al moverla. «Restablecer este juego» va a Avanzado. |
| «Vatios automáticos» + «Manual / Auto‑TDP» | 🔁 un interruptor «Automáticos \| Fijos» | Eran el mismo ajuste dos veces. |
| Barra de vatios | 🔁 visible solo con vatios fijos | Con automáticos se muestra «rango 10–15 W · ahora 12 W». |
| Atajos Eco / Equilibrado / Máx | ❌ con juego · ✅ sin juego | Con juego los sustituye el objetivo. «Sugerido» pasa a ser una marca en la barra. |
| Límite de FPS (8 fichas, 2 filas) | 🔁 una barra de posiciones | 8 paradas pasan a 1. En TV solo muestra lo que la TV admite. |
| VRR | 🔁 fila de interruptor con el estado escrito | En TV sin VRR: fila apagada con «tu TV no lo admite». |
| Escalado (5 + 3 fichas + nitidez) | 🗜️ fila plegable con el valor a la derecha | Se toca poco. |
| Reescalador de Panel | 🗜️ fila plegable | Solo informa. |
| Batería | 🗜️ fila plegable; el tiempo restante sube a la cabecera | Enchufado no aporta más que el límite de carga. |
| «Guardado en este juego: …» | 🔁 punto «● guardado» en el título | Mismo dato en 10 caracteres. |
| Avanzado | ✅ + «Restablecer este juego» | |

Resultado: de ~35 paradas del mando a ~12.

### 3.4 Imagen y sonido

```
┌ IMAGEN ───────────────────────────────────────┐
│ ☀ Brillo ▬▬▬▬▬○───                            │  (oculto en TV)
│ Color   ● ● ● ● ●   Vivo                      │  muestras de color, una parada
│ Modo noche              [ sí ]  calidez ▬▬○─  │
│ HDR                     [ no ]                │
│ Pantalla externa        1080p · 60 Hz       › │  solo en TV: refresco, ajustar bordes
├ SONIDO ───────────────────────────────────────┤
│ 🔊 Volumen ▬▬▬▬○────                          │
│ Salida   [ Altavoces | Auriculares | TV ]     │  arriba, con iconos
│ Ecualizador   ◀ Plano · [Juego] · Cine · Voz ▶│
│ Nivelar volumen         [ sí ]                │
│ Micrófono               47 %                › │  plegado salvo en llamada
└───────────────────────────────────────────────┘
```

| Elemento | Decisión | Por qué |
|---|---|---|
| Dos bloques con título: Imagen / Sonido | ➕ | Hoy van seguidos. |
| Brillo y volumen juntos arriba | 🔁 cada uno en su bloque | El brillo es imagen; el volumen, sonido. |
| Looks de color en fichas de texto | 🔁 muestras redondas de color, una sola parada | Se ve lo que hace antes de aplicarlo. [H: depende de que Panel dé los valores de cada look.] |
| Modo noche, HDR | 🔁 filas de interruptor | Hoy son fichas sueltas. La calidez sale en la misma fila al encender. |
| Salida de sonido | ➡️ primera del bloque Sonido, con iconos | Es lo primero al conectar TV o auriculares. |
| Ecualizador | 🔁 barra de posiciones | |
| Micrófono | 🗜️ plegado; se abre solo si hay llamada | |
| ➕ Pantalla externa (solo en TV) | nuevo | Refresco de la TV y «Ajustar bordes» si la imagen se corta. [H] |

### 3.5 Situación TV

| Cambio | Detalle |
|---|---|
| ➕ Detección real | Preguntar al sistema si hay una pantalla externa conectada (HDMI / DisplayPort), no deducirlo del ancho. [H: lectura desde el backend.] |
| ➕ Escala para sofá | Letra +15 %, filas de 48 px en vez de 40, sin los «?» táctiles (queda Y). |
| 🔁 Límites de la TV | FPS y refresco se leen y escriben para la pantalla externa (15 / 30 / 60 en tu TV). El objetivo no pide más Hz de los que la TV tiene. |
| 🔁 Inicio | El brillo se cambia por «Salida de sonido». Con cargador, «Según cargador» elige Equilibrado. |
| ➕ Todo alcanzable con el mando | Prueba automática: ninguna función depende del dedo. |

## 4. Bases de estilo

### 4.1 Medidas

| Ficha | Valores | Regla |
|---|---|---|
| Letra | 11 · 12 · 13 · 15 · 22 px | 22 solo para la cifra principal de una tarjeta. En TV, ×1,15. |
| Peso | 600 normal · 700 título · 800 cifra | |
| Separación | 4 · 8 · 12 · 16 px | 8 entre controles, 12 entre tarjetas. |
| Radio | 12 (celda) · 16 (tarjeta) · 20 (control) | |
| Alto mínimo | 40 px (48 en TV) | Se acaban las fichas de 32 px. |
| Iconos | Línea, 20 px, trazo 1,75 | Sin emojis en la interfaz. |

### 4.2 Estados (iguales en todas las piezas)

| Estado | Aspecto |
|---|---|
| Activado | Relleno de acento, texto en negrita, y el estado **escrito** («activado», «sí»). Nunca solo el color. |
| Con foco | Anillo de 2 px. La pieza no cambia de tamaño. |
| No disponible | 40 % de opacidad, no se puede enfocar, y dice por qué. |
| Esperando a Panel o Steam | El valor pedido se ve al instante; si no se aplica, vuelve y avisa. |

### 4.3 Seis piezas, y ninguna más

| Pieza | Para qué | Mando |
|---|---|---|
| Tarjeta | Agrupar. Título + estado a la derecha / control principal / avanzado plegado. | — |
| **Barra de posiciones** | Elegir 1 de N (objetivo, FPS, color, ecualizador, situación). | **Una parada**; izquierda y derecha cambian. |
| Fila de interruptor | Sí o no, con el estado escrito. | A cambia. |
| Deslizador | Un valor continuo. | Izquierda y derecha; acelera si se mantiene. |
| Fila plegable | Lo poco usado, con su valor a la derecha. | A abre. |
| Tesela | Acceso rápido en Inicio: icono, nombre, estado. | A cambia o avanza. |

Las fichas sueltas («Chip») quedan solo para acciones («Olvidar», «Abrir Panel»), no para elegir.

### 4.4 Texto

- **Un nombre por cosa** (tabla del punto 2).
- **El título dice qué es; la derecha, cómo está**: «Límite de FPS · 40».
- **Cifras con unidad**: «40 FPS», «12 W», «2 h 10 min».
- **Frases de ayuda de una línea**, solo donde el control no se explica solo. El resto, en la ayuda (Y).
- **Sin jerga en la primera capa**: «Vatios», no «TDP»; «Refresco variable (VRR)» la primera vez, «VRR» después.

### 4.5 Navegación

- **LB / RB** cambian de sección; **la cruceta** no sale de la sección; **B** vuelve; **Y** ayuda; **X** deshace o restablece el control enfocado.
- **Al abrir, el foco cae en el control principal de la situación**: con juego, la barra de objetivo.
- **Presupuesto de paradas**: ninguna sección pasa de 12 paradas antes del primer plegable. Se mide en las pruebas.
- **Lo más usado, a 3 pulsaciones como mucho** desde que se abre el panel: objetivo, volumen, brillo, límite de FPS.

### 4.6 Movimiento

- 120–160 ms, curva suave. La barra de posiciones desliza su marca; los plegables se abren sin empujar a saltos.
- Por debajo de la potencia fluida, sin animaciones (como ahora).

## 5. Orden de trabajo

| Versión | Qué | Se comprueba con |
|---|---|---|
| **0.47 · Piezas** | Barra de posiciones, fila de interruptor, tesela y medidas (40 / 48 px). Sin mover nada de sitio: se cambian las piezas donde ya están (FPS, modos, looks). | Paradas del mando por sección (antes / después). |
| **0.48 · Objetivo y Rendimiento** | Barra de objetivo con «Según cargador», tarjeta única de rendimiento, vatios Automáticos / Fijos, plegables, «Deshacer». | Rendimiento ≤ 12 paradas. Tu prueba: cambiar de objetivo en dos juegos. |
| **0.49 · Inicio** | Cabecera con FPS en vivo y tipo como etiqueta, teselas, barra de situación sin juego, «Descargas» como tesela. | Inicio con juego cabe sin desplazar. |
| **0.50 · TV e Imagen y sonido** | Detección real de la TV, límites de la pantalla externa, escala de sofá, bloques Imagen / Sonido, salida de sonido arriba, «Pantalla externa». | Zip desde la TV: `tv: true`, FPS dentro de lo que la TV admite. |
| **0.51 · Repaso con mando** | Prueba automática de alcance sección por sección, textos y ayuda al día. | 0 funciones que dependan del dedo. |

Cada versión se puede probar sola. El orden pone primero lo que más pesaba en la TV (paradas del mando) y deja la TV para cuando las piezas ya estén.

## 6. Decisiones (Carlos, 14-11)

1. Barra de objetivo de **4 posiciones**.
2. **Sin barra de vatios en Inicio** cuando los vatios son automáticos.
3. La barra **aplica al moverla**, con «Deshacer» 5 s.
4. «La de TV» = la sección **Imagen y sonido** (icono tras Rendimiento).
5. Añadido: **Sonido** — ordenar los perfiles, que al conectar la TV no haya que buscar la salida, y arreglar el micrófono.

## 7. Estado

- **0.47.0 (14-11) hecha, sin probar en la consola:** pieza «barra de posiciones» (`ui.Segments`, una parada del mando) en límite de FPS, escalado, filtro, color, ventiladores, overlay, modo del preset, tipo de juego y situación sin juego (con iconos de línea). Sonido: salida arriba con iconos, paso automático a la TV (`audioTv.ts`), ecualizador y «Nivelar» como interruptores, perfiles en una barra, micrófono que se activa al mover su barra.
- Siguiente: 0.48 (objetivo y tarjeta única de Rendimiento).
- **0.48.0 (14-11) hecha, sin probar:** arreglos de la barra de posiciones (A confirma, no salta; lo marcado se aplica al salir; el color recuerda lo elegido) y **cambio de rumbo de Carlos**: el tipo de juego solo adapta el panel; los FPS son siempre manuales. Nada cambia FPS, refresco ni escalado por su cuenta; los vatios sugeridos solo se aplican con «Aplicar vatios».

## 8. Revisión del punto 2 (14-11, noche)

El «objetivo» ya **no decide los FPS**. Queda así:
- **Tipo** = solo disposición del panel (kit de plugins y, pendiente, qué tarjetas van primero en cada tipo).
- **Límite de FPS** = siempre manual, en su barra.
- **Vatios** = sugerencia por tipo y rango (Auto · Ahorro · Mínimo · Pleno), aplicada solo a petición; el Auto‑TDP usa como meta el límite de FPS que tú pusiste.
- Pendiente de decidir con Carlos: si la barra de 4 posiciones sigue en Inicio como «rango de vatios» o se queda solo en Rendimiento.
