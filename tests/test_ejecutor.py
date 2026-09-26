import gzip
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

try:
    import fcntl
except ImportError:
    fcntl = None

SPEC = importlib.util.spec_from_file_location("ejecutor", Path(__file__).resolve().parent.parent / "deploy" / "ejecutor.py")
ej = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ej)

HTML = '<html><script>const DATA={"rows":[],"dates":["2026-09-25","2026-09-26"],"latest":"2026-09-26"};</script><section role="tabpanel"></section>' + "x" * 300 + "</html>"
# Paso simulado de la corrida: escribe un HTML válido y añade una fila al historial de trabajo.
WRITE_OK = ("import pathlib;pathlib.Path('index.html').write_text(%r);"
            "pathlib.Path('eda_indicadores.html').write_text('<p>eda</p>');"
            "pathlib.Path('historial_indicadores_no_calculo.csv').open('a').write('nueva\\n')" % HTML)


@unittest.skipIf(sys.platform == "win32", "el ejecutor corre en el contenedor Linux (fcntl, symlinks)")
class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.saved = {k: getattr(ej, k) for k in ("APP", "DATA", "SEED", "STATE", "PUBLIC", "WORK", "MIN_HTML_BYTES", "TIMEOUT", "pipeline_commands")}
        ej.APP, ej.DATA, ej.SEED = root / "app", root / "data", root / "seed"
        ej.STATE, ej.PUBLIC, ej.WORK = ej.DATA / "state", ej.DATA / "public", ej.DATA / "work"
        (ej.APP / "data").mkdir(parents=True)
        ej.SEED.mkdir()
        (ej.SEED / ej.HISTORY).write_text("cabecera\nfila1\nfila2\nfila3\n", encoding="utf-8")
        (ej.SEED / ej.CURRENT).write_text("cabecera\nfila1\n", encoding="utf-8")
        ej.MIN_HTML_BYTES, ej.TIMEOUT = 200, 20
        ej.PUBLIC.mkdir(parents=True)
        ej.seed_state()
        self.step(WRITE_OK)

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(ej, k, v)
        self.tmp.cleanup()

    def step(self, code):
        ej.pipeline_commands = lambda update: [[sys.executable, "-c", code]]

    def test_seed_copies_once_and_never_overwrites(self):
        (ej.STATE / ej.HISTORY).write_text("mío\n", encoding="utf-8")
        ej.seed_state()
        self.assertEqual((ej.STATE / ej.HISTORY).read_text(encoding="utf-8"), "mío\n")

    def test_successful_run_publishes_page_gzip_and_state_atomically(self):
        self.assertTrue(ej.run_once(update=True))
        self.assertEqual((ej.PUBLIC / "index.html").read_text(encoding="utf-8"), HTML)
        self.assertEqual(gzip.decompress((ej.PUBLIC / "index.html.gz").read_bytes()).decode("utf-8"), HTML)
        self.assertTrue((ej.PUBLIC / "eda_indicadores.html").exists())
        self.assertTrue((ej.PUBLIC / ej.CURRENT).exists())
        self.assertIn("nueva", (ej.STATE / ej.HISTORY).read_text(encoding="utf-8"))
        status = ej.read_status()
        self.assertTrue(status["ok"])
        self.assertEqual((status["capture_date"], status["embedded_captures"]), ("2026-09-26", 2))
        self.assertIsNotNone(status["last_success"])
        self.assertFalse(ej.WORK.exists(), "la carpeta temporal se descarta siempre")

    def test_failed_run_keeps_published_page_and_state(self):
        self.assertTrue(ej.run_once(update=True))
        before = ((ej.PUBLIC / "index.html").read_bytes(), (ej.STATE / ej.HISTORY).read_bytes(), ej.read_status()["last_success"])
        self.step("import sys;print('fuente caída');sys.exit(3)")
        self.assertFalse(ej.run_once(update=True))
        self.assertEqual(((ej.PUBLIC / "index.html").read_bytes(), (ej.STATE / ej.HISTORY).read_bytes()), before[:2])
        status = ej.read_status()
        self.assertIs(status["ok"], False)
        self.assertIn("fuente caída", status["error"])
        self.assertIn("código 3: fuente caída", status["error"].splitlines()[0], "la causa va en la primera línea")
        self.assertEqual(status["last_success"], before[2], "un fallo no cuenta como éxito")
        self.assertFalse(ej.WORK.exists())

    def test_invalid_or_truncated_page_is_never_published(self):
        self.step("import pathlib;pathlib.Path('index.html').write_text('<html>corto</html>')")
        self.assertFalse(ej.run_once(update=True))
        self.assertFalse((ej.PUBLIC / "index.html").exists())
        self.step("import pathlib;pathlib.Path('index.html').write_text('<html>' + 'x'*500 + '</html>')")
        self.assertFalse(ej.run_once(update=True))
        self.assertIn("estructura", ej.read_status()["error"])

    def test_history_that_would_shrink_is_rejected(self):
        code = WRITE_OK + ";pathlib.Path('historial_indicadores_no_calculo.csv').write_text('cabecera\\n')"
        self.step(code)
        self.assertFalse(ej.run_once(update=True))
        self.assertIn("historial", ej.read_status()["error"])
        self.assertEqual((ej.STATE / ej.HISTORY).read_text(encoding="utf-8").count("\n"), 4)

    def test_offline_bootstrap_publishes_but_does_not_count_as_update(self):
        self.assertTrue(ej.run_once(update=False))
        status = ej.read_status()
        self.assertTrue((ej.PUBLIC / "index.html").exists())
        self.assertNotIn("last_success", status)
        self.assertEqual(status["mode"], "arranque sin descarga")

    def test_overlapping_run_is_skipped(self):
        ej.DATA.mkdir(exist_ok=True)
        with (ej.DATA / ".lock").open("w") as held:
            fcntl.flock(held, fcntl.LOCK_EX)
            self.assertFalse(ej.run_once(update=True))
        self.assertFalse((ej.PUBLIC / "index.html").exists())

    def test_step_over_time_limit_is_killed_and_reported(self):
        ej.TIMEOUT = 1
        self.step("import time;time.sleep(30)")
        self.assertFalse(ej.run_once(update=True))
        self.assertIn("tiempo máximo", ej.read_status()["error"])

    def test_health_requires_page_and_a_recent_real_update(self):
        self.assertFalse(ej.healthy())
        self.assertTrue(ej.run_once(update=True))
        self.assertTrue(ej.healthy())
        old = (datetime.now(timezone.utc) - timedelta(hours=13)).isoformat()
        ej.write_status(last_success=old)
        self.assertFalse(ej.healthy(), "más de tres intervalos sin éxito")

    def test_status_is_valid_json_after_every_state(self):
        ej.run_once(update=True)
        json.loads((ej.PUBLIC / "status.json").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
