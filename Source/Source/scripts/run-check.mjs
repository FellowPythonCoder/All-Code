import { spawn } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("A command is required");
const child = spawn(command, args, { shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] });
let tail = "";
const capture = (data, stream) => {
  stream.write(data);
  tail = (tail + data.toString()).slice(-16000);
};
child.stdout.on("data", data => capture(data, process.stdout));
child.stderr.on("data", data => capture(data, process.stderr));
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("close", code => {
  if (code && process.env.GITHUB_ACTIONS) {
    const text = tail.replace(/\u001b\[[0-9;]*m/g, "");
    for (let offset = 0; offset < text.length; offset += 3000) {
      const message = text.slice(offset, offset + 3000).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
      console.log(`::error title=Build diagnostics ${1 + offset / 3000}::${message}`);
    }
  }
  process.exitCode = code ?? 1;
});
