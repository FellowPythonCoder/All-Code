import { test, expect } from '../../Extra/Source/node_modules/@playwright/test/index.mjs';

test('minimal homepage has a single colon entrance and no download links', async ({page}) => {
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'A little more room to explore.'})).toBeVisible();
  await expect(page.locator('a[href="/site/notes/"]')).toHaveCount(1);
  await expect(page.locator('.quiet-colon')).toHaveText(':');
  await expect(page.getByRole('link',{name:/download/i})).toHaveCount(0);
  await expect(page.locator('.hero-photo img')).toBeVisible();
  await page.getByRole('button',{name:'Switch to dark mode'}).click();
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.locator('.quiet-colon').click();
  await expect(page.getByRole('heading',{name:'Off the clock.'})).toBeVisible();
  await expect(page.locator('.game-card')).toHaveCount(24);
  expect(errors).toEqual([]);
});
test('try area uses API data, safely renders results, and paginates', async ({page}) => {
  const requests=[];
  await page.route('**/api/search',route=>{
    requests.push(route.request().postDataJSON());
    return route.fulfill({json:{results:[{title:'<b>YouTube</b>',url:'https://www.youtube.com/',content:'Watch and discover.'},{title:'Unsafe',url:'javascript:alert(1)'}],nextCursor:requests.length===1?'next':null}});
  });
  await page.goto('/#try'); await page.locator('#query').fill('YouTube'); await page.locator('#search-submit').click();
  await expect(page.locator('.result')).toHaveCount(1);
  await expect(page.locator('.result a')).toHaveText('<b>YouTube</b>');
  await expect(page.locator('.result b')).toHaveCount(0);
  await page.locator('#more').click(); await expect(page.locator('.result')).toHaveCount(2);
  expect(requests[1]).toEqual({q:'YouTube',category:'web',cursor:'next'});
});
test('search errors do not create fake results and retry works', async ({page}) => {
  let fail=true;
  await page.route('**/api/search',route=>route.fulfill(fail?{status:503,json:{code:'BACKEND_NOT_READY',error:'Unavailable'}}:{json:{results:[{title:'Example',url:'https://example.org/'}]}}));
  await page.goto('/#try'); await page.locator('#query').fill('example'); await page.locator('#search-submit').click();
  await expect(page.locator('#search-status')).toContainText('not connected'); await expect(page.locator('.result')).toHaveCount(0);
  fail=false; await page.locator('#search-submit').click(); await expect(page.locator('.result')).toHaveCount(1);
});
test('Geometry Rush starts, 4 enables autoplay, and the button returns control', async ({page}) => {
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/site/notes/'); await page.getByRole('button',{name:/Geometry Rush/}).click();
  const canvas=page.locator('#game-canvas');
  const box=await canvas.boundingBox();
  await page.mouse.click(box.x+box.width*(75/760),box.y+box.height*(145/460));
  await expect(page.locator('#auto-play')).toBeEnabled();
  await page.keyboard.press('4'); await expect(page.locator('#auto-play')).toHaveAttribute('aria-pressed','true');
  await page.locator('#auto-play').click(); await expect(page.locator('#auto-play')).toHaveAttribute('aria-pressed','false');
  await page.locator('#exit-game').click(); await expect(page.locator('#library')).toBeVisible(); expect(errors).toEqual([]);
});
test('AI key stays out of persistent storage and request URLs; replies render safely', async ({page}) => {
  let request;
  await page.route('https://generativelanguage.googleapis.com/**',route=>{request=route.request();return route.fulfill({json:{candidates:[{content:{parts:[{text:'<img src=x onerror=alert(1)>\n```js\nconst x = 1;\n```'}]}}]}});});
  await page.goto('/site/notes/'); await page.getByRole('tab',{name:/Think/}).click();
  await page.locator('#api-key').fill('test-key-not-real'); await page.getByRole('button',{name:'Connect',exact:true}).click();
  await page.locator('#message').fill('Hello world'); await page.getByRole('button',{name:'Send ↗'}).click();
  await expect(page.locator('.message.ai')).toContainText('<img src=x'); await expect(page.locator('.message.ai img')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Copy code'})).toBeVisible();
  expect(request.url()).not.toContain('test-key'); expect(request.headers()['x-goog-api-key']).toBe('test-key-not-real');
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('test-key');
  expect(await page.evaluate(()=>JSON.stringify(sessionStorage))).not.toContain('test-key');
  await page.getByRole('button',{name:'Clear chat'}).click(); await expect(page.locator('.message')).toHaveCount(0);
});
test('AI handles keyless sends, optional tab storage, and provider errors', async ({page}) => {
  await page.route('https://generativelanguage.googleapis.com/**',route=>route.fulfill({status:429,json:{error:{message:'limited'}}}));
  await page.goto('/site/notes/'); await page.getByRole('tab',{name:/Think/}).click();
  await page.locator('#message').fill('hello with spaces'); await page.getByRole('button',{name:'Send ↗'}).click();
  await expect(page.locator('#chat-status')).toContainText('Connect your own');
  await page.locator('#api-key').fill('test-key'); await page.locator('#remember-key').check(); await page.getByRole('button',{name:'Connect',exact:true}).click();
  expect(await page.evaluate(()=>sessionStorage.getItem('sreon-tab-key'))).toBe('test-key');
  await page.getByRole('button',{name:'Send ↗'}).click(); await expect(page.locator('#chat-status')).toContainText('Provider limit');
  await expect(page.locator('#message')).toHaveValue('hello with spaces');
  await page.getByRole('button',{name:'Forget key'}).click(); expect(await page.evaluate(()=>sessionStorage.getItem('sreon-tab-key'))).toBeNull();
});
test('phone layout stays within the screen on the homepage and both hidden tabs', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  for(const path of ['/','/site/notes/']) {
    await page.goto(path); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByRole('tab',{name:/Think/}).click(); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('all 24 relocated modules can start without script or canvas errors', async ({page}) => {
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/site/notes/');
  for(let index=0;index<24;index++) {
    await page.locator('.game-card').nth(index).click();
    await expect(page.locator('#game-canvas')).toBeVisible();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.locator('#exit-game').click();
  }
  expect(errors).toEqual([]);
});

test('endless mode starts from an accessible button and retains all three forms', async ({page}) => {
  await page.goto('/site/notes/'); await page.getByRole('button',{name:/Geometry Rush/}).click();
  await page.getByRole('button',{name:'∞ Endless'}).click();
  await expect(page.locator('#auto-play')).toBeEnabled();
  await page.keyboard.press('4');
  await expect(page.locator('#auto-play')).toHaveAttribute('aria-pressed','true');
  const modes = await page.evaluate(() => {
    const seen = new Set();
    for(let frame=0;frame<2000;frame++) { GAME_GD.update(running,1/60); seen.add(running.mode); }
    return {modes:[...seen].sort(),endless:running.endless,stage:running.stage,dead:running.dead};
  });
  expect(modes).toEqual({modes:['cube','ship','wave'],endless:true,stage:1,dead:false});
});

test('all three photographs load and the discovery cards submit a real API request', async ({page}) => {
  let query;
  await page.route('**/api/search',route=>{query=route.request().postDataJSON().q;return route.fulfill({json:{results:[]}});});
  await page.goto('/');
  await page.locator('.discovery-grid').scrollIntoViewIfNeeded();
  for(const image of await page.locator('.discovery-image img').all()) await expect.poll(()=>image.evaluate(img=>img.complete && img.naturalWidth>0)).toBe(true);
  await page.getByRole('button',{name:/Take the scenic route/}).click();
  await expect(page.locator('#query')).toHaveValue('quiet coastal walking trails');
  await expect.poll(()=>query).toBe('quiet coastal walking trails');
});

test('the try panel confirms engine readiness and distinguishes provider outages',async({page})=>{
  await page.route('**/api/health',route=>route.fulfill({json:{ready:true,engine:'rust'}}));
  await page.route('**/api/search',route=>route.fulfill({status:502,json:{code:'SOURCE_UNAVAILABLE'}}));
  await page.goto('/#try');
  await expect(page.locator('#search-status')).toContainText('Connected to the Rust');
  await page.locator('#query').fill('YouTube'); await page.locator('#search-submit').click();
  await expect(page.locator('#search-status')).toContainText('engine is running');
  await expect(page.locator('.result')).toHaveCount(0);
});
