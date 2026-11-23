import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { isOnlyMedia, renderBB } from "../src/bbcode";

const html = (raw: string) => renderToStaticMarkup(h("div", null, ...renderBB(raw)));

describe("mensajes de Steam (BBCode)", () => {
  it("emoticonos y stickers como imagen del CDN de Steam", () => {
    const a = html("hola [emoticon]steamhappy[/emoticon]!");
    expect(a).toContain("hola ");
    expect(a).toContain('src="https://community.cloudflare.steamstatic.com/economy/emoticon/steamhappy"');
    expect(a).toContain("!");
    expect(html('[sticker type="Sticker_Chicken" limit="0"][/sticker]')).toContain("/economy/sticker/Sticker_Chicken");
  });
  it("formato anidado, imagen, invitación y etiquetas desconocidas", () => {
    expect(html("[b]muy [i]bien[/i][/b]")).toBe("<div><b>muy <i>bien</i></b></div>");
    expect(html('[img src="https://x/y.png"][/img]')).toContain('src="https://x/y.png"');
    expect(html("[gameinvite appid=730][/gameinvite]")).toContain("Invitación a jugar");
    expect(html("[raro]texto[/raro]")).toBe("<div>texto</div>");
  });
  it("mensaje que es solo un sticker o emoticono", () => {
    expect(isOnlyMedia("[emoticon]steamhappy[/emoticon]")).toBe(true);
    expect(isOnlyMedia("hola [emoticon]x[/emoticon]")).toBe(false);
  });
});
