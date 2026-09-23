import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run=promisify(execFile);
test('website source ZIP includes the actual engine and only clean source files',async()=>{
  const python=process.platform==='win32'?'python':'python3';
  await run(python,['site/package.py']);
  await run(python,['-c',`import zipfile
with zipfile.ZipFile('Extra/Sreon-website.zip') as z:
 names=set(z.namelist())
 for name in ['index.html','site/server.mjs','site/start.mjs','site/backend.mjs','site/Dockerfile','site/notes/index.html','site/assets/modules/module-07.js','site/assets/coast.webp','Extra/HOW-IT-WORKS.md','Extra/Source/src-tauri/src/api.rs','Extra/Source/src-tauri/src/search.rs','Extra/Source/integrations/sreon.mjs']:
  assert 'Sreon-website/'+name in names, name
 for name in names:
  assert not any(part in {'.git','node_modules','target','__pycache__','dist','o','games','test-results','playwright-report'} for part in name.split('/')), name
  assert not name.endswith(('.zip','.pyc','.env')), name
  assert '..' not in name.split('/')
`]);
});
