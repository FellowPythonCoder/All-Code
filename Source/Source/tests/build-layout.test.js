import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectBuilds } from "../scripts/collect-builds.mjs";

test("only runnable bundles are copied into Builds", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "sreon-layout-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "Extra", "Source");
  const directory = join(source, "src-tauri", "target", "release", "bundle");
  await mkdir(join(directory, "nsis"), { recursive: true });
  await writeFile(join(directory, "nsis", "Sreon-setup.exe"), "installer");
  await writeFile(join(directory, "nsis", "support.json"), "not an app");
  await mkdir(join(directory, "macos", "Sreon.app", "Contents"), { recursive: true });
  await writeFile(join(directory, "macos", "Sreon.app", "Contents", "Info.plist"), "bundle");
  const destination = await collectBuilds(source);
  assert.equal(destination, join(source, "..", "..", "Builds"));
  assert.deepEqual((await readdir(destination)).sort(), ["Sreon-setup.exe", "Sreon.app"]);
  assert.equal(await readFile(join(destination, "Sreon-setup.exe"), "utf8"), "installer");
});

test("missing bundles are reported instead of presenting an empty build as runnable", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "sreon-empty-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(collectBuilds(join(root, "Extra", "Source")), /No app bundles/);
});
