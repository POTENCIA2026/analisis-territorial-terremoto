import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import capturar_proyectos_gtrt as gtrt  # noqa: E402

import generar_tablero_recuperacion as tablero  # noqa: E402


def row(identifier, coverage, codes=()):
    return {"id": identifier, "cobertura": coverage, "codMunicipios": list(codes), "tipoOrganizacion": "ONGs"}


def ficha(identifier, **changes):
    base = {"id": identifier, "nombre": "Iniciativa " + identifier, "validada": True, "organizacion": "Org " + identifier,
            "naturalezaOrganizacion": "ONGs", "descripcion": "Descripción", "estadoEjecucion": "En ejecución",
            "estadosFinanciacion": ["Financiada"], "montoCOPReportado": 80300000, "montoUSDReportado": None,
            "situacionMonto": "reportadoCOP", "montoConfiable": "Sí", "corteFuente": "2026-09-15",
            "cobertura": [], "observaciones": "Nota interna de la secretaría que no debe copiarse"}
    return {**base, **changes}


def page(rows, fichas, offers, cut="Corte 2, 29 de octubre de 2026"):
    props = {"filas": rows, "fichas": fichas, "vistas": [], "ofertaDe": offers, "tasa": 3193.15}
    # Sin espacios, como lo sirve la página real.
    flight = '1:["$","div",null,{"children":["$","$L13",null,' + json.dumps(props, ensure_ascii=False, separators=(",", ":")) + "]}]"
    script = "self.__next_f.push([1," + json.dumps(flight, ensure_ascii=False) + "])"
    return f"<html><body><script>{script}</script><footer>Corte vigente: {cut}. Las organizaciones…</footer></body></html>"


def sample_page():
    rows = [
        row("INI-0001", [{"d": "76", "n": "Valle del Cauca", "g": "Focalizado", "m": "76001"},
                         {"d": "19", "n": "Cauca", "g": "Otros afectados", "m": ""},
                         {"d": "76", "n": "Valle del Cauca", "g": "Focalizado", "m": "76001"}], ["76001"]),
        row("INI-0002", [{"d": "66", "n": "Risaralda", "g": "Focalizado", "m": "66001"}], ["66001"]),
        row("INI-0003", [{"d": "27", "n": "Chocó", "g": "Focalizado", "m": "27086"},
                         {"d": "27", "n": "Chocó", "g": "Focalizado", "m": "27001"}], ["27086", "27001"]),
        row("INI-0004", []),
    ]
    fichas = {
        "INI-0001": ficha("INI-0001"),
        "INI-0002": ficha("INI-0002", validada=False, estadoEjecucion="", montoCOPReportado=600000000,
                          estadosFinanciacion=["Financiación parcial", "Requiere recursos"]),
        "INI-0003": ficha("INI-0003", montoCOPReportado=None, montoUSDReportado=25000, situacionMonto="conversion",
                          cobertura=[{"departamento": "Chocó", "municipios": ["Belén de Bajirá", "Quibdó"], "sinMunicipio": 0}]),
        "INI-0004": ficha("INI-0004", montoConfiable="No"),
    }
    offers = {"INI-0001": "Oferta financiada", "INI-0002": "Oferta por financiar",
              "INI-0003": "Oferta financiada", "INI-0004": "Oferta financiada"}
    return page(rows, fichas, offers)


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.data = gtrt.build(sample_page(), "2026-11-10T00:00:00Z")
        self.by_id = {p["sourceRecordId"]: p for p in self.data["projects"]}

    def test_cut_and_counts_come_from_the_page(self):
        self.assertEqual(self.data["cut"], {"label": "Corte 2", "dateText": "29 de octubre de 2026"})
        self.assertEqual(self.data["coverage"]["initiatives"], 4)
        self.assertEqual(self.data["coverage"]["validated"], 3)
        self.assertEqual([p["id"] for p in self.data["projects"]], ["gtrt-INI-000" + str(i) for i in range(1, 5)])

    def test_fields_without_direct_equivalent_are_pending(self):
        for project in self.data["projects"]:
            self.assertEqual(project["mission"], ["Por confirmar"])
            self.assertEqual(project["beneficiaries"], "Por confirmar")
            self.assertEqual(project["origin"], "tercero")
            self.assertNotIn("observaciones", project)
            self.assertNotIn("Nota interna", json.dumps(project, ensure_ascii=False))

    def test_funded_value_is_copied_and_unfunded_cost_is_not_a_value(self):
        self.assertEqual(self.by_id["INI-0001"]["valueText"], "$ 80.300.000")
        self.assertEqual(self.by_id["INI-0001"]["funding"], "Financiada")
        unfunded = self.by_id["INI-0002"]
        self.assertEqual(unfunded["valueText"], "Por confirmar")
        self.assertEqual(unfunded["funding"], "Por financiar")
        self.assertIn("Costo de implementación reportado: $ 600.000.000 COP", unfunded["sourceHeader"])
        self.assertIn("Financiación parcial; Requiere recursos", unfunded["sourceHeader"])
        self.assertEqual(self.by_id["INI-0003"]["valueText"], "US$ 25.000 (reportado en dólares)")
        self.assertEqual(self.by_id["INI-0004"]["valueText"], "Por confirmar")  # monto no confiable

    def test_review_and_status_follow_the_source(self):
        self.assertEqual(self.by_id["INI-0001"]["reviewStatus"], "confirmed")
        self.assertEqual(self.by_id["INI-0002"]["reviewStatus"], "suggested")
        self.assertEqual(self.by_id["INI-0001"]["status"], "En ejecución")
        self.assertIsNone(self.by_id["INI-0002"]["status"])
        self.assertEqual(self.by_id["INI-0001"]["sourceUrl"], "https://gtrt-dashboard.vercel.app/iniciativas?ficha=INI-0001")

    def test_territories_use_dashboard_names_without_repeats(self):
        self.assertEqual(self.by_id["INI-0001"]["territories"],
                         [{"department": "Cauca", "municipality": None}, {"department": "Valle del Cauca", "municipality": "Cali"}])
        # 27086 no está en la referencia DANE 2018 del tablero: se toma el nombre que publica la ficha.
        self.assertEqual(self.by_id["INI-0003"]["territories"],
                         [{"department": "Chocó", "municipality": "Belén de Bajirá"}, {"department": "Chocó", "municipality": "Quibdó"}])
        self.assertEqual(self.by_id["INI-0004"]["territories"], [])
        self.assertTrue(self.by_id["INI-0004"]["territoryUnresolved"])

    def test_unexpected_pages_fail_instead_of_writing_partial_data(self):
        with self.assertRaises(ValueError):
            gtrt.build("<html>sin datos</html>", "x")
        with self.assertRaises(ValueError):
            gtrt.build(sample_page().replace("Corte vigente", "Otro texto"), "x")
        broken = page([row("INI-0001", [])], {"INI-0009": ficha("INI-0009")}, {"INI-0001": "Oferta financiada"})
        with self.assertRaises(ValueError):
            gtrt.build(broken, "x")


