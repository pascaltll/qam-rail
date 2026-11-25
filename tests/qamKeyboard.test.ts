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

import { SYMBOL_ROWS, padAction } from "../src/keyboardLayout";
describe("teclado grande: símbolos y mando", () => {
  it("la página de símbolos tiene un solo carácter por tecla, sin repetidos y con los dígitos", () => {
    const flat = SYMBOL_ROWS.flat();
    for (const c of flat) expect([...c].length).toBe(1);
    expect(new Set(flat).size).toBe(flat.length);
    for (const d of "0123456789") expect(flat).toContain(d);
    for (const c of "@#$%&*()[]{}<>/\\!?.,:;'\"") expect(flat).toContain(c);
  });
  it("LT=Mayús, RT=símbolos, L3=Bloq, LB/RB=cursor; el resto no se toca", () => {
    expect(padAction(7)).toEqual({ kind: "shift" });
    expect(padAction(8)).toEqual({ kind: "symbols" });
    expect(padAction(15)).toEqual({ kind: "caps" });
    expect(padAction(5)).toEqual({ kind: "key", key: "Left" });
    expect(padAction(6)).toEqual({ kind: "key", key: "Right" });
    for (const b of [0, 1, 2, 3, 4, 9, 12, undefined]) expect(padAction(b)).toBeNull();
  });
});
