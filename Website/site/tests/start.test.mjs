import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, chmod, rm, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareBackend } from '../start.mjs';
import { inspectEngine } from '../backend.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'sreon-start-'));
  t.after(() => rm(root, { recursive:true, force:true }));
  const crate = join(root, 'Extra/Source/src-tauri');
  const binary = join(crate, 'target/release/sreon-api'+(process.platform === 'win32' ? '.exe' : ''));
  await mkdir(join(crate,'target/release'),{recursive:true});
  await mkdir(join(crate,'src'),{recursive:true});
  async function build() { await writeFile(binary,'test executable'); await chmod(binary,0o755); }
  return {root,crate,binary,build};
}
test('normal website startup builds a missing Rust engine',async t=>{
  const f = await fixture(t); let calls = 0;
  const binary = await prepareBackend({root:f.root, configured:undefined, build:async root=>{calls++;assert.equal(root,f.root);await f.build();}});
  assert.equal(binary,f.binary); assert.equal(calls,1);
});
test('existing backend is reused without requiring a compiler',async t=>{
  const f = await fixture(t); await f.build();
  assert.equal(await prepareBackend({root:f.root, configured:undefined, build:()=>assert.fail('Unexpected build')}),f.binary);
});
test('modified Rust source rebuilds the default backend',async t=>{
  const f = await fixture(t); await f.build();
  const file = join(f.crate,'src/search.rs'); await writeFile(file,'source'); await utimes(f.binary,1,1);
  let calls = 0;
  await prepareBackend({root:f.root, configured:undefined, build:async()=>{calls++;await f.build();}});
  assert.equal(calls,1);
});
test('explicit backend path is checked without replacing the supplied program',async t=>{
  const f = await fixture(t); await f.build();
  assert.equal(await prepareBackend({root:f.root, configured:f.binary, build:()=>assert.fail('Unexpected build')}),f.binary);
  await assert.rejects(prepareBackend({root:f.root, configured:join(f.root,'missing')}),/SREON_API/);
});
test('failed or incomplete builds cannot start a disconnected website',async t=>{
  const f = await fixture(t);
  await assert.rejects(prepareBackend({root:f.root, configured:undefined, build:async()=>{throw new Error('compiler failed');}}),/compiler failed/);
  await assert.rejects(prepareBackend({root:f.root, configured:undefined, build:async()=>{}}),/without an executable/);
});
test('readiness verifies the Rust validation response without making a provider search',async()=>{
  let input;
  const client = {search:async(...args)=>{input=args;throw Object.assign(new Error('Invalid query'),{status:400,code:'INVALID_QUERY'});}};
  assert.equal(await inspectEngine(client),true);
  assert.deepEqual(input,['','web',null]);
  assert.equal(await inspectEngine({search:async()=>({results:[]})}),false);
  assert.equal(await inspectEngine({search:async()=>{throw new Error('stopped');}}),false);
});
