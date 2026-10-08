import json
from pathlib import Path
import unittest
from scripts.preparar_men_abierto import summarize_sites, summarize_coverage, crosswalk, dane


def site(**changes):
    return dict({'cod_dane_departamento': '66', 'cod_dane_municipio': '66001',
                 'codigo_dane_sede': '166001000001', 'sector': 'OFICIAL', 'zona': 'Urbana',
                 'matricula': '10', 'filas': '3', 'filas_con_matricula': '3'}, **changes)


def control(**changes):
    return dict({'filas': 3, 'filas_con_matricula': 3, 'sedes': 1, 'municipios': 1, 'matricula': 10}, **changes)


class PublicMenTests(unittest.TestCase):
    def test_dane_numeric_codes_keep_all_digits_and_municipal_leading_zero(self):
        self.assertEqual(dane('166001000001.0', 12), '166001000001')
        self.assertEqual(dane('5001', 5), '05001')
        for value in ('16600100', '166001000001.5', None):
            with self.assertRaises(ValueError): dane(value, 12)

    def test_whole_school_universe_includes_private_sector_and_same_year_denominator(self):
        rows = [site(), site(codigo_dane_sede='366001000001', sector='NO_OFICIAL', zona='Rural', matricula='30')]
        municipalities, sites, totals = summarize_sites(rows, control(filas=6, filas_con_matricula=6, sedes=2, matricula=40))
        self.assertEqual((municipalities[0]['sites'], municipalities[0]['official_percent'], municipalities[0]['rural_percent']), (2, 25, 75))
        self.assertEqual(totals['filas'], 6)  # Grouped enrollment records are not campuses.

    def test_truncated_download_cannot_masquerade_as_complete(self):
        with self.assertRaisesRegex(ValueError, 'No concilia'):
            summarize_sites([site()], control(sedes=2))

    def test_duplicate_campus_or_incomplete_enrollment_rejected(self):
        for rows in ([site(), site()], [site(filas_con_matricula='2')], [site(sector='UNKNOWN')]):
            with self.assertRaises(ValueError): summarize_sites(rows, control())

    def test_crosswalk_requires_school_code_municipality_and_sector(self):
        sites = {str(166001000000+i): {'code': '66001' if i != 3 else '66170', 'sector': 'NO_OFICIAL' if i == 4 else 'OFICIAL'} for i in (1, 3, 4)}
        reported = [{'site': str(166001000000+i), 'code': '66001'} for i in range(1, 5)]
        rows, exceptions = crosswalk(sites, reported)
        self.assertEqual(rows[0], {'code':'66001', 'reported':4, 'matched':1, 'missing':1, 'municipality_conflict':1, 'sector_conflict':1})
        self.assertEqual(len(exceptions), 3)

    def test_coverage_keeps_published_percentage_and_flags_do_not_clamp_it(self):
        rows = [{'a_o':'2024','c_digo_municipio':'66001','cobertura_neta':'102.45'}, {'a_o':'2024','c_digo_municipio':'05001'}]
        result = summarize_coverage(rows, 2024)
        self.assertIsNone(result[0]['net_coverage'])
        self.assertEqual(result[1]['net_coverage'], 102.45)
        with self.assertRaises(ValueError): summarize_coverage(rows + rows, 2024)

    def test_national_snapshot_controls_and_pereira_crosswalk(self):
        root = Path(__file__).resolve().parents[1]
        payload = json.loads((root / 'data/men_universo.json').read_bytes())
        self.assertEqual(payload['totals']['sedes'], 53005)
        self.assertEqual(payload['totals']['matricula'], 9311478)
        self.assertEqual(sum(r['sites'] for r in payload['municipalities']), 53005)
        self.assertEqual(sum(r['enrollment'] for r in payload['municipalities']), 9311478)
        self.assertEqual(len(payload['coverage']), 1122)
        pereira = next(r for r in payload['municipalities'] if r['code'] == '66001')
        self.assertEqual((pereira['sites'], pereira['enrollment']), (319, 82902))
        self.assertEqual([(r['sites'], r['enrollment']) for r in pereira['sectors']], [(170,61947),(149,20955)])
        match = next(r for r in payload['crosswalk'] if r['code'] == '66001')
        self.assertEqual((match['reported'], match['matched']), (167, 167))


if __name__ == '__main__': unittest.main()
