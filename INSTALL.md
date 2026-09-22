# Sreon — the final folder, everything inside

    INSTALL.md                     this file
    Source/Browser/                desktop browser source + installer builders
    Source/Source/app/             the website — try Sreon in the browser, for real
    Source/HOW-IT-WORKS.md         how everything works
    .github/workflows/browser.yml  CI: builds, launch-verifies, bundles, releases

## Get the compiled installers (about 1 GB)

    https://github.com/FellowPythonCoder/All-Code/releases/tag/v0.5.0

The release asset `Sreon.zip` contains every compiled installer plus this
source tree. CI verified each platform before publishing: the frozen app
is launched and must open its window cleanly, and the macOS PKG is
test-installed into /Applications on the runner.

| System | File | How |
| --- | --- | --- |
| Windows 10/11 x64 | `Windows/Sreon-Setup.exe` | Run the wizard. Sreon appears in the Start Menu. |
| macOS 11+ | `macOS/Sreon.dmg` | Open, drag Sreon onto Applications. |
| macOS 11+ | `macOS/Sreon-Installer.pkg` | Double-click; lands in /Applications. |
| Linux x86-64 | `Linux/Sreon-linux.deb` | `sudo apt install ./Sreon-linux.deb` |
| Linux x86-64 | `Linux/Sreon-linux.tar.gz` | Unpack and run `./Sreon`. |

Gatekeeper/SmartScreen may ask for a confirmation because the builds are
not signed/notarized.

## Try Sreon in the browser — it works for real

Open `Source/Source/app/index.html` (double-click, or serve the folder):

    cd Source/Source/app && python3 -m http.server 8080

With no server, no keys, and no install, the page really searches:

- All → live results from the Wikipedia API
- Images / Photos → the Wikimedia Commons library (Photos filters to JPEG)
- Videos → Commons video files
- Pagination via API continuation cursors; author + licence credits on
  every media card; every result notice names its live source
- Clicking a result opens the real website in a new tab

The installed desktop app keeps using its own Rust engine inside the same
interface; the in-browser runtime uses the sources browsers are allowed
to reach (CORS-open APIs).

## Build and verify yourself

Desktop app:

    cd Source/Browser
    python -m venv .venv
    .venv/bin/pip install -r requirements.txt
    .venv/bin/python -m pytest tests
    .venv/bin/python tools/build.py           # engine + app + installers
    .venv/bin/python tools/build.py verify    # launches the app to prove it opens

Website:

    cd Source/Source && npm ci && npm test    # 33 tests incl. DOM end-to-end
