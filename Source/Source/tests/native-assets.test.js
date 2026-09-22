import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

test("desktop package contains only bundled UI assets, never the web server or legacy files", async () => {
  await execute(process.execPath, ["scripts/prepare-desktop.mjs"]);
  const files = (
    await readdir(new URL("../dist/desktop/", import.meta.url))
  ).sort();
  assert.deepEqual(files, [
    "app.js",
    "assets",
    "index.html",
    "native.js",
    "styles.css",
    "theme.js",
  ]);
  const html = await readFile(
    new URL("../dist/desktop/index.html", import.meta.url),
    "utf8",
  );
  assert.ok(html.indexOf('src="native.js"') < html.indexOf('src="app.js"'));
  assert.doesNotMatch(html, /<iframe|localhost|docker|demo-browser/i);
});

test("only the local main window receives explicitly scoped native commands", async () => {
  const config = JSON.parse(
    await readFile(
      new URL("../src-tauri/tauri.conf.json", import.meta.url),
      "utf8",
    ),
  );
  const capability = JSON.parse(
    await readFile(
      new URL("../src-tauri/capabilities/main.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(config.build.devUrl, undefined);
  assert.equal(config.build.frontendDist, "../dist/desktop");
  assert.deepEqual(config.app.security.capabilities, ["main"]);
  assert.equal(capability.windows, undefined);
  assert.deepEqual(capability.webviews, ["main"]);
  assert.equal(capability.remote, undefined);
  assert.deepEqual(
    capability.permissions.filter((name) => name.startsWith("allow-")),
    ["allow-search", "allow-open-page", "allow-navigate"],
  );
  assert.ok(
    !capability.permissions.some((permission) =>
      /shell|fs:|http:|process:/.test(permission),
    ),
  );
});


test("one explanatory document retains every original project and font license", async () => {
  const root = new URL("../", import.meta.url);
  const docs = (await readdir(new URL("../../", import.meta.url))).filter((file) => /\.(md|txt)$/i.test(file));
  assert.deepEqual(docs, ["HOW-IT-WORKS.md"]);
  const document = await readFile(new URL("../HOW-IT-WORKS.md", root), "utf8");
  const config = JSON.parse(await readFile(new URL("src-tauri/tauri.conf.json", root), "utf8"));
  assert.deepEqual(config.bundle.resources, { "../../HOW-IT-WORKS.md": "HOW-IT-WORKS.md" });
  const notices = document.slice(document.indexOf("### Sreon —")).split("```text\n").slice(1, 4).map((part) => part.split("\n```")[0]);
  assert.equal(notices.length, 3);
  assert.deepEqual(notices.map((notice) => createHash("sha256").update(notice).digest("hex")), ["d8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee", "6fbd040a29c2037a765dfb9f2561e9965b5c95c6dcb5dce516089d63d5f17af7", "b6106a757902d2d412e09d94dc4a226fe3da80485208a98003969f1b8b6b1d74"]);
  assert.equal((await readdir(new URL("app/assets/fonts/", root))).some((file) => file.endsWith(".txt")), false);
});

test("source has no standalone website entry point or preview command", async () => {
  const root = new URL("../", import.meta.url);
  const files = await readdir(root);
  assert.ok(!files.includes("index.html"));
  assert.ok(!files.includes("CNAME"));
  assert.ok(!files.includes("server.js"));
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(packageJson.scripts.preview, undefined);
  assert.ok(!(await readdir(new URL("scripts/", root))).includes("preview.mjs"));
});
