import { describe, expect, it, vi } from "vitest";

import { InstallType, artifactUrl, parseStore, pendingUpdates, requestInstall, stateOf } from "../src/deckyStore";

describe("Decky integrado", () => {
  const raw = [
    { id: 1, name: "CSS Loader", author: "a", description: "d", tags: ["themes"], image_url: "x.png", versions: [{ name: "2.1.0", hash: "abc" }] },
    { id: 2, name: "Decky Clash", author: "b", description: "", tags: [], versions: [{ name: "1.0", hash: "h2", artifact: "https://x/y.zip" }] },
    { bad: true },
  ];
  it("normaliza la tienda y calcula el estado de cada plugin", () => {
    const list = parseStore(raw);
    expect(list.map((p) => p.name)).toEqual(["CSS Loader", "Decky Clash"]);
    expect(artifactUrl(list[0].versions[0])).toContain("/versions/abc.zip");
    expect(artifactUrl(list[1].versions[0])).toBe("https://x/y.zip");
    const installed = new Map([["CSS Loader", "2.0.0"]]);
    expect(stateOf(list[0], installed, new Map())).toBe("installed");
    expect(stateOf(list[0], installed, new Map([["CSS Loader", {}]]))).toBe("update");
    expect(stateOf(list[1], installed, new Map())).toBe("available");
  });
  it("actualizaciones de Decky (Map) e instalar por el backend de Decky", async () => {
    const call = vi.fn(async () => null);
    (window as unknown as Record<string, unknown>).DeckyBackend = { call };
    (window as unknown as Record<string, unknown>).DeckyPluginLoader = { deckyState: { publicState: () => ({ updates: new Map([["Colores", { name: "1.2", hash: "hh" }]]) }) } };
    const ups = pendingUpdates();
    expect(ups.get("Colores")).toEqual({ name: "1.2", hash: "hh", artifact: null });
    expect(await requestInstall("Colores", ups.get("Colores")!, InstallType.UPDATE)).toBe(true);
    expect(call).toHaveBeenCalledWith("utilities/install_plugin", expect.stringContaining("hh.zip"), "Colores", "1.2", "hh", 2);
    delete (window as unknown as Record<string, unknown>).DeckyBackend;
    delete (window as unknown as Record<string, unknown>).DeckyPluginLoader;
  });
});
