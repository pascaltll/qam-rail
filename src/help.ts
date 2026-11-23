// Ayuda de cada tarjeta: qué hace y cómo se usa. Se abre con Y (mando) sobre cualquier control de la tarjeta, o
// tocando el «?» del título. Textos cortos, en el idioma del panel.
export interface HelpEntry { title: string; text: string[] }

export const HELP: Record<string, HelpEntry> = {
  canales: { title: "Versión instalada", text: [
    "Pueden estar instaladas a la vez dos copias de QAM Rail: la ESTABLE (se actualiza sola desde GitHub) y la de DESARROLLO (la que se prueba antes).",
    "Solo una dibuja el panel; la otra queda en pausa y no gasta nada. Con la de desarrollo instalada, esa es la que arranca.",
    "Pasar de una a otra reinicia Decky unos segundos. Desde la terminal: ./canal.sh estable  ·  ./canal.sh dev  ·  ./canal.sh (para ver cuál está activa).",
    "Red de seguridad: si la de desarrollo no llega a arrancar bien 2 veces seguidas, el panel vuelve solo a la estable y lo avisa.",
  ] },
  steam: { title: "Apps del equipo", text: [
    "Aquí salen las apps de escritorio instaladas (Flatpak, AppImage y del sistema): navegadores, Discord, emuladores…",
    "«Abrir» la lanza y pasa a «Cerrar» mientras está abierta (cierra la app y todos sus procesos). «Agregar a QAM» la pone en Apps (y en Inicio) de este panel para abrirla desde su menú; no se crea nada en Steam.",
    "Los navegadores basados en Chromium se abren a pantalla completa. Firefox no tiene una opción fiable para eso.",
    "Si una app no abre, el aviso dice por qué (lo último que escribió al cerrarse).",
  ] },
  tipo: { title: "Tipo de juego", text: [
    "Dice al panel qué clase de juego es para adaptarse: qué plugins y ajustes quedan a mano.",
    "Simple: 2D, indies, retro. Medio: 3D moderado. Exigente: 3D pesado.",
    "App: navegador, YouTube, lanzador. No es un juego: Inicio queda como el escritorio.",
    "Elegir un tipo NO cambia los FPS ni los vatios. Cada juego recuerda el suyo.",
  ] },
  preset: { title: "Vatios sugeridos", text: [
    "Una sugerencia de vatios para este tipo de juego. No cambia nada hasta que pulses «Aplicar vatios».",
    "Vatios automáticos: Panel de Control busca los justos para tu límite de FPS, dentro del rango del tipo.",
    "Rango: Auto (ahorra solo si no hay cargador) · Ahorro · Mínimo · Pleno.",
    "El límite de FPS lo pones tú en su tarjeta: el panel no lo cambia solo.",
  ] },
  potencia: { title: "Potencia", text: [
    "Los vatios que puede gastar el procesador. Más vatios = más FPS, más calor y menos batería.",
    "Arrastra la barra o usa los atajos (Eco, Equilibrado, Máx).",
    "Manual: tú eliges. Auto: Panel los ajusta para llegar a la meta de FPS. Descargas: lo mínimo, para bajar cosas.",
    "Si dice «Aplicado X W» distinto de lo pedido, el equipo no permite menos ahora (con cargador suele tener un mínimo más alto).",
  ] },
  fluidez: { title: "Límite de FPS y VRR", text: [
    "Los números (30, 40, 60…) son el máximo de imágenes por segundo que dibuja el juego. «Sin límite» deja que vaya todo lo rápido que pueda.",
    "Limitar ahorra batería y calor: 30 = dura más, 40 = buen equilibrio, 60 = fluido.",
    "VRR (refresco variable): la pantalla se adapta a los FPS del juego en cada instante. Evita tirones e imagen partida cuando el juego no llega a la meta. Conviene dejarlo encendido.",
    "Si notas retardo o tirones con VRR y un límite (juegos pesados): prueba VRR apagado con 40 o 60 FPS, o sube los vatios mínimos; con pocos vatios el juego puede ir justo y se nota como lag.",
  ] },
  escalado: { title: "Escalado de Steam", text: [
    "Cómo se estira la imagen del juego hasta llenar la pantalla cuando el juego usa menos resolución.",
    "Primera fila, la forma: Auto, Entero (píxeles exactos, retro), Ajustar (sin deformar), Llenar (recorta), Estirar (deforma).",
    "Segunda fila, el filtro: Lineal (suave), Píxel (nítido, retro), FSR (afila; va bien bajando la resolución del juego para ganar FPS).",
  ] },
  reescalador: { title: "Reescalador de Panel", text: [
    "FSR o XeSS instalados por Panel de Control dentro del juego: el juego dibuja a menos resolución y el reescalador la sube. Da muchos FPS.",
    "Aquí solo se ve cómo está. Se instala y se configura en Panel de Control ANTES de iniciar el juego.",
  ] },
  bateria: { title: "Batería", text: [
    "Carga, tiempo estimado, salud y ciclos.",
    "Limitar carga: deja de cargar a un porcentaje (por ejemplo 80 %) para cuidar la batería si juegas casi siempre enchufado.",
  ] },
  avanzado: { title: "Avanzado", text: [
    "Ventiladores: Auto es lo normal. Silencio hace menos ruido y calienta más; Máximo, al revés.",
    "Overlay: los datos de rendimiento sobre el juego (0 = oculto, 4 = todo).",
    "Baja latencia: responde antes al mando; puede costar algo de fluidez.",
  ] },
  color: { title: "Color", text: [
    "Looks de imagen: Nativo, Aspecto OLED (más contraste), Cine, Vivo, Cómodo.",
    "Modo noche: tonos cálidos para la vista. HDR solo aparece si la pantalla lo admite.",
    "Con un juego abierto, lo que cambies se guarda solo para ese juego.",
  ] },
  sonido: { title: "Sonido", text: [
    "Ecualizador de Panel: enciéndelo y elige un perfil (Voces, Graves, Cine…). «Nivelar volumen» iguala escenas fuertes y flojas.",
    "Salida: por dónde suena (altavoces, auriculares, HDMI). Solo aparece si hay más de una.",
    "Micrófono: el botón lo silencia y la barra cambia su volumen.",
  ] },
  wifi: { title: "Wi‑Fi", text: [
    "Enciende o apaga el Wi‑Fi y conecta a redes que ya conoces.",
    "Para una red nueva (con contraseña), usa «Otras redes», que abre los ajustes de Steam.",
  ] },
  bluetooth: { title: "Bluetooth", text: [
    "Enciende o apaga el Bluetooth y conecta dispositivos ya emparejados (auriculares, mandos).",
    "Para emparejar uno nuevo, usa «Emparejar otro», que abre los ajustes de Steam.",
  ] },
  actualizar: { title: "Actualizaciones", text: [
    "Busca una versión nueva de QAM Rail en GitHub (como mucho cada 6 horas; «Buscar actualización» lo fuerza).",
    "Nada se instala solo: al pulsar «Actualizar» se descarga, se comprueba su SHA-256 y se guarda una copia de la versión actual.",
    "Decky se reinicia unos segundos. Si algo va mal, «Volver a X» restaura la copia.",
    "Estable = solo versiones probadas. Beta = también las de prueba.",
  ] },
  panel: { title: "Fluidez del panel", text: [
    "Con pocos vatios este panel va más lento. Por debajo del límite de ahorro quita animaciones y desenfoque para responder mejor.",
    "Impulso al abrir: sube un poco la potencia mientras el panel está abierto y la devuelve al cerrar.",
  ] },
};
