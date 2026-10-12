import assert from "node:assert/strict";
import { readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { cases, initialEntries, safetyCases, stopCases } from "./cases.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, "../..");
const desktop = path.join(repository, "apps/desktop");
const require = createRequire(path.join(desktop, "package.json"));
const esbuild = require("esbuild");
const ts = require("typescript");
const binary = path.join(
  directory,
  "target",
  process.argv.includes("--release") ? "release" : "debug",
  "trace-kernel-js-host-spike" + (process.platform === "win32" ? ".exe" : ""),
);
const profile = readFileSync(path.join(directory, "profile.js"), "utf8");
const workerInvoke = path.join(
  desktop,
  "src/app/contents/detail/program/util/worker-invoke.ts",
);
const productionCompiler = path.join(
  desktop,
  "src/app/util/typescript-util.ts",
);
const compiledCompiler = ts.transpileModule(
  readFileSync(productionCompiler, "utf8"),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  },
).outputText;
const compilerModule = { exports: {} };
new Function("require", "exports", "module", compiledCompiler)(
  require,
  compilerModule.exports,
  compilerModule,
);
const transpile = (source) =>
  compilerModule.exports.default.transpileTsToJs(source).outputText;

const built = await esbuild.build({
  entryPoints: [path.join(directory, "fixture.ts")],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "SpikeWork",
  platform: "browser",
  target: "es2020",
  metafile: true,
  plugins: [
    {
      name: "spike-worker-boundary",
      setup(build) {
        build.onResolve({ filter: /worker-invoke$/ }, (args) => {
          const resolved = path.resolve(args.resolveDir, args.path + ".ts");
          assert.equal(resolved, workerInvoke);
          return { path: path.join(directory, "host-call.ts") };
        });
      },
    },
  ],
});
const bundle = built.outputFiles[0].text;
assert.ok(
  !Object.keys(built.metafile.inputs).some((p) =>
    /worker-adapter|svelte|license-state|tauri-apps/.test(p),
  ),
  "The experiment unexpectedly imports a GUI or Tauri dependency.",
);
const generated = path.join(directory, "generated");
mkdirSync(generated, { recursive: true });
writeFileSync(path.join(generated, "fixture.js"), bundle);

const requestFor = (scenario, useProfile) => ({
  entries: initialEntries(),
  failCommand: scenario.failCommand,
  failAt: scenario.failAt,
  deadlineMs: scenario.deadlineMs ?? 2000,
  cancelAfterMs: scenario.cancelAfterMs,
  source:
    (useProfile ? profile : "") +
    "\n" +
    bundle +
    "\n" +
    `(async () => JSON.stringify(await SpikeWork.run(${JSON.stringify(transpile(scenario.source))})))()`,
});

