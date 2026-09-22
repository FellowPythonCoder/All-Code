import { cp, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function collectBuilds(root) {
  const destination = join(root, "..", "..", "Builds");
  await mkdir(destination, { recursive: true });
  let count = 0;
  for (const target of ["release", "universal-apple-darwin/release"]) {
    for (const kind of ["macos", "dmg", "nsis", "appimage", "deb"]) {
      const directory = join(root, "src-tauri", "target", target, "bundle", kind);
      let entries;
      try { entries = await readdir(directory, { withFileTypes: true }); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      for (const entry of entries) {
        if ((entry.isDirectory() && entry.name.endsWith(".app")) || (entry.isFile() && /\.(dmg|exe|AppImage|deb)$/.test(entry.name))) {
          await cp(join(directory, entry.name), join(destination, entry.name), { recursive: true, force: true, verbatimSymlinks: true });
          count++;
        }
      }
    }
  }
  if (!count) throw new Error("No app bundles were produced. Choose app, dmg, nsis, appimage, or deb when building.");
  return destination;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(`Runnable apps copied to ${await collectBuilds(fileURLToPath(new URL("../", import.meta.url)))}`);
