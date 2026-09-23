import { startWebsite } from '../start.mjs';
import assert from 'node:assert/strict';

const server = await startWebsite({ port:0, host:'127.0.0.1' });
try {
  const health = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
  assert.equal(health.status,200);
  assert.equal((await health.json()).engine,'rust');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/search`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:'YouTube',category:'web'}),signal:AbortSignal.timeout(25000)});
  assert.equal(response.status,200,'Real Rust engine should answer the website adapter');
  const data = await response.json();
  assert.ok(data.results.some(result => ['youtube.com','www.youtube.com'].includes(new URL(result.url).hostname)), 'Results should contain the real YouTube website');
  console.log('Website HTTP endpoint → compiled Rust API → live YouTube result verified');
} finally {
  server.close(); server.closeAllConnections();
}
