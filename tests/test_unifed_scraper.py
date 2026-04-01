import argparse
import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock

from bs4 import BeautifulSoup


def load_module():
    project_root = Path(__file__).resolve().parent.parent
    script_path = project_root / "unifed-scraper.py"
    spec = importlib.util.spec_from_file_location("unifed_scraper", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class UnifiedScraperTests(unittest.TestCase):
    def test_type_c_countries_are_registered(self):
        mod = load_module()
        for name in ("Benin", "Cameroon", "Senegal", "Togo"):
            self.assertIn(name, mod.COUNTRIES)
            self.assertEqual(mod.COUNTRIES[name]["type"], "C")
            self.assertIn("history_url", mod.COUNTRIES[name])
            self.assertIn("portal_url", mod.COUNTRIES[name])

    def test_extract_type_c_issue_candidates_filters_by_country(self):
        mod = load_module()
        html = """
        <html><body>
          <a href="../Benin/2026-01-22-000000/html/index-fr-FR.html">Benin current</a>
          <a href="../Cameroon/2026-03-19-000000/html/index-fr-FR.html">Cameroon current</a>
          <a href="../Benin/2025-12-25-000000/html/index-fr-FR.html">Benin old</a>
        </body></html>
        """
        soup = BeautifulSoup(html, "html.parser")
        items = mod._extract_type_c_issue_candidates(
            soup, "https://aim.asecna.aero/html/history-fr-FR.html", "Benin"
        )
        self.assertEqual(len(items), 2)
        # Keep folders so resolver can pick the latest lexically.
        self.assertEqual(items[0][0], "2026-01-22-000000")
        self.assertEqual(items[1][0], "2025-12-25-000000")

    def test_resolve_cli_inputs_interactive_prompt(self):
        mod = load_module()
        args = argparse.Namespace(country=None, mode=None, icao=None, output="downloads")
        answers = iter(["Benin", "2", "DBBB"])
        country, mode, icao = mod.resolve_cli_inputs(args, input_func=lambda prompt="": next(answers))
        self.assertEqual(country, "Benin")
        self.assertEqual(mode, "ad2")
        self.assertEqual(icao, "DBBB")

    def test_resolve_cli_inputs_requires_icao_for_ad2(self):
        mod = load_module()
        args = argparse.Namespace(country="Benin", mode="ad2", icao=None, output="downloads")
        with self.assertRaises(RuntimeError):
            mod.resolve_cli_inputs(args, input_func=lambda prompt="": "")

    def test_type_a_ad2_pdf_fallback_candidates_are_used(self):
        mod = load_module()
        airport_page_url = "https://example.test/2026-02-19-000000/html/eAIP/XX-AD-2-DBBB-en-GB.html"
        eaip_base = "https://example.test/2026-02-19-000000/html/"
        with mock.patch.object(mod, "get_soup", return_value=BeautifulSoup("<html></html>", "html.parser")):
            with mock.patch.object(mod, "_type_a_pdf_head_ok", side_effect=[False, True]):
                resolved = mod.type_a_get_ad2_pdf(airport_page_url, eaip_base)
        self.assertIsNotNone(resolved)
        assert resolved is not None
        self.assertTrue(resolved.endswith("XX-AD-2-DBBB.pdf"))

    def test_history_frame_body_resolution(self):
        mod = load_module()
        history_soup = BeautifulSoup(
            """
            <html><frameset>
              <frame src="history-image-en-GB.html" />
              <frame src="history-body-en-GB.html" />
            </frameset></html>
            """,
            "html.parser",
        )
        body_soup = BeautifulSoup(
            """
            <html><body>
              <a href="2020-07-16/html/index-en-GB.html">AMDT AIRAC NR 6</a>
            </body></html>
            """,
            "html.parser",
        )
        with mock.patch.object(mod, "get_soup", side_effect=[history_soup, body_soup]):
            folder, eaip_base = mod._type_a_resolve_one_history_url(
                "https://example.test/eaip/history-en-GB.html"
            )
        self.assertEqual(folder, "2020-07-16")
        self.assertEqual(eaip_base, "https://example.test/eaip/2020-07-16/html/")

    def test_commands_js_style_pdf_name_derivation(self):
        mod = load_module()
        gen_name = mod._commands_js_style_name_from_html_page(
            "https://example.test/eaip/2020-07-16/html/eAIP/SV-GEN 0.1-en-GB.html"
        )
        ad2_name = mod._commands_js_style_name_from_html_page(
            "https://example.test/eaip/2020-07-16/html/eAIP/SV-AD2.1SVAC-en-GB.html"
        )
        self.assertEqual(gen_name, "GEN 0.1.pdf")
        self.assertEqual(ad2_name, "AD2.1SVAC.pdf")

    def test_ad2_multi_pattern_extraction(self):
        mod = load_module()
        soup = BeautifulSoup(
            """
            <html><body>
              <a href="SV-AD2.1SVAC-en-GB.html">Airport SVAC</a>
              <a href="XX-AD-2-DBBB-en-GB.html">Airport DBBB</a>
            </body></html>
            """,
            "html.parser",
        )
        with mock.patch.object(
            mod,
            "_get_navigation_soup",
            return_value=("https://example.test/eaip/2020-07-16/html/eAIP/Menu-en-GB.html", soup),
        ):
            airports = mod.type_a_get_ad2_airports("https://example.test/eaip/2020-07-16/html/")
        self.assertIn("SVAC", airports)
        self.assertIn("DBBB", airports)


if __name__ == "__main__":
    unittest.main()
