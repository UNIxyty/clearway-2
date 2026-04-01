import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


def load_module():
    project_root = Path(__file__).resolve().parent.parent
    script_path = project_root / "scripts" / "pdf_to_complete_json.py"
    spec = importlib.util.spec_from_file_location("pdf_to_complete_json", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class PdfToJsonSchemaTests(unittest.TestCase):
    def test_build_initial_document_has_required_top_level_keys(self):
        mod = load_module()
        doc = mod.build_initial_document(
            source_path=Path("sample.pdf"),
            page_count=2,
            sha256_hex="abc123",
            ocr_langs="eng+rus",
            dpi=300,
            include_images_metadata=False,
        )

        self.assertEqual(
            set(doc.keys()),
            {
                "source",
                "engine",
                "pages",
                "document_text_concat",
                "stats",
                "warnings",
            },
        )
        self.assertEqual(doc["source"]["page_count"], 2)
        self.assertEqual(doc["engine"]["ocr_langs"], "eng+rus")
        self.assertEqual(doc["pages"], [])

    def test_finalize_document_populates_document_text_and_stats(self):
        mod = load_module()
        doc = mod.build_initial_document(
            source_path=Path("sample.pdf"),
            page_count=1,
            sha256_hex="abc123",
            ocr_langs="eng",
            dpi=300,
            include_images_metadata=False,
        )
        doc["pages"].append(
            {
                "page_number": 1,
                "width": 100.0,
                "height": 100.0,
                "rotation": 0,
                "language_hints": ["eng"],
                "raw_text_concat": "hello page",
                "blocks": [],
                "lines": [],
                "tables": [],
                "images": [],
                "warnings": [],
                "stats": {"native_char_count": 10, "ocr_char_count": 0, "table_count": 0},
            }
        )

        mod.finalize_document(doc)
        self.assertEqual(doc["document_text_concat"], "hello page")
        self.assertEqual(doc["stats"]["page_count"], 1)
        self.assertEqual(doc["stats"]["total_native_chars"], 10)

    def test_conservative_dedup_keeps_distinct_lines(self):
        mod = load_module()
        native_lines = [
            {"text": "Hello world", "bbox": [0.0, 0.0, 100.0, 10.0], "confidence": 1.0},
        ]
        ocr_lines = [
            {"text": "Hello world", "bbox": [0.5, 0.2, 100.2, 10.2], "confidence": 0.9},
            {"text": "Different line", "bbox": [0.0, 20.0, 100.0, 30.0], "confidence": 0.8},
        ]
        merged = mod.conservative_merge_lines(native_lines, ocr_lines)
        self.assertEqual(len(merged), 2)
        self.assertEqual(merged[0]["source"], "native")
        self.assertEqual(merged[1]["source"], "ocr")

    def test_sha256_file(self):
        mod = load_module()
        with tempfile.NamedTemporaryFile("wb", delete=False) as tmp:
            tmp.write(b"abc")
            tmp_path = Path(tmp.name)
        try:
            digest = mod.sha256_file(tmp_path)
            self.assertEqual(
                digest, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
            )
        finally:
            tmp_path.unlink(missing_ok=True)

    def test_parse_aip_structured_extracts_ad_2_2_basics(self):
        mod = load_module()
        sample_text = "\n".join(
            [
                "AIP RUSSIA",
                "AD 2.2 AERODROME GEOGRAPHICAL AND ADMINISTRATIVE DATA.",
                "514854N 0391356E. In the centre of RWY",
                "18 KM N of Voronezh",
                "531 FT/ 162 M/24.6°C",
                "PZ-90.11 coordinate system",
                "Types of traffic permitted (IFR/VFR)",
                "AD 2.3 OPERATIONAL HOURS.",
            ]
        )
        parsed = mod.parse_aip_ad2_from_text(sample_text)
        ad22 = parsed["sections"]["AD_2_2"]
        self.assertEqual(ad22["ARP_coordinates"]["latitude"], "514854N")
        self.assertEqual(ad22["ARP_coordinates"]["longitude"], "0391356E")
        self.assertEqual(ad22["direction_distance_from_city"], "18 KM N of Voronezh")
        self.assertEqual(ad22["elevation"]["ft"], 531)
        self.assertEqual(ad22["coordinate_system"], "PZ-90.11")
        self.assertEqual(ad22["types_of_traffic_permitted"], ["IFR", "VFR"])

    def test_parse_args_supports_profile_switch(self):
        mod = load_module()
        cfg = mod.parse_args(["in.pdf", "--profile", "aip_ad2"])
        self.assertEqual(cfg.profile, "aip_ad2")


if __name__ == "__main__":
    unittest.main()
