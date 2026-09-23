import { defineConfig } from '../Extra/Source/node_modules/@playwright/test/index.mjs';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir:'./tests', testMatch:'**/*.spec.mjs', fullyParallel:true, workers:2,
  use:{ baseURL:'http://127.0.0.1:3000', headless:true, launchOptions:process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote']} : {} },
  webServer:{ command:'node site/server.mjs', cwd:fileURLToPath(new URL('../',import.meta.url)), url:'http://127.0.0.1:3000', reuseExistingServer:!process.env.CI },
});
