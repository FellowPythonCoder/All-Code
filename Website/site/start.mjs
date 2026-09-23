import { spawn } from 'node:child_process';
import { access, readdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { Sreon } from '../Extra/Source/integrations/sreon.mjs';
import { createWebsite } from './server.mjs';
import { inspectEngine } from './backend.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
async function executable(path) {
  try { await access(path, constants.X_OK); return (await stat(path)).isFile(); }
  catch { return false; }
}
async function newestSource(directory) {
  let newest = 0;
  let entries;
  try { entries = await readdir(directory, { withFileTypes:true }); }
  catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, await newestSource(path));
    else if (entry.isFile() && entry.name.endsWith('.rs')) newest = Math.max(newest, (await stat(path)).mtimeMs);
  }
  return newest;
}
function compile(root) {
  return new Promise((resolveBuild, reject) => {
    const child = spawn('cargo', ['build','--manifest-path','Extra/Source/src-tauri/Cargo.toml','--release','--no-default-features','--features','api','--bin','sreon-api'], { cwd:root, stdio:'inherit', windowsHide:true });
    child.once('error', error => reject(error.code === 'ENOENT'
      ? new Error('Rust is not installed. Install Rust, then run node site/start.mjs again, or use the complete site/Dockerfile container.')
      : error));
    child.once('exit', code => code === 0 ? resolveBuild() : reject(new Error('Rust backend compilation failed. No disconnected search server was started.')));
  });
}
export async function prepareBackend({ root = project, configured = process.env.SREON_API, build = compile, force = false } = {}) {
  if (configured) {
    const path = resolve(root, configured);
    if (!await executable(path)) throw new Error('SREON_API must point to an existing executable Rust search helper. Check its path and permissions.');
    return path;
  }
  const crate = join(root, 'Extra/Source/src-tauri');
  const path = join(crate, 'target/release/sreon-api'+(process.platform === 'win32' ? '.exe' : ''));
  let stale = !await executable(path);
  if (!stale) {
    let newest = await newestSource(join(crate, 'src'));
    for (const name of ['Cargo.toml','Cargo.lock','build.rs']) {
      try { newest = Math.max(newest, (await stat(join(crate, name))).mtimeMs); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    stale = newest > (await stat(path)).mtimeMs;
  }
  if (force || stale) await build(root);
  if (!await executable(path)) throw new Error('Build finished without an executable Rust search helper.');
  return path;
}
export async function startWebsite({ root = project, configured = process.env.SREON_API, port = Number(process.env.PORT || 3000), host = '0.0.0.0', force = false } = {}) {
  const path = await prepareBackend({ root, configured, force });
  const client = new Sreon(path);
  let ready;
  try { ready = await inspectEngine(client); }
  finally { client.close(); }
  if (!ready) throw new Error('Rust backend failed its protocol check. Website startup stopped rather than offering disconnected search.');
  const server = createWebsite({ executable:path });
  server.listen(port, host);
  await once(server, 'listening');
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const server = await startWebsite({ force:process.argv.includes('--rebuild') });
    console.log(`Sreon website and Rust search backend ready on port ${server.address().port}`);
    for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
