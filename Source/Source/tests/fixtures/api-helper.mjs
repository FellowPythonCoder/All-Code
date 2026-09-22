import { createInterface } from "node:readline";

let active = false;
createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  const { q } = request.params;
  const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
  if (active) { send({ version: 1, id: -1, error: { message: "Requests must be serialized" } }); return; }
  if (q === "stall") { active = true; return; }
  if (q === "exit") { process.exit(0); }
  if (q === "null") { send(null); return; }
  if (q === "wrong-id") { send({ version: 1, id: request.id + 1, result: { results: [] } }); return; }
  if (q === "wrong-version") { send({ version: 2, id: request.id, result: { results: [] } }); return; }
  if (q === "bad-json") { process.stdout.write("{\n"); return; }
  if (q === "bad-result") { send({ version: 1, id: request.id, result: null }); return; }
  if (q === "large-response") { process.stdout.write("x".repeat(4 * 1024 * 1024 + 1)); return; }
  if (q === "error") { send({ version: 1, id: request.id, error: { status: 502, code: "SEARCH_UNAVAILABLE", message: "Source unavailable" } }); return; }
  active = true;
  setTimeout(() => {
    active = false;
    send({ version: 1, id: request.id, result: { results: [{ title: q, url: "https://example.org/" }], category: request.params.category, cursor: request.params.cursor } });
  }, 30);
});
