import os
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.5.0"

def engine_name():
    return "sreon-api.exe" if sys.platform == "win32" else "sreon-api"

def find_engine():
    name = engine_name()
    for path in (
        ROOT / "engine" / name,
        ROOT / "search" / "target" / "release" / name,
        ROOT.parent / "Source" / "src-tauri" / "target" / "release" / name,
    ):
        print("engine candidate", path, path.is_file(), flush=True)
        if path.is_file():
            return path
    return None

def place_engine():
    dest = ROOT / "engine"
    dest.mkdir(exist_ok=True)
    built = find_engine()
    if built is None:
        raise SystemExit("search engine binary missing")
    target = dest / engine_name()
    if built.resolve() != target.resolve():
        shutil.copy2(built, target)
    if sys.platform != "win32":
        os.chmod(target, 0o755)
    print("engine ready", target, flush=True)

def run(command):
    print("+", *command, flush=True)
    log = ROOT / "freeze.log"
    with log.open("a", encoding="utf-8") as handle:
        handle.write(" ".join(map(str, command)) + "\n")
        process = subprocess.run(command, stdout=handle, stderr=subprocess.STDOUT, text=True)
    text = log.read_text(encoding="utf-8", errors="replace")
    print(text[-4000:], flush=True)
    if process.returncode:
        snippet = text[-2000:].replace("\r", " ").replace("%", "/")
        print("::error::" + snippet[:3900], flush=True)
        raise SystemExit(process.returncode)

def pyinstaller():
    os.chdir(ROOT)
    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    sep = ";" if sys.platform == "win32" else ":"
    command = [
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--windowed", "--name", "Sreon",
        "--hidden-import", "PySide6.QtCore",
        "--hidden-import", "PySide6.QtGui",
        "--hidden-import", "PySide6.QtWidgets",
        "--hidden-import", "PySide6.QtNetwork",
        "--hidden-import", "PySide6.QtWebEngineCore",
        "--hidden-import", "PySide6.QtWebEngineWidgets",
        "--hidden-import", "PySide6.QtWebChannel",
        "--hidden-import", "PySide6.QtPrintSupport",
        "--hidden-import", "PySide6.QtTextToSpeech",
        "--hidden-import", "shiboken6",
        "--hidden-import", "cryptography",
        "--add-data", f"assets{sep}assets",
        "--add-data", f"engine{sep}engine",
        "--exclude-module", "tkinter",
        "--exclude-module", "matplotlib",
        "--exclude-module", "numpy",
        "app/main.py",
    ]
    if sys.platform == "darwin":
        icns = ROOT / "assets" / "icon.icns"
        if icns.is_file():
            command.extend(["--icon", str(icns), "--osx-bundle-identifier", "com.sreon.browser"])
    elif sys.platform == "win32":
        ico = ROOT / "assets" / "icon.ico"
        if ico.is_file():
            command.extend(["--icon", str(ico)])
    run(command)
    if sys.platform == "darwin":
        fix_bundle()

def fix_bundle():
    info = bundled_app() / "Contents" / "Info.plist"
    if not info.is_file():
        raise SystemExit("Sreon.app Info.plist missing")
    for entry, kind, value in (
        (":LSMinimumSystemVersion", "string", "11.0"),
        (":NSHighResolutionCapable", "bool", "true"),
        (":CFBundleDisplayName", "string", "Sreon"),
        (":LSApplicationCategoryType", "string", "public.app-category.productivity"),
    ):
        run(["/bin/bash", "-c", f'/usr/libexec/PlistBuddy -c "Set {entry} {value}" "{info}" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add {entry} {kind} {value}" "{info}"'])

def bundled_app():
    app = ROOT / "dist" / "Sreon.app"
    if app.exists():
        return app
    nested = ROOT / "dist" / "Sreon" / "Sreon.app"
    if nested.exists():
        return nested
    raise SystemExit("Sreon.app was not built")

