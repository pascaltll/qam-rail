import { describe, it, expect } from "vitest";
import { buildSections, pushRecent } from "../src/deskOrg";

const A = (key: string, group = "Otras", name = key) => ({ key, name, group, source: "flatpak" } as never);

describe("organización de apps del equipo", () => {
  const apps = [A("ff", "Navegadores", "Firefox"), A("ed", "Navegadores", "Edge"), A("st", "Multimedia", "Stremio"), A("vl", "Multimedia", "VLC"), A("xx")];
  it("cada app sale una sola vez, en su sección más prioritaria", () => {
    const s = buildSections(apps, ["st"], ["ff", "st"], ["ff", "vl", "xx"], {});
    expect(s.open.map((a) => a.key)).toEqual(["st"]);
    expect(s.favs.map((a) => a.key)).toEqual(["ff"]);
    expect(s.recent.map((a) => a.key)).toEqual(["vl", "xx"]);
    const rest = s.groups.flatMap((g) => g.apps.map((a) => a.key));
    expect(rest).toEqual(["ed"]);
  });
  it("grupos ordenados y «Otras» al final; plegado por tamaño o a mano", () => {
    const many = Array.from({ length: 7 }, (_, i) => A(`n${i}`, "Navegadores", `N${i}`));
    const s = buildSections([...many, A("o", "Otras")], [], [], [], {});
    expect(s.groups.map((g) => g.group)).toEqual(["Navegadores", "Otras"]);
    expect(s.groups[0].collapsed).toBe(true);
    expect(s.groups[1].collapsed).toBe(false);
    const t = buildSections([...many, A("o", "Otras")], [], [], [], { Navegadores: false, Otras: true });
    expect(t.groups[0].collapsed).toBe(false);
    expect(t.groups[1].collapsed).toBe(true);
  });
  it("recientes: tope y las que sobran vuelven a su grupo", () => {
    const list = Array.from({ length: 7 }, (_, i) => A(`k${i}`, "Herramientas"));
    const s = buildSections(list, [], [], list.map((a) => (a as { key: string }).key), {});
    expect(s.recent).toHaveLength(5);
    expect(s.groups.flatMap((g) => g.apps)).toHaveLength(2);
  });
  it("pushRecent sin repetir y la última delante", () => {
    expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(pushRecent([], "x")).toEqual(["x"]);
  });
});
