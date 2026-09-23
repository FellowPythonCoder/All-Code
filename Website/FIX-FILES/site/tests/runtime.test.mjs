import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
const { createRuntime } = await import('../assets/runtime.js');

const WIKI_PAGE = {
  query: {
    searchinfo: { totalhits: 60 },
    search: [
      { title: 'YouTube', snippet: 'The <span class="searchmatch">video</span> platform &amp; more' },
      { title: 'History of online video', snippet: 'A &#39;clip&#39; history' },
    ],
  },
};
const PIPED_PAGE = {
  items: [
    { url: '/watch?v=abc123', title: 'A video about birds', thumbnail: 'https://pipedproxy.example/bird.jpg', uploaderName: 'Bird Channel', duration: 214, views: 250000 },
    { url: 'https://example.com/not-a-watch', title: 'skip me' },
  ],
  nextpage: 'TOKEN-1',
};
const INVIDIOUS_PAGE = [
  { videoId: 'inv456', title: 'Invidious bird video', author: 'Someone', lengthSeconds: 95, viewCount: 4200, videoThumbnails: [{ url: 'https://inv.example/thumb.jpg' }] },
];
const COMMONS_PAGE = (name, mime) => ({
  title: `File:${name}`,
  imageinfo: [{
    descriptionurl: `https://commons.wikimedia.org/wiki/File:${name}`,
    thumburl: `https://upload.wikimedia.org/thumb/${name}/340px-${name}`,
    mime,
    extmetadata: { Artist: { value: '<a href="#">Ada</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, ImageDescription: { value: 'A &quot;photo&quot;' } },
  }],
});

function responder(routes) {
  return async (url) => {
    const target = String(url);
    for (const [match, body] of routes) {
      if (target.includes(match)) {
        if (typeof body === 'number') return { ok: false, status: body, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => (typeof body === 'function' ? body(target) : body) };
      }
    }
    throw new Error('no route for ' + target);
  };
}

test('web search uses Wikipedia with snippet text, overview-shaped results, and a cursor', async () => {
  const calls = [];
  const runtime = createRuntime({ fetchImpl: async (url) => { calls.push(String(url)); return responder([['en.wikipedia.org', WIKI_PAGE]])(url); } });
  const data = await runtime.search('video', 'web', null);
  assert.match(calls[0], /en\.wikipedia\.org/);
  assert.match(calls[0], /origin=\*/);
  assert.equal(data.results[0].title, 'YouTube');
  assert.equal(data.results[0].url, 'https://en.wikipedia.org/wiki/YouTube');
  assert.equal(data.results[0].content, 'The video platform & more');
  assert.equal(data.overview.length, 2);
  assert.deepEqual(JSON.parse(data.nextCursor), { w: 2 });
  assert.match(data.notice, /Wikipedia/);
});

test('YouTube search returns real youtube.com watch links through Piped, then continues on the same host', async () => {
  const calls = [];
  const runtime = createRuntime({ fetchImpl: async (url) => { calls.push(String(url)); return responder([['pipedapi.kavin.rocks', PIPED_PAGE]])(url); } });
  const data = await runtime.search('birds', 'videos', null);
  assert.equal(data.results.length, 1);
  assert.equal(data.results[0].url, 'https://www.youtube.com/watch?v=abc123');
  assert.equal(data.results[0].title, 'A video about birds');
  assert.match(data.results[0].content, /Bird Channel/);
  assert.match(data.results[0].content, /4 min/);
  assert.match(data.results[0].content, /250K views/);
  assert.equal(data.results[0].credit, 'YouTube');
  assert.equal(data.results[0].thumbnail, 'https://pipedproxy.example/bird.jpg');
  assert.deepEqual(JSON.parse(data.nextCursor), { i: 0, p: 'TOKEN-1' });
  assert.match(data.notice, /Piped/);
  const second = await runtime.search('birds', 'videos', data.nextCursor);
  assert.match(calls[1], /pipedapi\.kavin\.rocks\/search\?q=birds&filter=videos&nextpage=TOKEN-1/);
  assert.equal(second.results.length, 1);
});

test('YouTube search falls back to the next Piped host, then to Invidious, then to Commons', async () => {
  const calls = [];
  const runtime = createRuntime({ fetchImpl: async (url) => {
    calls.push(String(url));
    if (String(url).includes('invidious.nerdvpn.de')) return responder([['invidious.nerdvpn.de', INVIDIOUS_PAGE]])(url);
    if (String(url).includes('commons.wikimedia.org')) return responder([['commons.wikimedia.org', { query: { pages: { v: COMMONS_PAGE('Clip.webm', 'video/webm') } }, continue: { gsroffset: 30 } }]])(url);
    throw new Error('down');
  } });
  const data = await runtime.search('birds', 'videos', null);
  assert.ok(calls.some((entry) => entry.includes('pipedapi.kavin.rocks')));
  assert.ok(calls.some((entry) => entry.includes('pipedapi.adminforge.de')));
  assert.equal(data.results[0].url, 'https://www.youtube.com/watch?v=inv456');
  assert.match(data.notice, /Piped/);
  const commonsOnly = createRuntime({ fetchImpl: async (url) => { if (String(url).includes('commons.wikimedia.org')) return responder([['commons', { query: { pages: { v: COMMONS_PAGE('Clip.webm', 'video/webm') } }, continue: { gsroffset: 30 } }]])(url); throw new Error('down'); } });
  const fallback = await commonsOnly.search('birds', 'videos', null);
  assert.equal(fallback.results[0].title, 'Clip.webm');
  assert.deepEqual(JSON.parse(fallback.nextCursor), { c: 30 });
  assert.match(fallback.notice, /Commons/);
});

test('images and photos search Commons, filter photos to JPEG, and keep credits', async () => {
  const calls = [];
  const body = { query: { pages: { a: COMMONS_PAGE('Coast.jpg', 'image/jpeg'), b: COMMONS_PAGE('Diagram.png', 'image/png') } }, continue: { gsroffset: 30 } };
  const runtime = createRuntime({ fetchImpl: async (url) => { calls.push(String(url)); return responder([['commons.wikimedia.org', body]])(url); } });
  const images = await runtime.search('coast', 'images', null);
  assert.equal(images.results.length, 2);
  assert.match(calls[0], /filetype%3Abitmap/);
  assert.equal(images.results[0].credit, 'Ada · CC BY-SA 4.0');
  assert.equal(images.results[0].content, 'A "photo"');
  const photos = await runtime.search('coast', 'photos', null);
  assert.match(calls[1], /filemime%3Aimage%2Fjpeg/);
  assert.equal(photos.results.length, 1);
  assert.equal(photos.results[0].title, 'Coast.jpg');
});

test('input validation and the open contract hold', async () => {
  const runtime = createRuntime({ fetchImpl: async () => { throw new Error('down'); } });
  await assert.rejects(runtime.search(''), /Type something/);
  await assert.rejects(runtime.search('x'.repeat(501)), /500 characters/);
  let opened = '';
  window.open = (url) => { opened = url; return {}; };
  await runtime.openPage('https://www.youtube.com/watch?v=abc123');
  assert.equal(opened, 'https://www.youtube.com/watch?v=abc123');
  assert.equal(runtime.isNative, false);
  assert.equal(runtime.externalLinks, true);
  const working = createRuntime({ fetchImpl: responder([['en.wikipedia.org', WIKI_PAGE]]) });
  const brokenCursor = await working.search('video', 'web', 'not-json');
  assert.equal(typeof brokenCursor.elapsed, 'number');
  const offline = createRuntime({ fetchImpl: async () => { throw new Error('down'); } });
  await assert.rejects(offline.search('video', 'web'), /unreachable right now/);
});
