# How Sreon works

Sreon Browser is a real desktop browser. The window, tabs, and downloads are native. Pages run in Qt WebEngine (Chromium), the same engine family other serious embedded browsers use: a small UI process and sandboxed renderer processes. It is not a website wrapper and not Electron.

The start page keeps the original Sreon mark and the line **Search privately. Browse freely.** Type `youtube.com` to open YouTube. Type `YouTube` to search the existing Sreon Rust engine. Result clicks open the real site in a tab. There is no Sreon account, no telemetry, and no extra AI, games, VPN, or ad blocker in the desktop app. Things that are not built, and why, are listed in `unable.txt`.

## Install

Download the one folder: [Sreon.zip](https://github.com/FellowPythonCoder/Sreon-Browser/releases/download/sreon-preview/Sreon.zip). It contains Windows, macOS, Linux double-click apps, this guide, `unable.txt`, website code, and source. GitHub may require sign-in. Builds are also on [Sreon Browser](https://github.com/FellowPythonCoder/Sreon-Browser/actions/workflows/browser.yml).

| System | In the folder | Install |
| --- | --- | --- |
| Windows 10/11, x64 | `Windows/Sreon-Setup.exe` | Run the setup wizard and follow the steps. Sreon appears in the Start Menu, and optionally on the desktop. SmartScreen may warn because the build is not publisher-signed. |
| macOS 11+ | `macOS/Sreon.dmg` and `macOS/Sreon-Installer.pkg` | DMG: open it and drag Sreon to Applications. PKG: double-click and the macOS Installer puts Sreon in Applications. Gatekeeper may warn because the build is not notarized. |
| Linux x86-64 | `Linux/Sreon-linux.deb` and `Sreon-linux.tar.gz` |deb: double-click or `sudo apt install ./Sreon-linux.deb` — Sreon is added to the applications menu. tar.gz: unpack and run `./Sreon`. |

Internet is required for websites and live search. The app does not phone home to Sreon. Search queries go to the public sources used by the Rust engine only when you search. Website visits are ordinary HTTPS to that site.

### Run from source on a Mac

Install Xcode command-line tools, [Rust](https://rustup.rs), and Python 3.12+. In Terminal, from the repository or the `Source` folder:

```sh
cd Browser
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python tools/build.py
.venv/bin/python -m app
```

`tools/build.py` compiles the search engine and can also freeze a .app. For day-to-day work you only need the last line after the engine exists at `Browser/engine/sreon-api`.

Windows and Linux are the same idea: install Rust and Python, then `python tools/build.py` or `python -m app` from `Browser`.

## Search and visit sites

- Enter `youtube.com` or `https://youtube.com` to visit the website directly.
- Enter `YouTube`, `YouTube videos`, or another phrase to get normal web search results.
- Use **Shift-Return** to search a domain as text instead of visiting it.
- Result links open inside the same app window, below the address bar, not in a new window or iframe.
- **Back to results** returns to the retained search. **Forward to website** restores the page. Reload refreshes the visible site. Native Navigate menu commands support website history.
- **Command-L / Control-L** focuses the address field. Click the Sreon start-page logo to clear the current search. The moon/sun button toggles dark mode.

## Search categories and overview

**All** searches normal websites. The primary source is Bing's public RSS search endpoint; DuckDuckGo's public HTML search is a secondary source. The app never substitutes Wikipedia-only results when web search fails. If both sources are unavailable, an error and retry button appear. This is an online-source adapter, not a new independently crawled Sreon index. It does not bypass CAPTCHA or guarantee source availability.

**Images** searches Wikimedia Commons for bitmap images. **Photos** narrows that library to JPEG files, a practical format filter rather than a guarantee that every result is a photograph. These are explicitly labeled Commons library results, not a full-web image index. Cards show available author/license credits and open the original file's description page for complete attribution and reuse terms.

**Videos** searches web video pages, currently focusing on YouTube, Vimeo, and Dailymotion. YouTube results can show thumbnails. Opening a video loads its original website in the same app window. Availability depends on the upstream web index; Sreon does not download or rehost video files.

**Search overview** displays excerpts from up to three top web results with clickable sources. It is not an AI-generated answer, an independently verified fact summary, or an encyclopedia fallback. It makes no extra model/API request and adds no AI account or charge.

Pagination appears only when the source supplies a supported continuation cursor. The RSS source currently returns one batch; Sreon does not invent further pages. There are no pretend news/date/language filters that the underlying source cannot reliably honor.

## Performance, privacy, and security

The compiled Rust core reuses HTTPS connections, applies bounded timeouts and response sizes, normalizes results, excludes identifiable ads, deduplicates links, and unwraps provider redirect wrappers. Search results and source overviews are returned together; image thumbnails load lazily. New desktop searches cancel earlier native requests. Up to 32 query/category/page responses are cached in process memory for two minutes, making repeated searches avoid a network round trip. No absolute speed claim or benchmark is implied.

Only the theme is saved locally by Sreon. Query/cache data is temporary memory, not a Sreon disk-history database. Going home clears the visible result state; the short-lived engine cache remains until expiry/process exit. Queries and your IP go to the active search sources. Media tabs also contact Commons and thumbnail hosts (`upload.wikimedia.org`, `thumb.wikimedia.org`, `i.ytimg.com`). Website navigation creates normal traffic to the visited website. Sreon adds no telemetry, is not a VPN, and does not hide traffic from providers or your network.

A local webview renders the controls; a separate, unprivileged child webview renders websites inside the same native window. Only the local **main webview**, not every view sharing its window, can invoke native commands. Remote views have no IPC permissions. Search result markup is rendered as text, not executable HTML. Website views use incognito mode and public HTTP(S) navigation restrictions. Private literal addresses are blocked, but this is not a complete DNS-rebinding defense. System caches/crash reporting are outside the application's storage guarantees. Pop-up windows are blocked.

## Delivery folder

A complete browser download is one `Sreon/` folder:

```text
Sreon/
  Windows/          Sreon-Setup.exe
  macOS/            Sreon.dmg and Sreon-Installer.pkg
  Linux/            Sreon-linux.deb and Sreon-linux.tar.gz
  Source/Browser/   desktop browser source
  Website/          website and hidden workspace
  HOW-IT-WORKS.md
  unable.txt
```

Generated installers are not committed to Git. The website still has no in-page download buttons.

The desktop app lives under `Browser/`. It is a Qt WebEngine shell plus the Rust search crate in `Browser/search/`. It does not wrap `index.html`. The older Tauri project under `Extra/Source` remains the website’s search helper source; do not treat that old single-webview app as this browser.

New application code has no explanatory comments. Instructions and omitted-feature notes are this file and `unable.txt`.

## Build the browser

Install Python 3.12+, stable Rust 1.85+, and a C toolchain (Xcode CLT on Mac, Visual Studio C++ on Windows, gcc on Linux). From the repository:

```sh
cd Browser
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest tests
.venv/bin/python tools/build.py
```

`tools/build.py` compiles `sreon-api`, copies it to `engine/`, and freezes the desktop app with PyInstaller. On a Mac it also writes `dist/Sreon.dmg` and `dist/Sreon-Installer.pkg`. On Linux it writes `dist/Sreon-linux.tar.gz` and `dist/Sreon-linux.deb`. GitHub Actions attaches the installers to releases. `python tools/build.py verify` launches the frozen app and proves it opens.

The website is separate and is not required to use the installed browser.

## Integrate into another application

The desktop packages contain `Extra/API/sreon-api` (Mac/Linux) or `Extra/API/sreon-api.exe` (Windows). This is a command-line helper, not the graphical application. Another program starts it as a subprocess, writes one JSON request per line to standard input, and reads one JSON response per line from standard output. There is **no listening HTTP server or domain to configure**. Keep it running to reuse connections/cache. Requests are processed sequentially; callers should avoid large queues.

From `Extra/Source`, build just the helper without desktop dependencies:

```sh
cargo build --manifest-path src-tauri/Cargo.toml --release --no-default-features --features api --bin sreon-api
```

Protocol version 1, method `search`, categories `web`, `images`, `photos`, `videos`. A query is 1–500 characters. The entire request must fit in 16 KiB. `cursor` is null initially; pass `nextCursor` back unchanged for another page. Request IDs are echoed for valid requests.

```json
{"id":1,"method":"search","params":{"q":"YouTube","category":"web","cursor":null}}
```

Success has `version`, `id`, and `result`; result contains `results`, `overview`, `nextCursor`, `notice`, `elapsed`, and `cached`. Each result has `title`, `url`, `content`, `thumbnail`, and `credit`. Error responses have `error: {status, code, message}` instead. Malformed/oversized requests return `id: null`. Standard output is reserved for protocol responses; diagnostics go to standard error. This is not a publicly deployed REST API. If exposing it through your own server, add authentication, rate limits, request limits, and your own origin policy.

Python, with `integrations/` on the Python import path:

```python
from sreon import Sreon

with Sreon("/path/to/sreon-api") as engine:
    result = engine.search("YouTube")
    for item in result["results"]:
        print(item["title"], item["url"])
```

Node.js:

```js
import { Sreon } from "./integrations/sreon.mjs";

const engine = new Sreon("/path/to/sreon-api");
try {
  const result = await engine.search("forests", "images");
  console.log(result.results);
} finally {
  engine.close();
}
```

After extracting a Mac/Linux artifact, run `chmod +x Extra/API/sreon-api` from the download folder before using the helper. On Windows, use the path to `sreon-api.exe`. Do not launch the graphical Sreon EXE as the API helper. Python/Node are needed only by these example clients, not by the installed desktop app or compiled helper. Rust applications can instead depend on package `sreon` at `src-tauri/` with `default-features = false` and call `sreon_core::search::Engine::new()?.search(SearchRequest { ... }).await` directly.

The supplied clients serialize requests. Node allows at most 32 pending requests; Python serializes callers with a lock. Each active request has a 20-second default timeout, including pipe I/O. Set `timeoutMs` in the Node constructor or `timeout` (seconds) in the Python constructor to change it. Both clients limit request frames to 16 KiB and responses to 4 MiB, check protocol version/IDs, and stop the helper after a timeout or broken protocol. Create a new client after a fatal error. Ordinary search errors reject the current request without disconnecting the client. Closing twice is safe; Python close waits for an active request to finish or time out. Optional constructor `args` can be used with a wrapper executable.

## Website and hidden workspace

The full repository also contains a separate website at `index.html`, with styling, scripts, and compressed images under `site/assets/`. These files are not included in desktop app packages. No app download links have been added to the redesigned website.

The colon in `sreon://privacy` is the only public navigation link to the notes area at `site/notes/`. The previous `games/` folder is now `site/assets/modules/`, with neutral module filenames. The old `/o/` and `/games/` paths are not served by the included server. Renaming paths and adding noindex metadata makes the area less obvious; it is not authentication, encryption, or access control. Public source history and browser developer tools can reveal it. Do not store private information there.

The hidden workspace includes 24 games and an optional bring-your-own-key AI chat. Geometry Rush has ten seeded levels with cube, spaceship, and wave sections, safe square platforms, buffered jumps, and more generous spacing. Space/click/tap jumps; hold repeats jumps or flies upward. Arrow keys select a level; Enter starts it. Press `4` during play to toggle assisted autoplay, or use its on-screen button. Completed assisted runs are marked and do not earn manual-run points. The Endless button or `i` on the selection screen starts an endless run. Its speed and corridor difficulty increase toward bounded limits; obstacle clusters have at most three spikes and retain tested jump clearances. This avoids simply accelerating into mathematically impossible obstacles. Automated tests complete every finite level with ordinary controls and collisions enabled, and check sampled endless sectors; they are not a claim of exhaustive human playtesting of every possible sequence.

AI chat calls the configured Gemini model directly only after Send. It requires the visitor’s own valid API key and may incur provider charges. Keys stay in memory by default; “Remember for this tab” opts into session storage. Forget removes the key. A key previously saved by the old page is moved out of persistent storage into memory. Chat history stays in memory; Clear chat removes it from the page. Messages and optional text attachments go to the provider, whose policies also apply. Attachments are limited to 128 KiB, requests to 512 KiB, and the conversation context to the most recent 20 messages. Replies are rendered as text with safe code blocks; they are not executed. Stop cancels waiting on the browser side but cannot guarantee the provider stops processing or charging for an already submitted request. No AI responses or paid API calls were used in the automated UI tests.

### Run the actual website search engine

The website does not fake results or replace the engine. Browser requests go to `POST /api/search`; `site/server.mjs` uses the existing Node integration client to communicate with the compiled Rust `sreon-api` process. Queries are forwarded to the same search core used by the app. The server is required only for the website demo, never for installed desktop apps.

From the repository root, with Node 22 and Rust installed:

```sh
node site/start.mjs
```

The launcher automatically builds the Rust API when its default executable is missing or older than the Rust sources, checks its actual JSON-lines response, and only then starts the website. Use `node site/start.mjs --rebuild` to force a rebuild. A working precompiled helper selected with `SREON_API` does not require a local Rust compiler. `node site/server.mjs` alone is now only the low-level interface/test server; it does not build the engine. The website listens on all interfaces on port 3000. Set `PORT` to change it. `SREON_API` can point to another compiled helper; otherwise the server uses the release binary at the path above, adding `.exe` on Windows. It does not need an upstream search API key. `GET /api/health` verifies the compiled backend’s local input-validation response without contacting search providers; a healthy process does not guarantee upstream internet access. The Try panel displays connection status and distinguishes a missing backend from an unreachable search source. If the helper or provider is unavailable, search returns an explicit error rather than invented results. The full container starts through the same verified launcher and includes a readiness healthcheck.

Alternatively, build and run the complete website plus Rust engine as a container from the full repository or website archive:

```sh
docker build -f site/Dockerfile -t sreon-website .
docker run --rm -p 3000:3000 sreon-website
```

For public use, deploy this container behind HTTPS. The shipped API validates methods, origins, query/body size, concurrency, and per-connection-IP request rate. It does not log queries. It deliberately does not trust forwarded IP headers; behind a reverse proxy, visitors may share its limit. Configure visitor-aware rate limiting at your trusted edge before scaling. This is a public search endpoint, not an authenticated private API.

**GitHub Pages cannot run the Rust process or this Node adapter.** Static files alone do not make live search work. Either host the complete container for the website, or host the API separately over HTTPS and change the `sreon-search-endpoint` meta tag in `index.html` to that host’s `/api/search` URL. `SREON_ALLOWED_ORIGINS` is a comma-separated exact origin allowlist and defaults to the two opensreon.com HTTPS origins. No public API hosting or DNS changes have been performed by these source changes. The existing GitHub Pages site uses `main`; changes on the working branch need review/merge before they appear there.

### Website checks and files

```sh
npm ci --prefix Extra/Source
node --test site/tests/*.test.mjs
cd Extra/Source
npx playwright install chromium
cd ../..
Extra/Source/node_modules/.bin/playwright test --config site/playwright.config.mjs
node site/tests/live-api.mjs
python3 site/package.py
```

The last API check requires a built Rust helper and verifies a real YouTube destination through the HTTP adapter. UI tests mock API and AI responses to test rendering and errors without paid provider calls. The website workflow runs the real-engine check as well. `Extra/Sreon-website.zip` contains the website, required engine source, and this guide; it is not a compiled app download. `Extra/Sreon-source.zip` remains the separate app-only source archive. Website instructions require the website archive or full repository, not the app-only ZIP.

The three editorial landscape/interior images are AI-generated illustrative assets, not photographs documenting real locations. Website fonts reuse the same DM Sans and Instrument Serif files whose original notices are retained below.

## Tests and licenses

Run these from `Extra/Source`:

```sh
npm test
npm run test:rust
npx playwright install chromium
npm run test:ui
```

Live web search check: `cargo run --manifest-path src-tauri/Cargo.toml --no-default-features --example live-search -- YouTube`. UI tests simulate IPC; they do not exercise every native website or prove physical-device compatibility.

Sreon is **AGPL-3.0-only**. Integration does not relicense the code; review AGPL obligations before embedding, distributing, or offering modified software as a network service. Preserve this document with redistributions. Corresponding source/build scripts: [FellowPythonCoder/Sreon-Browser](https://github.com/FellowPythonCoder/Sreon-Browser/tree/arena/01a0bffb-sreon-browser). CI appends dependency notices and an exact commit link to packaged copies. Dependencies and media retain their own licenses. The public search form protocol was checked against the [SearXNG adapter](https://github.com/searxng/searxng/blob/master/searx/engines/duckduckgo.py); no SearXNG server is embedded or required.

### Sreon — GNU Affero General Public License

```text
GNU AFFERO GENERAL PUBLIC LICENSE
Version 3, 19 November 2007

Copyright (C) 2007 Free Software Foundation, Inc. <http://fsf.org/>

Everyone is permitted to copy and distribute verbatim copies of this license document, but changing it is not allowed.

                            Preamble

The GNU Affero General Public License is a free, copyleft license for software and other kinds of works, specifically designed to ensure cooperation with the community in the case of network server software.

The licenses for most software and other practical works are designed to take away your freedom to share and change the works.  By contrast, our General Public Licenses are intended to guarantee your freedom to share and change all versions of a program--to make sure it remains free software for all its users.

When we speak of free software, we are referring to freedom, not price.  Our General Public Licenses are designed to make sure that you have the freedom to distribute copies of free software (and charge for them if you wish), that you receive source code or can get it if you want it, that you can change the software or use pieces of it in new free programs, and that you know you can do these things.

Developers that use our General Public Licenses protect your rights with two steps: (1) assert copyright on the software, and (2) offer you this License which gives you legal permission to copy, distribute and/or modify the software.

A secondary benefit of defending all users' freedom is that improvements made in alternate versions of the program, if they receive widespread use, become available for other developers to incorporate.  Many developers of free software are heartened and encouraged by the resulting cooperation.  However, in the case of software used on network servers, this result may fail to come about. The GNU General Public License permits making a modified version and letting the public access it on a server without ever releasing its source code to the public.

The GNU Affero General Public License is designed specifically to ensure that, in such cases, the modified source code becomes available to the community.  It requires the operator of a network server to provide the source code of the modified version running there to the users of that server.  Therefore, public use of a modified version, on a publicly accessible server, gives the public access to the source code of the modified version.

An older license, called the Affero General Public License and published by Affero, was designed to accomplish similar goals.  This is a different license, not a version of the Affero GPL, but Affero has released a new version of the Affero GPL which permits relicensing under this license.

The precise terms and conditions for copying, distribution and modification follow.

                       TERMS AND CONDITIONS

0. Definitions.

"This License" refers to version 3 of the GNU Affero General Public License.

"Copyright" also means copyright-like laws that apply to other kinds of works, such as semiconductor masks.

"The Program" refers to any copyrightable work licensed under this License.  Each licensee is addressed as "you".  "Licensees" and "recipients" may be individuals or organizations.

To "modify" a work means to copy from or adapt all or part of the work in a fashion requiring copyright permission, other than the making of an exact copy.  The resulting work is called a "modified version" of the earlier work or a work "based on" the earlier work.

A "covered work" means either the unmodified Program or a work based on the Program.

To "propagate" a work means to do anything with it that, without permission, would make you directly or secondarily liable for infringement under applicable copyright law, except executing it on a computer or modifying a private copy.  Propagation includes copying, distribution (with or without modification), making available to the public, and in some countries other activities as well.

To "convey" a work means any kind of propagation that enables other parties to make or receive copies.  Mere interaction with a user through a computer network, with no transfer of a copy, is not conveying.

An interactive user interface displays "Appropriate Legal Notices" to the extent that it includes a convenient and prominently visible feature that (1) displays an appropriate copyright notice, and (2) tells the user that there is no warranty for the work (except to the extent that warranties are provided), that licensees may convey the work under this License, and how to view a copy of this License.  If the interface presents a list of user commands or options, such as a menu, a prominent item in the list meets this criterion.

1. Source Code.
The "source code" for a work means the preferred form of the work for making modifications to it.  "Object code" means any non-source form of a work.

A "Standard Interface" means an interface that either is an official standard defined by a recognized standards body, or, in the case of interfaces specified for a particular programming language, one that is widely used among developers working in that language.

The "System Libraries" of an executable work include anything, other than the work as a whole, that (a) is included in the normal form of packaging a Major Component, but which is not part of that Major Component, and (b) serves only to enable use of the work with that Major Component, or to implement a Standard Interface for which an implementation is available to the public in source code form.  A "Major Component", in this context, means a major essential component (kernel, window system, and so on) of the specific operating system (if any) on which the executable work runs, or a compiler used to produce the work, or an object code interpreter used to run it.

The "Corresponding Source" for a work in object code form means all the source code needed to generate, install, and (for an executable work) run the object code and to modify the work, including scripts to control those activities.  However, it does not include the work's System Libraries, or general-purpose tools or generally available free programs which are used unmodified in performing those activities but which are not part of the work.  For example, Corresponding Source includes interface definition files associated with source files for the work, and the source code for shared libraries and dynamically linked subprograms that the work is specifically designed to require, such as by intimate data communication or control flow between those
subprograms and other parts of the work.

The Corresponding Source need not include anything that users can regenerate automatically from other parts of the Corresponding Source.

The Corresponding Source for a work in source code form is that same work.

2. Basic Permissions.
All rights granted under this License are granted for the term of copyright on the Program, and are irrevocable provided the stated conditions are met.  This License explicitly affirms your unlimited permission to run the unmodified Program.  The output from running a covered work is covered by this License only if the output, given its content, constitutes a covered work.  This License acknowledges your rights of fair use or other equivalent, as provided by copyright law.

You may make, run and propagate covered works that you do not convey, without conditions so long as your license otherwise remains in force.  You may convey covered works to others for the sole purpose of having them make modifications exclusively for you, or provide you with facilities for running those works, provided that you comply with the terms of this License in conveying all material for which you do not control copyright.  Those thus making or running the covered works for you must do so exclusively on your behalf, under your direction and control, on terms that prohibit them from making any copies of your copyrighted material outside their relationship with you.

Conveying under any other circumstances is permitted solely under the conditions stated below.  Sublicensing is not allowed; section 10 makes it unnecessary.

3. Protecting Users' Legal Rights From Anti-Circumvention Law.
No covered work shall be deemed part of an effective technological measure under any applicable law fulfilling obligations under article 11 of the WIPO copyright treaty adopted on 20 December 1996, or similar laws prohibiting or restricting circumvention of such measures.

When you convey a covered work, you waive any legal power to forbid circumvention of technological measures to the extent such circumvention is effected by exercising rights under this License with respect to the covered work, and you disclaim any intention to limit operation or modification of the work as a means of enforcing, against the work's users, your or third parties' legal rights to forbid circumvention of technological measures.

4. Conveying Verbatim Copies.
You may convey verbatim copies of the Program's source code as you receive it, in any medium, provided that you conspicuously and appropriately publish on each copy an appropriate copyright notice; keep intact all notices stating that this License and any non-permissive terms added in accord with section 7 apply to the code; keep intact all notices of the absence of any warranty; and give all recipients a copy of this License along with the Program.

You may charge any price or no price for each copy that you convey, and you may offer support or warranty protection for a fee.

5. Conveying Modified Source Versions.
You may convey a work based on the Program, or the modifications to produce it from the Program, in the form of source code under the terms of section 4, provided that you also meet all of these conditions:

    a) The work must carry prominent notices stating that you modified it, and giving a relevant date.

    b) The work must carry prominent notices stating that it is released under this License and any conditions added under section 7.  This requirement modifies the requirement in section 4 to "keep intact all notices".

    c) You must license the entire work, as a whole, under this License to anyone who comes into possession of a copy.  This License will therefore apply, along with any applicable section 7 additional terms, to the whole of the work, and all its parts, regardless of how they are packaged.  This License gives no permission to license the work in any other way, but it does not invalidate such permission if you have separately received it.

    d) If the work has interactive user interfaces, each must display Appropriate Legal Notices; however, if the Program has interactive interfaces that do not display Appropriate Legal Notices, your work need not make them do so.

A compilation of a covered work with other separate and independent works, which are not by their nature extensions of the covered work, and which are not combined with it such as to form a larger program, in or on a volume of a storage or distribution medium, is called an "aggregate" if the compilation and its resulting copyright are not used to limit the access or legal rights of the compilation's users beyond what the individual works permit.  Inclusion of a covered work in an aggregate does not cause this License to apply to the other parts of the aggregate.

6. Conveying Non-Source Forms.
You may convey a covered work in object code form under the terms of sections 4 and 5, provided that you also convey the machine-readable Corresponding Source under the terms of this License, in one of these ways:

    a) Convey the object code in, or embodied in, a physical product (including a physical distribution medium), accompanied by the Corresponding Source fixed on a durable physical medium customarily used for software interchange.

    b) Convey the object code in, or embodied in, a physical product (including a physical distribution medium), accompanied by a written offer, valid for at least three years and valid for as long as you offer spare parts or customer support for that product model, to give anyone who possesses the object code either (1) a copy of the Corresponding Source for all the software in the product that is covered by this License, on a durable physical medium customarily used for software interchange, for a price no more than your reasonable cost of physically performing this conveying of source, or (2) access to copy the Corresponding Source from a network server at no charge.

    c) Convey individual copies of the object code with a copy of the written offer to provide the Corresponding Source.  This alternative is allowed only occasionally and noncommercially, and only if you received the object code with such an offer, in accord with subsection 6b.

    d) Convey the object code by offering access from a designated place (gratis or for a charge), and offer equivalent access to the Corresponding Source in the same way through the same place at no further charge.  You need not require recipients to copy the Corresponding Source along with the object code.  If the place to copy the object code is a network server, the Corresponding Source may be on a different server (operated by you or a third party) that supports equivalent copying facilities, provided you maintain clear directions next to the object code saying where to find the Corresponding Source.  Regardless of what server hosts the Corresponding Source, you remain obligated to ensure that it is available for as long as needed to satisfy these requirements.

    e) Convey the object code using peer-to-peer transmission, provided you inform other peers where the object code and Corresponding Source of the work are being offered to the general public at no charge under subsection 6d.

A separable portion of the object code, whose source code is excluded from the Corresponding Source as a System Library, need not be included in conveying the object code work.

A "User Product" is either (1) a "consumer product", which means any tangible personal property which is normally used for personal, family, or household purposes, or (2) anything designed or sold for incorporation into a dwelling.  In determining whether a product is a consumer product, doubtful cases shall be resolved in favor of coverage.  For a particular product received by a particular user, "normally used" refers to a typical or common use of that class of product, regardless of the status of the particular user or of the way in which the particular user actually uses, or expects or is expected to use, the product.  A product is a consumer product regardless of whether the product has substantial commercial, industrial or non-consumer uses, unless such uses represent the only significant mode of use of the product.

"Installation Information" for a User Product means any methods, procedures, authorization keys, or other information required to install and execute modified versions of a covered work in that User Product from a modified version of its Corresponding Source.  The information must suffice to ensure that the continued functioning of the modified object code is in no case prevented or interfered with solely because modification has been made.

If you convey an object code work under this section in, or with, or specifically for use in, a User Product, and the conveying occurs as part of a transaction in which the right of possession and use of the User Product is transferred to the recipient in perpetuity or for a fixed term (regardless of how the transaction is characterized), the Corresponding Source conveyed under this section must be accompanied by the Installation Information.  But this requirement does not apply if neither you nor any third party retains the ability to install modified object code on the User Product (for example, the work has been installed in ROM).

The requirement to provide Installation Information does not include a requirement to continue to provide support service, warranty, or updates for a work that has been modified or installed by the recipient, or for the User Product in which it has been modified or installed.  Access to a network may be denied when the modification itself materially and adversely affects the operation of the network or violates the rules and protocols for communication across the network.

Corresponding Source conveyed, and Installation Information provided, in accord with this section must be in a format that is publicly documented (and with an implementation available to the public in source code form), and must require no special password or key for unpacking, reading or copying.

7. Additional Terms.
"Additional permissions" are terms that supplement the terms of this License by making exceptions from one or more of its conditions. Additional permissions that are applicable to the entire Program shall be treated as though they were included in this License, to the extent that they are valid under applicable law.  If additional permissions apply only to part of the Program, that part may be used separately under those permissions, but the entire Program remains governed by this License without regard to the additional permissions.

When you convey a copy of a covered work, you may at your option remove any additional permissions from that copy, or from any part of it.  (Additional permissions may be written to require their own removal in certain cases when you modify the work.)  You may place additional permissions on material, added by you to a covered work, for which you have or can give appropriate copyright permission.

Notwithstanding any other provision of this License, for material you add to a covered work, you may (if authorized by the copyright holders of that material) supplement the terms of this License with terms:

    a) Disclaiming warranty or limiting liability differently from the terms of sections 15 and 16 of this License; or

    b) Requiring preservation of specified reasonable legal notices or author attributions in that material or in the Appropriate Legal Notices displayed by works containing it; or

    c) Prohibiting misrepresentation of the origin of that material, or requiring that modified versions of such material be marked in reasonable ways as different from the original version; or

    d) Limiting the use for publicity purposes of names of licensors or authors of the material; or

    e) Declining to grant rights under trademark law for use of some trade names, trademarks, or service marks; or

    f) Requiring indemnification of licensors and authors of that material by anyone who conveys the material (or modified versions of it) with contractual assumptions of liability to the recipient, for any liability that these contractual assumptions directly impose on those licensors and authors.

All other non-permissive additional terms are considered "further restrictions" within the meaning of section 10.  If the Program as you received it, or any part of it, contains a notice stating that it is governed by this License along with a term that is a further restriction, you may remove that term.  If a license document contains a further restriction but permits relicensing or conveying under this License, you may add to a covered work material governed by the terms of that license document, provided that the further restriction does not survive such relicensing or conveying.

If you add terms to a covered work in accord with this section, you must place, in the relevant source files, a statement of the additional terms that apply to those files, or a notice indicating where to find the applicable terms.

Additional terms, permissive or non-permissive, may be stated in the form of a separately written license, or stated as exceptions; the above requirements apply either way.

8. Termination.

You may not propagate or modify a covered work except as expressly provided under this License.  Any attempt otherwise to propagate or modify it is void, and will automatically terminate your rights under this License (including any patent licenses granted under the third paragraph of section 11).

However, if you cease all violation of this License, then your license from a particular copyright holder is reinstated (a) provisionally, unless and until the copyright holder explicitly and finally terminates your license, and (b) permanently, if the copyright holder fails to notify you of the violation by some reasonable means prior to 60 days after the cessation.

Moreover, your license from a particular copyright holder is reinstated permanently if the copyright holder notifies you of the violation by some reasonable means, this is the first time you have received notice of violation of this License (for any work) from that copyright holder, and you cure the violation prior to 30 days after your receipt of the notice.

Termination of your rights under this section does not terminate the licenses of parties who have received copies or rights from you under this License.  If your rights have been terminated and not permanently reinstated, you do not qualify to receive new licenses for the same material under section 10.

9. Acceptance Not Required for Having Copies.

You are not required to accept this License in order to receive or run a copy of the Program.  Ancillary propagation of a covered work occurring solely as a consequence of using peer-to-peer transmission to receive a copy likewise does not require acceptance.  However, nothing other than this License grants you permission to propagate or modify any covered work.  These actions infringe copyright if you do not accept this License.  Therefore, by modifying or propagating a covered work, you indicate your acceptance of this License to do so.

10. Automatic Licensing of Downstream Recipients.

Each time you convey a covered work, the recipient automatically receives a license from the original licensors, to run, modify and propagate that work, subject to this License.  You are not responsible for enforcing compliance by third parties with this License.

An "entity transaction" is a transaction transferring control of an organization, or substantially all assets of one, or subdividing an organization, or merging organizations.  If propagation of a covered work results from an entity transaction, each party to that transaction who receives a copy of the work also receives whatever licenses to the work the party's predecessor in interest had or could give under the previous paragraph, plus a right to possession of the Corresponding Source of the work from the predecessor in interest, if the predecessor has it or can get it with reasonable efforts.

You may not impose any further restrictions on the exercise of the rights granted or affirmed under this License.  For example, you may not impose a license fee, royalty, or other charge for exercise of rights granted under this License, and you may not initiate litigation (including a cross-claim or counterclaim in a lawsuit) alleging that any patent claim is infringed by making, using, selling, offering for sale, or importing the Program or any portion of it.

11. Patents.

A "contributor" is a copyright holder who authorizes use under this License of the Program or a work on which the Program is based.  The work thus licensed is called the contributor's "contributor version".

A contributor's "essential patent claims" are all patent claims owned or controlled by the contributor, whether already acquired or hereafter acquired, that would be infringed by some manner, permitted by this License, of making, using, or selling its contributor version, but do not include claims that would be infringed only as a consequence of further modification of the contributor version.  For purposes of this definition, "control" includes the right to grant patent sublicenses in a manner consistent with the requirements of this License.

Each contributor grants you a non-exclusive, worldwide, royalty-free patent license under the contributor's essential patent claims, to make, use, sell, offer for sale, import and otherwise run, modify and propagate the contents of its contributor version.

In the following three paragraphs, a "patent license" is any express agreement or commitment, however denominated, not to enforce a patent (such as an express permission to practice a patent or covenant not to sue for patent infringement).  To "grant" such a patent license to a party means to make such an agreement or commitment not to enforce a patent against the party.

If you convey a covered work, knowingly relying on a patent license, and the Corresponding Source of the work is not available for anyone to copy, free of charge and under the terms of this License, through a publicly available network server or other readily accessible means, then you must either (1) cause the Corresponding Source to be so available, or (2) arrange to deprive yourself of the benefit of the patent license for this particular work, or (3) arrange, in a manner consistent with the requirements of this License, to extend the patent
license to downstream recipients.  "Knowingly relying" means you have actual knowledge that, but for the patent license, your conveying the covered work in a country, or your recipient's use of the covered work in a country, would infringe one or more identifiable patents in that country that you have reason to believe are valid.

If, pursuant to or in connection with a single transaction or arrangement, you convey, or propagate by procuring conveyance of, a covered work, and grant a patent license to some of the parties receiving the covered work authorizing them to use, propagate, modify or convey a specific copy of the covered work, then the patent license you grant is automatically extended to all recipients of the covered work and works based on it.

A patent license is "discriminatory" if it does not include within the scope of its coverage, prohibits the exercise of, or is conditioned on the non-exercise of one or more of the rights that are specifically granted under this License.  You may not convey a covered work if you are a party to an arrangement with a third party that is in the business of distributing software, under which you make payment to the third party based on the extent of your activity of conveying the work, and under which the third party grants, to any of the parties who would receive the covered work from you, a discriminatory patent license (a) in connection with copies of the covered work conveyed by you (or copies made from those copies), or (b) primarily for and in connection with specific products or compilations that contain the covered work, unless you entered into that arrangement, or that patent license was granted, prior to 28 March 2007.

Nothing in this License shall be construed as excluding or limiting any implied license or other defenses to infringement that may otherwise be available to you under applicable patent law.

12. No Surrender of Others' Freedom.

If conditions are imposed on you (whether by court order, agreement or otherwise) that contradict the conditions of this License, they do not excuse you from the conditions of this License.  If you cannot convey a covered work so as to satisfy simultaneously your obligations under this License and any other pertinent obligations, then as a consequence you may
not convey it at all.  For example, if you agree to terms that obligate you to collect a royalty for further conveying from those to whom you convey the Program, the only way you could satisfy both those terms and this License would be to refrain entirely from conveying the Program.

13. Remote Network Interaction; Use with the GNU General Public License.

Notwithstanding any other provision of this License, if you modify the Program, your modified version must prominently offer all users interacting with it remotely through a computer network (if your version supports such interaction) an opportunity to receive the Corresponding Source of your version by providing access to the Corresponding Source from a network server at no charge, through some standard or customary means of facilitating copying of software.  This Corresponding Source shall include the Corresponding Source for any work covered by version 3 of the GNU General Public License that is incorporated pursuant to the following paragraph.

Notwithstanding any other provision of this License, you have permission to link or combine any covered work with a work licensed under version 3 of the GNU General Public License into a single combined work, and to convey the resulting work.  The terms of this License will continue to apply to the part which is the covered work, but the work with which it is combined will remain governed by version 3 of the GNU General Public License.

14. Revised Versions of this License.

The Free Software Foundation may publish revised and/or new versions of the GNU Affero General Public License from time to time.  Such new versions will be similar in spirit to the present version, but may differ in detail to address new problems or concerns.

Each version is given a distinguishing version number.  If the Program specifies that a certain numbered version of the GNU Affero General Public License "or any later version" applies to it, you have the option of following the terms and conditions either of that numbered version or of any later version published by the Free Software Foundation.  If the Program does not specify a version number of the GNU Affero General Public License, you may choose any version ever published by the Free Software Foundation.

If the Program specifies that a proxy can decide which future versions of the GNU Affero General Public License can be used, that proxy's public statement of acceptance of a version permanently authorizes you to choose that version for the Program.

Later license versions may give you additional or different permissions.  However, no additional obligations are imposed on any author or copyright holder as a result of your choosing to follow a later version.

15. Disclaimer of Warranty.

THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW.  EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.  THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM IS WITH YOU.  SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF ALL NECESSARY SERVICING, REPAIR OR CORRECTION.

16. Limitation of Liability.

IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MODIFIES AND/OR CONVEYS THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES, INCLUDING ANY GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED TO LOSS OF DATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD PARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER PROGRAMS), EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

17. Interpretation of Sections 15 and 16.

If the disclaimer of warranty and limitation of liability provided above cannot be given local legal effect according to their terms, reviewing courts shall apply local law that most closely approximates an absolute waiver of all civil liability in connection with the Program, unless a warranty or assumption of liability accompanies a copy of the Program in return for a fee.

END OF TERMS AND CONDITIONS

            How to Apply These Terms to Your New Programs

If you develop a new program, and you want it to be of the greatest possible use to the public, the best way to achieve this is to make it free software which everyone can redistribute and change under these terms.

To do so, attach the following notices to the program.  It is safest to attach them to the start of each source file to most effectively state the exclusion of warranty; and each file should have at least the "copyright" line and a pointer to where the full notice is found.

     <one line to give the program's name and a brief idea of what it does.>
     Copyright (C) <year>  <name of author>

     This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

     This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

     You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <http://www.gnu.org/licenses/>.

Also add information on how to contact you by electronic and paper mail.

If your software can interact with users remotely through a computer network, you should also make sure that it provides a way for users to get its source.  For example, if your program is a web application, its interface could display a "Source" link that leads users to an archive of the code.  There are many ways you could offer source, and different solutions will be better for different programs; see section 13 for the specific requirements.

You should also get your employer (if you work as a programmer) or school, if any, to sign a "copyright disclaimer" for the program, if necessary. For more information on this, and how to apply and follow the GNU AGPL, see <http://www.gnu.org/licenses/>.

```

### DM Sans — font copyright and SIL Open Font License

```text
Copyright 2014 The DM Sans Project Authors (https://github.com/googlefonts/dm-fonts) DMSans-Italic[opsz,wght].ttf: Copyright 2014 The DM Sans Project Authors (https://github.com/googlefonts/dm-fonts)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.

```

### Instrument Serif — font copyright and SIL Open Font License

```text
Copyright 2022 The Instrument Serif Project Authors (https://github.com/Instrument/instrument-serif) InstrumentSerif-Italic.ttf: Copyright 2022 The Instrument Serif Project Authors (https://github.com/Instrument/instrument-serif)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.

```

