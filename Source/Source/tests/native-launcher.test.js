import test from "node:test";
import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

async function fixture(callback) {
  const root = await mkdtemp(join(tmpdir(), "sreon-native-"));
  const project = join(root, "Sreon App");
  const bin = join(root, "bin");
  const home = join(root, "home");
  const log = join(root, "commands");
  await Promise.all([
    mkdir(project),
    mkdir(bin),
    mkdir(home),
    writeFile(log, ""),
  ]);
  await copyFile(
    new URL("../sreon.sh", import.meta.url),
    join(project, "sreon.sh"),
  );
  const commands = {
    uname: '#!/bin/sh\nprintf "%s\\n" "$TEST_OS"\n',
    cargo: "#!/bin/sh\nexit 0\n",
    node: "#!/bin/sh\nexit 0\n",
    "xcode-select": "#!/bin/sh\nexit 0\n",
    open: '#!/bin/sh\nprintf "open %s\\n" "$*" >> "$TEST_LOG"\n',
    npm: '#!/bin/sh\nprintf "npm %s\\n" "$*" >> "$TEST_LOG"\nif [ "$1" = run ]; then\n  if [ "$TEST_FAIL" = 1 ]; then exit 1; fi\n  mkdir -p "$TEST_PROJECT/src-tauri/target/release/bundle/macos/Sreon.app"\nfi\n',
  };
  for (const [name, source] of Object.entries(commands))
    await writeFile(join(bin, name), source, { mode: 0o755 });
  async function run(args = [], overrides = {}) {
    const env = {
      ...process.env,
      HOME: home,
      PATH: `${bin}:${process.env.PATH}`,
      TEST_LOG: log,
      TEST_PROJECT: project,
      TEST_OS: "Darwin",
      TEST_FAIL: "0",
      ...overrides,
    };
    try {
      const result = await execute(
        "/bin/bash",
        [join(project, "sreon.sh"), ...args],
        { cwd: root, env, timeout: 15000 },
      );
      return { ...result, code: 0, commands: await readFile(log, "utf8") };
    } catch (error) {
      return { ...error, commands: await readFile(log, "utf8") };
    }
  }
  try {
    await callback(run, project);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("native launcher opens an existing app without Docker, npm, or a web server", { skip: process.platform === "win32" }, async () => {
  await fixture(async (run, project) => {
    const app = join(
      project,
      "src-tauri/target/release/bundle/macos/Sreon.app",
    );
    await mkdir(app, { recursive: true });
    const result = await run();
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.commands.trim(), `open ${app}`);
  });
});

test("native launcher builds a real app bundle and opens its filesystem path", { skip: process.platform === "win32" }, async () => {
  await fixture(async (run, project) => {
    const result = await run(["build"]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.commands, /npm ci/);
    assert.match(result.commands, /npm run desktop:build -- --bundles app/);
    assert.ok(
      result.commands.includes(
        `open ${project}/src-tauri/target/release/bundle/macos/Sreon.app`,
      ),
    );
    assert.doesNotMatch(result.commands, /docker|http:|localhost|npm start/);
  });
});

test("native build errors never fall back to localhost", { skip: process.platform === "win32" }, async () => {
  await fixture(async (run) => {
    const result = await run(["build"], { TEST_FAIL: "1" });
    assert.equal(result.code, 1);
    assert.doesNotMatch(result.commands, /open |docker|npm start/);
  });
});

test("non-Mac launch is rejected with instructions instead of starting a website", { skip: process.platform === "win32" }, async () => {
  await fixture(async (run) => {
    const result = await run([], { TEST_OS: "Linux" });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Run it on your Mac/);
    assert.equal(result.commands, "");
  });
});
