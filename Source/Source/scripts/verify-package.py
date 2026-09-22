from pathlib import Path
import sys

root = Path(sys.argv[1])
assert {path.name for path in root.iterdir()} == {"Builds", "Extra"}, "Only Builds and Extra belong at the top level"
assert any(path.is_file() or path.suffix == ".app" for path in (root / "Builds").iterdir()), "No runnable builds found"
assert (root / "Extra/HOW-IT-WORKS.md").is_file()
assert (root / "Extra/Source/src-tauri/Cargo.lock").is_file()
assert (root / "Extra/Source/app/index.html").is_file()
assert any((root / "Extra/API").iterdir()), "Integration helper is missing"
for path in (root / "Extra/Source").rglob("*"):
    assert path.name not in {"node_modules", "target", "dist", "preview.mjs", "CNAME", "o", "games"}, str(path)
assert not (root / "Extra/Source/index.html").exists()
print("Package contains app builds and app-only extras")
