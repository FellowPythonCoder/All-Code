import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

test("source archive contains only app source and integration files without credentials or build output", async () => {
  await run(process.platform === "win32" ? "python" : "python3", ["scripts/package-source.py"]);
  const script = `import zipfile, pathlib
with zipfile.ZipFile('../Sreon-source.zip') as archive:
    names = set(archive.namelist())
    for file in ['app/index.html','src-tauri/src/search.rs','src-tauri/src/api.rs','integrations/sreon.py','integrations/sreon.mjs']:
        assert 'Sreon/Extra/Source/' + file in names, file
    assert 'Sreon/Extra/HOW-IT-WORKS.md' in names
    assert 'Sreon/Builds/' in names
    for name in names:
        assert name.startswith('Sreon/') and '..' not in pathlib.PurePosixPath(name).parts
        assert not any(part in {'.git','node_modules','target','.env','dist','games','o'} for part in pathlib.PurePosixPath(name).parts)
        assert not name.endswith('.zip')
        assert not name.endswith('/preview.mjs')
    assert 'Sreon/index.html' not in names
print('ok')`;
  const result = await run(process.platform === "win32" ? "python" : "python3", ["-c", script]);
  assert.equal(result.stdout.trim(), "ok");
});

test("source packager is atomic and independent of Git tracking", async () => {
  await run(process.platform === "win32" ? "python" : "python3", ["tests/packaging_test.py"], { timeout: 30000 });
});
