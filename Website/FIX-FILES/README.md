# Fix the Try-it search on opensreon.com — two ways

These 7 files make the Try panel really work on the static site:
All = Wikipedia · YouTube = real youtube.com videos via Piped/Invidious ·
Images/Photos = Wikimedia Commons. (A connected /api/search Rust engine
is still preferred automatically when present.)

## Option A — GitHub web upload (no tools needed)
1. Open https://github.com/FellowPythonCoder/Sreon-Browser
2. Add each file below at its exact path (Add file → Upload files):
   - .gitignore
   - index.html
   - site/assets/site.js        (replaces the old one)
   - site/assets/site.css       (replaces the old one)
   - site/assets/runtime.js     (NEW file)
   - site/tests/runtime.test.mjs (NEW file)
   - site/tests/try-panel.test.mjs (NEW file)
3. Commit to main. Pages redeploys in ~1 minute. Done.

## Option B — patch (git, one command)
Copy website-fix.patch (next to this folder) anywhere and run:

    git clone https://github.com/FellowPythonCoder/Sreon-Browser && cd Sreon-Browser
    git apply /path/to/website-fix.patch
    git add -A && git commit -m "Try-it search works: YouTube, Wikipedia, Commons in the browser" && git push

## Verify before/after
    node --test site/tests/runtime.test.mjs   # 5 tests (no deps)
    node --test site/tests/try-panel.test.mjs # 2 DOM tests (needs: npm i jsdom)
