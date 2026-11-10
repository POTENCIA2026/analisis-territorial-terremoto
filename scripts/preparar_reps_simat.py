"""Escenario sin imputación: sedes IPS REPS 2026 y sedes educativas MEN/SIMAT 2022."""
import csv
import hashlib
import io
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
URL = "https://portalsineb.mineducacion.gov.co/1782/articles-417663_recurso_1.csv"
SHA = "30f8707f0914e123b71f6ae5cea582ad56b62e855ad0f7d60013122b29cadf73"
PAGE = "https://portalsineb.mineducacion.gov.co/portal/secciones/Informacion-Estadistica/Bases-consolidadas/"
BASE_DATE = "2022-12-31"  # Fin de vigencia anual; NO fecha exacta de medición de sedes.

def education(raw):
    if hashlib.sha256(raw).hexdigest() != SHA:
        raise ValueError("La publicación MEN cambió: revisar corte/esquema antes de sustituir la base")
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    required = {"ANNO_INF","DPTO_CARGA","CODIGO_SED","DIVIPOLA_MUNICIPIO","CTE_ID_SECTOR","CTE_ID_ZONA","TOTAL_SEDES"}
    if set(reader.fieldnames or []) != required:
        raise ValueError(f"Esquema educativo distinto: {reader.fieldnames}")
    cells = {}
    duplicates = 0
    for line, r in enumerate(reader, 2):
        if r["ANNO_INF"].strip() != "2022":
            raise ValueError(f"Vigencia distinta de 2022: {r['ANNO_INF']}")
        code = r["DIVIPOLA_MUNICIPIO"].strip().zfill(5)
        if len(code) != 5 or not code.isdigit():
            raise ValueError(f"DIVIPOLA inválido en línea {line}")
        sector, zone = r["CTE_ID_SECTOR"].strip(), r["CTE_ID_ZONA"].strip()
        if sector not in {"1","2"} or zone not in {"1","2"}:
            raise ValueError(f"Categoría desconocida, no sumar posibles totales: {sector}, {zone}")
        val = float(r["TOTAL_SEDES"])
        if not val.is_integer() or val < 0:
            raise ValueError("TOTAL_SEDES no es un conteo no negativo")
        key = (code, sector, zone)
        value = (r["CODIGO_SED"],r["DPTO_CARGA"],int(val))
        if key in cells:
            if cells[key]["value"] != value:
                raise ValueError(f"Celda municipal contradictoria: {key}")
            duplicates += 1
            continue
        cells[key] = {"value":value,"line":line}
    groups = defaultdict(list)
    for (code, sector, zone), item in cells.items():
        groups[code].append({"sector":sector,"zone":zone,"count":item["value"][2],"csv_line":item["line"]})
    rows = []
    for code, items in sorted(groups.items()):
        count = sum(i["count"] for i in items)
        if count <= 0:
            continue
        rows.append(dict(code=code,year=2022,kind="sedes_educativas",value=count,unit="Sedes educativas",
          source="men_simat_sedes_2022",reference_date=BASE_DATE,area="Total",status="observed_registry_proxy",
          locator="data/simat_sedes_2022.csv · DIVIPOLA "+code+" · suma TOTAL_SEDES por sector y zona",
          breakdown=items))
    total = sum(r["value"] for r in rows)
    if len(rows) < 1000 or not 40000 <= total <= 80000:
        raise ValueError(f"Cobertura educativa inesperada: {len(rows)} municipios, {total} sedes")
    return rows,dict(csv_rows=len(cells)+duplicates,duplicate_cells_removed=duplicates,municipalities=len(rows),total_sites=total)

