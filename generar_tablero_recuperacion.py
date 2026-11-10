#!/usr/bin/env python3
"""Tablero unificado. Comparaciones por fuente, indicador, unidad y captura.

Prepara observaciones y línea base para un compuesto con límites por faltantes.
La fecha del inventario nunca se presenta como fecha de observación del sismo.
"""
import argparse
import base64
from collections import Counter, defaultdict
import csv
from datetime import date, datetime, timezone
import html
import json
import math
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parent
CURRENT = "indicadores_largo_no_calculo.csv"
HISTORY = "historial_indicadores_no_calculo.csv"
RECOVERY = "undp_rapida_recovery_needs"
IPM = "undp_rapida_mpi"
RAPIDA = "UNDP-RAPIDA"
BASELINE = ROOT / 'data/linea_base_priorizacion.json'
# Equivalencias explícitas por departamento. El código debe existir en DANE.
GEO_ALIASES = {
    ('valle del cauca', 'santiago de cali'): '76001',
    ('valle del cauca', 'cali'): '76001',
    ('valle del cauca', 'anserma nuevo'): '76041',
    ('valle del cauca', 'calima (darien)'): '76126',
    ('choco', 'canton de san pablo'): '27135',
    ('choco', 'carmen de atrato'): '27245',
    ('choco', 'litoral de san juan'): '27250',
}
SOURCES = {
    RAPIDA: {"label": "UNDP · RAPIDA", "kind": "Evaluación y modelación", "url": "https://geosmart.undp.org/arcgis/apps/storymaps/stories/9d0ef01099a64edda2caecbd34135d7e", "note": "Se conservan los valores publicados por PNUD/UNGRD; la cobertura depende del indicador y del ámbito seleccionado. El StoryMap documenta la estructura de pesos de la necesidad de recuperación temprana (50% impactos, 30% vulnerabilidad socioeconómica, 20% vulnerabilidad física) pero no su normalización interna, tratamiento de faltantes ni la combinación exacta de subindicadores -- no alcanza para reproducir el puntaje publicado. Su campo de IPM se describe como proyección de PNUD a 2025 sobre datos DANE, sin metodología de proyección publicada ni confirmación de que corresponda al campo descargado -- no sustituye la línea base DANE censal 2018 de contexto sin antes validar ambas cosas. Afectación no utiliza el IPM; su incorporación a un futuro índice general queda pendiente. Detalle: docs/investigacion_undp_geosmart.md. El puntaje original se consulta sin añadirle IPM."},
    "PNUD": {"label": "PNUD · estimación de daños", "kind": "Estimación", "url": "https://pnudco.github.io/Respuesta-a-crisis-y-recuperaci-n-temprana/", "note": "Vivienda y daño económico coinciden con RAPIDA en la cobertura común auditada. No constituyen corroboración independiente ni se suman entre fuentes."},
    "3iS-Sheets": {"label": "3iS · reportes territoriales", "kind": "Reportes consolidados", "url": "https://docs.google.com/spreadsheets/d/1fQ-LTlIEljzOKvW23epwevJeWLWORi88xL7XxkpTMzY", "note": "Cobertura de reportes por territorio. Su corte operativo no está conservado fila por fila en este inventario."},
    "FundacionExe": {"label": "Fundación ExE · sedes educativas", "kind": "Inventario de sedes", "url": "data/sedes_educativas_afectadas_ago2026.csv", "note": "Necesidades educativas de alcance amplio. Estar dentro de un departamento del decreto no prueba que el daño de cada sede sea causado por el sismo. Fuera de ese ámbito: no atribuida al sismo."},
    "Naboo": {"label": "Naboo · puntos reportados", "kind": "Registro de puntos", "url": "https://www.mapadelterremoto.com/datos/registro.json", "note": "Mide puntos registrados; intensidad de reporte y daño pueden confundirse. Un cero no acredita ausencia de afectación."},
    "Naboo/UNGRD": {"label": "Listado municipal · gravedad", "kind": "Clasificación del listado", "url": "data/municipios_afectados_terremoto_colombia_ago2026.csv", "note": "El valor 0 significa sin clasificación oficial en el listado, no sin daño. Las categorías no son cantidades sumables."},
    "Camaras": {"label": "Cámaras · empresarios", "kind": "Reporte empresarial", "url": "data/camaras_comercio_empresarios_afectados_ago2026.csv", "note": "Cobertura departamental parcial. Empresarios reportados no equivalen a pérdida de producción ni a empleo perdido."},
    "Decreto1171": {"label": "Ámbito del Decreto 1171", "kind": "Marco territorial", "url": "data/decreto_1171_11ago2026.pdf", "note": "Filtro por departamentos nombrados en el inventario. No es una delimitación municipal del daño ni una prueba de atribución causal."},
}


