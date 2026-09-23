const themeButton = document.querySelector('#theme');
function themeLabel() { themeButton.setAttribute('aria-label', `Switch to ${document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'} mode`); }
themeLabel();
themeButton.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('sreon-site-theme', theme); } catch {}
  themeLabel();
});
const form = document.querySelector('#search-form');
const query = document.querySelector('#query');
const results = document.querySelector('#results');
const status = document.querySelector('#search-status');
const submit = document.querySelector('#search-submit');
const more = document.querySelector('#more');
let kind = 'web';
let cursor = null;
let lastQuery = '';
let request = null;
let sequence = 0;
let localOnly = false;

function localRuntime() { return window.SreonSiteRuntime?.createRuntime(); }

function safeLink(url) {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed;
  } catch { return null; }
}

function render(item) {
  const article = document.createElement('article');
  article.className = 'result';
  const source = document.createElement('small');
  source.textContent = item.host;
  const link = document.createElement('a');
  link.href = item.url;
  link.textContent = item.title || item.host;
  link.target = '_blank';
  link.rel = 'noreferrer noopener';
  const excerpt = document.createElement('p');
  excerpt.textContent = item.content || '';
  article.append(source, link, excerpt);
  if (item.thumbnail) {
    const image = document.createElement('img');
    image.className = 'thumb';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.alt = '';
    image.src = item.thumbnail;
    image.addEventListener('error', () => image.remove(), { once: true });
    article.append(image);
  }
  return article;
}

function renderEngineRow(item) {
  const parsed = safeLink(item.url);
  if (!parsed || !item.title) return 0;
  results.append(render({ host: parsed.hostname, url: parsed.href, title: item.title, content: item.content || '', thumbnail: null }));
  return 1;
}

function renderLocalRow(item) {
  const parsed = safeLink(item.url);
  if (!parsed) return 0;
  results.append(render({ host: parsed.hostname, url: parsed.href, title: item.title || parsed.hostname, content: item.content || '', thumbnail: item.thumbnail || null }));
  return 1;
}

async function search(append = false) {
  const q = append ? lastQuery : query.value.trim();
  if (!q) { query.focus(); return; }
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const id = ++sequence;
  const timer = setTimeout(() => controller.abort(), 25000);
  if (!append) { results.replaceChildren(); cursor = null; lastQuery = q; }
  more.hidden = true;
  submit.disabled = true;
  results.setAttribute('aria-busy', 'true');
  status.dataset.error = 'false';
  status.textContent = 'Searching the web…';
  try {
    if (localOnly) throw new Error('use-local');
    const endpoint = document.querySelector('meta[name="sreon-search-endpoint"]').content;
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, category: kind, cursor: append ? cursor : null }), credentials: 'omit', signal: controller.signal, referrerPolicy: 'no-referrer' });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      if (response.status === 429) throw new Error('A few too many searches. Please wait a minute and try again.');
      if (failure.code === 'SOURCE_UNAVAILABLE') throw new Error('The Rust engine is running, but its search sources could not be reached. Please retry shortly.');
      throw new Error('backend-unavailable');
    }
    const data = await response.json();
    if (!Array.isArray(data.results)) throw new Error('The search service returned an unexpected response.');
    if (id !== sequence) return;
    let added = 0;
    for (const item of data.results) added += renderEngineRow(item);
    cursor = typeof data.nextCursor === 'string' ? data.nextCursor : null;
    more.hidden = !cursor;
    status.textContent = added ? `${results.children.length} results for “${q}”.${data.cached ? ' From the engine’s short-lived cache.' : ''}${data.notice ? ' ' + data.notice : ''}` : data.notice || 'No results this time. Try another search.';
  } catch (error) {
    if (id !== sequence) return;
    if (error.message === 'backend-unavailable' || error.message === 'use-local' || error.name === 'TypeError') {
      localOnly = true;
      status.dataset.error = 'false';
      status.textContent = 'Using the in-browser demo search…';
      await searchLocal(q, append, id);
    } else {
      status.dataset.error = 'true';
      status.textContent = error.name === 'AbortError' ? 'The search took too long. Please try again.' : error.message;
      if (append && cursor) more.hidden = false;
    }
  } finally {
    clearTimeout(timer);
    if (id === sequence) { submit.disabled = false; results.setAttribute('aria-busy', 'false'); }
  }
}

async function searchLocal(q, append, id) {
  const runtime = localRuntime();
  if (!runtime) {
    status.dataset.error = 'true';
    status.textContent = 'Search is unavailable in this browser.';
    return;
  }
  try {
    const data = await runtime.search(q, kind, append ? cursor : null);
    if (id !== sequence) return;
    if (!append) results.replaceChildren();
    let added = 0;
    for (const item of data.results) added += renderLocalRow(item);
    cursor = typeof data.nextCursor === 'string' ? data.nextCursor : null;
    more.hidden = !cursor;
    status.dataset.error = 'false';
    status.textContent = added ? `${results.children.length} results for “${q}”. ${data.notice || ''}` : `${data.notice || 'No results this time. Try another search.'}`;
  } catch (error) {
    if (id !== sequence) return;
    status.dataset.error = 'true';
    status.textContent = error.message || 'Search failed. Please try again.';
  }
}

form.addEventListener('submit', (event) => { event.preventDefault(); search(); });
document.querySelectorAll('.kinds button').forEach((chip) => chip.addEventListener('click', () => {
  kind = chip.dataset.kind;
  document.querySelectorAll('.kinds button').forEach((item) => item.setAttribute('aria-pressed', String(item === chip)));
  if (query.value.trim()) search();
}));
document.querySelectorAll('[data-query]').forEach((button) => button.addEventListener('click', () => {
  query.value = button.dataset.query;
  if (button.dataset.kind) {
    kind = button.dataset.kind;
    document.querySelectorAll('.kinds button').forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.kind === kind)));
  }
  document.querySelector('#try').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  search();
}));
more.addEventListener('click', () => search(true));

async function checkBackend() {
  try {
    const endpoint = new URL(document.querySelector('meta[name="sreon-search-endpoint"]').content, location.href);
    endpoint.pathname = endpoint.pathname.replace(/\/search\/?$/, '/health');
    endpoint.search = '';
    const response = await fetch(endpoint, { credentials:'omit', referrerPolicy:'no-referrer', signal:AbortSignal.timeout(12000) });
    const data = await response.json();
    if (sequence || localOnly) return;
    if (!response.ok || !data.ready || data.engine !== 'rust') throw new Error('Backend unavailable');
    status.textContent = 'Connected to the Rust search engine. What are you curious about?';
  } catch {
    if (!sequence && !localOnly) { status.dataset.error = 'false'; status.textContent = 'Try a search below — this hosted page uses its in-browser demo search.'; }
  }
}
checkBackend();
