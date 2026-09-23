import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Sreon } from '../Extra/Source/integrations/sreon.mjs';
import { inspectEngine } from './backend.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2' };
function json(response, status, data) {
  response.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  response.end(JSON.stringify(data));
}
function body(request) {
  return new Promise((resolveBody, reject) => {
    let size = 0, ended = false;
    const chunks = [];
    const fail = (message) => { if (!ended) { ended = true; clearTimeout(timer); reject(new Error(message)); } };
    const timer = setTimeout(() => fail('Request timed out'), 5000);
    request.on('data', (chunk) => {
      if (ended) return;
      size += chunk.length;
      if (size > 4096) { fail('Request too large'); return; }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (ended) return;
      ended = true; clearTimeout(timer);
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('Invalid JSON')); }
    });
    request.on('error', () => fail('Request interrupted'));
    request.on('aborted', () => fail('Request interrupted'));
  });
}
export function createWebsite({ executable = process.env.SREON_API || resolve(root, 'Extra/Source/src-tauri/target/release/sreon-api' + (process.platform === 'win32' ? '.exe' : '')), clientFactory = () => new Sreon(executable), allowedOrigins = (process.env.SREON_ALLOWED_ORIGINS || 'https://opensreon.com,https://www.opensreon.com').split(','), limit = 15 } = {}) {
  let client = null;
  let pending = 0;
  let health = null;
  let healthUntil = 0;
  function engine() {
    if (!client || client.failure) { client?.close(); client = clientFactory(); }
    return client;
  }
  const clients = new Map();
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://sreon.invalid').pathname); }
    catch { json(response, 400, { error: 'Invalid path' }); return; }
    if (pathname === '/api/search' || pathname === '/api/health') {
      response.setHeader('Vary', 'Origin');
      const origin = request.headers.origin;
      let sameOrigin = false;
      try { const parsed = new URL(origin); sameOrigin = ['https:', 'http:'].includes(parsed.protocol) && parsed.host === request.headers.host; } catch {}
      if (origin && !sameOrigin && !allowedOrigins.includes(origin)) { json(response, 403, { error:'Origin not allowed' }); return; }
      if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
      const methods = pathname === '/api/health' ? 'GET, OPTIONS' : 'POST, OPTIONS';
      if (request.method === 'OPTIONS') {
        response.writeHead(204, { 'Access-Control-Allow-Methods':methods, 'Access-Control-Allow-Headers':'Content-Type', 'Access-Control-Max-Age':'600' }); response.end(); return;
      }
      if (pathname === '/api/health') {
        if (request.method !== 'GET') { response.setHeader('Allow', methods); json(response, 405, { error:'Use GET' }); return; }
        if (!health || Date.now() > healthUntil) {
          healthUntil = Infinity;
          health = Promise.resolve().then(() => inspectEngine(engine())).catch(() => false).then(ready => { healthUntil = Date.now()+5000; return ready; });
        }
        const ready = await health;
        json(response, ready ? 200 : 503, ready
          ? { ready:true, engine:'rust', sources:'checked when searching' }
          : { ready:false, code:'BACKEND_NOT_READY', error:'The Rust search backend is not running.' });
        return;
      }
      if (request.method !== 'POST') { response.setHeader('Allow', 'POST, OPTIONS'); json(response, 405, { error:'Use POST' }); return; }
      if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') { json(response, 415, { error:'Use application/json' }); return; }
      const now = Date.now();
      for (const [ip, entry] of clients) if (entry.until < now) clients.delete(ip);
      const ip = request.socket.remoteAddress;
      const entry = clients.get(ip) || { count:0, until:now+60000 };
      if (entry.count >= limit || pending >= 8 || (!clients.has(ip) && clients.size >= 10000)) { response.setHeader('Retry-After','60'); json(response, 429, { error:'Please wait before searching again' }); return; }
      entry.count++; clients.set(ip, entry);
      let data;
      try { data = await body(request); }
      catch (error) { json(response, error.message === 'Request too large' ? 413 : 400, { error:error.message }); return; }
      if (!data || Array.isArray(data) || typeof data.q !== 'string' || !data.q.trim() || [...data.q.trim()].length > 500 || (data.category !== undefined && data.category !== 'web') || (data.cursor != null && (typeof data.cursor !== 'string' || data.cursor.length > 2048))) { json(response, 400, { error:'Use a query of 1–500 characters and the web category' }); return; }
      if (pending >= 8) { json(response, 429, { error:'The search service is busy' }); return; }
      pending++;
      try {
        const result = await engine().search(data.q.trim(), 'web', data.cursor ?? null);
        if (!response.destroyed) json(response, 200, result);
      } catch (error) {
        if (!response.destroyed) {
          if (['SOURCE_UNAVAILABLE','SEARCH_UNAVAILABLE'].includes(error.code))
            json(response, 502, { code:'SOURCE_UNAVAILABLE', error:'The Rust engine could not reach its search sources. Please retry shortly.' });
          else if (['ENOENT','EACCES','ENOEXEC'].includes(error.code))
            json(response, 503, { code:'BACKEND_NOT_READY', error:'The Rust search backend is not running.' });
          else json(response, 503, { error:'Search is temporarily unavailable' });
        }
      } finally { pending--; }
      return;
    }
    if (!['GET','HEAD'].includes(request.method)) { json(response, 405, { error:'Method not allowed' }); return; }
    if (pathname === '/site/notes') { response.writeHead(308, { Location:'/site/notes/' }); response.end(); return; }
    const relative = pathname === '/' || pathname === '/index.html' ? 'index.html' : pathname === '/site/notes/' ? 'site/notes/index.html' : pathname.startsWith('/site/assets/') ? pathname.slice(1) : null;
    if (!relative || relative.includes('\\') || relative.split('/').some(part => part === '..' || part.startsWith('.')) || !mime[extname(relative)]) { json(response, 404, { error:'Not found' }); return; }
    try {
      const file = await realpath(resolve(root, relative));
      if (file !== resolve(root, relative) || !file.startsWith(root.endsWith(sep) ? root : root+sep) || !(await stat(file)).isFile()) throw new Error('Not found');
      const content = await readFile(file);
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self' https://generativelanguage.googleapis.com; object-src 'none'; base-uri 'none'; form-action 'self'");
      response.setHeader('Cache-Control', 'no-cache');
      if (relative.startsWith('site/notes/') || relative.startsWith('site/assets/modules/')) response.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
      response.writeHead(200, { 'Content-Type':mime[extname(file)], 'Content-Length':content.length });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch { json(response, 404, { error:'Not found' }); }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.on('close', () => client?.close());
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createWebsite();
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log(`Sreon website listening on port ${server.address().port}`));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
}
