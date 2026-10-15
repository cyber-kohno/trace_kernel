// Real MCP stdio -> real native loopback bridge -> real Desktop handler/compiler.
// UI/store/license ports are in-memory fixtures, not the actual Tauri WebView.
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  rm,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { AcceptanceProcess } from "./acceptance-process.mjs";
import { checkLiveSession } from "./check-live-session.mjs";
import { acceptanceHarness } from "../../desktop/scripts/mcp-acceptance-harness.mjs";
import { loadDesktopMcpIdentity } from "../../../release/desktop-mcp.mjs";

const identity = loadDesktopMcpIdentity();
const binaryDirectory = fileURLToPath(
  new URL("../target/debug/", import.meta.url),
);
const extension = process.platform === "win32" ? ".exe" : "";
const root = await mkdtemp(
  path.join(os.tmpdir(), "trace-kernel-mcp-acceptance-"),
);
const directory = path.join(root, "jp.hkdev.tk/mcp/sessions");
const env = { ...process.env, LOCALAPPDATA: root, XDG_DATA_HOME: root };
const harness = acceptanceHarness();
const children = [];
const start = async (generation, forward) => {
  let host;
  host = new AcceptanceProcess(
    path.join(binaryDirectory, "examples", "compatibility_host" + extension),
    [root, String(generation)],
    env,
    async (event) => {
      if (event.event !== "trace-kernel://mcp/request") return;
      if (!forward)
        throw new Error("Noncompatible fixture received a host event");
      try {
        const result = await harness.handle(event.payload);
        await host.command("respond", {
          id: event.payload.id,
          result,
          error: null,
        });
      } catch {
        await host.command("respond", {
          id: event.payload.id,
          result: null,
          error: { message: "Fixture handler rejected request" },
        });
      }
    },
  );
  children.push(host);
  const session = await Promise.race([
    host.ready,
    new Promise((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Fixture startup timeout")),
        10000,
      );
      timer.unref();
    }),
  ]);
  return { host, session };
};
let legacy;
try {
  const missing = new AcceptanceProcess(
    path.join(root, "missing-executable"),
    [],
    env,
  );
  await assert.rejects(missing.initialize());
  await missing.close();
  const current = await start(identity.bridgeProtocolGen, true);
  const foreign = await start(identity.bridgeProtocolGen + 1, false);
  const legacyId = randomUUID(),
    legacyToken = randomUUID().replaceAll("-", "");
  legacy = http.createServer((_request, response) => {
    const body = JSON.stringify({ ok: true, sessionId: legacyId });
    response.writeHead(200, { "Content-Length": Buffer.byteLength(body) });
    response.end(body);
  });
  await new Promise((resolve) => legacy.listen(0, "127.0.0.1", resolve));
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, legacyId + ".json"),
    JSON.stringify({
      sessionId: legacyId,
      endpoint: `http://127.0.0.1:${legacy.address().port}`,
      token: legacyToken,
    }),
  );
  const client = new AcceptanceProcess(
    path.join(binaryDirectory, "trace-kernel-mcp" + extension),
    [],
    env,
  );
  children.push(client);
  await client.initialize();
  const tool = async (name, args = {}) => {
    const result = await client.rpc("tools/call", { name, arguments: args });
    assert.notEqual(result.isError, true, `MCP tool failed: ${name}`);
    return JSON.parse(result.content[0].text);
  };
  const sessions = await tool("list_development_sessions");
  assert.equal(sessions.length, 3);
  assert.equal(
    sessions.find((item) => item.sessionId === current.session.sessionId)
      .compatible,
    true,
  );
  assert.equal(
    sessions.find((item) => item.sessionId === foreign.session.sessionId)
      .status,
    "incompatible",
  );
  assert.equal(
    sessions.find((item) => item.sessionId === legacyId).status,
    "legacy",
  );
  const secrets = [legacyToken];
  for (const file of await readdir(directory)) {
    const descriptor = JSON.parse(
      await readFile(path.join(directory, file), "utf8"),
    );
    secrets.push(descriptor.token);
  }
  for (const secret of secrets)
    assert.ok(
      !JSON.stringify(sessions).includes(secret),
      "credential escaped discovery",
    );
  for (const sessionId of [foreign.session.sessionId, legacyId]) {
    const result = await client.rpc("tools/call", {
      name: "get_work_context",
      arguments: { sessionId, method: "plain" },
    });
    assert.equal(result.isError, true);
    assert.match(
      result.content[0].text,
      /MCP_BRIDGE_GENERATION_MISMATCH|MCP_CONTRACT_REQUIRED/,
    );
  }
  assert.equal((await foreign.host.command("diagnostics")).acceptedRequests, 0);
  console.log(
    "PASS: actual-process discovery distinguishes compatible/foreign/legacy sessions without tokens.",
  );

  for (const pro of [false, true])
    for (const method of ["plain", "channel"]) {
      harness.setPro(pro);
      const args = { sessionId: current.session.sessionId };
      const context = await tool("get_work_context", { ...args, method });
      assert.equal(
        context.mcpConnection.desktopIdentity.releaseVersion,
        "9.9.9",
      );
      assert.equal(
        context.mcpConnection.contract.bridgeProtocolGen,
        identity.bridgeProtocolGen,
      );
      assert.equal(context.api.includes("$fs"), pro);
      assert.equal(context.api.includes("$net"), pro);
      assert.equal(context.api.includes("$println"), method === "plain");
      assert.equal(context.api.includes("$channel"), method === "channel");
      const source =
        method === "plain"
          ? '$println("fixture"); throw new Error("MUST_NOT_EXECUTE");'
          : '$channel.createTextStream("fixture").println("test"); throw new Error("MUST_NOT_EXECUTE");';
      const request = {
        ...args,
        name: `fixture-${pro}-${method}`,
        method,
        source,
      };
      const before = JSON.stringify(harness.workspace());
      assert.equal((await tool("validate_work", request)).valid, true);
      assert.equal(JSON.stringify(harness.workspace()), before);
      const invalid = await tool("validate_work", {
        ...request,
        source:
          method === "plain"
            ? '$channel.createTextStream("x");'
            : '$println("x");',
      });
      assert.equal(invalid.valid, false);
      const filesystem = await tool("validate_work", {
        ...request,
        source: 'await $fs.readText("C:/fixture-only.txt");',
      });
      assert.equal(filesystem.valid, pro);
      const created = await tool("create_work", request);
      assert.equal(created.created, true);
      const duplicate = await tool("create_work", request);
      assert.equal(duplicate.created, false);
      console.log(
        `PASS: ${pro ? "Pro" : "Free"}/${method} live declarations, validation and fixture-only creation (no Work execution).`,
      );
    }
  harness.setPro(false);
  await checkLiveSession({
    sessionId: current.session.sessionId,
    license: "free",
    checkRejections: true,
    executable: path.join(binaryDirectory, "trace-kernel-mcp" + extension),
    env,
  });
  harness.setPro(true);
  await checkLiveSession({
    sessionId: current.session.sessionId,
    license: "pro",
    executable: path.join(binaryDirectory, "trace-kernel-mcp" + extension),
    env,
  });
  harness.setPro(false);
  harness.openEditor();
  const target = harness.workspace().works[0];
  const baseline = target.source;
  const params = {
    sessionId: current.session.sessionId,
    editorId: "fixture-editor",
    name: target.name,
    baselineSource: baseline,
    proposedSource: '$println("fixture update");',
  };
  const waitForProposal = async () => {
    const deadline = Date.now() + 10000;
    while (!harness.proposal()) {
      if (Date.now() > deadline)
        throw new Error("Fixture proposal was not opened");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(
      harness.workspace().works[0].source,
      baseline,
      "proposal mutated before a fixture decision",
    );
  };
  let pending = tool("propose_work_update", params);
  pending.catch(() => {});
  await waitForProposal();
  harness.decide("reject");
  assert.equal((await pending).status, "rejected_by_user");
  assert.equal(harness.workspace().works[0].source, baseline);
  pending = tool("propose_work_update", params);
  pending.catch(() => {});
  await waitForProposal();
  harness.decide("apply");
  assert.equal((await pending).status, "applied");
  assert.equal(harness.workspace().works[0].source, params.proposedSource);
  harness.closeEditor();
  assert.equal(
    (await tool("propose_work_update", params)).status,
    "rejected_stale",
  );
  assert.equal(harness.proposal(), null);
  console.log(
    "PASS: fixture proposals remain unchanged before an explicit test decision; reject/apply/stale guards work.",
  );

  const descriptor = JSON.parse(
    await readFile(
      path.join(directory, current.session.sessionId + ".json"),
      "utf8",
    ),
  );
  for (const contract of [
    undefined,
    { bridgeProtocolGen: identity.bridgeProtocolGen + 1 },
  ]) {
    const body = {
      method: "createWork",
      sessionId: current.session.sessionId,
      contract,
      params: { work: { name: "must-not-create", source: '$println("bad");' } },
    };
    const before = JSON.stringify(harness.workspace());
    const response = await fetch(current.session.endpoint + "/bridge", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + descriptor.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(response.status, 409);
    assert.match(
      (await response.json()).error.code,
      /MCP_CONTRACT_REQUIRED|MCP_BRIDGE_GENERATION_MISMATCH/,
    );
    assert.equal(JSON.stringify(harness.workspace()), before);
  }
  const diagnostics = await current.host.command("diagnostics");
  assert.ok(diagnostics.acceptedRequests > 0);
  assert.equal(diagnostics.rejectedRequests, 4);
  assert.equal(diagnostics.rejections.length, 2);
  assert.equal(diagnostics.published, true);
  for (const secret of secrets)
    assert.ok(!JSON.stringify(diagnostics).includes(secret));
  assert.ok(
    !(await tool("list_works", { sessionId: current.session.sessionId })).some(
      (work) => work.name === "must-not-create",
    ),
  );
  await current.host.command("stop");
  console.log(
    "PASS: direct legacy/foreign requests are refused before fixture mutations and produce safe Desktop diagnostics.",
  );
  console.log(
    "Acceptance passed. This exercised real processes/native TCP/TS handler, NOT a Tauri WebView or real license.",
  );
} finally {
  harness.dispose();
  for (const child of children.reverse()) await child.close();
  if (legacy)
    await new Promise((resolve) => {
      legacy.closeAllConnections();
      legacy.close(resolve);
    });
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith("trace-kernel-mcp-acceptance-"));
  await rm(root, { recursive: true, force: true });
}
