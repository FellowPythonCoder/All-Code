import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = join(root, "dist", "desktop");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const file of [
  "index.html",
  "styles.css",
  "app.js",
  "native.js",
  "theme.js",
  "assets",
]) {
  await cp(join(root, "app", file), join(destination, file), { recursive: true });
}
console.log("Sreon desktop assets are ready. No web server is started.");
