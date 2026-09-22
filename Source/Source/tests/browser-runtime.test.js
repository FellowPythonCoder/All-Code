import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis;
await import("../app/browser.js");
const { createRuntime } = globalThis.SreonBrowserRuntime;

function jsonResponder(body) {
  return async (url) => ({
    ok: true,
    status: 200,
    json: async () => (typeof body === "function" ? body(String(url)) : body),
  });
}

const WIKI_BODY = {
  query: {
    searchinfo: { totalhits: 42 },
    search: [
      { title: "YouTube", snippet: `The <span class="searchmatch">video</span> platform &amp; more` },
      { title: "Vimeo", snippet: "A &#39;video&#39; hosting service" },
    ],
  },
};

const COMMONS_PAGE = (name, mime, thumb) => ({
  title: `File:${name}`,
  imageinfo: [{
    descriptionurl: `https://commons.wikimedia.org/wiki/File:${name}`,
    url: `https://upload.wikimedia.org/wikipedia/commons/${name}`,
    thumburl: thumb,
    mime,
    extmetadata: {
      Artist: { value: `<a href="#">Ada</a>` },
      LicenseShortName: { value: "CC BY-SA 4.0" },
      ImageDescription: { value: "A &quot;photo&quot; of the <b>coast</b>" },
    },
  }],
});

test("browser runtime searches the web for real shape and honest notice", async () => {
  let requested = "";
  const runtime = createRuntime({ fetchImpl: async (url) => { requested = String(url); return jsonResponder(WIKI_BODY)(url); } });
  const data = await runtime.search("video", "web", null);
  assert.match(requested, /en\.wikipedia\.org\/w\/api\.php/);
  assert.match(requested, /origin=*/);
  assert.equal(data.results[0].title, "YouTube");
  assert.equal(data.results[0].url, "https://en.wikipedia.org/wiki/YouTube");
  assert.equal(data.results[0].content, "The video platform & more");
  assert.equal(data.overview.length, 2);
  assert.equal(data.overview[0].url, data.results[0].url);
  assert.deepEqual(JSON.parse(data.nextCursor), { w: 2 });
  assert.match(data.notice, /Wikipedia/);
  assert.equal(typeof data.elapsed, "number");
});

test("browser runtime searches Commons images, filters photos to JPEG, and credits authors", async () => {
  const calls = [];
  const body = {
    query: {
      pages: {
        a: COMMONS_PAGE("Coast.jpg", "image/jpeg", "https://upload.wikimedia.org/thumb/Coast.jpg/340px-Coast.jpg"),
        b: COMMONS_PAGE("Diagram.png", "image/png", "https://upload.wikimedia.org/thumb/Diagram.png/340px-Diagram.png"),
      },
    },
    continue: { gsroffset: 30 },
  };
  const runtime = createRuntime({ fetchImpl: async (url) => { calls.push(String(url)); return jsonResponder(body)(url); } });
  const images = await runtime.search("coast", "images", null);
  assert.equal(images.results.length, 2);
  assert.equal(images.results[0].thumbnail, "https://upload.wikimedia.org/thumb/Coast.jpg/340px-Coast.jpg");
  assert.equal(images.results[0].credit, "Ada · CC BY-SA 4.0");
  assert.equal(images.results[0].content, "A \"photo\" of the coast");
  assert.deepEqual(JSON.parse(images.nextCursor), { c: 30 });
  assert.match(images.notice, /Commons/);
  const photos = await runtime.search("coast", "photos", null);
  assert.equal(photos.results.length, 1);
  assert.equal(photos.results[0].title, "Coast.jpg");
  assert.match(calls[0], /commons\.wikimedia\.org/);
  assert.match(calls[0], /filetype%3Abitmap/);
});

test("browser runtime searches Commons videos with the video file type", async () => {
  let requested = "";
  const body = { query: { pages: { v: COMMONS_PAGE("Clip.webm", "video/webm", null) } } };
  const runtime = createRuntime({ fetchImpl: async (url) => { requested = String(url); return jsonResponder(body)(url); } });
  const data = await runtime.search("ocean", "videos", null);
  assert.match(requested, /filetype%3Avideo/);
  assert.equal(data.results[0].title, "Clip.webm");
  assert.equal(data.results[0].thumbnail, null);
});

test("browser runtime continues from cursors and ignores broken ones", async () => {
  const seen = [];
  const runtime = createRuntime({ fetchImpl: async (url) => { seen.push(String(url)); return jsonResponder(WIKI_BODY)(url); } });
  await runtime.search("video", "web", JSON.stringify({ w: 40 }));
  assert.match(seen[0], /sroffset=40/);
  seen.length = 0;
  await runtime.search("video", "web", "not-json");
  assert.match(seen[0], /sroffset=0/);
});

test("browser runtime surfaces honest errors and opens sites in a new tab", async () => {
  const runtime = createRuntime({ fetchImpl: async () => { throw new Error("offline"); } });
  await assert.rejects(runtime.search("video"), /unreachable/);
  await assert.rejects(runtime.search(""), /Type something/);
  await assert.rejects(runtime.search("x".repeat(501)), /500 characters/);
  let opened = "";
  globalThis.open = (url) => { opened = url; return {}; };
  await runtime.openPage("https://example.com/x");
  assert.equal(opened, "https://example.com/x");
  assert.equal(runtime.isNative, false);
  assert.equal(runtime.externalLinks, true);
});

test("browser runtime rejects failed HTTP and unreadable JSON", async () => {
  const failing = createRuntime({ fetchImpl: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(failing.search("x"), /unreachable/);
  const broken = createRuntime({ fetchImpl: async () => ({ ok: true, json: async () => { throw new Error("bad"); } }) });
  await assert.rejects(broken.search("x"), /could not be read/);
});
