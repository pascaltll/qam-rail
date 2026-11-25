// Medidas reales de «Inicio» (Ally, 25-nov): el modelo de filas SÍ pasa por la barra de TDP y por Brillo/Volumen.
// Si en la Ally el foco se las salta, la causa no es listTarget sino que esos controles no eran enfocables (ver noActivate en ui.tsx).
import { describe, expect, it } from "vitest";
import { BTN, listTarget } from "../src/nav";

const R = (top: number, bottom: number, left: number, right: number) => ({ top, bottom, left, right });
const names = ["Tocar un texto", "Escritorio", "Barra TDP", "Steam 10", "Eco 7", "Equilibrado", "Máx 30", "Brillo", "Volumen", "Wi-Fi", "Bluetooth", "No molestar", "Noche", "Editar"];
const rects = [
  R(315, 364, 432, 792), R(383, 434, 420, 804), R(518, 540, 432, 792),
  R(572, 612, 432, 518), R(572, 612, 524, 609), R(572, 612, 615, 701), R(572, 612, 707, 792),
  R(654, 707, 420, 607), R(654, 707, 617, 804),
  R(717, 779, 420, 510), R(717, 779, 518, 608), R(717, 779, 616, 706), R(717, 779, 714, 804),
  R(789, 829, 510, 804),
];
const go = (from: string, dir: number) => { const t = listTarget(rects, names.indexOf(from), dir); return t < 0 ? null : names[t]; };

describe("Inicio con medidas reales: filas alrededor de las barras", () => {
  it("de arriba abajo: Escritorio → barra → perfiles → Brillo/Volumen → atajos", () => {
    expect(go("Tocar un texto", BTN.DOWN)).toBe("Escritorio");
    expect(go("Escritorio", BTN.DOWN)).toBe("Barra TDP");
    expect(go("Barra TDP", BTN.DOWN)).toBe("Eco 7");       // el perfil más cercano en horizontal al centro de la barra
    expect(go("Eco 7", BTN.DOWN)).toBe("Brillo");
    expect(go("Máx 30", BTN.DOWN)).toBe("Volumen");
    expect(go("Volumen", BTN.DOWN)).toBe("Noche");
    expect(go("Noche", BTN.DOWN)).toBe("Editar");
  });
  it("de abajo arriba pasa por las mismas filas", () => {
    expect(go("Steam 10", BTN.UP)).toBe("Barra TDP");
    expect(go("Barra TDP", BTN.UP)).toBe("Escritorio");
    expect(go("Brillo", BTN.UP)).toBe("Steam 10");
    expect(go("Wi-Fi", BTN.UP)).toBe("Brillo");
  });
  it("Brillo y Volumen son una misma fila: derecha/izquierda se mueven entre ellos", () => {
    expect(go("Brillo", BTN.RIGHT)).toBe("Volumen");
    expect(go("Volumen", BTN.LEFT)).toBe("Brillo");
  });

  it("con Brillo y Volumen apilados (una barra por fila) se llega a las dos con Arriba/Abajo", () => {
    // Izquierda/Derecha sobre una barra cambian su valor (onBodyDir no las usa para moverse), así que en la misma fila no había camino de Brillo a Volumen.
    const n = ["Perfil", "Brillo", "Volumen", "Wi-Fi"];
    const r = [R(572, 612, 420, 804), R(654, 707, 420, 804), R(717, 770, 420, 804), R(780, 842, 420, 510)];
    const to = (from: string, d: number) => { const t = listTarget(r, n.indexOf(from), d); return t < 0 ? null : n[t]; };
    expect(to("Perfil", BTN.DOWN)).toBe("Brillo");
    expect(to("Brillo", BTN.DOWN)).toBe("Volumen");
    expect(to("Volumen", BTN.UP)).toBe("Brillo");
    expect(to("Volumen", BTN.DOWN)).toBe("Wi-Fi");
  });
});
