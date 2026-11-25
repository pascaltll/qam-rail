import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn(async (_s: unknown) => true));
vi.mock("@decky/api", () => ({ callable: () => send }));
import { DIR, anon, ctrlRef, focusBegin, focusFlush, focusMove, focusSection, focusTap, pending, resetFocusLog } from "../src/focusLog";

const mk = (html: string) => { const d = document.createElement("div"); d.innerHTML = html; document.body.appendChild(d); return d; };

describe("registro de foco con el mando", () => {
  beforeEach(() => { send.mockClear(); resetFocusLog(); document.body.innerHTML = ""; });

  it("botones de la cruceta → dirección", () => {
    expect([DIR[9], DIR[10], DIR[11], DIR[12]]).toEqual(["U", "D", "L", "R"]);
    expect(DIR[5]).toBeUndefined();
  });

  it("anonimiza las listas de amigos y apps, no el resto", () => {
    expect(anon("social", "MrDesdes")).toBe("(lista)");
    expect(anon("apps", "Firefox")).toBe("(lista)");
    expect(anon("home", "Steam 10")).toBe("Steam 10");
  });

  it("identifica un control por etiqueta y ruta en el DOM, sin el texto largo", () => {
    const root = mk('<div><div><button>Steam   10</button><button>Eco 7</button></div></div>');
    const b = root.querySelectorAll("button")[1] as HTMLElement;
    const r = ctrlRef(b, root, "home");
    expect(r.label).toBe("Eco 7");
    expect(r.id).toBe("Eco 7|div:0>div:0>button:1");
    expect(ctrlRef(b, root, "social").label).toBe("(lista)");
    const largo = mk("<div><button>" + "x".repeat(200) + "</button></div>");
    expect(ctrlRef(largo.querySelector("button") as HTMLElement, largo, "home").label.length).toBeLessThanOrEqual(24);
  });

  it("registra movimientos, secciones y toques; no hace nada antes de empezar", () => {
    focusMove("home", { id: "a", label: "A" }, "D", { id: "b", label: "B" });
    expect(pending()).toBe(0);
    focusBegin(1000);
    focusMove("home", { id: "a", label: "A" }, "D", { id: "b", label: "B" }, 1500);
    focusMove("home", { id: "b", label: "B" }, "D", null, 2000);       // sin destino
    focusSection("home", "energy", 3000);
    focusTap("energy", { id: "c", label: "Manual" }, 4000);
    expect(pending()).toBe(4);
  });

  it("al cerrar manda UNA sesión con tiempos relativos y vacía el buffer", async () => {
    focusBegin(1000);
    focusMove("home", { id: "a", label: "A" }, "R", null, 1500);
    await focusFlush();
    expect(send).toHaveBeenCalledTimes(1);
    const ses = send.mock.calls[0][0] as { t0: number; ev: Array<Record<string, unknown>> };
    expect(ses.t0).toBe(1);
    expect(ses.ev).toEqual([{ k: "m", t: 0.5, s: "home", f: "a", fl: "A", d: "R", to: "", tl: "" }]);
    expect(pending()).toBe(0);
    await focusFlush();                                                 // vacío: no manda nada
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("tiene tope de eventos y no revienta si el backend falla", async () => {
    focusBegin(0);
    for (let i = 0; i < 2000; i++) focusSection("a", "b", i);
    expect(pending()).toBeLessThanOrEqual(600);
    send.mockRejectedValueOnce(new Error("sin backend"));
    await expect(focusFlush()).resolves.toBeUndefined();
  });
});
