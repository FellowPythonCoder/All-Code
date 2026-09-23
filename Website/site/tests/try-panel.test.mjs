import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import jsdom from 'jsdom';
const { JSDOM } = jsdom;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const WIKI_PAGE = {
  query: {
    searchinfo: { totalhits: 12 },
    search: [{ title: 'Quiet places', snippet: 'A guide to <span class="searchmatch">quiet</span> places' }],
  },
};
const PIPED_PAGE = {
  items: [{ url: '/watch?v=lofi123', title: 'lo-fi study beats', thumbnail: 'https://pipedproxy.example/lofi.jpg', uploaderName: 'Calm Channel', duration: 182, views: 98000 }],
  nextpage: 'TOK',
};

function fixtures(target) {
  const url = String(target);
  if (url.includes('/api/search')) return { ok: false, status: 404, json: async () => ({}) };
  if (url.includes('/api/health')) return { ok: false, status: 404, json: async () => ({}) };
  if (url.includes('pipedapi.kavin.rocks')) return { ok: true, status: 200, json: async () => PIPED_PAGE };
  if (url.includes('en.wikipedia.org')) return { ok: true, status: 200, json: async () => WIKI_PAGE };
  throw new Error('no fixture for ' + url);
}

async function boot() {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = (url, init) => Promise.resolve(fixtures(url, init));
      window.open = (url) => { window.__opened = window.__opened || []; window.__opened.push(url); return { focus() {} }; };
      window.__runtimeReady = import('file://' + join(ROOT, 'site/assets/runtime.js')).then((module) => {
        window.SreonSiteRuntime = { createRuntime: () => module.createRuntime({ fetchImpl: (url, init) => window.fetch(url, init) }) };
      });
    },
  });
  await dom.window.__runtimeReady;
  dom.window.eval(readFileSync(join(ROOT, 'site/assets/theme.js'), 'utf8'));
  dom.window.eval(readFileSync(join(ROOT, 'site/assets/site.js'), 'utf8'));
  await new Promise((r) => setTimeout(r, 30));
  return dom;
}

async function waitFor(check, label) {
  const limit = Date.now() + 6000;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > limit) throw new Error('timeout waiting for ' + label + ' — status said: ' + document.getElementById('search-status').textContent);
    await new Promise((r) => setTimeout(r, 25));
  }
}

let document;

test('on the real opensreon.com page the Try panel searches YouTube and All with no backend', async () => {
  const dom = await boot();
  document = dom.window.document;

  assert.match(
    document.getElementById('search-status').textContent,
    /in-browser demo|curious/i,
    'the panel greets the visitor with the demo notice when the backend is absent',
  );

  document.querySelector('.kinds button[data-kind="videos"]').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  document.getElementById('query').value = 'lo-fi beats';
  document.getElementById('search-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => document.querySelector('#results article.result a'), 'YouTube results');
  const video = document.querySelector('#results article.result a');
  assert.equal(video.href, 'https://www.youtube.com/watch?v=lofi123');
  assert.equal(video.target, '_blank');
  assert.match(video.rel, /noopener/);
  assert.match(document.querySelector('#results article.result small').textContent, /youtube\.com/);
  assert.match(document.getElementById('search-status').textContent, /Piped/);
  assert.ok(document.querySelector('#results article.result img.thumb'), 'video thumbnail renders');

  document.querySelector('.kinds button[data-kind="web"]').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  document.getElementById('query').value = 'quiet places';
  document.getElementById('search-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => (document.querySelector('#results article.result a') || {}).href?.includes('wikipedia'), 'web results');
  const web = document.querySelector('#results article.result a');
  assert.match(web.href, /en\.wikipedia\.org\/wiki/);
  assert.equal(web.target, '_blank');
  dom.window.close();
});
