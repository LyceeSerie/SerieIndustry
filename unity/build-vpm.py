"""Build a VPM archive and merge its manifest into a repository listing (stdlib only)."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parent
PACKAGE = ROOT / "VRCBandDB"
LISTING_URL = "https://serieindustry.com/vpm/index.json"
RELEASE_ROOT = "https://github.com/LyceeSerie/SerieIndustry/releases/download"


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def validate_package(source):
    manifest = read_json(source / "package.json")
    version = manifest["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Use a stable semantic version: 0.1.0")
    if manifest["name"] != "com.serieindustry.vrcbanddb.calendar":
        raise ValueError("Unexpected package ID")
    required = ["Runtime/VbdEventCalendar.cs", "Runtime/VbdCalendarRow.cs",
                "Runtime/SerieIndustry.VRCBandDB.Runtime.asmdef", "Editor/SerieIndustry.VRCBandDB.Editor.asmdef",
                "Runtime/SerieIndustry.VRCBandDB.Udon.asset",
                "Runtime/VbdEventCalendar.asset", "Runtime/VbdCalendarRow.asset",
                "Runtime/CompiledPrograms/VbdEventCalendar.asset", "Runtime/CompiledPrograms/VbdCalendarRow.asset",
                "Prefabs/VRCBandDB Calendar.prefab", "Fonts/OFL.txt", "Fonts/CalendarFont.ttf", "Materials/CalendarBack.mat"]
    for name in required:
        if not (source / name).is_file():
            raise ValueError(f"Missing required distribution asset: {name}")
    guids = {}
    for path in source.rglob("*.meta"):
        match = re.search(r"^guid: ([a-f0-9]{32})$", path.read_text(encoding="utf-8-sig"), re.M)
        if not match:
            raise ValueError(f"Invalid meta: {path}")
        guid = match.group(1)
        if guid in guids:
            raise ValueError(f"Duplicate GUID: {path} / {guids[guid]}")
        guids[guid] = path
    for path in source.rglob("*"):
        if not path.is_file() or path.suffix == ".meta":
            continue
        if not Path(str(path) + ".meta").is_file():
            raise ValueError(f"Missing Unity meta (import in Unity first): {path}")
    return manifest


def build(source=PACKAGE, output=ROOT / "dist", tag=None, previous=None):
    manifest = validate_package(source)
    version, name = manifest["version"], manifest["name"]
    expected_tag = "calendar-v" + version
    if tag is not None and tag != expected_tag:
        raise ValueError(f"Tag must match package.json: {expected_tag}")
    filename = f"{name}-{version}.zip"
    url = f"{RELEASE_ROOT}/{expected_tag}/{filename}"
    if manifest["url"] != url:
        raise ValueError("package.json url does not match release version")
    output.mkdir(parents=True, exist_ok=True)
    archive = output / filename
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for path in sorted(source.rglob("*")):
            if not path.is_file():
                continue
            relative = path.relative_to(source).as_posix()
            if any(part.startswith(".") for part in path.relative_to(source).parts) or "BuildCalendar.request" in relative:
                continue
            info = zipfile.ZipInfo(relative, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, path.read_bytes())
    listing = read_json(previous) if previous else {
        "name": "SerieIndustry VPM Repository", "id": "com.serieindustry.vpm",
        "author": "SerieIndustry", "url": LISTING_URL, "packages": {}}
    if listing.get("url") != LISTING_URL or listing.get("id") != "com.serieindustry.vpm":
        raise ValueError("Unexpected previous listing identity")
    versions = listing.setdefault("packages", {}).setdefault(name, {"versions": {}})["versions"]
    entry = dict(manifest, zipSHA256=hashlib.sha256(archive.read_bytes()).hexdigest())
    if version in versions and versions[version] != entry:
        raise ValueError("Published versions are immutable; increment version before releasing changes")
    versions[version] = entry
    listing_path = output / "index.json"
    listing_path.write_text(json.dumps(listing, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Built {archive.name}; sha256={entry['zipSHA256']}")
    return archive, listing_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--tag")
    parser.add_argument("--previous", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    args = parser.parse_args()
    build(output=args.output, tag=args.tag, previous=args.previous)

