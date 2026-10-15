// Explicitly selected live session only. No Work creation/update/execution,
// license edits, AI-client setting changes, env values or source reads.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { AcceptanceProcess } from "./acceptance-process.mjs";

export const checkLiveSession = async ({
  sessionId,
  license,
  executable,
  checkRejections = false,
  env = process.env,
}) => {
  assert.match(
    sessionId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Use the complete copied sessionId",
  );
  assert.ok(
    license === "free" || license === "pro",
    "Expected license must be free or pro",
  );
  const client = new AcceptanceProcess(executable, [], env);
  const tool = async (name, args = {}) => {
    const result = await client.rpc("tools/call", {
      name,
      arguments: { sessionId, ...args },
    });
    assert.notEqual(
      result.isError,
      true,
      `Read-only MCP check failed: ${name}`,
    );
    return JSON.parse(result.content[0].text);
  };
  try {
    await client.initialize();
    const probe = await tool("probe_session");
    assert.equal(
      probe.compatible,
      true,
      "Selected Desktop is not compatible/available",
    );
    const before = await tool("get_workspace_overview");
    for (const method of ["plain", "channel"]) {
      const context = await tool("get_work_context", { method });
      assert.equal(
        context.mcpConnection.contract.bridgeProtocolGen,
        probe.contract.bridgeProtocolGen,
      );
      assert.equal(
        context.api.includes("$fs"),
        license === "pro",
        "Actual capability differs from the expected license",
      );
      assert.equal(context.api.includes("$net"), license === "pro");
      assert.equal(context.api.includes("$println"), method === "plain");
      assert.equal(context.api.includes("$channel"), method === "channel");
      const name = "MCP static check " + randomUUID();
      const source =
        method === "plain"
          ? '$println("static check"); throw new Error("MUST_NOT_EXECUTE");'
          : '$channel.createTextStream("static-check").println("test"); throw new Error("MUST_NOT_EXECUTE");';
      assert.equal(
        (await tool("validate_work", { name, method, source })).valid,
        true,
      );
      assert.equal(
        (
          await tool("validate_work", {
            name,
            method,
            source:
              method === "plain"
                ? "$println(123);"
                : "$channel.createTextStream(123);",
          })
        ).valid,
        false,
      );
      assert.equal(
        (
          await tool("validate_work", {
            name,
            method,
            source:
              'await $fs.readText("C:/not-read-by-static-validation.txt");',
          })
        ).valid,
        license === "pro",
      );
      console.log(
        `PASS: selected ${license}/${method} declarations and static validation (no Work execution).`,
      );
    }
    if (checkRejections) {
      const base =
        process.platform === "win32" ? env.LOCALAPPDATA : env.XDG_DATA_HOME;
      assert.ok(base, "Session directory is unavailable");
      const descriptor = JSON.parse(
        await readFile(
          path.join(base, "jp.hkdev.tk/mcp/sessions", sessionId + ".json"),
          "utf8",
        ),
      );
      assert.equal(descriptor.sessionId, sessionId);
      const endpoint = new URL(descriptor.endpoint);
      assert.equal(endpoint.protocol, "http:");
      assert.ok(
        ["127.0.0.1", "[::1]"].includes(endpoint.hostname),
        "Only loopback is allowed",
      );
      assert.equal(endpoint.username, "");
      assert.equal(endpoint.password, "");
      assert.equal(endpoint.pathname, "/");
      assert.equal(endpoint.search, "");
      assert.equal(endpoint.hash, "");
      assert.ok(
        typeof descriptor.token === "string" &&
          /^[A-Za-z0-9_-]{1,512}$/.test(descriptor.token),
        "Invalid credential format",
      );
      // Read-only even if the compatibility guard were broken.
      for (const contract of [
        undefined,
        { bridgeProtocolGen: probe.contract.bridgeProtocolGen + 1 },
      ]) {
        const response = await fetch(endpoint.origin + "/bridge", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + descriptor.token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId,
            method: "getWorkContext",
            params: { method: "plain" },
            contract,
          }),
          signal: AbortSignal.timeout(3000),
        });
        assert.equal(response.status, 409);
        assert.match(
          (await response.json()).error.code,
          /^MCP_CONTRACT_REQUIRED$|^MCP_BRIDGE_GENERATION_MISMATCH$/,
        );
      }
      console.log(
        "PASS: read-only legacy/foreign requests rejected; inspect Desktop history for the two reasons.",
      );
    }
    const after = await tool("get_workspace_overview");
    assert.deepEqual(
      after.counts,
      before.counts,
      "Workspace changed during checks; keep other edits paused and retry",
    );
    assert.deepEqual(
      after.names,
      before.names,
      "Workspace names changed during checks",
    );
    console.log(
      "Selected-session read-only checks passed. The target may be a fixture; GUI layout, mouse approval/rejection and real license setup still need manual confirmation.",
    );
  } finally {
    await client.close();
  }
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2),
    options = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === "--check-rejections") {
      assert.equal(options.checkRejections, undefined, "Duplicate flag");
      options.checkRejections = true;
      continue;
    }
    assert.ok(
      ["--session", "--expect-license", "--mcp-exe"].includes(key),
      "Use --session FULL_UUID --expect-license free|pro [--mcp-exe PATH] [--check-rejections]",
    );
    assert.ok(
      args[index + 1] && !args[index + 1].startsWith("--"),
      "Missing option value",
    );
    assert.equal(options[key], undefined, "Duplicate option");
    options[key] = args[++index];
  }
  const executable = options["--mcp-exe"]
    ? path.resolve(options["--mcp-exe"])
    : fileURLToPath(
        new URL(
          `../target/debug/trace-kernel-mcp${process.platform === "win32" ? ".exe" : ""}`,
          import.meta.url,
        ),
      );
  await checkLiveSession({
    sessionId: options["--session"],
    license: options["--expect-license"],
    executable,
    checkRejections: options.checkRejections,
  });
}
