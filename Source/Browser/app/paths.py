import os
import sys
from pathlib import Path

ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
ASSETS = ROOT / "assets"

def data_dir():
    override = os.environ.get("SREON_DATA")
    if override:
        path = Path(override)
        path.mkdir(parents=True, exist_ok=True)
        return path
    home = Path.home()
    if sys.platform == "darwin":
        path = home / "Library" / "Application Support" / "Sreon"
    elif sys.platform == "win32":
        path = Path(os.environ.get("APPDATA", home / "AppData" / "Roaming")) / "Sreon"
    else:
        path = Path(os.environ.get("XDG_DATA_HOME", home / ".local" / "share")) / "sreon"
    path.mkdir(parents=True, exist_ok=True)
    return path

def engine_binary():
    name = "sreon-api.exe" if sys.platform == "win32" else "sreon-api"
    env = os.environ.get("SREON_API")
    if env:
        path = Path(env)
        if path.is_file():
            return path
    for item in (
        ROOT / "engine" / name,
        Path(__file__).resolve().parents[1] / "engine" / name,
        Path(__file__).resolve().parents[1] / "search" / "target" / "release" / name,
        Path(__file__).resolve().parents[2] / "Source" / "src-tauri" / "target" / "release" / name,
    ):
        if item.is_file():
            return item
    return ROOT / "engine" / name
