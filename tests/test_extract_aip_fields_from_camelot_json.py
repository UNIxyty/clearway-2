import importlib.util
import sys
import unittest
from pathlib import Path


def load_module():
    root = Path(__file__).resolve().parent.parent
    script_path = root / "scripts" / "extract_aip_fields_from_camelot_json.py"
    spec = importlib.util.spec_from_file_location(
        "extract_aip_fields_from_camelot_json", script_path
    )
    module = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ExtractAipFieldsFromCamelotJsonTests(unittest.TestCase):
    def test_extract_required_fields_from_sample_tables(self):
        mod = load_module()
        tables = [
            [
                {
                    "0": "7",
                    "1": "Types of traffic permitted (IFR/VFR)",
                    "2": "IFR/VFR",
                },
                {
                    "0": "8",
                    "1": "Remarks",
                    "2": "NIL",
                },
            ],
            [
                {
                    "0": "1",
                    "1": "AD operator AD Operational hours",
                    "2": "MON-FRI: 0600-1430",
                },
                {
                    "0": "2",
                    "1": "Customs and immigration",
                    "2": "H24 1 HR PN required",
                },
                {
                    "0": "7",
                    "1": "ATS",
                    "2": "See NOTAM.",
                },
            ],
            [
                {
                    "0": "12",
                    "1": "Remarks",
                    "2": "ATS contacts: Tel +372 6710244",
                },
            ],
            [
                {
                    "0": "1",
                    "1": "AD category for fire fighting",
                    "2": "CAT 5",
                }
            ],
        ]
        out = mod.extract_required_fields(
            tables=tables,
            icao_hint="EETU",
            airport_name_hint="TARTU",
        )
        self.assertEqual(out["Airport Code"], "EETU")
        self.assertEqual(out["Airport Name"], "TARTU")
        self.assertEqual(out["AD2.2 Types of Traffic Permitted"], "IFR/VFR")
        self.assertEqual(out["AD2.2 Remarks"], "NIL")
        self.assertEqual(out["AD2.3 AD Operator"], "MON-FRI: 0600-1430")
        self.assertEqual(out["AD 2.3 Customs and Immigration"], "H24 1 HR PN required")
        self.assertEqual(out["AD2.3 ATS"], "See NOTAM.")
        self.assertIn("ATS contacts", out["AD2.3 Remarks"])
        self.assertEqual(out["AD2.6 AD category for fire fighting"], "CAT 5")


if __name__ == "__main__":
    unittest.main()
