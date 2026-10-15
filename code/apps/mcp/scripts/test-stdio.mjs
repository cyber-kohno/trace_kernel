// Read-only smoke test of a built MCP executable; never discovers/edits a Workspace.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

const executable = process.argv[2]
  ? path.resolve(process.argv[2])
  : fileURLToPath(
      new URL(
        `../target/debug/trace-kernel-mcp${process.platform === "win32" ? ".exe" : ""}`,
        import.meta.url,
      ),
    );
const version = spawnSync(executable, ["--version-json"], {
  encoding: "utf8",
  timeout: 5000,
  windowsHide: true,
});
assert.equal(version.status, 0, version.stderr || version.error?.message);
const identity = JSON.parse(version.stdout);
const child = spawn(executable, [], {
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
const pending = new Map();
let sequence = 0;
let buffer = "";
let stderr = "";
child.stderr.setEncoding("utf8").on("data", (chunk) => {
  stderr = (stderr + chunk).slice(-8192);
});
const failAll = (error) => {
  for (const item of pending.values()) {
    clearTimeout(item.timer);
    item.reject(error);
  }
  pending.clear();
};
child.on("error", failAll);
child.on("exit", () =>
  failAll(new Error(`MCP exited before replying: ${stderr}`)),
);
child.stdout.setEncoding("utf8").on("data", (chunk) => {
  buffer += chunk;
  if (buffer.length > 1024 * 1024) {
    failAll(new Error("MCP output exceeds smoke-test limit"));
    child.kill();
    return;
  }
  while (buffer.includes("\n")) {
    const end = buffer.indexOf("\n");
    const line = buffer.slice(0, end);
    buffer = buffer.slice(end + 1);
    if (!line.trim()) continue;
    try {
      const message = JSON.parse(line);
      const item = pending.get(message.id);
      if (!item) continue;
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message.result);
    } catch (error) {
      failAll(error);
    }
  }
});
const request = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP timeout: ${method}; ${stderr}`));
    }, 5000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
    );
  });
try {
  const initialized = await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "trace-kernel-smoke", version: "1" },
  });
  assert.equal(initialized.serverInfo.version, identity.releaseVersion);
  child.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) +
      "\n",
  );
  const tools = await request("tools/list");
  for (const name of [
    "ping",
    "list_development_sessions",
    "probe_session",
    "get_work_context",
    "create_work",
    "propose_work_update",
  ]) {
    assert.ok(
      tools.tools.some((tool) => tool.name === name),
      `missing tool: ${name}`,
    );
  }
  const ping = await request("tools/call", { name: "ping", arguments: {} });
  assert.notEqual(ping.isError, true);
  assert.deepEqual(JSON.parse(ping.content[0].text).identity, identity);
  const resources = await request("resources/list");
  assert.equal(resources.resources.length, 8);
  const core = await request("resources/read", {
    uri: "trace-kernel://knowledge/core",
  });
  assert.deepEqual(core.contents[0]._meta["traceKernel/contract"], {
    bridgeProtocolGen: identity.bridgeProtocolGen,
  });
  assert.ok(
    core.contents[0].text.includes("not confirmation of any Desktop session"),
  );
  const guidance = await request("tools/call", {
    name: "get_api_reference",
    arguments: { topic: "network" },
  });
  assert.notEqual(guidance.isError, true);
  assert.ok(
    guidance.content[0].text.includes(
      `MCP bridge generation ${identity.bridgeProtocolGen}`,
    ),
  );
  console.log(
    "MCP stdio smoke passed: initialize, tools, ping, resource metadata and guidance (no Desktop session accessed).",
  );
} finally {
  failAll(new Error("Smoke test finished"));
  child.stdin.end();
  if (child.exitCode === null) {
    child.kill();
    await once(child, "exit");
  }
}
