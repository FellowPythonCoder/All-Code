import { execFileSync } from "node:child_process";
import { readFile, readdir, appendFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";

const metadata = JSON.parse(execFileSync("cargo", ["metadata", "--locked", "--format-version", "1", "--manifest-path", "src-tauri/Cargo.toml"], { encoding: "utf8", maxBuffer: 20_000_000 }));
const notices = new Map();
for (const dependency of metadata.packages) {
  if (dependency.name === "sreon" && !dependency.source) continue;
  const root = dirname(dependency.manifest_path);
  const files = new Set();
  if (dependency.license_file) files.add(resolve(root, dependency.license_file));
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isFile() && /^(licen[cs]e|copying|copyright|notice)([._-]|$)/i.test(entry.name)) files.add(join(root, entry.name));
    if (entry.isDirectory() && /^licenses?$/i.test(entry.name)) {
      for (const file of await readdir(join(root, entry.name), { withFileTypes: true }))
        if (file.isFile()) files.add(join(root, entry.name, file.name));
    }
  }
  const label = `${dependency.name} ${dependency.version} (${dependency.license || "see notice"})`;
  if (!files.size) {
    const text = `No separate license file was included in this crate package. Declared license: ${dependency.license || "unspecified"}. Source: ${dependency.repository || dependency.source || "Cargo registry"}`;
    notices.set(text, [label]);
  }
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const labels = notices.get(text) || [];
    if (!labels.includes(label)) labels.push(label);
    notices.set(text, labels);
  }
}
let output = "\n## Rust dependency notices for this build\n\nNotices are grouped when their full text is identical. Cargo.lock records exact dependencies.\n";
for (const [text, labels] of notices) {
  const longest = Math.max(2, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  output += `\n### ${labels.join(", ")}\n\n${fence}text\n${text}\n${fence}\n`;
}
if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(process.env.GITHUB_REPOSITORY || "") && /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || ""))
  output += `\n## Exact source for this build\n\nhttps://github.com/${process.env.GITHUB_REPOSITORY}/tree/${process.env.GITHUB_SHA}\n`;
await appendFile("../HOW-IT-WORKS.md", output);
