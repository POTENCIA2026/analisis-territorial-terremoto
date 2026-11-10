import copy
import json
import unittest

import generar_tablero_recuperacion as tablero


def project(identifier, amount="$ 500", **changes):
    return {"id": identifier, "sourceRecordId": "CO1.NTC.123",
            "sourceUrl": "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.123",
            "title": "Un proyecto", "valueText": amount, "beneficiaries": None,
            "mission": ["Vivienda y hábitat"],
            "territories": [{"department": "Risaralda", "municipality": "Pereira"}], **changes}


class UniqueProjectsTests(unittest.TestCase):
    def test_same_reference_is_counted_once_and_inputs_are_preserved(self):
        original = [project("a"), project("b", sourceRecordId=None)]
        saved = copy.deepcopy(original)
        unique = tablero.unique_projects(original)
        self.assertEqual(len(unique), 1)
        self.assertEqual(unique[0]["valueText"], "$ 500")
        self.assertFalse(unique[0]["valueConflict"])
        self.assertEqual(unique[0]["deduplicatedRecords"], original)
        self.assertEqual(len(unique[0]["territories"]), 1)
        self.assertEqual(original, saved)
        self.assertEqual(tablero.unique_projects(unique), unique)

    def test_conflicting_amounts_are_not_chosen_or_added(self):
        records = [project("a", "$ 500", beneficiaries=100),
                   project("b", "$ 1.500", beneficiaries=200)]
        unique = tablero.unique_projects(records)[0]
        self.assertEqual(unique["valueText"], "Por confirmar")
        self.assertTrue(unique["valueConflict"])
        self.assertEqual(unique["beneficiaries"], "Por confirmar")
        self.assertEqual([p["valueText"] for p in unique["deduplicatedRecords"]], ["$ 500", "$ 1.500"])

    def test_record_identifier_alone_is_enough_for_secop(self):
        unique = tablero.unique_projects([project("a", sourceUrl=None), project("b")])
        self.assertEqual(len(unique), 1)

    def test_titles_and_identifiers_from_different_sources_do_not_merge(self):
        records = [project("a", sourceRecordId="INI-1", sourceUrl="https://gtrt.example/iniciativas?ficha=INI-1"),
                   project("b", sourceRecordId="INI-2", sourceUrl="https://gtrt.example/iniciativas?ficha=INI-2"),
                   project("c", sourceRecordId="INI-1", sourceUrl="https://otra.example/iniciativas?ficha=INI-1")]
        self.assertEqual(tablero.unique_projects(records), records)

    def test_records_without_identity_are_not_dropped(self):
        records = [{"title": "Mismo título"}, {"title": "Mismo título"}]
        self.assertEqual(tablero.unique_projects(records), records)

    def test_disagreeing_secop_identifier_and_link_fail(self):
        with self.assertRaises(ValueError):
            tablero.unique_projects([project("a", sourceRecordId="CO1.NTC.999")])

    def test_published_capture_keeps_every_gtrt_initiative(self):
        snapshot = tablero.projects_snapshot()
        self.assertEqual(snapshot["deduplication"],
                         {"sourceRecords": 213, "uniqueProjects": 208, "removedRecords": 5, "valueConflicts": 2})
        visible = [p for p in snapshot["projects"] if p["reviewStatus"] == "confirmed" and p["origin"] != "alianza"]
        self.assertEqual(len(visible), 152)
        gtrt = json.loads(tablero.PROJECTS_GTRT.read_text(encoding="utf-8"))["projects"]
        self.assertEqual([p for p in snapshot["projects"] if p["id"].startswith("gtrt-")], gtrt)
        grouped = [p for p in snapshot["projects"] if p.get("deduplicatedRecords")]
        self.assertEqual(sorted(len(p["deduplicatedRecords"]) for p in grouped), [2, 5])
        self.assertTrue(all(p["valueText"] == "Por confirmar" for p in grouped))
        self.assertEqual(len({tablero.project_source_key(p, i) for i, p in enumerate(visible)}), 152)


if __name__ == "__main__":
    unittest.main()
