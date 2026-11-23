import { describe, expect, it, vi } from "vitest";

import { Persona, groupFriends, plainText, recentChats, statusText, unreadTotal, type Friend } from "../src/social";
import { guardNavigation } from "../src/navGuard";

const f = (o: Partial<Friend>): Friend => ({
  accountId: 1, steam64: "1", name: "A", state: Persona.Online, appid: 0, gameName: "", avatar: null, lastOnline: 0, unread: 0, lastMsg: null, voice: false, ...o,
});

describe("amigos", () => {
  it("agrupa: tu juego, jugando, en linea, ausentes, desconectados; no leidos primero", () => {
    const g = groupFriends([
      f({ accountId: 1, name: "Zoe", appid: 730 }),
      f({ accountId: 2, name: "Ana", appid: 570 }),
      f({ accountId: 3, name: "Bea" }),
      f({ accountId: 4, name: "Abel", unread: 3 }),
      f({ accountId: 5, name: "Carla", state: Persona.Away }),
      f({ accountId: 6, name: "Dani", state: Persona.Offline, lastOnline: 50 }),
      f({ accountId: 7, name: "Eva", state: Persona.Invisible, lastOnline: 90 }),
    ], 730);
    expect(g.here.map((x) => x.name)).toEqual(["Zoe"]);
    expect(g.playing.map((x) => x.name)).toEqual(["Ana"]);
    expect(g.online.map((x) => x.name)).toEqual(["Abel", "Bea"]);
    expect(g.away.map((x) => x.name)).toEqual(["Carla"]);
    expect(g.offline.map((x) => x.name)).toEqual(["Eva", "Dani"]);
  });
  it("texto de estado", () => {
    expect(statusText(f({ appid: 730, gameName: "CS2" }))).toBe("Jugando · CS2");
    expect(statusText(f({ state: Persona.Away }))).toBe("Ausente");
    expect(statusText(f({ state: Persona.Offline, lastOnline: 1000 }), 1000 + 7200)).toBe("Hace 2 h");
  });
  it("chats recientes y no leidos", () => {
    const list = [f({ accountId: 1, lastMsg: { text: "a", at: 5, mine: false } }), f({ accountId: 2, unread: 2, lastMsg: { text: "b", at: 1, mine: false } }), f({ accountId: 3 })];
    expect(recentChats(list).map((x) => x.accountId)).toEqual([2, 1]);
    expect(unreadTotal(list)).toBe(2);
  });
  it("BBCode de Steam a texto", () => {
    expect(plainText("[b]hola[/b] [emoticon]steamhappy[/emoticon]")).toBe("hola :steamhappy:");
    expect(plainText("[gameinvite appid=730][/gameinvite]")).toBe("🎮 Invitación a jugar");
  });
});

describe("cerrar el panel al navegar", () => {
  it("envuelve los metodos, avisa antes de navegar y restaura", () => {
    const nav = { Navigate: vi.fn(), CloseSideMenus: vi.fn() };
    const orig = nav.Navigate;
    const leave = vi.fn();
    const undo = guardNavigation([nav as never], leave);
    nav.Navigate("/decky/store");
    expect(leave).toHaveBeenCalledTimes(1);
    expect(orig).toHaveBeenCalledWith("/decky/store");
    nav.CloseSideMenus();
    expect(leave).toHaveBeenCalledTimes(1);
    undo();
    expect(nav.Navigate).toBe(orig);
  });
});

import { voice, voiceState } from "../src/social";
describe("voz (VoiceChatStore real)", () => {
  it("llamada entrante: aparece con nombre, aceptar y rechazar llaman a Steam; colgar usa la interfaz exportada", () => {
    const accept = vi.fn(), reject = vi.fn(), end = vi.fn();
    (window as unknown as Record<string, unknown>).g_FriendsUIApp = {
      ChatStore: { VoiceChat: {
        IsVoiceChatActive: () => false, GetActiveOneOnOneVoiceChatAccountID: () => 0, GetActiveChatRoomGroupID: () => "",
        GetOneOnOneCallsWaitingForJoinOrAccept: () => new Map([[11, {}]]), BSelfHadPreviouslyJoinedOneOnOneChat: () => false,
        BPartnerHasRequestedAndIsInOneOnOneChat: () => true, AcceptPartnersOneOnOneChatRequest: accept, OnRejectOneOnOneVoiceChatForPartner: reject,
        IsMicMuted: () => true, IsOutputMuted: () => false,
      } },
      m_exportsVoiceInterface: { EndVoiceChat: end },
    };
    const v = voiceState([f({ accountId: 11, name: "Mateo" })]);
    expect(v.incoming).toEqual([{ accountId: 11, name: "Mateo" }]);
    expect(v.micMuted).toBe(true);
    voice.accept(11); voice.reject(11); voice.hangUp();
    expect(accept).toHaveBeenCalledWith(11);
    expect(reject).toHaveBeenCalledWith(11);
    expect(end).toHaveBeenCalled();
    delete (window as unknown as Record<string, unknown>).g_FriendsUIApp;
  });
});

describe("chat: menos trabajo mientras escribes", () => {
  it("«escribiendo» como mucho cada 3 s por amigo y lista de fondo en pausa con una conversación abierta", async () => {
    const { typing, chatOpened, chatIsOpen } = await import("../src/social");
    expect(typing(5, 1000)).toBe(true);
    expect(typing(5, 2500)).toBe(false);
    expect(typing(6, 2500)).toBe(true);
    expect(typing(5, 4100)).toBe(true);
    expect(chatIsOpen()).toBe(false);
    const a = chatOpened(), b = chatOpened();
    a();
    expect(chatIsOpen()).toBe(true);
    b(); b();
    expect(chatIsOpen()).toBe(false);
  });
});
