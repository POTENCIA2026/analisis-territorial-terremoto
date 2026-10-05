#!/usr/bin/env python3
"""Extrae agregados municipales MEN y el ámbito SIMAT. Nunca modifica los Excel."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
DEPARTMENTS = {'17': 'Caldas', '27': 'Chocó', '63': 'Quindío',
               '66': 'Risaralda', '76': 'Valle del Cauca'}
CRITICAL = {'colapso total', 'colapso parcial', 'riesgo inminente de colapso'}
KNOWN_DAMAGE = CRITICAL | {'afectacion menor', 'afectacion parcial', 'sin afectacion'}
ALIASES = {('choco', 'bajo baudo(pizarro)'): '27077',
           ('choco', 'bojaya(bellavista)'): '27099',
           ('choco', 'litoral de san juan'): '27250',
           ('choco', 'itsmina'): '27361',
           ('choco', 'bahia solano(mutis)'): '27075',
           ('choco', 'canton del san pablo'): '27135',
           ('valle del cauca', 'cali'): '76001',
           ('valle del cauca', 'buga'): '76111',
           ('valle del cauca', 'el darien calima'): '76126'}


def norm(value):
    return ' '.join(''.join(c for c in unicodedata.normalize('NFD', str(value or '').casefold())
                            if not unicodedata.combining(c)).split())


def code(value, width):
    s = str(int(value)) if isinstance(value, (int, float)) else str(value or '').strip()
    if not s.isdigit() or len(s) > width:
        raise ValueError(f'Código inválido: {value!r}')
    return s.zfill(width)


def count(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        x = float(value)
        return int(x) if math.isfinite(x) and x >= 0 and x.is_integer() else None
    except (TypeError, ValueError):
        return None


def aggregate(records):
    """Cero solo si hay reportes clasificados; un faltante crítico no se imputa."""
    groups, seen = defaultdict(list), set()
    for r in records:
        if r['site'] in seen:
            raise ValueError(f'Sede MEN duplicada: {r["site"]}')
        seen.add(r['site'])
        groups[r['code']].append(r)
    result = []
    for municipal, rows in sorted(groups.items()):
        critical = [r for r in rows if r['damage'] in CRITICAL]
        missing = sum(r['enrollment'] is None for r in critical)
        unclassified = sum(r['damage'] not in KNOWN_DAMAGE for r in rows)
        result.append({'code': municipal, 'd': rows[0]['d'], 'm': rows[0]['m'],
                       'reported_sites': len(rows), 'critical_sites': len(critical),
                       'critical_enrollment': None if missing or unclassified else sum(r['enrollment'] for r in critical),
                       'missing_critical_enrollment': missing, 'unclassified_sites': unclassified})
    return result


def prepare(folder):
    from openpyxl import load_workbook
    folder = Path(folder)
    reference = json.loads((ROOT / 'data/poblacion_relativa.json').read_text(encoding='utf-8'))
    ref = {r['code']: r for r in reference['rows']}
    names = {(norm(r['d']), norm(r['m'])): r['code'] for r in ref.values()}
    names.update(ALIASES)
    sources = {}

    def book(pattern, key, sheet, cut, note):
        files = list(folder.glob(pattern))
        if len(files) != 1:
            raise ValueError(f'{pattern}: se esperaba un archivo, hay {len(files)}')
        p = files[0]
        sources[key] = {'file': p.name, 'sheet': sheet, 'cut': cut, 'note': note,
                        'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
        return load_workbook(p, read_only=True, data_only=True)

    men = book('MEN*.xlsx', 'men', 'Sheet1', '2026-09-21',
               'Corte inferido del nombre del archivo. Matrícula en AM, daño en AP; fecha propia de la matrícula no acreditada. Solo sedes oficiales reportadas.')
    records = []
    for row in list(men['Sheet1'].values)[1:]:
        if not any(v is not None for v in row):
            continue
        municipal, site = code(row[3], 5), code(row[9], 12)
        if municipal not in ref or norm(ref[municipal]['d']) != norm(row[1]):
            raise ValueError(f'Municipio MEN sin cruce: {municipal}')
        if norm(row[7]) != 'oficial':
            raise ValueError(f'Sector MEN inesperado: {site}')
        names[(norm(row[1]), norm(row[4]))] = municipal
        records.append({'site': site, 'code': municipal, 'd': ref[municipal]['d'],
                        'm': ref[municipal]['m'], 'damage': norm(row[41]), 'enrollment': count(row[38])})
    men.close()
    municipalities = aggregate(records)
    simat = book('SIMAT*.xlsx', 'simat', 'Sedes_5_Departamentos', '2026-07',
                 'Resumen declara Base Nación SIMAT julio 2026. Se usa para delimitar el ámbito, no como numerador ni denominador de este indicador.')
    seen, roster_codes = set(), set()
    for row in list(simat['Sedes_5_Departamentos'].values)[1:]:
        if not any(v is not None for v in row):
            continue
        site = code(row[6], 12)
        municipal = names.get((norm(row[0]), norm(row[2])))
        if not municipal or municipal[:2] not in DEPARTMENTS:
            raise ValueError(f'Municipio SIMAT sin cruce: {row[0]} / {row[2]}')
        if site in seen:
            raise ValueError(f'Sede SIMAT duplicada: {site}')
        seen.add(site)
        roster_codes.add(municipal)
    simat.close()
    expected = {k for k in ref if k[:2] in DEPARTMENTS}
    if roster_codes != expected:
        raise ValueError(f'Ámbito incompleto: faltan {expected-roster_codes}, sobran {roster_codes-expected}')
    roster = [{k: ref[c][k] for k in ('code', 'd', 'm')} for c in sorted(roster_codes)]
    return {'version': 1, 'enabled': True, 'report_date': '2026-09-21',
            'critical_damage': sorted(CRITICAL), 'sources': sources,
            'municipalities': municipalities, 'roster': roster,
            'department_counts': dict(Counter(r['d'] for r in roster)),
            'totals': {'men_sites': len(records), 'men_municipalities': len(municipalities),
                       'critical_sites': sum(r['critical_sites'] for r in municipalities),
                       'critical_enrollment': sum(r['critical_enrollment'] or 0 for r in municipalities),
                       'simat_sites': len(seen), 'scope_municipalities': len(roster),
                       'scope_with_men': sum(r['code'] in roster_codes for r in municipalities)}}


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('folder', type=Path)
    ap.add_argument('--out', type=Path, default=ROOT / 'data/matricula_critica.json')
    args = ap.parse_args()
    result = prepare(args.folder)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False)+'\n', encoding='utf-8')
    print(json.dumps(result['totals'], ensure_ascii=False))
