#!/usr/bin/env python3
"""Inventario verificable de data/: qué es cada archivo, cuánto pesa, su huella y quién lo usa.

    python scripts/generar_manifiesto_datos.py            # reescribe data/MANIFIESTO.json
    python scripts/generar_manifiesto_datos.py --check    # falla si el manifiesto no coincide con data/

No clasifica a ojo: la clase sale del tipo de archivo y de qué scripts del repositorio lo nombran.
  - "fuente original": archivo tal como llegó de la entidad o aliado (Excel, PDF).
  - "derivado":        lo escribe o lo lee algún script del repositorio a partir de otras fuentes.
  - "captura":         conjunto fijo que solo se incrusta en el tablero (no hay script que lo regenere).
Solo biblioteca estándar.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MANIFEST = DATA / "MANIFIESTO.json"
ORIGINAL_SUFFIXES = {".xlsx", ".xls", ".pdf", ".docx"}
# Archivos que no deben publicarse fuera de la organización: se marcan para revisarlos antes de abrir el repo.
RESTRICTED = {
    "proyectos_torre_control.json": "Captura de la interfaz autenticada de Torre de Control.",
}


def code_files():
    for pattern in ("*.py", "scripts/*.py", "scripts/*.cjs", "deploy/*.py"):
        for path in sorted(ROOT.glob(pattern)):
            if path.resolve() != Path(__file__).resolve():
                yield path


def build():
    sources = {path.relative_to(ROOT).as_posix(): path.read_text(encoding="utf-8", errors="replace") for path in code_files()}
    generator = sources.get("generar_tablero_recuperacion.py", "")
    entries = []
    for path in sorted(p for p in DATA.rglob("*") if p.is_file()):
        relative = path.relative_to(DATA).as_posix()
        if relative in ("MANIFIESTO.json", "README.md"):
            continue
        users = [name for name, text in sources.items() if path.name in text]
        if path.suffix.lower() in ORIGINAL_SUFFIXES:
            kind = "fuente original"
        elif [u for u in users if u != "generar_tablero_recuperacion.py"]:
            kind = "derivado"
        else:
            kind = "captura"
        entry = {"archivo": "data/" + relative, "clase": kind, "bytes": path.stat().st_size,
                 "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                 "nombrado_en_generador": path.name in generator, "usado_por": users}
        if path.name in RESTRICTED:
            entry["restringido"] = RESTRICTED[path.name]
        entries.append(entry)
    totals = {}
    for entry in entries:
        group = totals.setdefault(entry["clase"], {"archivos": 0, "bytes": 0})
        group["archivos"] += 1
        group["bytes"] += entry["bytes"]
    return {"esquema": "manifiesto-datos/v1",
            "nota": "Generado por scripts/generar_manifiesto_datos.py. No editar a mano.",
            "resumen": totals, "archivos": entries}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="No escribe; falla si data/ cambió sin actualizar el manifiesto.")
    args = ap.parse_args()
    text = json.dumps(build(), ensure_ascii=False, indent=1) + "\n"
    if args.check:
        current = MANIFEST.read_text(encoding="utf-8") if MANIFEST.exists() else ""
        if current != text:
            print("data/MANIFIESTO.json no coincide con data/. Ejecuta: python scripts/generar_manifiesto_datos.py", file=sys.stderr)
            return 1
        print("Manifiesto de datos al día.")
        return 0
    MANIFEST.write_text(text, encoding="utf-8", newline="\n")
    print(f"Manifiesto escrito: {MANIFEST.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
