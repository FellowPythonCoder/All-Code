import { test as base, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, resolve, sep } from "node:path";

const root = fileURLToPath(new URL("../app/", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2" };

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("https://sreon.test/**", async (route) => {
      const url = new URL(route.request().url());
      let path;
      try { path = resolve(root, decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html"); }
      catch { await route.fulfill({ status: 400, body: "Invalid path" }); return; }
      const contentType = types[extname(path)];
      if (!path.startsWith(resolve(root) + sep) || !contentType) {
        await route.fulfill({ status: 404, body: "Not found" });
        return;
      }
      try { await route.fulfill({ contentType, body: await readFile(path) }); }
      catch { await route.fulfill({ status: 404, body: "Not found" }); }
    });
    await use(page);
  },
});
export { expect };
