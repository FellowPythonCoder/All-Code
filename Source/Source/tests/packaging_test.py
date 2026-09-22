import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location("packaging", Path(__file__).resolve().parent.parent / "scripts" / "package-source.py")
packaging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packaging)


class PackagingTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.parent = Path(self.temporary.name)
        self.root = self.parent / "Extra" / "Source"
        self.root.mkdir(parents=True)
        self.write("../HOW-IT-WORKS.md", "guide")
        for name in packaging.REQUIRED:
            self.write(name, "source")

    def write(self, name, data):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data, encoding="utf-8")
        return path

    def names(self):
        with zipfile.ZipFile(packaging.package(self.root)) as archive:
            self.assertIsNone(archive.testzip())
            return set(archive.namelist())

    def test_new_source_in_an_extracted_folder_inside_another_repository(self):
        (self.parent / ".git").mkdir()
        self.write("integrations/new-client.py", "new source")
        self.write("src-tauri/Cargo.lock", "lock data")
        names = self.names()
        self.assertIn("Sreon/Extra/Source/integrations/new-client.py", names)
        self.assertIn("Sreon/Extra/Source/src-tauri/Cargo.lock", names)

    def test_secret_files_build_output_and_archives_are_excluded(self):
        files = ["src-tauri/target/debug/file.rs", "scripts/__pycache__/file.py", "tests/node_modules/demo/index.js", "app/assets/build/file.svg", "integrations/.env.local", "integrations/credentials.json", "integrations/secrets.yaml", "integrations/api-key.json", "app/assets/signing.pfx", "app/assets/private.pem", "app/assets/old.zip", "tests/.cache/data.json"]
        for name in files:
            self.write(name, "must not be archived")
        names = self.names()
        for name in files:
            self.assertNotIn("Sreon/Extra/Source/" + name, names)

    def test_symlinks_do_not_copy_files_outside_the_project(self):
        outside = self.parent / "outside"
        outside.mkdir()
        (outside / "private.json").write_text("private")
        (self.root / "app" / "assets").mkdir(parents=True)
        try:
            (self.root / "app" / "assets" / "outside").symlink_to(outside, target_is_directory=True)
            (self.root / "app" / "assets" / "linked.json").symlink_to(outside / "private.json")
        except OSError:
            self.skipTest("This host does not allow symlink creation")
        names = self.names()
        self.assertNotIn("Sreon/Extra/Source/app/assets/linked.json", names)
        self.assertNotIn("Sreon/Extra/Source/app/assets/outside/private.json", names)

    def test_missing_source_preserves_the_previous_archive(self):
        output = self.root.parent / "Sreon-source.zip"
        output.write_bytes(b"previous archive")
        (self.root / "app" / "index.html").unlink()
        with self.assertRaisesRegex(ValueError, "index.html"):
            packaging.package(self.root)
        self.assertEqual(output.read_bytes(), b"previous archive")

    def test_write_failure_preserves_the_previous_archive(self):
        output = self.root.parent / "Sreon-source.zip"
        output.write_bytes(b"previous archive")
        with patch.object(zipfile.ZipFile, "writestr", side_effect=OSError("disk full")):
            with self.assertRaisesRegex(OSError, "disk full"):
                packaging.package(self.root)
        self.assertEqual(output.read_bytes(), b"previous archive")
        self.assertEqual(list(self.root.parent.glob(".Sreon-source-*.zip")), [])

    def test_staged_download_has_only_builds_and_extra(self):
        self.write("integrations/client.py", "code")
        self.write("o/index.html", "legacy")
        destination = self.parent / "download"
        packaging.package(self.root)
        packaging.stage(self.root, destination)
        self.assertEqual({path.name for path in destination.iterdir()}, {"Builds", "Extra"})
        self.assertEqual((destination / "Extra/Source/integrations/client.py").read_text(), "code")
        self.assertEqual((destination / "Extra/HOW-IT-WORKS.md").read_text(), "guide")
        self.assertFalse((destination / "Extra/Source/o").exists())
        self.assertEqual(list((destination / "Builds").iterdir()), [])

    def test_archive_is_reproducible_and_does_not_include_itself(self):
        self.write("o/index.html", "protected source")
        first = packaging.package(self.root).read_bytes()
        second = packaging.package(self.root).read_bytes()
        self.assertEqual(first, second)
        with zipfile.ZipFile(self.root.parent / "Sreon-source.zip") as archive:
            self.assertNotIn("Sreon/Extra/Source/o/index.html", archive.namelist())
            self.assertIn("Sreon/Builds/", archive.namelist())
            self.assertIn("Sreon/Extra/HOW-IT-WORKS.md", archive.namelist())
            self.assertFalse(any(name.endswith(".zip") for name in archive.namelist()))


if __name__ == "__main__":
    unittest.main()
