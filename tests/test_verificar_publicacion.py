import copy
import json
import unittest
from scripts.verificar_publicacion import verify


class PublicationVerificationTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = {"projects": [{"id": "a", "origin": "tercero", "reviewStatus": "confirmed",
                                     "sourceRecordId": "INI-1", "sourceUrl": "https://example.org/?ficha=INI-1"}]}
        self.html = "<script>const PROJECTS_DATA=" + json.dumps(self.snapshot) + ";</script>"
        self.status = {"ok": True, "revision": "tested-commit"}

    def test_same_revision_and_inventory_pass(self):
        self.assertEqual(verify(self.html, self.status, "tested-commit", self.snapshot), 1)

    def test_old_revision_fails_even_if_status_is_ok(self):
        with self.assertRaises(ValueError):
            verify(self.html, self.status, "new-commit", self.snapshot)

    def test_different_inventory_fails_even_if_revision_matches(self):
        with self.assertRaises(ValueError):
            verify(self.html, self.status, "tested-commit", {"projects": []})

    def test_duplicate_source_reference_fails(self):
        repeated = copy.deepcopy(self.snapshot)
        repeated["projects"].append({**repeated["projects"][0], "id": "b"})
        html = "const PROJECTS_DATA=" + json.dumps(repeated) + ";"
        with self.assertRaises(ValueError):
            verify(html, self.status, "tested-commit", repeated)

    def test_missing_project_data_fails(self):
        with self.assertRaises(ValueError):
            verify("<html></html>", self.status, "tested-commit", self.snapshot)


if __name__ == "__main__":
    unittest.main()
