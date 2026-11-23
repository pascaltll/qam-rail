import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "py_modules"))
from qam_audio import parse_status, choices, inspect_id, sink_names, eq_target

# Como en el ROG Ally con Bazzite: la tarjeta en crudo + filtro de altavoces + un loopback de rol que no se ofrece.
ALLY = """Audio
 ├─ Devices:
 │      45. Ryzen HD Audio Controller           [alsa]
 │
 ├─ Sinks:
 │      96. Ryzen HD Audio Controller Analog Stereo [vol: 1.00]
 │      63. Rembrandt Radeon HDMI / DisplayPort 1 Output [vol: 1.00]
 │
 ├─ Sources:
 │  *   97. Ryzen HD Audio Controller Analog Stereo [vol: 0.19]
 │
 ├─ Filters:
 │    - loopback-2511-19
 │  *   58. Speakers                                                    [Audio/Sink]
 │      59. output.virtual-sink                                         [Stream/Output/Audio]
 │      70. input.loopback.sink.role.multimedia                         [Audio/Sink]
 │
 └─ Streams:
"""

def test_ally_filter_replaces_raw():
    st = parse_status(ALLY)
    assert [x["id"] for x in st["salidas"]] == [96, 63]
    assert [x["id"] for x in st["filtros_salida"]] == [58]  # sin el loopback de rol
    c = choices(st, default_sink=58, default_source=97)
    assert [(x["id"], x["tipo"], x["activa"]) for x in c["salidas"]] == [(58, "altavoz", True), (63, "hdmi", False)]
    assert c["entradas"][0]["tipo"] == "micro" and c["entradas"][0]["activa"]
    assert not c["crudo_activo"]
    # Si la tarjeta en crudo quedó por defecto (lo que hizo 0.34), se avisa para restaurar.
    assert choices(st, default_sink=96, default_source=97)["crudo_activo"]

def test_plain():
    s = parse_status("Audio\n ├─ Sinks:\n │  *   50. Speaker [vol: 0.60]\n │      61. WH-1000XM4 [vol: 0.50 MUTED]\n")
    c = choices(s, None, None)
    assert [(x["id"], x["tipo"], x["activa"]) for x in c["salidas"]] == [(50, "altavoz", True), (61, "auriculares", False)]
    assert s["salidas"][1]["silenciado"]

def test_inspect():
    assert inspect_id("id 58, type PipeWire:Interface:Node\n    node.name = speakers") == 58
    assert inspect_id("") is None

def test_empty():
    assert parse_status("")["salidas"] == []

def test_collapse_duplicates():
    # El gestor de Panel puede dejar varios filtros del mismo altavoz: se ofrece uno solo, el que está en uso.
    txt = ALLY.replace(" │      70. input.loopback.sink.role.multimedia                         [Audio/Sink]",
                       " │      71. Speakers Voice                                             [Audio/Sink]\n │      72. Speakers Game                                              [Audio/Sink]")
    st = parse_status(txt)
    c = choices(st, default_sink=72, default_source=97)
    assert [(o["id"], o["tipo"]) for o in c["salidas"]] == [(72, "altavoz"), (63, "hdmi")]
    assert c["ocultos"] == 2



# Ally con el ecualizador de Panel (zip 14-11) y unos auriculares Bluetooth de marca desconocida.
PANEL = """Audio
 ├─ Sinks:
 │      96. Ryzen HD Audio Controller Analog Stereo [vol: 1.00]
 │     201. Soundcore Q30 [vol: 0.60]
 │
 ├─ Sources:
 │  *   97. Ryzen HD Audio Controller Analog Stereo [vol: 0.19 MUTED]
 │
 ├─ Filters:
 │      44. ROG Ally                                                     [Audio/Sink]
 │      51. game_output                                                  [Audio/Sink]
 │  *  151. ROG Ally EQ                                                  [Audio/Sink]
 │     170. effect_output.pdc_eq                                         [Stream/Output/Audio]
 │
 └─ Streams:
"""
PACTL = "96\talsa_output.pci-0000_c4_00.6.analog-stereo\tPipeWire\ts32le 2ch 48000Hz\tSUSPENDED\n201\tbluez_output.AC_12_2F_00_11_22.1\tPipeWire\ts16le 2ch 48000Hz\tRUNNING\n151\tpdc_eq\tPipeWire\tfloat32le 2ch 48000Hz\tRUNNING\n"
LINKS = """alsa_output.pci-0000_c4_00.6.analog-stereo:monitor_FL
effect_output.pdc_eq:output_FL
  |-> bluez_output.AC_12_2F_00_11_22.1:playback_FL
effect_output.pdc_eq:output_FR
  |-> bluez_output.AC_12_2F_00_11_22.1:playback_FR
"""

def test_panel_eq_no_es_una_salida():
    st = parse_status(PANEL)
    names = sink_names(PACTL)
    assert names[201].startswith("bluez_output")
    assert eq_target(LINKS, names) == 201
    c = choices(st, default_sink=151, default_source=97, names=names, eq_dest=201)
    # Se ofrecen los dispositivos reales; ni el EQ ni los canales virtuales de Bazzite.
    assert [(x["id"], x["tipo"], x["activa"]) for x in c["salidas"]] == [(96, "altavoz", False), (201, "auriculares", True)]
    assert c["eq"]["por_defecto"] and c["eq"]["destino"] == 201
    # El EQ manda a los altavoces.
    c = choices(st, 151, 97, names, 96)
    assert [x["activa"] for x in c["salidas"]] == [True, False]
    # Sin poder leer el enlace: con un solo Bluetooth, se supone que suena por él.
    c = choices(st, 151, 97, names, None)
    assert [x["activa"] for x in c["salidas"]] == [False, True] and not c["eq"]["leido"]
    # Ecualizador apagado: la salida por defecto es el dispositivo real.
    c = choices(st, 96, 97, names, None)
    assert [x["activa"] for x in c["salidas"]] == [True, False] and not c["eq"]["por_defecto"]


