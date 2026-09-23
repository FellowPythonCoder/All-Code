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
  const wikiCall = seen.find((entry) => entry.includes("en.wikipedia.org"));
  assert.match(wikiCall, /sroffset=40/);
  seen.length = 0;
  await runtime.search("video", "web", "not-json");
  const wikiCall2 = seen.find((entry) => entry.includes("en.wikipedia.org"));
  assert.match(wikiCall2, /sroffset=0/);
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
  await assert.rejects(broken.search("x"), /unreachable right now/);
});

const PIPED_PAGE = {
  items: [
    { url: "/watch?v=abc123", title: "A video about birds", thumbnail: "https://pipedproxy.example/bird.jpg", uploaderName: "Bird Channel", duration: 214, views: 250000 },
  ],
  nextpage: "TOKEN-1",
};
const INVIDIOUS_PAGE = [
  { videoId: "inv456", title: "Invidious bird video", author: "Someone", lengthSeconds: 95, viewCount: 4200, videoThumbnails: [{ url: "https://inv.example/thumb.jpg" }] },
];

test("browser runtime returns real YouTube videos via Piped and continues on the same host", async () => {
  const calls = [];
  const runtime = createRuntime({ fetchImpl: async (url) => { calls.push(String(url)); return jsonResponder(PIPED_PAGE)(url); } });
  const data = await runtime.search("birds", "videos", null);
  assert.equal(data.results[0].url, "https://www.youtube.com/watch?v=abc123");
  assert.match(data.results[0].content, /Bird Channel/);
  assert.match(data.results[0].content, /4 min/);
  assert.match(data.results[0].content, /250K views/);
  assert.equal(data.results[0].credit, "YouTube");
  assert.deepEqual(JSON.parse(data.nextCursor), { i: 0, p: "TOKEN-1" });
  assert.match(data.notice, /Piped/);
  await runtime.search("birds", "videos", data.nextCursor);
  assert.match(calls[1], /pipedapi\.kavin\.rocks\/search\?q=birds&filter=videos&nextpage=TOKEN-1/);
});

test("browser runtime falls back from dead Piped hosts to Invidious, then to Commons", async () => {
  const runtime = createRuntime({ fetchImpl: async (url) => {
    if (String(url).includes("invidious.nerdvpn.de")) return jsonResponder(INVIDIOUS_PAGE)(url);
    if (String(url).includes("commons.wikimedia.org")) return jsonResponder({ query: { pages: { v: COMMONS_PAGE("Clip.webm", "video/webm") } }, continue: { gsroffset: 30 } })(url);
    throw new Error("down");
  } });
  const data = await runtime.search("birds", "videos", null);
  assert.equal(data.results[0].url, "https://www.youtube.com/watch?v=inv456");
  const offline = createRuntime({ fetchImpl: async (url) => {
    if (String(url).includes("commons.wikimedia.org")) return jsonResponder({ query: { pages: { v: COMMONS_PAGE("Clip.webm", "video/webm") } }, continue: { gsroffset: 30 } })(url);
    throw new Error("down");
  } });
  const fallback = await offline.search("birds", "videos", null);
  assert.equal(fallback.results[0].title, "Clip.webm");
  assert.match(fallback.notice, /Commons/);
});

test("browser runtime wraps total outage in a friendly error", async () => {
  const runtime = createRuntime({ fetchImpl: async () => { throw new Error("down"); } });
  await assert.rejects(runtime.search("birds", "videos"), /unreachable right now/);
  await assert.rejects(runtime.search("birds", "images"), /unreachable right now/);
});

const SEARX_PAGE = {
  results: [
    { title: "Bird facts — full web", url: "https://birds.example/facts", content: "Everything about birds", engine: "duckduckgo" },
    { title: "More birds", url: "https://birds.example/more", content: "Even more", engine: "bing" },
    { title: "dup", url: "https://birds.example/facts", content: "should be deduped" },
    { title: "bad", url: "javascript:alert(1)", content: "skip" },
  ],
};

test("web search hits the full web via SearXNG, dedupes, filters, and paginates on the same host", async () => {
  const calls = [];
  const runtime = createRuntime({ fetchImpl: async (url) => { calls.push(String(url)); return jsonResponder(SEARX_PAGE)(url); } });
  const data = await runtime.search("birds", "web", null);
  assert.match(calls[0], /searx\.be\/search\?q=birds&format=json&language=en&page=1/);
  assert.equal(data.results.length, 2, "deduped and scheme-filtered");
  assert.equal(data.results[0].url, "https://birds.example/facts");
  assert.equal(data.results[0].credit, "duckduckgo");
  assert.equal(data.overview.length, 2);
  assert.deepEqual(JSON.parse(data.nextCursor), { s: 2, i: 0 });
  assert.match(data.notice, /SearXNG/);
  await runtime.search("birds", "web", data.nextCursor);
  assert.match(calls[1], /searx\.be\/search\?q=birds&format=json&language=en&page=2/);
});

test("web search rotates SearXNG hosts when one fails, then falls back to Wikipedia", async () => {
  const calls = [];
  const runtime = createRuntime({ fetchImpl: async (url) => { calls.push(String(url)); if (String(url).includes("searxng.site")) return jsonResponder(SEARX_PAGE)(url); if (String(url).includes("en.wikipedia.org")) return jsonResponder(WIKI_BODY)(url); throw new Error("down"); } });
  const data = await runtime.search("birds", "web", null);
  const hosts = [...new Set(calls.map((entry) => new URL(entry).host))];
  assert.deepEqual(hosts.slice(0, 5), ["searx.be", "search.inetol.net", "searx.tiekoetter.com", "priv.au", "opnxng.com"]);
  assert.equal(hosts[5], "searxng.site");
  assert.equal(data.results[0].url, "https://birds.example/facts");
  const allDown = createRuntime({ fetchImpl: async (url) => { if (String(url).includes("en.wikipedia.org")) return jsonResponder(WIKI_BODY)(url); throw new Error("down"); } });
  const fallback = await allDown.search("birds", "web", null);
  assert.match(fallback.notice, /unreachable right now.*Wikipedia/s);
  assert.equal(fallback.results[0].title, "YouTube");
});
