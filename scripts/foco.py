#!/usr/bin/env python3
"""Resumen del registro de foco con el mando (foco.jsonl): qué hizo la cruceta en el panel y a qué controles solo se llegó con el dedo.
Uso:  python3 ~/homebrew/plugins/qam-rail-dev/foco.py [ruta-de-foco.jsonl]
Por defecto lee ~/homebrew/settings/qam-rail-dev/foco.jsonl. Solo lectura. El plugin lo escribe solo cada vez que usas el panel (se apaga creando
el archivo `foco-off` en esa carpeta). Contiene etiquetas de controles y posiciones, nunca lo que escribes ni nombres de amigos o apps."""
import importlib.util, sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent


def _modulo():
    for cand in (AQUI / "py_modules" / "qam_focus.py", AQUI.parent / "py_modules" / "qam_focus.py"):
        if cand.exists():
            spec = importlib.util.spec_from_file_location("qam_focus", cand)
            m = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(m)
            return m
    sys.exit("No encuentro py_modules/qam_focus.py")


def main() -> None:
    m = _modulo()
    ruta = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "homebrew" / "settings" / "qam-rail-dev" / "foco.jsonl"
    if not ruta.exists():
        sys.exit(f"Aún no hay registro ({ruta}). Usa el panel con el mando y vuelve a ejecutarlo.")
    print("\n".join(m.formatear(m.resumen(m.leer(str(ruta))))))


if __name__ == "__main__":
    main()