def read_rows(path):
    if not path or not Path(path).exists():
        return []
    with open(path, encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def normalized(value):
    return " ".join("".join(c for c in unicodedata.normalize("NFD", value.strip().casefold())
                             if unicodedata.category(c) != "Mn").split())


def prepare_payload(current, history=()):
    from migrar_clasificacion_3is import normalize
    current = [normalize(r) for r in current]
    history = [normalize(r) for r in history]
    baseline = json.loads(BASELINE.read_text(encoding='utf-8')) if BASELINE.exists() else {'rows': []}
    population_path = ROOT / 'data/poblacion_relativa.json'
    population = json.loads(population_path.read_text(encoding='utf-8')) if population_path.exists() else {'rows': []}
    denominator_path = ROOT / 'data/denominadores_sectoriales.json'
    denominators = json.loads(denominator_path.read_text(encoding='utf-8')) if denominator_path.exists() else {'rows': []}
    proxy_path = ROOT / 'data/denominadores_reps_simat.json'
    if proxy_path.exists():
        denominators['registry_proxies'] = json.loads(proxy_path.read_text(encoding='utf-8'))
    pressure_path = ROOT / 'data/presion_salud.json'
    pressure = json.loads(pressure_path.read_text(encoding='utf-8')) if pressure_path.exists() else None
    education_path = ROOT / 'data/matricula_critica.json'
    education = json.loads(education_path.read_text(encoding='utf-8')) if education_path.exists() else None
    investment_path = ROOT / 'data/inversion_educativa.json'
    investment = json.loads(investment_path.read_text(encoding='utf-8')) if investment_path.exists() else None
    universe_path = ROOT / 'data/men_universo.json'
    universe = json.loads(universe_path.read_text(encoding='utf-8')) if universe_path.exists() else None
    reference_names = defaultdict(set)
    reference_codes = {r['code']: r for r in baseline['rows']}
    for r in baseline['rows']:
        reference_names[(normalized(r['d']), normalized(r['m']))].add(r['code'])
    # A current capture replaces the WHOLE capture of that date, including
    # missing sources. Old values must not resurrect a failed download.
    current_dates = {r.get("fecha_corte", "") for r in current}
    raw = [r for r in history if r.get("fecha_corte", "") not in current_dates] + list(current)
    capture_dates = set()
    for r in raw:
        try:
            capture_dates.add(date.fromisoformat(r.get("fecha_corte", "")).isoformat())
        except (TypeError, ValueError):
            pass
    issues = Counter()
    clean = []
    invalid_names = set()
    for r in raw:
        if r.get("fuente") == "Calculo":
            continue
        required = ("nivel", "departamento", "dimension", "indicador_id", "indicador", "unidad", "fuente")
        if any(not r.get(k, "").strip() for k in required) or r.get("nivel") not in {"municipal", "departamental"}:
            issues["Filas sin metadatos obligatorios"] += 1
            continue
        if r["nivel"] == "municipal" and not r.get("municipio", "").strip():
            issues["Municipios sin nombre"] += 1
            continue
        try:
            value = float(r["valor"])
            if not math.isfinite(value) or value < 0:
                raise ValueError()
            date.fromisoformat(r.get("fecha_corte", ""))
        except (KeyError, TypeError, ValueError):
            issues["Valor o fecha de captura inválidos"] += 1
            continue
        if r["indicador_id"] == IPM and value > 100:
            issues["IPM fuera de 0–100"] += 1
            continue
        code = r.get("divipola", "").strip()
        expected = 5 if r["nivel"] == "municipal" else 2
        code = code if code.isdigit() and len(code) == expected else ""
        original_code = code
        if r['nivel'] == 'municipal':
            name_key = (normalized(r['departamento']), normalized(r['municipio']))
            known = reference_names.get(name_key, set())
            alias = GEO_ALIASES.get(name_key)
            resolved = alias if alias in reference_codes else next(iter(known), '') if len(known) == 1 else ''
            if code and resolved and code != resolved:
                issues['Código incompatible con la referencia DANE'] += 1
                invalid_names.add(name_key)
                continue
            code = code or resolved
        clean.append({"lv": r["nivel"], "d": r["departamento"].strip(), "m": r.get("municipio", "").strip(),
                      "dim": r["dimension"], "id": r["indicador_id"], "i": r["indicador"],
                      "u": r["unidad"], "f": r["fuente"], "v": value,
                      "date": r["fecha_corte"], "code": code,
                      "identity_note": 'Equivalencia municipal explícita' if r['nivel']=='municipal' and name_key in GEO_ALIASES else 'Referencia DANE' if code and not original_code else ''})
    # Only unambiguous codes are shared between spelling-normalized names.
    codes = defaultdict(set)
    for r in clean:
        if r["code"]:
            codes[(r["lv"], normalized(r["d"]), normalized(r["m"]))].add(r["code"])
    grouped = defaultdict(list)
    for r in clean:
        key = (r["lv"], normalized(r["d"]), normalized(r["m"]))
        if r['lv']=='municipal' and key[1:] in invalid_names:
            issues['Filas con identidad geográfica ambigua'] += 1
            continue
        known = codes[key]
        if len(known) > 1:
            issues["Filas con identidad geográfica ambigua"] += 1
            continue
        code = next(iter(known), "")
        r["geo"] = r["lv"] + ":" + (code or "|".join(key[1:]))
        r["join"] = "DIVIPOLA" if code else "Departamento + municipio normalizados"
        r["code"] = code
        # Same entity/indicator/source/date may not silently select a unit.
        grouped[(r["geo"], r["f"], r["id"], r["date"])].append(r)
    rows = []
    for group in grouped.values():
        variants = {(r["v"], r["u"], r["dim"], r["i"]) for r in group}
        if len(variants) > 1:
            issues["Observaciones conflictivas excluidas"] += len(group)
            continue
        issues["Copias idénticas deduplicadas"] += len(group) - 1
        rows.append(group[0])
    rows.sort(key=lambda r: (r["date"], r["f"], r["id"], r["geo"]))
    dates = sorted(capture_dates)
    latest = max((d for d in current_dates if d in dates), default=dates[-1] if dates else "")
    return {"rows": rows, "dates": dates, "latest": latest, "sources": SOURCES, "baseline": baseline, "population": population, "denominators": denominators, "healthPressure": pressure, "educationCritical": education,
            "educationInvestment": investment,
            "educationUniverse": universe,
            "issues": [{"label": k, "n": v} for k, v in sorted(issues.items()) if v],
            "generated": datetime.now(timezone.utc).isoformat(timespec="seconds")}


# Identidad de Torre de Control (EFUSCOL): fuente, logo e ícono viajan dentro del HTML
# para que el tablero siga siendo un solo archivo que funciona sin conexión.
BRAND_ASSETS = (
    ("__FONT_REGULAR__", "NationalPark-Regular.ttf", "font/ttf"),
    ("__FONT_MEDIUM__", "NationalPark-Medium.ttf", "font/ttf"),
    ("__FONT_BOLD__", "NationalPark-Bold.ttf", "font/ttf"),
    ("__LOGO__", "logo-linea-oscuro.webp", "image/webp"),
    ("__ICONO__", "icono.webp", "image/webp"),
)


def data_uri(path, mime):
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


# El historial completo se conserva en disco, pero el HTML no puede crecer sin límite (cada captura
# suma ~4-5 MB): se incrustan las últimas capturas y, de las anteriores, la última de cada semana.
HISTORY_RECENT_CAPTURES = 30


def thin_history(history, current=(), recent=HISTORY_RECENT_CAPTURES):
    """Reduce el historial que se incrusta: `recent` capturas más recientes (contando la actual) y
    la última captura de cada semana ISO anterior. Filas con fecha inválida se conservan para que
    el control de integridad las siga reportando."""
    def parsed(row):
        try:
            return date.fromisoformat(row.get("fecha_corte", ""))
        except (TypeError, ValueError):
            return None
    days = {parsed(r) for r in history} | {parsed(r) for r in current}
    days.discard(None)
    newest_first = sorted(days, reverse=True)
    keep = set(newest_first[:recent])
    weeks = {}
    for day in newest_first[recent:]:
        weeks.setdefault(day.isocalendar()[:2], day)  # el primero visto es el más reciente de su semana
    keep |= set(weeks.values())
    return [r for r in history if parsed(r) is None or parsed(r) in keep]


# Formato compacto de las observaciones incrustadas. Cada fila repite los mismos textos (territorio,
# indicador, fuente, fecha): se guarda cada texto una vez y la fila solo lleva su posición en esas
# listas más el valor. web/datos.js reconstruye en el navegador las filas completas, idénticas a las
# que produce prepare_payload. Las listas se rehacen en cada generación; nadie las mantiene a mano.
COMPACT_FORMAT = "filas-compactas/v1"
GEO_FIELDS = ("lv", "d", "m", "code", "identity_note", "geo", "join")
INDICATOR_FIELDS = ("dim", "id", "i", "u")
ROW_FIELDS = ("lv", "d", "m", "dim", "id", "i", "u", "f", "v", "date", "code", "identity_note", "geo", "join")
DATA_START, DATA_END = "const DATA=Datos.expandir(", ");</script>"


def compact_rows(rows):
    """Filas completas -> listas únicas + columnas de posiciones. Sin pérdida: ver expand_rows."""
    tables = {name: ([], {}) for name in ("territorios", "indicadores", "fuentes", "fechas")}

    def position(name, key, value):
        values, index = tables[name]
        if key not in index:
            index[key] = len(values)
            values.append(value)
        return index[key]

    columns = {"t": [], "i": [], "f": [], "d": [], "v": []}
    for r in rows:
        if tuple(r) != ROW_FIELDS:
            raise ValueError(f"Fila con columnas inesperadas; el formato compacto no la puede representar: {list(r)}")
        geo = tuple(r[k] for k in GEO_FIELDS)
        indicator = tuple(r[k] for k in INDICATOR_FIELDS)
        columns["t"].append(position("territorios", geo, list(geo)))
        columns["i"].append(position("indicadores", indicator, list(indicator)))
        columns["f"].append(position("fuentes", r["f"], r["f"]))
        columns["d"].append(position("fechas", r["date"], r["date"]))
        columns["v"].append(r["v"])
    return {"formato": COMPACT_FORMAT, **{name: values for name, (values, _) in tables.items()}, **columns}


def expand_rows(compact):
    """Inversa exacta de compact_rows (la misma lógica que web/datos.js)."""
    if isinstance(compact, list):
        return compact
    if not isinstance(compact, dict) or compact.get("formato") != COMPACT_FORMAT:
        raise ValueError("Formato de filas no reconocido")
    rows = []
    for t, i, f, d, v in zip(compact["t"], compact["i"], compact["f"], compact["d"], compact["v"], strict=True):
        geo = dict(zip(GEO_FIELDS, compact["territorios"][t]))
        indicator = dict(zip(INDICATOR_FIELDS, compact["indicadores"][i]))
        merged = {**geo, **indicator, "f": compact["fuentes"][f], "v": v, "date": compact["fechas"][d]}
        rows.append({k: merged[k] for k in ROW_FIELDS})
    return rows


def read_embedded_data(source):
    """DATA tal como lo ve el tablero: lee el HTML generado y reconstruye las filas completas."""
    start = source.find(DATA_START)
    if start < 0:
        raise ValueError("El HTML no contiene DATA en formato compacto")
    start += len(DATA_START)
    data = json.loads(source[start:source.index(DATA_END, start)])
    data["rows"] = expand_rows(data["rows"])
    return data


# Marcador de la plantilla -> archivo de web/. Cada módulo se inserta tal cual, una sola vez.
WEB_MODULES = (
    ("__STYLE__", "tablero.css"), ("__PROJECTS_STYLE__", "proyectos.css"),
    ("__INVESTMENT_RANK_STYLE__", "inversion_ranking.css"), ("__INVESTMENT_CARDS_STYLE__", "inversion_tarjetas.css"),
    ("__VULNERABILITY_STYLE__", "vulnerabilidad.css"), ("__PARTIAL_PRIORITY_STYLE__", "prioridad_parcial.css"),
    ("__PRIORITY_EXPLAINER_STYLE__", "prioridad_explicacion.css"),
    ("__PRESENTATION__", "presentacion.js"), ("__MODEL__", "modelo.js"), ("__CRITICAL_ENROLLMENT__", "matricula_critica.js"),
    ("__HEALTH_PRESSURE__", "presion_salud.js"), ("__DENOMINATORS__", "denominadores.js"),
    ("__PRIORITY_MODEL__", "priorizacion.js"), ("__DATA_CODEC__", "datos.js"), ("__RADAR__", "radar.js"),
    ("__RELATIVE__", "relativo.js"), ("__COMPARISON__", "comparacion.js"), ("__INVESTMENT__", "inversion_educativa.js"),
    ("__PARTIAL_PRIORITY__", "prioridad_parcial.js"), ("__PROJECTS__", "proyectos.js"), ("__APP__", "tablero.js"),
    ("__VULNERABILITY__", "vulnerabilidad.js"),
)
# Conjuntos de datos que no dependen de la captura: se incrustan tal como están en data/.
PROJECTS = ROOT / "data/proyectos_torre_control.json"
VULNERABILITY = ROOT / "data/vulnerabilidad_municipal_2018.json"


def embedded_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def build_html(current, history=(), embed_history=False):
    # Por defecto el tablero solo lleva la captura vigente (ninguna pestaña visible consulta fechas
    # anteriores). El historial completo sigue en el CSV; --embed-history lo incrusta adelgazado.
    history = thin_history(history, current) if embed_history else ()
    payload = prepare_payload(current, history)
    payload["rows"] = compact_rows(payload["rows"])
    brand_source = brand = (ROOT / "web" / "marca.css").read_text(encoding="utf-8")
    parts = {marker: (ROOT / "web" / filename).read_text(encoding="utf-8") for marker, filename in WEB_MODULES}
    for marker, filename, mime in BRAND_ASSETS:
        uri = data_uri(ROOT / "web" / "brand" / filename, mime)
        brand = brand.replace(marker, uri)
        parts[marker] = uri
    parts["__BRAND__"] = brand
    parts["__DATA__"] = embedded_json(payload).replace("<", "\\u003c")
    parts["__PROJECTS_DATA__"] = embedded_json(json.loads(PROJECTS.read_text(encoding="utf-8"))).replace("</", "<\\/")
    parts["__VULNERABILITY_DATA__"] = embedded_json(json.loads(VULNERABILITY.read_text(encoding="utf-8"))).replace("</", "<\\/")
    template = (ROOT / "web" / "tablero.html").read_text(encoding="utf-8")
    missing = [marker for marker in parts if marker not in template and marker not in brand_source]
    if missing:
        raise ValueError(f"La plantilla no tiene estos marcadores: {missing}")
    # Una sola pasada: el contenido insertado nunca se vuelve a examinar en busca de marcadores.
    pattern = re.compile("|".join(re.escape(marker) for marker in sorted(parts, key=len, reverse=True)))
    return pattern.sub(lambda match: parts[match.group(0)], template)


def generate(input_path=CURRENT, history_path=HISTORY, out="index.html", eda_redirect="eda_indicadores.html", update_history=False, embed_history=False):
    current, history = read_rows(input_path), read_rows(history_path)
    if not current:
        raise ValueError(f"No hay inventario para generar el tablero: {input_path}")
    if update_history:
        # Retain the raw schema, and replace complete capture dates atomically.
        dates = {r.get("fecha_corte", "") for r in current}
        history = [r for r in history if r.get("fecha_corte", "") not in dates] + current
        target = Path(history_path)
        temporary = target.with_suffix(target.suffix + ".tmp")
        with temporary.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(current[0]), lineterminator="\n")
            writer.writeheader()
            writer.writerows(history)
        temporary.replace(target)
    output = Path(out)
    # newline="\n": el mismo archivo, byte a byte, en Windows y en Linux.
    output.write_text(build_html(current, history, embed_history), encoding="utf-8", newline="\n")
    if eda_redirect and Path(eda_redirect).resolve() != output.resolve():
        import os
        url = Path(os.path.relpath(output, Path(eda_redirect).parent)).as_posix()
        safe = html.escape(url, quote=True)
        Path(eda_redirect).write_text(f'<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url={safe}"><title>Tablero territorial</title><p>El EDA y el índice se integraron en el <a href="{safe}">tablero territorial</a>.</p></html>', encoding="utf-8")
    return output


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", default=CURRENT)
    ap.add_argument("--history", default=HISTORY)
    ap.add_argument("--out", default="index.html")
    ap.add_argument("--eda-redirect", default="eda_indicadores.html")
    ap.add_argument("--update-history", action="store_true")
    ap.add_argument("--embed-history", action="store_true",
                    help="Incrusta también las capturas anteriores (adelgazadas). Por defecto solo va la captura vigente.")
    args = ap.parse_args()
    output = generate(args.input, args.history, args.out, args.eda_redirect, args.update_history, args.embed_history)
    print(f"Tablero unificado generado: {output}")


if __name__ == "__main__":
    main()

