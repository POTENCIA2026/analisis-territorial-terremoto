import copy
import hashlib
import unittest
from unittest.mock import patch
from scripts import preparar_reps_simat as module

class RepsSimatTest(unittest.TestCase):
    def raw(self, suffix=""):
        head="ANNO_INF,DPTO_CARGA,CODIGO_SED,DIVIPOLA_MUNICIPIO,CTE_ID_SECTOR,CTE_ID_ZONA,TOTAL_SEDES\n"
        return (head+"".join(f"2022,05,1,{i:05d},1,1,50\n" for i in range(5001,6001))+suffix).encode()
    def parse(self, raw):
        with patch.object(module,"SHA",hashlib.sha256(raw).hexdigest()):
            return module.education(raw)
    def test_sum_and_zeros_in_divipola(self):
        rows,audit=self.parse(self.raw("2022,05,1,05001,2,2,7\n"))
        self.assertEqual(rows[0]["code"],"05001")
        self.assertEqual(rows[0]["value"],57)
        self.assertEqual(audit["total_sites"],50007)
        self.assertEqual(len(rows),1000)
    def test_identical_duplicate_not_double_counted(self):
        rows,audit=self.parse(self.raw("2022,05,1,05001,1,1,50\n"))
        self.assertEqual(rows[0]["value"],50)
        self.assertEqual(audit["duplicate_cells_removed"],1)
    def test_conflicting_cells_and_total_categories_fail(self):
        for extra in ["2022,05,1,05001,1,1,51\n","2022,05,1,05001,3,1,50\n","2021,05,1,05001,1,2,50\n","2022,05,1,05001,1,2,-1\n"]:
            with self.assertRaises(ValueError):self.parse(self.raw(extra))
    def test_changed_download_rejected(self):
        with self.assertRaises(ValueError):module.education(self.raw())
    def test_reps_observed_promoted_without_altering_original(self):
        base={"sources":{"reps":{"reference":"2026-03-12","sha256":"a"*64,"url":"https://www.datos.gov.co/d/c36g-9fc2"}},
            "audit":{"reps_conflicting_site_ids":[]},"candidates":[{"kind":"sedes_ips","code":"27050","value":3,"status":"candidate_only"}]}
        original=copy.deepcopy(base)
        raw=self.raw()
        with patch.object(module,"SHA",hashlib.sha256(raw).hexdigest()):
            result=module.build(base,raw)
        self.assertEqual(base,original)
        self.assertEqual(result["rows"][0]["value"],3)
        self.assertEqual(result["audit"]["imputed"],0)
        self.assertEqual(result["rows"][0]["status"],"observed_registry_proxy")

if __name__=="__main__":unittest.main()
