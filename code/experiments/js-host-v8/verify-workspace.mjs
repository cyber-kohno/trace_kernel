import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createPublicKey, verify } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
// Locate code/ from this script, independently of the invocation directory.
const codeRoot = path.resolve(directory, "../..");
const require = createRequire(path.join(codeRoot, "apps/desktop/package.json"));
const { build } = require("esbuild");
const built = await build({
  stdin: {
    contents: `
      export { default as codec } from './packages/runtime-core/src/workspace/workspace-codec';
      export { default as migration } from './packages/runtime-core/src/workspace/workspace-migration';
      export { default as license } from './packages/runtime-core/src/license/license-util';
    `,
    resolveDir: codeRoot,
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "iife",
  globalName: "CoreProbe",
  platform: "browser",
  target: "es2020",
  metafile: true,
});
assert.ok(
  !Object.keys(built.metafile.inputs).some((p) =>
    /apps[\\/]desktop|tauri|svelte/.test(p),
  ),
  "Workspace and license bundle imports Desktop code",
);
const bundle = built.outputFiles[0].text;
const node = new Function(bundle + "\nreturn CoreProbe;")();
const binary = path.join(
  directory,
  "target/release/trace-kernel-js-host-v8-spike.exe",
);
const runV8 = (body) => {
  const result = spawnSync(binary, [], {
    input: JSON.stringify({
      source:
        bundle + `\n(async()=>JSON.stringify(await (async()=>{${body}})()))()`,
      deadlineMs: 3000,
    }),
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.ok(result.stdout.trim(), result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 0, report.error ?? result.stderr);
  assert.equal(report.kind, "completed", report.error);
  assert.equal(report.nativeIo.activeAfterCleanup, false);
  assert.equal(report.nativeIo.cleanupError, null);
  return report.report;
};
let count = 0;
const check = (name, body, expected) => {
  assert.deepEqual(runV8(body), expected, name);
  count++;
  console.log(`PASS shared Workspace/license: ${name}`);
};
const literal = JSON.stringify;
const current = { workspace: "2", api: "3" };
const workspace = {
  gen: current,
  envs: [{ varName: "TITLE", value: "日本語😀\n\u0000" }],
  resources: [],
  datasets: [],
  processes: [],
  logics: [],
  works: [{ name: "確認", source: '$println("あ");' }],
  declare: { source: "" },
};
const text = JSON.stringify(workspace);
const compressed = node.codec.gZip(text);
assert.equal(
  gunzipSync(Buffer.from(compressed, "base64")).toString("utf8"),
  text,
);
check(
  "gzip/Base64 bytes retain Desktop format and Unicode",
  `return CoreProbe.codec.gZip(${literal(text)});`,
  compressed,
);

const legacy = gzipSync(text).toString("base64");
assert.equal(node.codec.unZip(legacy), text);
check(
  "read gzip produced outside the shared codec",
  `return CoreProbe.codec.unZip(${literal(legacy)});`,
  text,
);
check(
  "compressed Workspace loading",
  `return CoreProbe.codec.prepareFile(${literal(legacy)},${literal(current)});`,
  node.codec.prepareFile(legacy, current),
);

for (const [name, gen, status] of [
  [
    "older Workspace needs migration",
    { workspace: "1", api: "3" },
    "needs-workspace-migration",
  ],
  ["older API retains warning", { workspace: "2", api: "1" }, "warn-api"],
  [
    "newer Workspace is rejected",
    { workspace: "4", api: "3" },
    "reject-workspace-ahead",
  ],
  ["newer API is rejected", { workspace: "2", api: "4" }, "reject-api-ahead"],
  ["missing generation is rejected", undefined, "reject-missing-gen"],
]) {
  const input = node.codec.gZip(JSON.stringify({ ...workspace, gen }));
  const expected = node.codec.prepareFile(input, current);
  assert.equal(expected.status, status);
  check(
    name,
    `return CoreProbe.codec.prepareFile(${literal(input)},${literal(current)});`,
    expected,
  );
}

const badFiles = [
  "!",
  Buffer.from("not gzip").toString("base64"),
  compressed.slice(0, -12),
];
check(
  "malformed Base64/gzip and truncated content fail",
  `return ${literal(badFiles)}.map(input=>{try{CoreProbe.codec.unZip(input);return false;}catch{return true;}});`,
  badFiles.map((input) => {
    assert.throws(() => node.codec.unZip(input));
    return true;
  }),
);
const invalidJson = node.codec.gZip("{broken");
assert.throws(() => node.codec.prepareFile(invalidJson, current));
check(
  "invalid JSON is rejected after decompression",
  `try{CoreProbe.codec.prepareFile(${literal(invalidJson)},${literal(current)});return false;}catch{return true;}`,
  true,
);

const migrationBody = `
  const original=${literal({ ...workspace, gen: { workspace: "1", api: "1" } })};
  const state=CoreProbe.migration.create({handlePath:'fixture.trk',workspace:original,diff:{from:'1',to:'2'}});
  const result=await CoreProbe.migration.start(state,${literal(current)});
  return {inputStatus:state.status,inputGen:original.gen,status:result.status,gen:result.migrated.gen,
    works:result.migrated.works,changedWorkspace:result.migrated!==original,changedGen:result.migrated.gen!==original.gen};
`;
check("explicit migration preserves content and its input", migrationBody, {
  inputStatus: "idle",
  inputGen: { workspace: "1", api: "1" },
  status: "succeeded",
  gen: current,
  works: workspace.works,
  changedWorkspace: true,
  changedGen: true,
});

const licenseSource = readFileSync(
  path.join(codeRoot, "packages/runtime-core/src/license/license-util.ts"),
  "utf8",
);
const productKey = licenseSource.match(
  /\/\/ (v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/,
)?.[1];
const publicBase64 = licenseSource.match(
  /PUBLIC_KEY_BASE64 = ["']([^"']+)/,
)?.[1];
assert.ok(
  productKey && publicBase64,
  "Existing public signature fixture is missing",
);
const [, payload64, signature64] = productKey.split(".");
const payloadBytes = Buffer.from(payload64, "base64url");
const publicKey = createPublicKey({
  key: Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    Buffer.from(publicBase64, "base64"),
  ]),
  format: "der",
  type: "spki",
});
assert.equal(
  verify(null, payloadBytes, publicKey, Buffer.from(signature64, "base64url")),
  true,
);
const payload = JSON.parse(payloadBytes.toString("utf8"));
assert.deepEqual(
  await node.license.parseActivateInfoFromProductKey(productKey),
  payload,
);
check(
  "valid license signature agrees with Node crypto",
  `return await CoreProbe.license.parseActivateInfoFromProductKey(${literal(productKey)});`,
  payload,
);

const badSignature = Buffer.from(signature64, "base64url");
badSignature[0] ^= 1;
const badKeys = [
  "bad",
  productKey.replace(/^v1/, "v2"),
  `v1.${payload64}.${badSignature.toString("base64url")}`,
  `v1.${Buffer.from(JSON.stringify({ ...payload, n: "tampered" })).toString("base64url")}.${signature64}`,
  `v1.!.${signature64}`,
];
for (const key of badKeys)
  await assert.rejects(node.license.parseActivateInfoFromProductKey(key));
check(
  "malformed, unsupported and tampered licenses fail",
  `return await Promise.all(${literal(badKeys)}.map(async key=>{try{await CoreProbe.license.parseActivateInfoFromProductKey(key);return false;}catch{return true;}}));`,
  badKeys.map(() => true),
);
check(
  "license display conversion",
  `return CoreProbe.license.getConvertedLicenseFromPayload(${literal(payload)});`,
  node.license.getConvertedLicenseFromPayload(payload),
);

const fixtureDirectory = path.join(codeRoot, "apps/desktop/work");
for (const name of readdirSync(fixtureDirectory).filter((name) =>
  name.endsWith(".trk"),
)) {
  const content = readFileSync(path.join(fixtureDirectory, name), "utf8");
  const expected = node.codec.unZip(content);
  JSON.parse(expected);
  check(
    `existing trk: ${name}`,
    `return CoreProbe.codec.unZip(${literal(content)});`,
    expected,
  );
}
console.log(`${count} shared Workspace/license cases passed in V8.`);
