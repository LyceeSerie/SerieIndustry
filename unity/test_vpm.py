import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("vpm", Path(__file__).with_name("build-vpm.py"))
vpm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vpm)

class VpmTests(unittest.TestCase):
    def test_archive_and_version_history(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d)
            previous = out / "old.json"
            old = {"name":"SerieIndustry VPM Repository", "id":"com.serieindustry.vpm", "url":vpm.LISTING_URL,
                   "packages":{"another.package":{"versions":{"1.0.0":{"name":"another.package"}}}}}
            previous.write_text(json.dumps(old), encoding="utf-8")
            version = vpm.read_json(vpm.PACKAGE / "package.json")["version"]
            archive, listing = vpm.build(output=out, tag="calendar-v"+version, previous=previous)
            data = vpm.read_json(listing)
            self.assertIn("another.package", data["packages"])
            entry = data["packages"]["com.serieindustry.vrcbanddb.calendar"]["versions"][version]
            self.assertEqual(entry["zipSHA256"], vpm.hashlib.sha256(archive.read_bytes()).hexdigest())
            with zipfile.ZipFile(archive) as z:
                self.assertIn("package.json", z.namelist())
                self.assertIn("Prefabs/VRCBandDB Calendar.prefab", z.namelist())
                self.assertFalse(any("BuildCalendar.request" in x for x in z.namelist()))
                self.assertNotIn("zipSHA256", json.loads(z.read("package.json").decode("utf-8-sig")))
            first = archive.read_bytes()
            vpm.build(output=out, previous=listing)
            self.assertEqual(first, archive.read_bytes())
            data["packages"]["com.serieindustry.vrcbanddb.calendar"]["versions"][version]["zipSHA256"]="wrong"
            listing.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(ValueError,"immutable"):
                vpm.build(output=out, previous=listing)
    def test_wrong_tag_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError, "Tag must match"):
                vpm.build(output=Path(d), tag="wrong-tag")

if __name__ == "__main__":
    unittest.main()

