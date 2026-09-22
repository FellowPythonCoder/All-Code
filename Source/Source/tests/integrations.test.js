import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { Sreon } from "../integrations/sreon.mjs";

const helper = fileURLToPath(new URL("./fixtures/api-helper.mjs", import.meta.url));
const client = (options = {}) => new Sreon(process.execPath, { args: [helper], ...options });

test("Node client serializes concurrent requests and preserves Unicode, category, and cursor", async (t) => {
  const engine = client();
  t.after(() => engine.close());
  const cursor = { source: "media", offset: 24 };
  const data = await Promise.all([engine.search("森林", "images", cursor), engine.search("YouTube"), engine.search("forest")]);
  assert.deepEqual(data.map(item => item.results[0].title), ["森林", "YouTube", "forest"]);
  assert.equal(data[0].category, "images");
  assert.deepEqual(data[0].cursor, cursor);
});

test("valid API errors do not disconnect the Node client", async (t) => {
  const engine = client();
  t.after(() => engine.close());
  await assert.rejects(engine.search("error"), (error) => {
    assert.equal(error.message, "Source unavailable");
    assert.equal(error.code, "SEARCH_UNAVAILABLE");
    assert.equal(error.status, 502);
    return true;
  });
  assert.equal((await engine.search("next")).results[0].title, "next");
});

for (const query of ["null", "wrong-id", "wrong-version", "bad-json", "bad-result", "large-response", "exit"]) {
  test(`Node client safely rejects ${query} responses`, async (t) => {
    const engine = client();
    t.after(() => engine.close());
    await assert.rejects(engine.search(query));
    await assert.rejects(engine.search("later"));
    assert.ok(engine.failure);
  });
}

test("Node client times out a stalled helper and rejects queued requests", async (t) => {
  const engine = client({ timeoutMs: 150 });
  t.after(() => engine.close());
  const results = await Promise.allSettled([engine.search("stall"), engine.search("queued")]);
  for (const result of results) {
    assert.equal(result.status, "rejected");
    assert.match(result.reason.message, /timed out/);
  }
});

test("Node close is idempotent and immediately rejects pending work", async () => {
  const engine = client();
  const rejection = assert.rejects(engine.search("stall"), /closed/);
  engine.close();
  engine.close();
  await rejection;
  await assert.rejects(engine.search("later"), /closed/);
});

test("oversized and unserializable requests never corrupt the Node protocol", async (t) => {
  const engine = client();
  t.after(() => engine.close());
  await assert.rejects(engine.search("x".repeat(17000)), /16 KiB/);
  const cursor = {};
  cursor.circular = cursor;
  await assert.rejects(engine.search("test", "web", cursor), /circular/i);
  assert.equal((await engine.search("ok")).results[0].title, "ok");
});

test("Node client bounds the pending queue", async (t) => {
  const engine = client({ timeoutMs: 10000 });
  t.after(() => engine.close());
  const pending = Array.from({ length: 32 }, () => engine.search("stall").catch(error => error));
  await assert.rejects(engine.search("extra"), /pending searches/);
  engine.close();
  await Promise.all(pending);
});

test("Python client protocol and lifecycle regression tests", async () => {
  const execute = promisify(execFile);
  await execute(process.platform === "win32" ? "python" : "python3", ["tests/integrations_test.py"], { env: { ...process.env, SREON_TEST_NODE: process.execPath }, timeout: 30000 });
});