def dmg():
    app = bundled_app()
    stage = ROOT / "dist" / "dmg"
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    shutil.copytree(app, stage / "Sreon.app", symlinks=True)
    (stage / "Applications").symlink_to("/Applications", target_is_directory=True)
    background = stage / ".background"
    background.mkdir()
    shutil.copy2(ROOT / "packaging" / "mac" / "background.png", background / "background.png")
    dmg_path = ROOT / "dist" / "Sreon.dmg"
    if dmg_path.exists():
        dmg_path.unlink()
    run(["hdiutil", "create", "-volname", "Sreon", "-srcfolder", str(stage), "-ov", "-format", "UDZO", str(dmg_path)])

def pkg():
    run(["bash", str(ROOT / "packaging" / "mac" / "make_pkg.sh")])

def linux_tar():
    source = ROOT / "dist" / "Sreon"
    if not source.exists():
        raise SystemExit("Linux app folder was not built")
    archive = ROOT / "dist" / "Sreon-linux.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        tar.add(source, arcname="Sreon")

def linux_deb():
    run(["bash", str(ROOT / "packaging" / "linux" / "make_deb.sh")])

def verify():
    print("== verifying Sreon build ==", flush=True)
    if sys.platform == "darwin":
        app = bundled_app()
        binary = app / "Contents" / "MacOS" / "Sreon"
        if not binary.is_file():
            raise SystemExit("verify: app bundle has no executable")
        print("bundle:", app, flush=True)
        print("binary:", binary, flush=True)
        env = dict(os.environ)
        home = Path(env.get("HOME", "/tmp"))
        env["SREON_DATA"] = str(home / "Library" / "Application Support" / "SreonVerify")
        if env.get("SREON_VERIFY_OFFSCREEN"):
            env["QT_QPA_PLATFORM"] = "offscreen"
        launch = subprocess.Popen(
            [str(binary), "--verify-launch"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env,
        )
        try:
            out, _ = launch.communicate(timeout=90)
        except subprocess.TimeoutExpired:
            launch.kill()
            out, _ = launch.communicate()
            print(out[-2000:], flush=True)
            raise SystemExit("verify: app did not exit on its own")
        print(out[-2000:], flush=True)
        if launch.returncode != 0:
            raise SystemExit(f"verify: app exited with {launch.returncode}")
        print("verify: app opened and exited cleanly", flush=True)
    elif sys.platform.startswith("linux"):
        exe = ROOT / "dist" / "Sreon" / "Sreon"
        if not exe.is_file():
            raise SystemExit("verify: dist/Sreon/Sreon missing")
        env = dict(os.environ)
        env["SREON_DATA"] = "/tmp/sreon-verify"
        env["QT_QPA_PLATFORM"] = "offscreen"
        launch = subprocess.Popen([str(exe), "--verify-launch"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
        try:
            out, _ = launch.communicate(timeout=60)
        except subprocess.TimeoutExpired:
            launch.kill()
            out, _ = launch.communicate()
        print(out[-2000:], flush=True)
        if launch.returncode != 0:
            raise SystemExit(f"verify: app exited with {launch.returncode}")
        print("verify: app opened and exited cleanly", flush=True)
    else:
        exe = ROOT / "dist" / "Sreon" / "Sreon.exe"
        if not exe.is_file():
            raise SystemExit("verify: dist/Sreon/Sreon.exe missing")
        env = dict(os.environ)
        env["SREON_DATA"] = str(ROOT / "dist" / "verify-data")
        launch = subprocess.Popen([str(exe), "--verify-launch"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
        try:
            out, _ = launch.communicate(timeout=60)
        except subprocess.TimeoutExpired:
            launch.kill()
            out, _ = launch.communicate()
        print(out[-2000:], flush=True)
        if launch.returncode != 0:
            raise SystemExit(f"verify: app exited with {launch.returncode}")
        print("verify: app opened and exited cleanly", flush=True)

def main():
    args = sys.argv[1:]
    if "verify" in args:
        verify()
        return
    skip = "--skip-engine" in args
    if not skip:
        run(["cargo", "build", "--release", "--manifest-path", str(ROOT / "search" / "Cargo.toml"), "--bin", "sreon-api"])
    place_engine()
    pyinstaller()
    if sys.platform == "darwin":
        dmg()
        pkg()
    elif sys.platform.startswith("linux"):
        linux_tar()
        linux_deb()

if __name__ == "__main__":
    main()
