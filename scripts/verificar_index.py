#!/usr/bin/env python3
"""Comprueba que index.html es lo que hoy produce el generador, y que va en formato compacto.

    python scripts/verificar_index.py

Regenera el tablero en memoria con el inventario del repositorio y lo compara con index.html,
ignorando solo la marca de tiempo `generated`. Falla si alguien cambió web/ o data/ y no regeneró.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import generar_tablero_recuperacion as tablero  # noqa: E402

MAX_BYTES = 10_000_000  # GitHub rechaza archivos de más de 100 MB; el tablero compacto ronda los 5 MB.
STAMP = re.compile(r'"generated":"[^"]*"')


def main():
    index = ROOT / "index.html"
    published = index.read_text(encoding="utf-8")
    size = index.stat().st_size
    data = tablero.read_embedded_data(published)
    expected = tablero.build_html(tablero.read_rows(ROOT / tablero.CURRENT))
    problems = []
    if STAMP.sub("", published) != STAMP.sub("", expected):
        problems.append("index.html no coincide con lo que genera el código actual: ejecuta python generar_tablero_recuperacion.py")
    if size > MAX_BYTES:
        problems.append(f"index.html pesa {size:,} bytes (máximo esperado {MAX_BYTES:,})")
    if "\r" in published:
        problems.append("index.html tiene finales de línea CRLF")
    if problems:
        print("\n".join(problems), file=sys.stderr)
        return 1
    print(f"index.html al día: {size:,} bytes, {len(data['rows']):,} filas, captura {data['latest']}, formato {tablero.COMPACT_FORMAT}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
