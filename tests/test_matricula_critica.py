import unittest
from scripts.preparar_matricula_critica import aggregate, count


def row(site='1', damage='colapso parcial', enrollment=10, code='66001'):
    return dict(site=site, damage=damage, enrollment=enrollment, code=code, d='Risaralda', m='Pereira')


class CriticalEnrollmentTests(unittest.TestCase):
    def test_three_critical_categories_only(self):
        r = aggregate([row(str(i), damage) for i, damage in enumerate([
            'colapso total', 'colapso parcial', 'riesgo inminente de colapso',
            'afectacion menor', 'afectacion parcial'])])[0]
        self.assertEqual(r['critical_sites'], 3)
        self.assertEqual(r['critical_enrollment'], 30)

    def test_duplicate_site_fails_even_across_municipalities(self):
        with self.assertRaises(ValueError):
            aggregate([row(), row(code='66170')])

    def test_explicit_zero_and_missing_are_distinct(self):
        self.assertEqual(aggregate([row(enrollment=0)])[0]['critical_enrollment'], 0)
        self.assertIsNone(aggregate([row(enrollment=None)])[0]['critical_enrollment'])
        self.assertEqual(aggregate([row(damage='afectacion menor', enrollment=None)])[0]['critical_enrollment'], 0)
        self.assertEqual(aggregate([]), [])

    def test_unclassified_damage_cannot_become_zero(self):
        self.assertIsNone(aggregate([row(damage='sin reporte')])[0]['critical_enrollment'])

    def test_counts_never_round_or_replace_blanks(self):
        for value in [None, '', '#N/A', -1, 2.5, float('nan'), True]:
            self.assertIsNone(count(value))
        self.assertEqual(count('12'), 12)
        self.assertEqual(count(0), 0)


if __name__ == '__main__':
    unittest.main()
