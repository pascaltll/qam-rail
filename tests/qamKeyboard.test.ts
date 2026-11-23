import { describe, it, expect } from "vitest";
import { ROWS, keyChar, mirror } from "../src/keyboardLayout";

describe("teclado del panel (español)", () => {
  it("tiene las 26 letras y la ñ, y cada tecla es un solo carácter por capa", () => {
    const flat = ROWS.flat();
    for (const c of "abcdefghijklmnopqrstuvwxyzñ") expect(flat.some((k) => k[0] === c)).toBe(true);
    for (const k of flat) for (const v of k.filter((x): x is string => !!x)) expect([...v].length).toBe(1);
  });
  it("Mayús, AltGr y su orden", () => {
    const dos = ROWS[0][2];
    expect(keyChar(dos, false, false)).toBe("2");
    expect(keyChar(dos, true, false)).toBe('"');
    expect(keyChar(dos, false, true)).toBe("@");
    expect(keyChar(dos, true, true)).toBe("@");          // AltGr manda
    expect(keyChar(["q"], true, false)).toBe("Q");        // sin capa propia: mayúscula
    expect(keyChar(["7", "/"], false, true)).toBe("7");   // sin AltGr: queda la base
    expect(keyChar(["ñ"], true, false)).toBe("Ñ");
  });
  it("la vista previa sigue lo escrito", () => {
    let b = "";
    b = mirror(b, { text: "h" }); b = mirror(b, { text: "o" }); b = mirror(b, { text: "x" });
    expect(b).toBe("hox");
    expect(mirror(b, { key: "BackSpace" })).toBe("ho");
    expect(mirror(b, { key: "Return" })).toBe("");
    expect(mirror("", { key: "BackSpace" })).toBe("");
    expect(mirror("a".repeat(100), { text: "b" })).toHaveLength(80);
  });
});
