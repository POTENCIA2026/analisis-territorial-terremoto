import json
from pathlib import Path
import unittest

from scripts.preparar_inversion_educativa import aggregate


def record(**changes):
    return dict({'site': '166001000001', 'code': '66001', 'enrollment': 10,
                 'damage': 'Afectación parcial', 'zone': 'rural', 'territory': 'no',
                 'strategy': 'Presencialidad', 'service': 'Si', 'modality': 'Remota'}, **changes)


class EducationInventoryTests(unittest.TestCase):
    def test_denominator_only_affected_and_known_rural(self):
        r = aggregate([record(), record(site='2', enrollment=30, zone='urbana'),
                       record(site='3', enrollment=100, damage='Sin afectación')])[0]
        self.assertEqual(r['reported_sites'], 3)
        self.assertEqual(r['affected_sites'], 2)
        self.assertEqual(r['affected_enrollment'], 40)
        self.assertEqual(r['rural_percent'], 25)

    def test_missing_is_not_zero(self):
        r = aggregate([record(enrollment=None)])[0]
        self.assertIsNone(r['affected_enrollment'])
        self.assertIsNone(r['rural_percent'])
        self.assertIsNone(r['damage'][0]['enrollment'])
        r = aggregate([record(enrollment=0)])[0]
        self.assertEqual(r['affected_enrollment'], 0)
        self.assertIsNone(r['rural_percent'])

    def test_unknown_classification_or_zone_prevents_complete_rate(self):
        self.assertIsNone(aggregate([record(damage='Sin clasificación')])[0]['affected_sites'])
        self.assertIsNone(aggregate([record(zone='')])[0]['rural_percent'])

    def test_duplicated_site_rejected(self):
        with self.assertRaisesRegex(ValueError, 'duplicada'):
            aggregate([record(), record()])

    def test_conflicting_territory_is_missing_not_no(self):
        r = aggregate([record(), record(site='2', territory='zomac')])[0]
        self.assertIsNone(r['territory'])

    def test_no_service_or_severity_inferences(self):
        r = aggregate([record(service='Si', modality='Remota')])[0]
        self.assertEqual(r['service'][0]['label'], 'Si')
        self.assertEqual(r['modality'][0]['label'], 'Remota')
        self.assertNotIn('critical_sites', r)
        self.assertNotIn('presential_percent', r)

    def test_prepared_data_against_existing_independent_men_aggregate(self):
        root = Path(__file__).resolve().parents[1]
        new = json.loads((root / 'data/inversion_educativa.json').read_text(encoding='utf-8'))
        old = json.loads((root / 'data/matricula_critica.json').read_text(encoding='utf-8'))
        old_counts = {r['code']: r['reported_sites'] for r in old['municipalities']}
        self.assertEqual({r['code']: r['reported_sites'] for r in new['municipalities']}, old_counts)
        self.assertEqual(sum(r['reported_sites'] for r in new['municipalities']), 5537)
        p = next(r for r in new['municipalities'] if r['code'] == '66001')
        self.assertEqual((p['reported_sites'], p['affected_enrollment'], p['rural_enrollment']), (167, 56325, 9875))
        self.assertAlmostEqual(p['rural_percent'], 9875 / 56325 * 100)


if __name__ == '__main__':
    unittest.main()