const runRust = (input) => {
  const started = performance.now();
  const result = spawnSync(binary, [], {
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  assert.ok(result.stdout.trim(), result.stderr || "Host returned no report");
  const report = JSON.parse(result.stdout);
  assert.equal(
    result.status,
    report.kind === "completed" ? 0 : 1,
    result.stderr,
  );
  return { ...report, processMs: performance.now() - started };
};

const runNode = async (input) => {
  const entries = structuredClone(input.entries);
  const calls = [];
  let stdout = "";
  let matchingCalls = 0;
  const invoke = async (command, payload) => {
    await new Promise((resolve) =>
      setTimeout(resolve, command === "append_output" ? 15 : 2),
    );
    const args = JSON.parse(payload);
    calls.push({ command, args });
    const get = (key) => {
      if (!entries[key]) throw new Error("Missing path: " + key);
      return entries[key];
    };
    try {
      if (command === input.failCommand && ++matchingCalls === input.failAt) {
        throw new Error("Injected host failure");
      }
      let value = null;
      switch (command) {
        case "exists_path":
          value = Object.hasOwn(entries, args.path);
          break;
        case "stat":
          value = get(args.path).stat;
          break;
        case "read_binary":
          value = get(args.filePath).bytes;
          break;
        case "read_dir":
          value = get(args.dir).children ?? [];
          break;
        case "read_file":
          value = new TextDecoder(
            args.req.encoding === "sjis" ? "shift_jis" : "utf-8",
          ).decode(new Uint8Array(get(args.req.filePath).bytes));
          break;
        case "save_text":
        case "save_binary": {
          const bytes =
            command === "save_text"
              ? Array.from(new TextEncoder().encode(args.content))
              : args.bytes;
          entries[args.path] = {
            stat: {
              isFile: true,
              isDir: false,
              readonly: false,
              size: bytes.length,
              modifiedAt: 11,
            },
            bytes,
          };
          break;
        }
        case "make_dir":
          entries[args.dirPath] = {
            stat: {
              isFile: false,
              isDir: true,
              readonly: false,
              size: 0,
              modifiedAt: 10,
            },
            children: [],
          };
          break;
        case "copy_file":
          entries[args.dest] = structuredClone(get(args.src));
          break;
        case "rename":
          entries[args.to] = get(args.from);
          delete entries[args.from];
          break;
        case "delete_file":
        case "delete_dir":
          get(args.path);
          delete entries[args.path];
          break;
        case "append_output":
          stdout += args.text;
          break;
        default:
          throw new Error("Unsupported spike command: " + command);
      }
      return JSON.stringify({ ok: true, value });
    } catch (error) {
      return JSON.stringify({ ok: false, error: error.message });
    }
  };
  const context = vm.createContext({
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    __invoke: invoke,
    __beginWork: () => {},
  });
  const report = JSON.parse(
    await new vm.Script(input.source).runInContext(context, { timeout: 2000 }),
  );
  return { kind: "completed", report, stdout, calls, entries };
};

const comparable = ({ kind, report, stdout, calls, entries }) => ({
  kind,
  report,
  stdout,
  calls,
  entries,
});
const results = [];
for (const scenario of cases) {
  const reference = await runNode(requestFor(scenario, false));
  const actual = runRust(requestFor(scenario, true));
  assert.deepEqual(comparable(actual), comparable(reference), scenario.name);
  assert.equal(actual.report.kind, scenario.kind, scenario.name);
  assert.equal(actual.stdout, scenario.stdout, scenario.name);
  const mutations = actual.calls.filter((c) =>
    [
      "save_binary",
      "make_dir",
      "delete_file",
      "delete_dir",
      "rename",
      "copy_file",
    ].includes(c.command),
  );
  if (["runtime-error", "verification-failed"].includes(scenario.kind)) {
    assert.equal(
      mutations.length,
      0,
      scenario.name + " applied a staged transaction after failure",
    );
  }
  if (scenario.name === "seven-operations") {
    assert.equal(actual.report.result.committedCount, 7);
    const lastOutput = actual.calls.findLastIndex(
      (c) => c.command === "append_output",
    );
    const firstMutation = actual.calls.findIndex(
      (c) => c.command === "make_dir",
    );
    assert.ok(
      lastOutput < firstMutation,
      "Output must drain before transaction commit",
    );
  }
  if (scenario.name === "partial-commit") {
    assert.equal(actual.report.result.committedCount, 1);
    assert.equal(actual.report.result.skippedCount, 1);
    assert.equal(mutations.length, 2);
  }
  results.push({
    name: scenario.name,
    outcome: actual.report.kind,
    elapsedMs: actual.elapsedMs,
  });
  process.stdout.write("PASS parity: " + scenario.name + "\n");
}
for (const scenario of stopCases) {
  const actual = runRust(requestFor(scenario, true));
  assert.equal(actual.kind, scenario.kind, scenario.name + ": " + actual.error);
  assert.equal(
    actual.workStarted,
    true,
    "Stop occurred before user work started: " + scenario.name,
  );
  assert.ok(actual.elapsedMs < 1500, scenario.name + " did not stop promptly");
  assert.ok(!actual.calls.some((c) => c.command === "save_binary"));
  results.push({
    name: scenario.name,
    outcome: actual.kind,
    elapsedMs: actual.elapsedMs,
  });
  process.stdout.write("PASS stop: " + scenario.name + "\n");
}

for (const scenario of safetyCases) {
  const actual = runRust(requestFor(scenario, true));
  assert.equal(actual.workStarted, true, scenario.name);
  assert.ok(
    actual.kind === "host-error" || actual.report?.kind === "runtime-error",
    scenario.name + " unexpectedly succeeded",
  );
  assert.ok(!actual.calls.some((c) => c.command === "save_binary"));
  results.push({
    name: scenario.name,
    outcome: actual.report?.kind ?? actual.kind,
    error: actual.report?.error ?? actual.error,
    elapsedMs: actual.elapsedMs,
  });
  process.stdout.write("PASS safety: " + scenario.name + "\n");
}

const probeSource = `Promise.resolve(JSON.stringify(Object.fromEntries(
  ["TextEncoder", "TextDecoder", "setTimeout", "URL", "fetch", "process", "require"].map(name => [name, typeof globalThis[name]])
)))`;
const nativeGlobals = runRust({ source: probeSource });
assert.equal(nativeGlobals.report.TextDecoder, "undefined");
assert.equal(nativeGlobals.report.setTimeout, "undefined");
assert.equal(nativeGlobals.report.process, "undefined");
const starts = Array.from(
  { length: 10 },
  () =>
    runRust({ source: "Promise.resolve(JSON.stringify({ready:true}))" })
      .processMs,
).sort((a, b) => a - b);
const rustInfo = spawnSync("rustc", ["--version", "--verbose"], {
  encoding: "utf8",
  windowsHide: true,
});
assert.equal(rustInfo.status, 0, rustInfo.stderr);
const rustTarget = rustInfo.stdout.match(/^host: (.+)$/m)?.[1];
assert.ok(rustTarget, "Rust target could not be determined");

const compilerBuild = await esbuild.build({
  entryPoints: [path.join(directory, "compiler-fixture.ts")],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "CompilerProbe",
  platform: "browser",
  target: "es2020",
  external: ["fs", "path", "os", "crypto", "buffer", "perf_hooks", "inspector"],
});
const compilerBundle = compilerBuild.outputFiles[0].text;
writeFileSync(path.join(generated, "compiler.js"), compilerBundle);
const typedSource = "const value: number = 3; $println(String(value));";
const compilation = runRust({
  memoryLimitBytes: 128 * 1024 * 1024,
  deadlineMs: 5000,
  source:
    compilerBundle +
    "\nPromise.resolve(JSON.stringify(CompilerProbe.transpile(" +
    JSON.stringify(typedSource) +
    ")))",
});
assert.equal(compilation.kind, "completed", compilation.error);
assert.deepEqual(
  compilation.report,
  JSON.parse(
    JSON.stringify(compilerModule.exports.default.transpileTsToJs(typedSource)),
  ),
  "TypeScript compiler output differs between Node and QuickJS",
);
process.stdout.write(
  "PASS compiler: production TypeScript transpilation in Rust host\n",
);
const integratedCompilation = runRust({
  entries: initialEntries(),
  memoryLimitBytes: 128 * 1024 * 1024,
  deadlineMs: 5000,
  source:
    profile +
    "\n" +
    compilerBundle +
    "\n" +
    bundle +
    "\n(async () => JSON.stringify(await SpikeWork.run(CompilerProbe.transpile(" +
    JSON.stringify(typedSource) +
    ").outputText)))()",
});
assert.equal(
  integratedCompilation.kind,
  "completed",
  integratedCompilation.error,
);
assert.equal(integratedCompilation.report.kind, "success");
assert.equal(integratedCompilation.stdout, "3\n");
process.stdout.write(
  "PASS compiler: TypeScript -> work -> output in Rust host\n",
);
results.push(
  {
    name: "typescript-transpile",
    outcome: compilation.kind,
    elapsedMs: compilation.elapsedMs,
  },
  {
    name: "typescript-work-output",
    outcome: integratedCompilation.report.kind,
    elapsedMs: integratedCompilation.elapsedMs,
  },
);

const summary = {
  candidate: "rquickjs 0.14.0 / QuickJS-NG",
  productIntegration: false,
  reference: "Node " + process.version + " V8 (not a browser Worker)",
  rustTarget,
  rustVersion: rustInfo.stdout.split("\n")[0].trim(),
  binaryBytes: statSync(binary).size,
  bundleBytes: Buffer.byteLength(bundle),
  minimalProcessMedianMs: starts[5],
  compiler: {
    bundleBytes: Buffer.byteLength(compilerBundle),
    configuredHeapLimitBytes: 128 * 1024 * 1024,
    coldCompileMs: compilation.elapsedMs,
    compileAndRunMs: integratedCompilation.elapsedMs,
  },
  nativeGlobals: nativeGlobals.report,
  results,
};
writeFileSync(
  path.join(generated, "results.json"),
  JSON.stringify(summary, null, 2) + "\n",
);
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
