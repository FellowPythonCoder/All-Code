import { spawn } from "node:child_process";

const MAX_RESPONSE = 4 * 1024 * 1024;

export class Sreon {
  constructor(executable, { args = [], timeoutMs = 20000 } = {}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647)
      throw new RangeError("timeoutMs must be between 1 and 2147483647");
    this.process = spawn(executable, args, { stdio: ["pipe", "pipe", "inherit"], windowsHide: true });
    this.sequence = 0;
    this.queue = [];
    this.active = null;
    this.failure = null;
    this.buffer = "";
    this.timeoutMs = timeoutMs;
    this.process.stdout.setEncoding("utf8");
    this.process.stdout.on("data", (chunk) => {
      this.buffer += chunk;
      let end;
      while (!this.failure && (end = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 1);
        if (Buffer.byteLength(line) > MAX_RESPONSE) {
          this.fail(new Error("Sreon response exceeds 4 MiB"));
          return;
        }
        this.receive(line);
      }
      if (Buffer.byteLength(this.buffer) > MAX_RESPONSE)
        this.fail(new Error("Sreon response exceeds 4 MiB"));
    });
    this.process.stdout.on("end", () => this.fail(new Error("Sreon API stopped")));
    this.process.on("error", (error) => this.fail(error));
    this.process.on("close", () => this.fail(new Error("Sreon API stopped")));
    this.process.stdin.on("error", (error) => this.fail(error));
    this.process.stdout.on("error", (error) => this.fail(error));
  }

  receive(line) {
    let message;
    try { message = JSON.parse(line); }
    catch { this.fail(new Error("Invalid Sreon response")); return; }
    const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
    if (!object(message) || message.version !== 1 || !this.active || message.id !== this.active.id) {
      this.fail(new Error("Unexpected Sreon response or protocol version"));
      return;
    }
    const hasError = Object.hasOwn(message, "error");
    const hasResult = Object.hasOwn(message, "result");
    if (hasError === hasResult || (hasError && (!object(message.error) || typeof message.error.message !== "string")) || (hasResult && (!object(message.result) || !Array.isArray(message.result.results)))) {
      this.fail(new Error("Invalid Sreon response"));
      return;
    }
    const active = this.active;
    clearTimeout(active.timer);
    this.active = null;
    if (hasError) {
      const error = new Error(message.error.message);
      error.name = "SreonApiError";
      error.code = typeof message.error.code === "string" ? message.error.code : undefined;
      error.status = Number.isInteger(message.error.status) ? message.error.status : undefined;
      active.reject(error);
    }
    else active.resolve(message.result);
    this.sendNext();
  }

  sendNext() {
    if (this.failure || this.active || !this.queue.length) return;
    const request = this.queue.shift();
    this.active = request;
    request.timer = setTimeout(() => this.fail(new Error("Sreon request timed out")), this.timeoutMs);
    this.process.stdin.write(request.line, (error) => { if (error) this.fail(error); });
  }

  fail(error) {
    if (this.failure) return;
    this.failure = error;
    if (this.active) {
      clearTimeout(this.active.timer);
      this.active.reject(error);
      this.active = null;
    }
    for (const request of this.queue) request.reject(error);
    this.queue = [];
    this.buffer = "";
    this.process.stdin.destroy();
    this.process.stdout.destroy();
    this.process.kill();
  }

  async search(q, category = "web", cursor = null) {
    if (this.failure) throw this.failure;
    if (this.queue.length + Number(Boolean(this.active)) >= 32)
      throw new Error("Wait for pending searches to finish");
    const id = ++this.sequence;
    const line = JSON.stringify({ id, method: "search", params: { q, category, cursor } }) + "\n";
    if (Buffer.byteLength(line) > 16384) throw new Error("Request exceeds 16 KiB");
    return new Promise((resolve, reject) => {
      this.queue.push({ id, line, resolve, reject });
      this.sendNext();
    });
  }

  close() {
    this.fail(new Error("Sreon client is closed"));
  }
}
