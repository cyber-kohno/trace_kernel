import assert from "node:assert/strict";
import { readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { cases, initialEntries, safetyCases, stopCases } from "./cases.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
// Locate code/ from this script, independently of the invocation directory.
const codeRoot = path.resolve(directory, "../..");
const desktop = path.join(codeRoot, "apps/desktop");
const v8Candidate = process.argv.includes("--v8");
const hostDirectory = v8Candidate
  ? path.join(codeRoot, "experiments/js-host-v8")
  : directory;
const require = createRequire(path.join(desktop, "package.json"));
const esbuild = require("esbuild");
const ts = require("typescript");
const binary = path.join(
  hostDirectory,
  "target",
  process.argv.includes("--release") ? "release" : "debug",
  (v8Candidate
    ? "trace-kernel-js-host-v8-spike"
    : "trace-kernel-js-host-spike") +
    (process.platform === "win32" ? ".exe" : ""),
);
const profile = readFileSync(path.join(directory, "profile.js"), "utf8");
const productionCompiler = path.join(
  codeRoot,
  "packages/runtime-core/src/compiler/typescript-util.ts",
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
});
const bundle = built.outputFiles[0].text;
assert.ok(
  !Object.keys(built.metafile.inputs).some((p) =>
    /apps[\\/]desktop|worker-adapter|svelte|license-state|tauri-apps/.test(p),
  ),
  "The Work fixture unexpectedly imports Desktop, GUI or Tauri code.",
);
const generated = path.join(hostDirectory, "generated");
mkdirSync(generated, { recursive: true });
writeFileSync(path.join(generated, "fixture.js"), bundle);

const requestFor = (scenario, useProfile) => ({
  entries: initialEntries(),
  failCommand: scenario.failCommand,
  failAt: scenario.failAt,
  deadlineMs: scenario.deadlineMs ?? 2000,
  cancelAfterMs: scenario.cancelAfterMs,
  scanTrees: scenario.scanTrees,
  processResults: scenario.processResults,
  memoryLimitBytes: scenario.memoryLimitBytes,
  source:
    (useProfile && !v8Candidate ? profile : "") +
    "\n" +
    bundle +
    "\n" +
    `(async () => JSON.stringify(await SpikeWork.run(${JSON.stringify(transpile(scenario.source))}, ${JSON.stringify(
      {
        contextData: scenario.contextData,
        professional: scenario.professional,
        outputMethod: scenario.outputMethod,
        compiledLogics: Object.fromEntries(
          (scenario.contextData?.logics ?? []).map((logic) => [
            logic.source,
            compilerModule.exports.default.transpileTsModuleToCjs(logic.source),
          ]),
        ),
      },
    )})))()`,
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
        case "worker_init":
        case "add_channel":
          break;
        case "scan_directory":
          if (!input.scanTrees?.[args.req.rootPath])
            throw new Error("Missing scan fixture: " + args.req.rootPath);
          value = { node: input.scanTrees[args.req.rootPath] };
          break;
        case "run_process":
          if (!input.processResults?.[args.req.program])
            throw new Error("Missing process fixture: " + args.req.program);
          value = input.processResults[args.req.program];
          break;
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
    URL,
    URLSearchParams,
    structuredClone,
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
    scenario.name + " resource expectation failed: " + JSON.stringify(actual),
  );
  assert.ok(!actual.calls.some((c) => c.command === "save_binary"));
  if (v8Candidate && scenario.name === "heap-pressure")
    assert.equal(
      actual.memoryLimitReached,
      true,
      "V8 did not invoke its memory limit callback",
    );
  results.push({
    name: scenario.name,
    outcome: actual.report?.kind ?? actual.kind,
    error: actual.report?.error ?? actual.error,
    elapsedMs: actual.elapsedMs,
    ...(actual.heap ? { heap: actual.heap } : {}),
  });
  process.stdout.write("PASS safety: " + scenario.name + "\n");
}

const probeSource = `Promise.resolve(JSON.stringify(Object.fromEntries(
  ["TextEncoder", "TextDecoder", "setTimeout", "setInterval", "Intl", "URL", "URLSearchParams", "structuredClone", "fetch", "process", "require"].map(name => [name, typeof globalThis[name]])
)))`;
const nativeGlobals = runRust({ source: probeSource });
const candidateProfile = v8Candidate ? "" : profile;
const profileGlobals = runRust({
  source: candidateProfile + "\n" + probeSource,
});
assert.equal(profileGlobals.kind, "completed", profileGlobals.error);
assert.equal(
  nativeGlobals.report.TextDecoder,
  v8Candidate ? "function" : "undefined",
);
assert.equal(
  nativeGlobals.report.setTimeout,
  v8Candidate ? "function" : "undefined",
);
assert.equal(nativeGlobals.report.process, "undefined");
const behaviorSource = `Promise.resolve(JSON.stringify((() => {
  const capture = (fn) => { try { return { supported: true, value: fn() }; } catch { return { supported: false }; } };
  return {
    intl: capture(() => new Intl.NumberFormat('en-US').format(1234.5)),
    url: capture(() => new URL('/x?q=1', 'https://example.test').href),
    clone: capture(() => Array.from(structuredClone(new Map([['x', 2]])).entries())),
    date: capture(() => new Date('2020-01-02T03:04:05Z').toISOString()),
    unicodeRegex: capture(() => /(?<word>\\p{L}+)/u.exec('日本語 2').groups.word),
    utf8: capture(() => new TextDecoder().decode(new TextEncoder().encode('あ😀'))),
  };
})()))`;
const referenceBehavior = await runNode({
  entries: initialEntries(),
  source: behaviorSource,
});
const candidateBehavior = runRust({
  source: candidateProfile + "\n" + behaviorSource,
});
assert.equal(candidateBehavior.kind, "completed", candidateBehavior.error);
for (const [name, result] of Object.entries(candidateBehavior.report)) {
  if (result.supported)
    assert.deepEqual(
      result,
      referenceBehavior.report[name],
      "Profile behavior: " + name,
    );
}
if (v8Candidate)
  assert.equal(
    candidateBehavior.report.intl.supported,
    true,
    "V8 ICU/Intl is unavailable",
  );
const allocationProbe = runRust({
  source:
    '__beginWork(); globalThis.retained = new Array(12000000).fill("x"); Promise.resolve(JSON.stringify({length: globalThis.retained.length}))',
});
assert.equal(allocationProbe.workStarted, true);
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
  metafile: true,
});
assert.ok(
  !Object.keys(compilerBuild.metafile.inputs).some((p) =>
    /apps[\\/]desktop/.test(p),
  ),
  "The compiler fixture imports Desktop code.",
);
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
  "TypeScript compiler output differs between Node and the candidate",
);
process.stdout.write(
  "PASS compiler: production TypeScript transpilation in Rust host\n",
);
const integratedCompilation = runRust({
  entries: initialEntries(),
  memoryLimitBytes: 128 * 1024 * 1024,
  deadlineMs: 5000,
  source:
    candidateProfile +
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
  candidate: v8Candidate
    ? "deno_core 0.412.0 / V8"
    : "rquickjs 0.14.0 / QuickJS-NG",
  engine: nativeGlobals.engine,
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
  profileGlobals: profileGlobals.report,
  profileBehavior: candidateBehavior.report,
  allocationProbe: {
    kind: allocationProbe.kind,
    memoryLimitReached: allocationProbe.memoryLimitReached,
    heap: allocationProbe.heap,
  },
  results,
};
writeFileSync(
  path.join(generated, "results.json"),
  JSON.stringify(summary, null, 2) + "\n",
);
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
