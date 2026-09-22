import argparse
import os
import shutil
from pathlib import Path
import re
import tempfile
import zipfile

FOLDERS = {"app", "src-tauri", "integrations", "scripts", "tests"}
FILES = {"package.json", "package-lock.json", "playwright.config.js", "sreon.sh"}
BLOCKED = {"node_modules", "target", "dist", "build", "out", "gen", "artifacts", "__pycache__", "test-results", "playwright-report"}
EXTENSIONS = {".rs", ".toml", ".lock", ".json", ".js", ".mjs", ".py", ".html", ".css", ".yml", ".yaml", ".sh", ".md", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".icns", ".woff", ".woff2"}
PRIVATE_NAMES = re.compile(r"^(credentials|secrets?|tokens?|api[-_]keys?|signing[-_]keys?)([._-]|$)", re.IGNORECASE)
REQUIRED = {"app/index.html", "src-tauri/Cargo.toml", "src-tauri/src/lib.rs", "src-tauri/tauri.conf.json"}


def source_files(root):
    paths = [root / name for name in FILES if (root / name).is_file() and not (root / name).is_symlink()]
    for folder in sorted(FOLDERS):
        directory = root / folder
        if directory.is_symlink() or not directory.is_dir() or not directory.resolve().is_relative_to(root):
            continue
        for base, directories, files in os.walk(directory, followlinks=False):
            directories[:] = sorted(name for name in directories if not name.startswith(".") and name not in BLOCKED and not (Path(base) / name).is_symlink() and (Path(base) / name).resolve().is_relative_to(root))
            for name in sorted(files):
                path = Path(base) / name
                if path.is_symlink() or name.startswith(".") or path.suffix.lower() not in EXTENSIONS:
                    continue
                if path.suffix.lower() in {".json", ".yaml", ".yml", ".toml"} and PRIVATE_NAMES.match(name):
                    continue
                paths.append(path)
    return sorted(paths, key=lambda path: path.relative_to(root).as_posix())


def package(root):
    root = Path(root).resolve()
    paths = source_files(root)
    missing = REQUIRED - {path.relative_to(root).as_posix() for path in paths}
    if missing:
        raise ValueError("Source archive is missing required files: " + ", ".join(sorted(missing)))
    guide = root.parent / "HOW-IT-WORKS.md"
    if not guide.is_file() or guide.is_symlink():
        raise ValueError("Source archive is missing Extra/HOW-IT-WORKS.md")
    output = root.parent / "Sreon-source.zip"
    with tempfile.NamedTemporaryFile(prefix=".Sreon-source-", suffix=".zip", dir=root.parent, delete=False) as temporary:
        temporary_path = Path(temporary.name)
    try:
        with zipfile.ZipFile(temporary_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            builds = zipfile.ZipInfo("Sreon/Builds/", date_time=(2026, 1, 1, 0, 0, 0))
            builds.external_attr = (0o40755 << 16) | 0x10
            archive.writestr(builds, b"")
            members = [(source, "Sreon/Extra/Source/" + source.relative_to(root).as_posix()) for source in paths]
            members.append((guide, "Sreon/Extra/HOW-IT-WORKS.md"))
            for source, name in members:
                info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                info.external_attr = (source.stat().st_mode & 0xffff) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, source.read_bytes())
        temporary_path.chmod(0o644)
        os.replace(temporary_path, output)
    finally:
        temporary_path.unlink(missing_ok=True)
    return output


def stage(root, destination):
    root = Path(root).resolve()
    destination = Path(destination).resolve()
    (destination / "Builds").mkdir(parents=True, exist_ok=True)
    for source in source_files(root):
        target = destination / "Extra" / "Source" / source.relative_to(root)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    shutil.copy2(root.parent / "HOW-IT-WORKS.md", destination / "Extra" / "HOW-IT-WORKS.md")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", type=Path)
    arguments = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    print(package(root))
    if arguments.stage:
        stage(root, arguments.stage)
