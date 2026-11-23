# QAM Rail · Propuesta de reorganización (2026-11-12, tras v0.43.0)

Revisión de todas las funciones del panel: qué se queda, qué se mueve, qué se quita y qué falta. **Estado: aplicada en v0.44.0** (riel de 7, Rendimiento, Imagen y sonido, Avisos dentro de Social, Más › Sistema, Remote Play como «próximamente», ventiladores plegados). Pendiente de esta propuesta: FPS en vivo y «dura X h» junto al preset, y unificar todas las piezas a 40 px. Corresponde a la fase 5 del plan (`claude/qam-plan-mejora.md`).

## 1. Qué hay hoy (8 iconos en el riel)

| Sección | Contenido | Problema |
|---|---|---|
| Inicio | Potencia, brillo, volumen, tipo de juego, pantalla rápida, plugins, apps, música | Bien. Es la que más se usa. |
| Energía | Preset, potencia y modos, batería, ventiladores, prueba de CPU, Panel | Mezcla lo de cada día con lo que casi no se toca (ventiladores, prueba de CPU). |
| Pantalla y sonido | FPS/VRR, escalado, reescalador, color, avanzado, sonido | Los FPS y el escalado son «rendimiento», pero están lejos de la potencia. Para ajustar un juego hay que ir a dos secciones. |
| Conexiones | Wi‑Fi, Bluetooth, avión, No molestar, Remote Play (prototipo), ajustes, mandos | Remote Play no hace nada. «Ajustes» y «Mandos» son atajos sueltos. |
| Apps | Apps y plugins, apps de QAM | Bien. |
| Social | Amigos, chats, grupos, jugar juntos | Bien. |
| Avisos | Lista de avisos | Un icono entero para una lista corta. |
| Más | Apariencia, Panel, pruebas, teclado, ayuda, módulos, QAM anterior, cerrar | «Cerrar» y «Módulos» sobran. |

## 2. Idea central

El panel se organiza por **lo que quieres conseguir**, no por de dónde sale cada ajuste:

1. **¿Cómo va el juego?** → Rendimiento (todo lo que da o quita FPS y batería, junto).
2. **¿Cómo se ve y se oye?** → Imagen y sonido.
3. **¿A qué estoy conectado?** → Conexiones.
4. **¿Qué abro?** → Apps.
5. **¿Con quién hablo y qué me avisan?** → Social.
6. **El resto** → Más.

Inicio sigue siendo el resumen de la situación: 4–6 controles y nada más.

## 3. Riel propuesto: de 8 a 7 iconos

| # | Sección | Icono | Contenido |
|---|---|---|---|
| 1 | **Inicio** | casa / mando | El kit de la situación (ver punto 5). |
| 2 | **Rendimiento** | rayo | Preset del juego · Potencia y modos · FPS y VRR · Escalado · Reescalador (estado) · Batería · *Avanzado* (ventiladores, overlay, baja latencia). |
| 3 | **Imagen y sonido** | pantalla con altavoz | Color y looks · Modo noche y HDR · Sonido (ecualizador, salida, micrófono). |
| 4 | **Conexiones** | Wi‑Fi | Wi‑Fi · Bluetooth · Modo avión. |
| 5 | **Apps** | rejilla | Apps · Plugins · Apps de QAM. |
| 6 | **Social** | personas | Amigos · Chats · Grupos · **Avisos** (pestaña nueva) · Jugar juntos. El globo del riel suma mensajes y avisos sin leer. |
| 7 | **Más** | puntos | Apariencia · Panel de Control · Sistema (ajustes, mandos, ayuda) · Pruebas · QAM anterior. |

## 4. Función por función

**Leyenda:** ✅ se queda · ➡️ se mueve · 🗜️ se pliega (queda, pero dentro de «Avanzado») · ❌ se quita · ➕ nuevo

### Rendimiento (antes Energía + parte de Pantalla)
| Función | Decisión | Por qué |
|---|---|---|
| Preset del juego (tipo, «Aplicar», Ahorrar batería, Vatios automáticos) | ✅ arriba | Es la decisión que arrastra a todas las demás. |
| Potencia (barra, presets, Manual / Auto / Descargas) | ✅ | Lo más usado. |
| FPS y VRR | ➡️ desde Pantalla | Van con la potencia: se ajustan juntos. |
| Escalado de Steam (Auto, Entero, Ajustar…, filtro, nitidez) | ➡️ desde Pantalla | Igual. |
| Reescalador de Panel (solo estado) | ➡️ desde Pantalla | Igual. |
| Batería (%, tiempo, límite de carga) | ✅ | |
| Lo aprendido de este juego | ✅ dentro de Potencia | |
| «Guardado en este juego» (4 fichas) | 🗜️ una línea al pie | Informa, no se toca. |
| Ventiladores | 🗜️ Avanzado | Dijiste que los dejas en automático. |
| Overlay de rendimiento, baja latencia | 🗜️ Avanzado | Uso ocasional. |
| «Fluidez del panel» (ahorro, impulso al abrir) | ➡️ Más › Apariencia | Es del panel, no del juego. |
| Prueba de rendimiento de CPU | ➡️ Más › Pruebas | Es una prueba. |
| ➕ FPS en vivo junto al preset | nuevo | Para ver si el preset cumple la meta. Panel ya los da. [H] |
| ➕ «Dura unas X h» junto a Ahorrar batería | nuevo | Para decidir con un dato. Panel da el tiempo restante. |

