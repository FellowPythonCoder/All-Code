# Deploy the fixed Try-it search to opensreon.com

This folder is the complete opensreon.com website (the `Sreon-Browser`
repository) with the working Try-it search:

- All searches the entire open web via the SearXNG network (Wikipedia as automatic fallback)
- YouTube chip plays real YouTube results via the Piped/Invidious network
- Images / Photos search the Wikimedia Commons (photos = JPEG)
- Pagination, credits, honest notices; links open the original site
- If you later host the container with `/api/search`, the page uses the
  full Rust engine automatically — no changes needed

## One-step deploy — two ways (both verified against pristine main)

**Easiest:** `FIX-FILES/` next to this guide holds exactly the 7 files at
their exact paths, with a README. Upload them in the GitHub web UI and
commit — or apply `website-fix.patch` with `git apply` and push:

    git clone https://github.com/FellowPythonCoder/Sreon-Browser && cd Sreon-Browser
    git apply /path/to/website-fix.patch
    git add -A && git commit -m "Try-it search works: full web via SearXNG, YouTube, Commons in the browser" && git push

GitHub Pages redeploys opensreon.com automatically within a minute or two.

## Verify before/after

    node --test site/tests/runtime.test.mjs    # 5 tests, no dependencies
    node --test site/tests/try-panel.test.mjs  # 2 DOM tests (needs: npm i jsdom)
    python3 -m http.server 8080                # open http://localhost:8080
