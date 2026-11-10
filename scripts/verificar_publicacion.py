#!/usr/bin/env python3
"""Verifica la revisión y el inventario de proyectos realmente publicados."""
import json
from pathlib import Path
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import generar_tablero_recuperacion as tablero


def verify(html, status, revision, expected):
    if not status.get("ok") or status.get("revision") != revision:
        raise ValueError("Producción todavía no confirma la revisión probada")
    marker = "const PROJECTS_DATA="
    if marker not in html:
        raise ValueError("La página publicada no contiene el inventario de proyectos")
    snapshot, _ = json.JSONDecoder().raw_decode(html, html.index(marker) + len(marker))
    if snapshot != expected:
        raise ValueError("El inventario publicado difiere del inventario probado")
    visible = [p for p in snapshot["projects"] if p.get("reviewStatus") == "confirmed" and p.get("origin") != "alianza"]
    keys = [tablero.project_source_key(p, i) for i, p in enumerate(visible)]
    if len(set(keys)) != len(keys):
        raise ValueError("La página publicada todavía contiene referencias repetidas")
    return len(visible)


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Panorama-publication-check", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Uso: verificar_publicacion.py URL REVISION")
    url, revision = sys.argv[1].rstrip("/"), sys.argv[2]
    expected = tablero.projects_snapshot()
    for attempt in range(3):
        try:
            status = json.loads(fetch(url + "/status.json"))
            count = verify(fetch(url + "/"), status, revision, expected)
            print(f"Producción verificada: {revision}, {count} fichas visibles, sin referencias duplicadas.")
            return 0
        except (OSError, ValueError) as error:
            if attempt == 2:
                raise
            print(f"Esperando publicación: {error}", flush=True)
            time.sleep(10)


if __name__ == "__main__":
    sys.exit(main())
