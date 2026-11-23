// @ts-nocheck
// Diagnostico de Amigos, Chat y Voz DENTRO del plugin (sin DevTools). Es el script qam-explorar-amigos-2.js como modulo:
// los botones de Mas › Diagnostico llaman a QRX2.explorar / teclado / voz. Guarda en diag/amigos-diagnostico.json.
// Sigue disponible en la consola como window.QRX2 si DevTools vuelve a conectar.
import { saveSection } from "./diagStore";

export function installQRX2(): Record<string, (...a: unknown[]) => Promise<unknown>> {

  const QRX2 = (window.QRX2 = window.QRX2 || {});
  const R = { version: 2, creado: new Date().toISOString(), pasos: {} };
  const MAXSRC = 600;
  const names = new Map();
  const alias = (pre, k) => { const key = `${pre}:${k}`; if (!names.has(key)) names.set(key, `${pre}#${names.size + 1}`); return names.get(key); };
  const red = (s) => (typeof s === "string" ? `<texto ${s.length} car.>` : s);
  const tipo = (v) => (v === null ? "null" : Array.isArray(v) ? `array(${v.length})` : typeof v?.values === "function" && typeof v?.get === "function" ? `mapa(${v.size ?? "?"})` : typeof v);
  const prim = (v) => (typeof v === "string" ? red(v) : typeof v === "number" || typeof v === "boolean" || v == null ? v : tipo(v));
  const src = (f) => { try { return String(f).replace(/\s+/g, " ").slice(0, MAXSRC); } catch { return "?"; } };
  const ctor = (o) => { try { return o?.constructor?.name ?? "?"; } catch { return "?"; } };
  const safe = (fn, def = null) => { try { return fn(); } catch (e) { return def ?? `ERROR: ${String(e).slice(0, 160)}`; } };
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

  /** Propiedades, getters (con su VALOR, que en estos objetos son lecturas sin efectos) y métodos con código. */
  function ficha(o, { fuentes = null, leerGetters = true, max = 80 } = {}) {
    if (!o || typeof o !== "object") return tipo(o);
    const out = { clase: ctor(o), propias: {}, getters: {}, metodos: [], fuentes: {} };
    for (const k of Object.getOwnPropertyNames(o).slice(0, max)) {
      const d = Object.getOwnPropertyDescriptor(o, k);
      if (d?.get) out.getters[k] = leerGetters ? prim(safe(() => o[k])) : "getter";
      else out.propias[k] = typeof d?.value === "function" ? "fn" : prim(d?.value);
    }
    const re = fuentes ? new RegExp(fuentes, "i") : null;
    for (let p = Object.getPrototypeOf(o), n = 0; p && p !== Object.prototype && n < 5; p = Object.getPrototypeOf(p), n++) {
      for (const k of Object.getOwnPropertyNames(p)) {
        if (k === "constructor") continue;
        const d = Object.getOwnPropertyDescriptor(p, k);
        if (d?.get) { if (!(k in out.getters)) out.getters[k] = leerGetters ? prim(safe(() => o[k])) : "getter"; }
        else if (typeof d?.value === "function") { out.metodos.push(k); if (re?.test(k) && !out.fuentes[k]) out.fuentes[k] = src(d.value); }
      }
    }
    return out;
  }

  const app = () => window.g_FriendsUIApp;
  const cs = () => app()?.ChatStore;
  const vc = () => cs()?.VoiceChat;

  // ---------- 1) Explorar ----------
  QRX2.explorar = async () => {
    const E = {};
    // Grupos y salas
    const grupos = safe(() => cs().currentChatRoomGroups, []);
    E.numGrupos = Array.isArray(grupos) ? grupos.length : tipo(grupos);
    const g0 = Array.isArray(grupos) ? grupos[0] : null;
    if (g0) {
      E.grupo = ficha(g0, { fuentes: "Voice|Join|Leave|Room|Name|Member|Unread|Show|Open|Active" });
      if (E.grupo.getters?.name) E.grupo.getters.name = alias("grupo", E.grupo.getters.name);
      // Buscar la lista de salas dentro del grupo (array o mapa) sin conocer su nombre
      const salas = [];
      for (const k of [...Object.getOwnPropertyNames(g0), ...Object.getOwnPropertyNames(Object.getPrototypeOf(g0) ?? {})]) {
        const v = safe(() => g0[k], null);
        const lista = Array.isArray(v) ? v : typeof v?.values === "function" ? safe(() => [...v.values()], []) : null;
        if (lista && lista.length && typeof lista[0] === "object" && /room|chat|channel/i.test(k)) salas.push({ campo: k, n: lista.length, primera: lista[0] });
      }
      E.camposDeSalas = salas.map((x) => `${x.campo} (${x.n})`);
      const voz = salas.flatMap((x) => (Array.isArray(x.primera) ? [] : [x.primera]));
      if (voz[0]) E.sala = ficha(voz[0], { fuentes: "Voice|Join|Leave|Send|Name|Member|Active|Start" });
    }
    // FriendChatStore y chats recientes
    E.FriendChatStore = ficha(cs()?.FriendChatStore, { fuentes: "GetAllChats|Unread|GetFriendChat|Recent", leerGetters: false });
    const recientes = safe(() => cs().GetRecentChats(), []);
    E.recientes = Array.isArray(recientes) ? { n: recientes.length, primero: recientes[0] ? ficha(recientes[0], { leerGetters: false }) : null } : tipo(recientes);
    // Un chat con mensajes: cargar historial y describir un mensaje real
    const amigos = safe(() => window.friendStore.allFriends, []);
    let chat = null;
    for (const p of amigos) {
      const id = safe(() => p.m_unAccountID ?? p.accountid, 0);
      const c = id && safe(() => cs().GetFriendChat(id, false), null);
      if (c && safe(() => c.m_strLastMessage, null)) { chat = c; break; }
    }
    if (chat) {
      E.chatAntes = { cargado: safe(() => chat.m_bChatLogsLoaded), mensajes: safe(() => chat.m_rgChatMessages?.length) };
      await safe(() => chat.LoadChatLogs(), null);
      await wait(2500);
      const msgs = safe(() => chat.m_rgChatMessages, []) ?? [];
      E.chatDespues = { cargado: safe(() => chat.m_bChatLogsLoaded), mensajes: msgs.length };
      const m = msgs[msgs.length - 1];
      if (m) E.mensaje = ficha(m, { fuentes: "Text|Message|Invite|Server|Key" });
    } else E.chat = "no encontré un chat con último mensaje";
    // Persona de un amigo en línea: getters útiles (is_online, display_name, …)
    const online = amigos.find((p) => safe(() => p.persona?.m_ePersonaState, 0) > 0) ?? amigos[0];
    if (online) {
      const f = ficha(online, { fuentes: "Avatar|Name|Online|Game|Status" });
      for (const k of Object.keys(f.getters)) if (typeof f.getters[k] === "string" && f.getters[k].startsWith("<texto")) f.getters[k] = "<texto>";
      E.amigo = f;
      E.persona = ficha(online.persona, {});
    }
    // Voz: estado de la llamada
    const st = safe(() => vc().m_VoiceCallState, null);
    E.vozEstado = st ? ficha(st, { fuentes: "Match|State" }) : null;
    E.exportsVoz = ficha(app()?.m_exportsVoiceInterface, { fuentes: ".", leerGetters: false });
    E.exportsEstado = ficha(app()?.m_exportsCurrentUserStatus, { fuentes: ".", leerGetters: false });
    E.UIStore = ficha(app()?.UIStore, { fuentes: "Show|Open|Chat|Group|Friend", leerGetters: false });
    // Teclado de Steam
    const nav = window.FocusNavController;
    E.FocusNavController = ficha(nav, { fuentes: "Keyboard|Focus|Context", leerGetters: false });
    E.tecladoRaiz = ficha(safe(() => nav.m_ActiveContext.m_rootWindow, null), { fuentes: "Keyboard", leerGetters: false });
    const bb = safe(() => window.BrowserAndBackstackInstances, null);
    E.tecladoInstancias = bb ? Object.keys(bb).map((k) => ({ k, teclado: ficha(safe(() => bb[k].m_refKeyboard, null), { fuentes: "Keyboard|Show|Hide", leerGetters: false }) })) : null;
    E.qamRail = { modalAbierto: !!window.__qamRailModalEl?.isConnected, docModal: safe(() => window.__qamRailModalEl?.ownerDocument?.title, null) };
    R.pasos.explorar = E;
    await QRX2.guardar();
    console.log("Explorar 2 listo", { grupos: E.numGrupos, salas: E.camposDeSalas, mensajes: E.chatDespues, voz: !!st });
    return "ok";
  };

  // ---------- 2) Teclado: por qué se cierra el panel ----------
  QRX2.teclado = async (segundos = 30) => {
    const T = { eventos: [] };
    const t0 = performance.now();
    const pila = () => safe(() => new Error().stack.split("\n").slice(1).filter((l) => !/\b(pila|nota) \(/.test(l)).slice(1, 8).map((l) => l.trim().slice(0, 140)).join(" | "), "");
    const nota = (q, d = "", conPila = false) => T.eventos.push({ ms: Math.round(performance.now() - t0), q, d: String(d).slice(0, 200), ...(conPila ? { pila: pila() } : {}) });
    const undo = [];
    const envolver = (obj, etiqueta, re) => {
      if (!obj) return;
      const vistos = new Set();
      for (let p = obj; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
        for (const k of Object.getOwnPropertyNames(p)) {
          if (vistos.has(k) || k === "constructor" || !re.test(k)) continue;
          vistos.add(k);
          const f = safe(() => obj[k], null);
          if (typeof f !== "function") continue;
          try {
            obj[k] = function (...a) { nota(`${etiqueta}.${k}`, a.map(tipo).join(","), true); return f.apply(this, a); };
            undo.push(() => { try { delete obj[k]; if (obj[k] !== f) obj[k] = f; } catch { /* nada */ } });
          } catch { /* sellado */ }
        }
      }
    };
    // Teclado virtual en todas sus instancias
    const bb = safe(() => window.BrowserAndBackstackInstances, null);
    if (bb) for (const k of Object.keys(bb)) envolver(safe(() => bb[k].m_refKeyboard, null), `teclado[${k}]`, /Keyboard|Show|Hide|Close|Open/);
    envolver(safe(() => window.FocusNavController.m_ActiveContext.m_rootWindow, null), "rootWindow", /Keyboard/);
    // Menús y navegación de las ventanas de Steam (quién cierra)
    const wins = safe(() => window.SteamUIStore.WindowStore.SteamUIWindows, []) ?? [];
    wins.forEach((w, i) => envolver(safe(() => w.MenuStore, null), `MenuStore[${i}]`, /Open|Close|Toggle|Hide|Show/));
    envolver(safe(() => window.SteamUIStore.GetFocusedWindowInstance().MenuStore, null), "MenuStore(foco)", /Open|Close|Toggle|Hide|Show/);
    envolver(window.DFL?.Router ?? null, "Router", /Navigate|Close|Open|Hide/);
    envolver(window.DFL?.Navigation ?? null, "Navigation", /Navigate|Close|Open|Hide/);
    // Registro de QAM Rail
    const log0 = console.log;
    console.log = function (...a) { if (String(a[0]).includes("[qam-rail]")) nota("qam-rail", a.join(" "), true); return log0.apply(this, a); };
    undo.push(() => { console.log = log0; });
    // Eventos en la VENTANA DEL PANEL (no en la de la consola) y en la del QAM nativo
    const docs = new Set();
    const dm = window.__qamRailModalEl?.ownerDocument;
    if (dm) docs.add(dm);
    wins.forEach((w) => { const d = safe(() => w.BrowserWindow.document, null); if (d) docs.add(d); });
    let n = 0;
    for (const d of docs) {
      const tag = `doc${n++}:${safe(() => d.title, "") || "?"}`;
      for (const ev of ["visibilitychange", "focusin", "focusout", "keydown", "input", "blur", "focus"]) {
        const h = (e) => nota(`${ev}@${tag}`, `${e.target?.tagName ?? ""}.${String(e.target?.className ?? "").slice(0, 50)} key=${e.key ?? ""} vis=${d.visibilityState}`);
        d.addEventListener(ev, h, true);
        undo.push(() => d.removeEventListener(ev, h, true));
      }
      const view = d.defaultView;
      if (view) for (const ev of ["blur", "focus"]) { const h = () => nota(`ventana-${ev}@${tag}`); view.addEventListener(ev, h); undo.push(() => view.removeEventListener(ev, h)); }
    }
    // Cuándo desaparece el panel
    let estaba = !!window.__qamRailModalEl?.isConnected;
    const vig = setInterval(() => { const ahora = !!window.__qamRailModalEl?.isConnected; if (ahora !== estaba) { nota(ahora ? "PANEL-ABIERTO" : "PANEL-CERRADO"); estaba = ahora; } }, 50);
    undo.push(() => clearInterval(vig));
    T.docsVigilados = [...docs].map((d) => safe(() => d.title, "?"));
    console.log(`Vigilando ${segundos} s: Social › amigo › A en «Escribe un mensaje»…`);
    await wait(segundos * 1000);
    undo.reverse().forEach((f) => safe(f));
    R.pasos.teclado = T;
    await QRX2.guardar();
    console.log(`Teclado: ${T.eventos.length} eventos`);
    return "ok";
  };

  // ---------- 3) Voz con su estado real ----------
  QRX2.voz = async (segundos = 45) => {
    const V = { cambios: [] };
    const t0 = performance.now();
    const foto = () => {
      const v = vc();
      return {
        activa: safe(() => v.IsVoiceChatActive()), conAmigo: safe(() => (v.GetActiveOneOnOneVoiceChatAccountID() ? "sí" : "no")), grupo: safe(() => !!v.GetActiveChatRoomGroupID()),
        conectando: safe(() => v.IsAttemptingInitialConnection()), micMudo: safe(() => v.IsMicMuted()), salidaMuda: safe(() => v.IsOutputMuted()),
        estado: safe(() => v.m_VoiceCallState.m_eState), esperando: safe(() => v.GetOneOnOneCallsWaitingForJoinOrAccept().size),
      };
    };
    let prev = foto();
    V.inicial = prev;
    const off = safe(() => vc().RegisterForVoiceChatActiveStateChange((...a) => V.cambios.push({ ms: Math.round(performance.now() - t0), aviso: "VoiceChatActiveStateChange", args: a.map(prim) })), null);
    console.log(`Vigilando la voz ${segundos} s: llama desde QAM Rail, silencia el micro y cuelga desde QAM Rail…`);
    await new Promise((fin) => {
      const id = setInterval(() => {
        const cur = foto();
        for (const k of Object.keys(cur)) if (cur[k] !== prev[k]) V.cambios.push({ ms: Math.round(performance.now() - t0), clave: k, antes: prev[k], ahora: cur[k] });
        prev = cur;
        if (performance.now() - t0 > segundos * 1000) { clearInterval(id); fin(); }
      }, 100);
    });
    safe(() => off?.Unregister?.());
    R.pasos.voz = V;
    await QRX2.guardar();
    console.log(`Voz: ${V.cambios.length} cambios`);
    return "ok";
  };

  // ---------- 4) Enviar (opcional) ----------
  QRX2.amigos = () => {
    const l = (safe(() => window.friendStore.allFriends, []) ?? []).map((p) => ({ nombre: safe(() => p.persona.m_strPlayerName, "?"), id: safe(() => p.m_unAccountID, 0), estado: safe(() => p.persona.m_ePersonaState, 0) }))
      .filter((x) => x.id).sort((a, b) => (b.estado > 0) - (a.estado > 0) || String(a.nombre).localeCompare(String(b.nombre)));
    QRX2._lista = l;
    console.table(l.slice(0, 40).map((x, i) => ({ n: i + 1, nombre: x.nombre, estado: x.estado })));
    return `${l.length} amigos`;
  };
  QRX2.enviar = async (n, texto = "prueba qam") => {
    const lista = window.QRX?._lista ?? QRX2._lista ?? (QRX2.amigos(), QRX2._lista);
    const a = lista[n - 1];
    if (!a) return "número fuera de la lista";
    const chat = cs().GetFriendChat(a.id, true);
    await safe(() => chat.LoadChatLogs(), null);
    await wait(1500);
    const antes = chat.m_rgChatMessages?.length ?? 0;
    let error = null;
    try { await chat.SendChatMessage(texto); } catch (e) { error = String(e); }
    await wait(2000);
    const msgs = chat.m_rgChatMessages ?? [];
    const ult = msgs[msgs.length - 1];
    R.pasos.enviar = { antes, despues: msgs.length, error, ultimo: ult ? { mio: ult.unAccountID === safe(() => window.friendStore.currentUserSteamID.GetAccountID()), texto: red(ult.strMessage ?? ult.strMessageInternal), ack: safe(() => ult.BHasServerAcknowledged?.()) } : null,
      cola: ficha(chat.m_MessageSendQueue, { leerGetters: false }) };
    await QRX2.guardar();
    console.log("Enviar:", R.pasos.enviar);
    return R.pasos.enviar.despues > antes ? "enviado" : "sin cambios";
  };

  // ---------- Guardar ----------
  QRX2.guardar = async () => {
    // Cada paso es su propia seccion del informe: explorar no borra lo de teclado ni al reves.
    let donde = null;
    for (const [k, v] of Object.entries(R.pasos)) {
      try { donde = await saveSection(`amigos.${k}`, JSON.parse(JSON.stringify(v))); } catch { /* sigue con el resto */ }
    }
    console.log(donde ? `Guardado en ${donde}` : "No se pudo guardar: JSON.stringify(QRX2.resultados())");
    return donde ?? "portapapeles";
  };
  QRX2.resultados = () => R;
  console.log("QRX2 listo. Empieza con:  await QRX2.explorar()");

  return QRX2;
}
