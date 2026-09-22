import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "app");

const WIKI_PAGE1 = {
  query: {
    searchinfo: { totalhits: 42 },
    search: [
      { title: "YouTube", snippet: "The <span class=\"searchmatch\">video</span> platform" },
      { title: "Vimeo", snippet: "Another video service" },
    ],
  },
};
const WIKI_PAGE2 = {
  query: {
    searchinfo: { totalhits: 42 },
    search: [{ title: "Video culture", snippet: "Second page result" }],
  },
};
const COMMONS_BODY = {
  query: {
    pages: {
      a: {
        title: "File:Coast.jpg",
        imageinfo: [{
          descriptionurl: "https://commons.wikimedia.org/wiki/File:Coast.jpg",
          thumburl: "https://upload.wikimedia.org/thumb/Coast.jpg/340px-Coast.jpg",
          mime: "image/jpeg",
          extmetadata: { Artist: { value: "Ada" }, LicenseShortName: { value: "CC BY-SA 4.0" }, ImageDescription: { value: "Shoreline" } },
        }],
      },
    },
  },
};

function responder(log) {
  return async (url) => {
    const target = String(url);
    log.push(target);
    let body;
    if (target.includes("en.wikipedia.org")) body = target.includes("sroffset=0") ? WIKI_PAGE1 : WIKI_PAGE2;
    else if (target.includes("commons.wikimedia.org")) body = COMMONS_BODY;
    else body = {};
    return {
      ok: true,
      status: 200,
      json: async () => body,
    };
  };
}

async function boot(log) {
  const dom = await JSDOM.fromFile(join(APP, "index.html"), {
    resources: "usable",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
      const respond = responder(log);
      window.fetch = (url, init) => respond(url, init);
      window.open = (url) => { log.push(`open:${url}`); return { focus() {} }; };
    },
  });
  await new Promise((resolve) => {
    if (dom.window.document.readyState === "complete") resolve();
    else dom.window.addEventListener("load", resolve);
  });
  return dom;
}

async function waitFor(check, label) {
  const limit = Date.now() + 4000;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > limit) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

test("the real page searches, renders, paginates, browses to sites, and switches to Commons images", async () => {
  const log = [];
  const dom = await boot(log);
  const document = dom.window.document;
  const runtime = document.documentElement.className;
  assert.match(runtime, /browser-demo/, "page must boot the browser runtime");
  assert.equal(dom.window.sreonRuntime.isNative, false);

  document.getElementById("search-input").value = "video";
  document.getElementById("search-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));

  await waitFor(() => document.querySelectorAll("#results article.result").length >= 2, "web results");
  const first = document.querySelector("#results article.result h2 a");
  assert.equal(first.textContent, "YouTube");
  assert.equal(first.href, "https://en.wikipedia.org/wiki/YouTube");
  assert.match(document.getElementById("notice").textContent, /Wikipedia/);
  assert.equal(document.getElementById("overview").hidden, false);
  assert.ok(document.querySelectorAll("#overview-items li").length >= 1, "overview entries render");
  assert.match(log[0], /en\.wikipedia\.org/);

  first.dispatchEvent(new dom.window.Event("click", { bubbles: true, cancelable: true }));
  await waitFor(() => log.some((entry) => entry.startsWith("open:")), "site opened in a new tab");
  const opened = log.find((entry) => entry.startsWith("open:"));
  assert.equal(opened, "open:https://en.wikipedia.org/wiki/YouTube");
  assert.equal(document.getElementById("results-section").hidden, false, "results stay visible after opening a site");

  document.getElementById("next").dispatchEvent(new dom.window.Event("click", { bubbles: true, cancelable: true }));
  await waitFor(() => document.body.textContent.includes("Second page result"), "page 2 results");
  assert.ok(log.some((entry) => entry.includes("sroffset=2")), "pagination requests the next offset");

  document.querySelector('[data-category="images"]').dispatchEvent(new dom.window.Event("click", { bubbles: true, cancelable: true }));
  await waitFor(() => document.querySelectorAll("#results article.result").length >= 1 && document.body.textContent.includes("Coast.jpg"), "Commons images");
  assert.ok(log.some((entry) => entry.includes("commons.wikimedia.org") && entry.includes("filetype")), "image search hits Commons");
  const credit = document.querySelector("#results .credit");
  assert.match(credit.textContent, /Ada/);
  assert.match(credit.textContent, /CC BY-SA 4\.0/);
  const thumb = document.querySelector("#results .media-preview img");
  assert.ok(thumb && thumb.src.startsWith("https://upload.wikimedia.org/"), "thumbnail renders");
  dom.window.close();
});