### Imagen y sonido
| Función | Decisión | Por qué |
|---|---|---|
| Color y looks, modo noche, calidez, HDR | ✅ | |
| Sonido: ecualizador, presets, nivelar, salida, micrófono | ✅ | |
| ➕ Brillo y volumen también aquí | nuevo | Hoy solo están en Inicio; quien entra aquí los busca. |

### Conexiones
| Función | Decisión | Por qué |
|---|---|---|
| Wi‑Fi, Bluetooth, modo avión | ✅ | |
| No molestar | ➡️ Social (cabecera) | Es sobre avisos y chat. Se queda también como ficha rápida de Inicio. |
| Remote Play (prototipo sin función) | ❌ hasta que funcione | Un botón que no hace nada confunde. Vuelve cuando invite de verdad. |
| «Ajustes del sistema», «Mandos (remapeo)» | ➡️ Más › Sistema | Son atajos, no conexiones. |
| ➕ Wi‑Fi con contraseña | nuevo (pendiente de portar) | |

### Social
| Función | Decisión | Por qué |
|---|---|---|
| Amigos, chats, grupos, voz, jugar juntos, mi estado | ✅ | |
| Avisos | ➡️ pestaña dentro de Social | Libera un icono del riel. |
| ➕ Tocar un aviso abre su destino | nuevo (pendiente de portar) | |
| Efectos del chat | aparcado | Decidido: al final. |

### Más
| Función | Decisión | Por qué |
|---|---|---|
| Apariencia, Panel de Control, Pruebas, QAM anterior | ✅ | |
| «Cerrar» | ❌ | B y el botón QAM ya cierran. |
| «Módulos» | ➡️ dentro de Pruebas | Dato de diagnóstico. |
| Ayuda, teclado | ➡️ Más › Sistema | |
| Módulo antiguo «QAM Rail Amigos 0.1.1» | ❌ desinstalar | Sin uso desde 0.15; sigue instalado en tu consola. |

## 5. Inicio según la situación

| Situación | Arriba (se ve al abrir) | Debajo |
|---|---|---|
| **Juego** (Simple / Medio / Exigente) | Juego + FPS y vatios en vivo · Potencia · Brillo y volumen | Tipo de juego · FPS, VRR, escalado, color · Plugins para jugar |
| **Juego en batería** | Lo mismo + «Ahorrar batería · dura X h» | Igual |
| **App** (navegador, YouTube, lanzador) | Potencia · Brillo y volumen · Wi‑Fi, Bluetooth, No molestar, Noche | Plugins de Multimedia · Apps |
| **Escritorio** | Potencia · Brillo y volumen · Wi‑Fi, Bluetooth, No molestar, Noche | Plugins · Apps · Música |
| **TV / 4K** | Potencia · Volumen · Salida de sonido · Wi‑Fi, Bluetooth | Plugins · Apps |

Regla: lo de arriba cabe en una pantalla sin desplazar.

## 6. Diseño de cada tarjeta

Todas con el mismo esqueleto, para que se lean igual:

1. **Título + estado** a la derecha (lo que hay ahora: «40 FPS», «12 W», «activo»).
2. **Control principal** (una barra o una fila de opciones).
3. **Avanzado**, plegado.

Y seis piezas, ninguna más: tarjeta, fila de interruptor, segmentos (elegir 1 de N), deslizador, fila plegable, botón con icono. Todas de 40 px de alto como mínimo (hoy hay fichas de 32 px, pequeñas para el dedo).

## 7. Orden de trabajo propuesto

1. **Riel de 7 y mover tarjetas** (Rendimiento, Imagen y sonido, Avisos dentro de Social, Más › Sistema). Sin funciones nuevas: solo cambia dónde está cada cosa.
2. **Quitar** lo marcado ❌ y plegar lo marcado 🗜️.
3. **Añadir** FPS en vivo, «dura X h», brillo y volumen en Imagen y sonido.
4. **Unificar las piezas** (40 px, mismo esqueleto de tarjeta).
5. Revisión de mando y táctil sección por sección.

## 8. Decisiones que necesito
1. **Rendimiento:** ¿te parece juntar potencia, FPS, escalado y batería en una sola sección? Es el cambio más grande.
2. **Avisos dentro de Social:** ¿o prefieres que conserven su icono?
3. **Remote Play:** ¿lo quito hasta que funcione, o lo dejo visible como «próximamente»?
4. **Ventiladores:** ¿plegados en Avanzado está bien?
