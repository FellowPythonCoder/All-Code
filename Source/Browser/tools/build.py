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
    import plistlib
    info = bundled_app() / "Contents" / "Info.plist"
    if not info.is_file():
        raise SystemExit("Sreon.app Info.plist missing")
    with info.open("rb") as handle:
        data = plistlib.load(handle)
    data["LSMinimumSystemVersion"] = "11.0"
    data["NSHighResolutionCapable"] = True
    data["CFBundleDisplayName"] = "Sreon"
    data["LSApplicationCategoryType"] = "public.app-category.productivity"
    data.setdefault("CFBundleShortVersionString", VERSION)
    with info.open("wb") as handle:
        plistlib.dump(data, handle)
    print("bundle metadata updated", info, flush=True)

def bundled_app():
    app = ROOT / "dist" / "Sreon.app"
    if app.exists():
        return app
    nested = ROOT / "dist" / "Sreon" / "Sreon.app"
    if nested.exists():
        return nested
    raise SystemExit("Sreon.app was not built")

def dmg():
    run(["bash", str(ROOT / "packaging" / "mac" / "make_dmg.sh")])

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
        binary = bundled_app() / "Contents" / "MacOS" / "Sreon"
        label = "macOS app bundle"
    elif sys.platform.startswith("linux"):
        binary = ROOT / "dist" / "Sreon" / "Sreon"
        label = "Linux build"
    else:
        binary = ROOT / "dist" / "Sreon" / "Sreon.exe"
        label = "Windows build"
    if not binary.is_file():
        raise SystemExit(f"verify: {binary} missing")
    print("verifying", label, ":", binary, flush=True)

    def attempt(extra_env):
        env = dict(os.environ)
        env.update(extra_env)
        env["SREON_DATA"] = str(Path(env.get("HOME", "/tmp")) / "sreon-verify-data")
        env["SREON_VERIFY"] = "1"
        env.setdefault("QTWEBENGINE_DISABLE_SANDBOX", "1")
        env.setdefault("QTWEBENGINE_CHROMIUM_FLAGS", "--no-sandbox --disable-gpu")
        launch = subprocess.Popen(
            [str(binary), "--verify-launch"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env,
        )
        try:
            out, _ = launch.communicate(timeout=120)
            code = launch.returncode
        except subprocess.TimeoutExpired:
            launch.kill()
            out, _ = launch.communicate()
            code = "timeout"
        return code, out

    code, out = attempt({})
    if code != 0:
        print("native launch failed, retrying offscreen for diagnosis", flush=True)
        for line in out.strip().splitlines()[-15:]:
            print("::error::launch output: " + line[:230], flush=True)
        code, out = attempt({"QT_QPA_PLATFORM": "offscreen"})
    for line in out.strip().splitlines()[-8:]:
        print("launch:", line[:230], flush=True)
    if code != 0:
        for line in out.strip().splitlines()[-15:]:
            print("::error::offscreen output: " + line[:230], flush=True)
        raise SystemExit(f"verify: app failed to open (status {code})")
    print("verify: app opened and exited cleanly", flush=True)

def main():
    args = sys.argv[1:]
    if "verify" in args:
        verify()
        return
    if "--skip-engine" in args:
        args = ["freeze", "finish"]
    if not args:
        args = ["engine", "freeze", "finish"]
    for mode in args:
        if mode == "engine":
            run(["cargo", "build", "--release", "--manifest-path", str(ROOT / "search" / "Cargo.toml"), "--bin", "sreon-api"])
            place_engine()
        elif mode == "freeze":
            pyinstaller()
        elif mode == "finish":
            if sys.platform == "darwin":
                dmg()
                pkg()
            elif sys.platform.startswith("linux"):
                linux_tar()
                linux_deb()

if __name__ == "__main__":
    main()