def build(base, raw):
    school, audit = education(raw)
    source = base["sources"]["reps"]
    if source["reference"] != "2026-03-12" or len(source["sha256"]) != 64:
        raise ValueError("Corte o procedencia REPS distintos")
    if base["audit"].get("reps_conflicting_site_ids"):
        raise ValueError("Conflictos de código de sede REPS sin resolver")
    rows, seen = [], set()
    for r in base["candidates"]:
        if r.get("kind") != "sedes_ips": continue
        if r["code"] in seen: raise ValueError("Municipio REPS duplicado")
        seen.add(r["code"])
        if not (len(r["code"]) == 5 and r["code"].isdigit() and isinstance(r["value"],int) and r["value"]>0):
            raise ValueError("Conteo REPS inválido")
        rows.append(dict(code=r["code"],year=2026,kind="sedes_ips",value=r["value"],unit="Sedes IPS",
          source="reps_sedes_2026",reference_date="2026-03-12",area="Total",status="observed_registry_proxy",
          locator="data/denominadores_sectoriales.json · candidates · DIVIPOLA "+r["code"]))
    return dict(version="reps-simat-1",enabled=True,
      notice="Salud: sedes IPS REPS, marzo de 2026. Educación: sedes MEN/SIMAT, 2022. Cocientes sobre inventarios registrados; no porcentajes de pérdida.",
      catalog={
        "sedes_ips":dict(year=2026,unit="Sedes IPS",source="reps_sedes_2026",reference_date="2026-03-12",label="Sedes IPS registradas · REPS 2026"),
        "sedes_educativas":dict(year=2022,unit="Sedes educativas",source="men_simat_sedes_2022",reference_date=BASE_DATE,label="Sedes educativas registradas · MEN/SIMAT 2022")},
      sources={
        "reps_sedes_2026":dict(source,reference_date="2026-03-12",scope="Clase IPS, municipio de la sede. Un código de sede no garantiza un edificio distinto.",
          snapshot="data/denominadores_sectoriales.json",status="observed_registry_proxy"),
        "men_simat_sedes_2022":dict(label="MEN · SINEB/SIMAT · sedes educativas 2022",url=URL,page=PAGE,
          sha256=SHA,reference_year=2022,reference_date=BASE_DATE,reference_date_meaning="Fin de vigencia anual 2022, no fecha de inspección.",
          origin="https://portalsineb.mineducacion.gov.co/portal/secciones/SINEB/",
          scope="Sedes de preescolar, básica y media derivadas del registro de matrícula; sector oficial/no oficial y zona urbana/rural.",
          method="Suma de TOTAL_SEDES de celdas municipales sector-zona sin duplicación. No conteo de filas ni matrícula.",
          snapshot="data/simat_sedes_2022.csv",publication_date_verified=False)},
      rows=rows+school,
      audit=dict(reps_municipalities=len(rows),education=audit,imputed=0,
        notes=["Los inventarios aproximan la oferta; no se acredita operación preevento ni correspondencia nominal con PNUD/3iS.",
               "El año 2022 educativo se conserva explícitamente; no es SIMAT 2025/2026.",
               "Cociente mayor que uno se conserva y marca; no se convierte en porcentaje ni se recorta.",
               "Municipios sin denominador positivo quedan sin tasa; no se rellenan con cero o ML."]))

def main():
    target = ROOT/"data/simat_sedes_2022.csv"
    if target.exists():
        raw = target.read_bytes()
    else:
        with urlopen(Request(URL,headers={"User-Agent":"Mozilla/5.0"}),timeout=60) as r:
            raw = r.read()
    base = json.loads((ROOT/"data/denominadores_sectoriales.json").read_text(encoding="utf-8"))
    result = build(base, raw)
    # Solo escribir después de validar ambas fuentes; no modificar los registros originales.
    target.write_bytes(raw)
    (ROOT/"data/denominadores_reps_simat.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(result["audit"],ensure_ascii=False))
    for code in ["27050","27660","66001","76828"]:
        print(code,[(r["kind"],r["value"],r["year"]) for r in result["rows"] if r["code"]==code])
if __name__=="__main__":main()