class PublishedCaptureTests(unittest.TestCase):
    """La captura versionada y su paso al tablero."""

    def setUp(self):
        self.data = json.loads(tablero.PROJECTS_GTRT.read_text(encoding="utf-8"))

    def test_capture_follows_the_rules(self):
        projects = self.data["projects"]
        self.assertEqual(len(projects), self.data["coverage"]["initiatives"])
        self.assertEqual(len({p["id"] for p in projects}), len(projects))
        for p in projects:
            self.assertEqual(p["mission"], ["Por confirmar"], p["id"])
            self.assertEqual(p["beneficiaries"], "Por confirmar", p["id"])
            self.assertIn(p["reviewStatus"], ("confirmed", "suggested"), p["id"])
            self.assertTrue(p["sourceUrl"].endswith("?ficha=" + p["sourceRecordId"]), p["id"])
            if p["funding"] != "Financiada":
                self.assertEqual(p["valueText"], "Por confirmar", p["id"])

    def test_snapshot_merges_both_sources(self):
        torre = json.loads(tablero.PROJECTS.read_text(encoding="utf-8"))
        merged = tablero.projects_snapshot()
        unique_torre = tablero.unique_projects(torre["projects"])
        self.assertEqual(len(merged["projects"]), len(unique_torre) + len(self.data["projects"]))
        self.assertEqual(merged["projects"][:len(unique_torre)], unique_torre)
        self.assertEqual(merged["projects"][len(unique_torre):], self.data["projects"])
        self.assertEqual(merged["capturedAt"], torre["capturedAt"])
        source = merged["additionalSources"][0]
        self.assertEqual(source["records"], len(self.data["projects"]))
        self.assertEqual(source["cut"], f"{self.data['cut']['label']}, {self.data['cut']['dateText']}")


if __name__ == "__main__":
    unittest.main()
