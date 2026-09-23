import importlib.util
import os
from pathlib import Path
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("app_source", ROOT / "Extra/Source/scripts/package-source.py")
app_source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app_source)


def package(root=ROOT):
    root = Path(root).resolve()
    paths = [root / name for name in ["index.html", "CNAME", ".dockerignore", "Extra/HOW-IT-WORKS.md", ".github/workflows/website.yml"]]
    for directory, folders, files in os.walk(root / "site", followlinks=False):
        parent = Path(directory)
        folders[:] = sorted(name for name in folders if name not in app_source.BLOCKED and not name.startswith(".") and not (parent / name).is_symlink())
        for name in sorted(files):
            path = parent / name
            if path.is_file() and not path.is_symlink() and not name.startswith(".") and not app_source.PRIVATE_NAMES.match(name) and (path.suffix.lower() in app_source.EXTENSIONS or name == "Dockerfile"):
                paths.append(path)
    paths.extend(app_source.source_files(root / "Extra/Source"))
    required = {"site/server.mjs", "site/start.mjs", "site/backend.mjs", "site/notes/index.html", "site/assets/modules/module-07.js", "Extra/Source/src-tauri/src/api.rs"}
    required.update("Extra/Source/" + name for name in app_source.REQUIRED)
    missing = required - {path.relative_to(root).as_posix() for path in paths}
    if missing:
        raise ValueError("Missing website source: " + ", ".join(sorted(missing)))
    output = root / "Extra/Sreon-website.zip"
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=output.parent, prefix=".Sreon-website-", suffix=".zip", delete=False) as handle:
            temporary = Path(handle.name)
        with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for path in sorted(set(paths)):
                if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(root):
                    raise ValueError("Unsafe or missing source file")
                info = zipfile.ZipInfo("Sreon-website/" + path.relative_to(root).as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, path.read_bytes())
        temporary.chmod(0o644)
        os.replace(temporary, output)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return output


if __name__ == "__main__":
    print(package())
