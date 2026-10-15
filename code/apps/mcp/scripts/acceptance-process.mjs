import { spawn } from "node:child_process";
import { once } from "node:events";

export class AcceptanceProcess {
  pending = new Map();
  sequence = 0;
  buffer = "";
  closed = false;
  constructor(executable, args, env, onEvent = () => {}) {
    this.ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.ready.catch(() => {});
    this.child = spawn(executable, args, {
      env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stderr.resume(); // Never print fixture protocol/source or credentials.
    this.child.stdin.on("error", () =>
      this.fail(new Error("Fixture stdin failed")),
    );
    this.child.on("error", () => {
      if (!this.child.pid) this.closed = true; // Spawn failure has no exit event.
      this.fail(new Error("Fixture process could not start"));
    });
    this.child.on("exit", () => {
      this.closed = true;
      this.fail(new Error("Fixture process exited"));
    });
    this.child.stdout.setEncoding("utf8").on("data", (chunk) => {
      this.buffer += chunk;
      if (this.buffer.length > 8 * 1024 * 1024) {
        this.fail(new Error("Fixture output limit exceeded"));
        this.child.kill();
        return;
      }
      while (this.buffer.includes("\n")) {
        const end = this.buffer.indexOf("\n"),
          line = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 1);
        if (!line.trim()) continue;
        try {
          const value = JSON.parse(line);
          if (value.event === "ready") this.readyResolve(value.session);
          const item = this.pending.get(value.id);
          if (item) {
            clearTimeout(item.timer);
            this.pending.delete(value.id);
            value.error
              ? item.reject(new Error("Fixture RPC failed"))
              : item.resolve(value.result);
          } else if (value.event)
            Promise.resolve(onEvent(value)).catch(() =>
              this.fail(new Error("Fixture event failed")),
            );
        } catch {
          this.fail(new Error("Invalid fixture JSON"));
        }
      }
    });
  }
  fail(error) {
    this.readyReject(error);
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    this.pending.clear();
  }
  send(value) {
    if (this.closed)
      return Promise.reject(new Error("Fixture process already exited"));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Fixture RPC deadline exceeded"));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ ...value, id }) + "\n");
    });
  }
  command(command, payload) {
    return this.send({ command, payload });
  }
  rpc(method, params = {}) {
    return this.send({ jsonrpc: "2.0", method, params });
  }
  async initialize() {
    await this.rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "isolated-acceptance", version: "1" },
    });
    this.child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) +
        "\n",
    );
  }
  async close() {
    this.fail(new Error("Fixture closing"));
    if (!this.closed) {
      const exited = once(this.child, "exit");
      this.child.stdin.end();
      this.child.kill();
      await exited;
    }
  }
}
