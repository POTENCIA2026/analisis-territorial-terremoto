#!/usr/bin/env python3
"""Captura las iniciativas del Tablero GTRT y las deja con el formato del apartado Proyectos.

    python scripts/capturar_proyectos_gtrt.py                 # descarga y reescribe data/proyectos_gtrt.json
    python scripts/capturar_proyectos_gtrt.py --html pagina.html   # usa una copia guardada de /iniciativas

Fuente: Mapa de oferta en Recuperación Temprana del Grupo de Trabajo de Recuperación Temprana
(secretaría técnica: PNUD), https://gtrt-dashboard.vercel.app/iniciativas. La página trae las fichas
completas incrustadas; no hay API ni descarga.

Regla de esta captura: solo se copia lo que tiene equivalente directo en la tarjeta de Proyectos.
Lo que no lo tiene queda como «Por confirmar» en lugar de inferirse:
  - Temática: siempre «Por confirmar» (mesas y subcategorías del GTRT no son las temáticas del tablero).
  - Beneficiarios: «Por confirmar» (el GTRT no los publica).
  - Valor: solo el monto de la oferta financiada. En la oferta por financiar la cifra es un costo de
    implementación, no un valor asignado: queda «Por confirmar» y el costo va en la trazabilidad.
  - Revisión: «confirmed» solo si el GTRT la marca «Validada por la organización».
No se copian las observaciones internas de la secretaría técnica. Solo biblioteca estándar.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
import unicodedata
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
URL = "https://gtrt-dashboard.vercel.app/iniciativas"
OUTPUT = ROOT / "data/proyectos_gtrt.json"
REFERENCE = ROOT / "data/linea_base_priorizacion.json"
PENDING = "Por confirmar"
FUNDED = "Oferta financiada"
NBSP = " "


def norm(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    return "".join(c for c in text if unicodedata.category(c) != "Mn").casefold().strip()


def flight_payload(html):
    """Texto que Next.js incrusta en la página (se lee como datos; no se ejecuta)."""
    chunks = re.findall(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', html)
    if not chunks:
        raise ValueError("La página no trae el bloque de datos esperado (self.__next_f.push)")
    return "".join(json.loads(chunk) for chunk in chunks)


def page_data(html):
    flight = flight_payload(html)
    start = flight.find('{"filas":[')
    if start < 0:
        raise ValueError("No se encontró la lista de iniciativas («filas») en la página")
    props, _ = json.JSONDecoder().raw_decode(flight, start)
    for key in ("filas", "fichas", "ofertaDe"):
        if not props.get(key):
            raise ValueError(f"Falta «{key}» en los datos de la página")
    ids = [row["id"] for row in props["filas"]]
    if len(set(ids)) != len(ids) or set(ids) != set(props["fichas"]) or set(ids) != set(props["ofertaDe"]):
        raise ValueError("Las listas de iniciativas, fichas y ofertas no coinciden entre sí")
    cut = re.search(r"Corte vigente: (Corte \d+), (\d{1,2} de [a-záéíóú]+ de \d{4})", html)
    if not cut:
        raise ValueError("No se encontró el corte vigente en el pie de la página")
    return props, {"label": cut.group(1), "dateText": cut.group(2)}


def reference_names():
    """Código DIVIPOLA -> (departamento, municipio) con los nombres que ya usa el tablero."""
    rows = json.loads(REFERENCE.read_text(encoding="utf-8"))["rows"]
    municipalities = {r["code"]: (r["d"], r["m"]) for r in rows}
    departments = {}
    for r in rows:
        departments.setdefault(r["code"][:2], r["d"])
    return municipalities, departments


def territories(row, ficha, municipalities, departments):
    """Cobertura declarada, sin repetir. Un departamento sin municipio queda con municipio nulo."""
    named = {}  # departamento normalizado -> nombres de municipio que publica la ficha
    for block in ficha.get("cobertura") or []:
        named[norm(block["departamento"])] = list(block.get("municipios") or [])
    result, seen = [], set()
    for item in row.get("cobertura") or []:
        department = departments.get(item["d"]) or item.get("n") or ""
        municipality = None
        if item.get("m"):
            if item["m"] in municipalities:
                department, municipality = municipalities[item["m"]]
            else:
                # Municipio que no está en la referencia DANE del tablero: se usa el nombre que publica
                # la ficha y que no corresponde a ningún otro código de esa iniciativa.
                known = {norm(municipalities[c][1]) for c in row.get("codMunicipios") or [] if c in municipalities}
                spare = [n for n in named.get(norm(item.get("n")), []) if norm(n) not in known]
                if len(spare) != 1:
                    raise ValueError(f"{row['id']}: no se pudo nombrar el municipio {item['m']}")
                municipality = spare[0]
        key = (norm(department), norm(municipality))
        if key not in seen:
            seen.add(key)
            result.append({"department": department, "municipality": municipality})
    result.sort(key=lambda t: (norm(t["department"]), t["municipality"] is None, norm(t["municipality"])))
    return result


def pesos(value):
    return "$" + NBSP + f"{int(round(value)):,}".replace(",", ".")


def dollars(value):
    return "US$" + NBSP + f"{int(round(value)):,}".replace(",", ".")


def value_text(ficha, funded):
    if not funded or ficha.get("montoConfiable") != "Sí":
        return PENDING
    if ficha.get("situacionMonto") == "reportadoCOP" and ficha.get("montoCOPReportado"):
        return pesos(ficha["montoCOPReportado"])
    if ficha.get("situacionMonto") == "conversion" and ficha.get("montoUSDReportado"):
        return dollars(ficha["montoUSDReportado"]) + " (reportado en dólares)"
    return PENDING


def reported_cost(ficha):
    if ficha.get("montoCOPReportado"):
        return pesos(ficha["montoCOPReportado"]) + " COP"
    if ficha.get("montoUSDReportado"):
        return dollars(ficha["montoUSDReportado"])
    return ""


def project(row, ficha, offer, cut, municipalities, departments):
    funded = offer == FUNDED
    places = territories(row, ficha, municipalities, departments)
    states = [s for s in ficha.get("estadosFinanciacion") or [] if s]
    header = [ficha["organizacion"], ficha.get("naturalezaOrganizacion") or row.get("tipoOrganizacion"),
              f"Tablero GTRT · {cut['label']}, {cut['dateText']}", offer + (": " + "; ".join(states) if states else "")]
    if not funded and reported_cost(ficha):
        header.append("Costo de implementación reportado: " + reported_cost(ficha))
    return {
        "id": "gtrt-" + row["id"],
        "idType": "source_record",
        "origin": "tercero",
        "title": ficha["nombre"],
        "organization": ficha["organizacion"],
        "organizationType": ficha.get("naturalezaOrganizacion") or row.get("tipoOrganizacion") or None,
        "mission": [PENDING],
        "stage": None,
        "status": ficha.get("estadoEjecucion") or None,
        "type": "Iniciativa",
        "reviewStatus": "confirmed" if ficha.get("validada") else "suggested",
        "funding": "Financiada" if funded else "Por financiar",
        "fundingStates": states,
        "territories": places,
        "territoryText": None,
        "valueText": value_text(ficha, funded),
        "beneficiaries": PENDING,
        "description": ficha.get("descripcion") or None,
        "sourceUrl": f"{URL}?ficha={row['id']}",
        "detailUrl": None,
        "updatedAt": None,
        "sourceDateText": ficha.get("corteFuente") or None,
        "sourceHeader": " · ".join(part for part in header if part),
        "sourceRecordId": row["id"],
        "territoryUnresolved": not places,
    }


def build(html, captured_at):
    props, cut = page_data(html)
    municipalities, departments = reference_names()
    projects = [project(row, props["fichas"][row["id"]], props["ofertaDe"][row["id"]], cut, municipalities, departments)
                for row in sorted(props["filas"], key=lambda r: r["id"])]
    confirmed = sum(1 for p in projects if p["reviewStatus"] == "confirmed")
    return {
        "capturedAt": captured_at,
        "source": "Tablero GTRT · Mapa de oferta en Recuperación Temprana (secretaría técnica: PNUD)",
        "sourceUrl": URL,
        "cut": cut,
        "coverage": {"complete": True, "initiatives": len(projects), "validated": confirmed,
                     "note": f"{len(projects)} iniciativas del {cut['label']}; {confirmed} validadas por su organización. "
                             "Temática, beneficiarios y el valor de la oferta por financiar quedan «Por confirmar»."},
        "projects": projects,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--html", help="Copia guardada de la página /iniciativas (no descarga).")
    ap.add_argument("--out", default=str(OUTPUT))
    args = ap.parse_args()
    if args.html:
        html = Path(args.html).read_text(encoding="utf-8")
    else:
        request = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (captura de datos públicos)"})
        with urllib.request.urlopen(request, timeout=60) as response:
            html = response.read().decode("utf-8")
    data = build(html, datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"))
    Path(args.out).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(data['projects'])} iniciativas ({data['coverage']['validated']} validadas) · {data['cut']['label']}, "
          f"{data['cut']['dateText']} -> {Path(args.out)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