if __name__ == "__main__":
    test_ally_filter_replaces_raw(); test_plain(); test_inspect(); test_empty(); test_collapse_duplicates(); test_panel_eq_no_es_una_salida(); print("ok")


def test_destino_eq_hdmi_con_ids_de_wpctl():
    import qam_audio
    pactl = """Sink #35806
\tState: IDLE
\tName: alsa_output.pci-0000_09_00.6.analog-stereo
\tProperties:
\t\tobject.id = "185"
Sink #67519
\tState: RUNNING
\tName: alsa_output.pci-0000_09_00.1.hdmi-stereo
\tProperties:
\t\tobject.id = "149"
"""
    names = qam_audio.sink_object_ids(pactl)
    assert names == {185: "alsa_output.pci-0000_09_00.6.analog-stereo", 149: "alsa_output.pci-0000_09_00.1.hdmi-stereo"}, names
    links = "effect_output.pdc_eq:output_FL\n  |-> alsa_output.pci-0000_09_00.1.hdmi-stereo:playback_FL\n"
    assert qam_audio.eq_target(links, names) == 149


def test_clamp_vol():
    import qam_audio as a
    assert a.clamp_vol(0.5) == 0.5
    assert a.clamp_vol(1.5) == 1.5
    assert a.clamp_vol(3) == 2.0
    assert a.clamp_vol(-1) == 0.0
    assert a.clamp_vol("x") == 1.0
    assert a.clamp_vol(float("nan")) == 1.0


_SI = """Sink Input #77
\tMute: no
\tVolume: front-left: 65536 / 100% / 0.00 dB,   front-right: 65536 / 100% / 0.00 dB
\tCorked: no
\tProperties:
\t\tmedia.name = "Video"
\t\tapplication.name = "Firefox"
\t\tapplication.process.binary = "firefox"
\t\tmedia.role = "Video"
Sink Input #78
\tMute: no
\tVolume: front-left: 65536 / 100% / 0.00 dB
\tCorked: yes
\tProperties:
\t\tapplication.name = "Steam"
\t\tmedia.role = "event"
Sink Input #79
\tMute: no
\tVolume: front-left: 52000 / 79% / -6.00 dB
\tCorked: no
\tProperties:
\t\tapplication.name = "MiJuego.exe"
\t\tmedia.role = "Game"
Sink Input #80
\tMute: no
\tVolume: front-left: 78643 / 120% / 4.00 dB
\tCorked: no
\tProperties:
\t\tmedia.name = "Game output"
Sink Input #81
\tMute: no
\tVolume: front-left: 65536 / 100% / 0.00 dB
\tCorked: no
\tProperties:
\t\tapplication.name = "Chromium"
\t\tapplication.process.binary = "steamwebhelper"
\t\tmedia.name = "Playback"
"""


def test_refuerzo_por_fuente():
    import qam_audio as a
    ss = a.parse_sink_inputs(_SI)
    assert [s["id"] for s in ss] == [77, 78, 79, 80, 81]
    assert ss[0]["app"] == "Firefox" and ss[0]["rol"] == "video" and ss[0]["vol"] == 100 and not ss[0]["pausado"]
    assert ss[1]["pausado"] and ss[2]["vol"] == 79
    assert [a.is_system_stream(s) for s in ss] == [False, True, False, True, True]
    assert a.is_anonymous(ss[3]) and not a.is_anonymous(ss[4])
    applied = {}
    # 150 %: suben el vídeo y el juego, no el aviso de Steam
    assert a.plan_boost(ss, 150, {}, applied) == [(77, 150), (79, 150)]
    assert a.plan_boost(ss, 150, {}, applied) == []  # ya puesto: no se pelea con la app
    # el usuario quita el juego: vuelve a 100; y marca Steam como sí
    assert sorted(a.plan_boost(ss, 150, {"MiJuego.exe": False, "Steam": True}, applied)) == [(78, 150), (79, 100)]
    # se vuelve a 100 %: solo se devuelve lo que se reforzó
    assert sorted(a.plan_boost(ss, 100, {"MiJuego.exe": False, "Steam": True}, applied)) == [(77, 100), (78, 100)]
    assert a.plan_boost(ss, 100, {}, {}) == []  # sin refuerzo y flujos nuevos: nada
    assert a.plan_boost(ss[:1], 120, {}, applied) == [(77, 120)] and 78 not in applied  # los flujos que mueren se olvidan
    assert a.clamp_pct(95) == 100 and a.clamp_pct(154) == 150 and a.clamp_pct(999) == 200 and a.clamp_pct("x") == 100


if __name__ == "__main__" and True:
    test_refuerzo_por_fuente()
    test_clamp_vol()
    test_destino_eq_hdmi_con_ids_de_wpctl()
    print("ok hdmi")
