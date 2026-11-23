const data: Record<string, unknown> = {
  audio_state: { ok: true, salidas: [
    { id: 1, nombre: "Altavoces", activa: true, volumen: 0.6, silenciado: false, tipo: "altavoz" },
    { id: 2, nombre: "Auriculares BT", activa: false, volumen: 0.5, silenciado: false, tipo: "auriculares" }],
    entradas: [{ id: 9, nombre: "Micrófono interno", activa: true, volumen: 0.8, silenciado: false, tipo: "micro" }] },
};
export const callable = (name: string) => async () => data[name] ?? {};
export const definePlugin = (f: unknown) => f; export const openFilePicker = async () => ({});
