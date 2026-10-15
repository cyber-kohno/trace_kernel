import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

assert.equal(
  process.platform,
  "win32",
  "This fixture exercises current Windows transaction paths.",
);
const directory = path.dirname(fileURLToPath(import.meta.url));
const binary = path.join(
  directory,
  "target/release/trace-kernel-js-host-v8-spike.exe",
);
const bundle = readFileSync(
  path.join(directory, "generated/fixture.js"),
  "utf8",
);
const base = path.resolve(directory, "generated/native-io");
mkdirSync(base, { recursive: true });
const root = mkdtempSync(path.join(base, "case-"));
assert.ok(path.resolve(root).startsWith(base + path.sep));
const literal = JSON.stringify;
const file = (name) => path.join(root, name);
const mutations = new Set([
  "save_binary",
  "save_text",
  "make_dir",
  "copy_file",
  "rename",
  "delete_file",
  "delete_dir",
  "delete_dir_all",
]);
const run = (code, options = {}, context = {}) => {
  const result = spawnSync(binary, [], {
    input: JSON.stringify({
      nativeFiles: true,
      deadlineMs: 3000,
      ...options,
      source:
        bundle +
        `\n(async () => JSON.stringify(await SpikeWork.run(${literal(code)}, ${literal(context)})))()`,
    }),
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.ok(result.stdout.trim(), result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(
    result.status,
    report.kind === "completed" ? 0 : 1,
    result.stderr,
  );
  assert.equal(report.nativeIo.realFiles, true);
  assert.equal(
    report.nativeIo.activeAfterCleanup,
    false,
    JSON.stringify(report),
  );
  if (options.expectCleanupFailure)
    assert.equal(typeof report.nativeIo.cleanupError, "string");
  else assert.equal(report.nativeIo.cleanupError, null);
  return report;
};
const success = (report) => {
  assert.equal(report.kind, "completed", report.error);
  assert.equal(report.report.kind, "success", JSON.stringify(report.report));
};
const pass = (name) => process.stdout.write(`PASS real native I/O: ${name}\n`);

try {
  const source = file("source.txt");
  writeFileSync(source, "original");
  writeFileSync(file("copy.txt"), "copy");
  writeFileSync(file("delete.txt"), "delete");
  writeFileSync(file("old.txt"), "rename");
  mkdirSync(file("empty"));
  const applied = run(`
    const tx=$fs.useTransaction();
    tx.makeDir(${literal(file("new"))});
    tx.saveText(${literal(file("new/created.txt"))}, 'created');
    const opened=await tx.openText(${literal(source)});
    $println(opened.content); tx.updateText(opened.token, 'changed');
    tx.copyFile(${literal(file("copy.txt"))}, ${literal(file("copied.txt"))});
    tx.deleteFile(${literal(file("delete.txt"))});
    tx.renameFile(${literal(file("old.txt"))}, 'renamed.txt');
    tx.deleteDir(${literal(file("empty"))});
  `);
  success(applied);
  assert.equal(applied.report.result.committedCount, 7);
  assert.equal(readFileSync(source, "utf8"), "changed");
  assert.equal(readFileSync(file("new/created.txt"), "utf8"), "created");
  assert.equal(readFileSync(file("copied.txt"), "utf8"), "copy");
  assert.equal(readFileSync(file("renamed.txt"), "utf8"), "rename");
  assert.equal(existsSync(file("delete.txt")), false);
  assert.equal(existsSync(file("old.txt")), false);
  assert.equal(existsSync(file("empty")), false);
  const lastOutput = applied.calls.findLastIndex(
    (c) => c.command === "append_output",
  );
  const firstMutation = applied.calls.findIndex((c) =>
    mutations.has(c.command),
  );
  assert.ok(lastOutput < firstMutation);
  pass("seven transactions and output-before-commit ordering");

  writeFileSync(file("sjis.txt"), Buffer.from([0x82, 0xa0]));
  const sjis = run(
    `const tx=$fs.useTransaction(); const opened=await tx.openText(${literal(file("sjis.txt"))}, 'sjis'); $println(opened.content); tx.updateText(opened.token, opened.content+'x');`,
  );
  success(sjis);
  assert.equal(sjis.stdout, "あ\n");
  assert.deepEqual(
    Array.from(readFileSync(file("sjis.txt"))),
    [0x82, 0xa0, 120],
  );
  pass("Shift-JIS read and staged update");

  const direct = run(`
    const p=${literal(file("direct.txt"))}; await $fs.saveText(p, ${literal("one\ntwo\nthree")});
    $println(String(await $fs.exists(p)));
    $println(String((await $fs.stat(p)).isFile));
    $println(await $fs.tailText(p, 1));
    $println(String((await $fs.glob(${literal(file("direct*"))})).length));
    $println(String((await $fs.readDir(${literal(root)})).some(x=>x.name==='direct.txt')));
    await $fs.copyFile(p, ${literal(file("direct-copy.txt"))});
    await $fs.renameFile(${literal(file("direct-copy.txt"))}, 'direct-renamed.txt');
    await $fs.deleteFile(${literal(file("direct-renamed.txt"))});
    await $fs.makeDir(${literal(file("direct-dir"))});
    await $fs.renameDir(${literal(file("direct-dir"))}, 'direct-dir-renamed');
    await $fs.deleteDir(${literal(file("direct-dir-renamed"))});
  `);
  success(direct);
  assert.equal(direct.stdout, "true\ntrue\nthree\n1\ntrue\n");
  assert.equal(existsSync(file("direct-dir-renamed")), false);
  pass("direct filesystem APIs, tail, glob and rename");

  const datasetRoot = file("dataset");
  mkdirSync(datasetRoot);
  writeFileSync(path.join(datasetRoot, "日本語.txt"), "data");
  const dataset = run(
    `for(const x of $dataset.DATA) $println(x.fileName+':'+await x.content());`,
    {},
    {
      contextData: {
        envs: [{ varName: "ROOT", value: datasetRoot }],
        resources: [],
        processes: [],
        logics: [],
        datasets: [
          {
            varName: "DATA",
            rootPath: "%ROOT%",
            encoding: "utf8",
            targets: null,
            scanOption: { dirConds: [], fileConds: [] },
          },
        ],
      },
    },
  );
  success(dataset);
  assert.equal(dataset.stdout, "日本語.txt:data\n");
  assert.equal(dataset.nativeIo.scanStarted, true);
  pass("dynamic dataset scan and content through real native ports");

  const never = file("never.txt");
  const failure = run(
    `const tx=$fs.useTransaction(); tx.saveText(${literal(never)}, 'never'); $println('before-error'); await $fs.readText(${literal(file("missing.txt"))});`,
  );
  assert.equal(failure.kind, "completed", failure.error);
  assert.equal(failure.report.kind, "runtime-error");
  assert.equal(failure.stdout, "before-error\n");
  assert.ok(!failure.calls.some((c) => mutations.has(c.command)));
  assert.equal(existsSync(never), false);
  pass("read failure retains earlier output without staged effects");

  const conflict = run(
    `const tx=$fs.useTransaction(); const opened=await tx.openText(${literal(source)}); tx.updateText(opened.token,'planned'); await $fs.saveText(${literal(source)},'external');`,
  );
  assert.equal(conflict.kind, "completed", conflict.error);
  assert.equal(conflict.report.kind, "verification-failed");
  assert.equal(readFileSync(source, "utf8"), "external");
  assert.equal(
    conflict.calls.filter((c) =>
      ["save_binary", "save_text"].includes(c.command),
    ).length,
    1,
  );
  pass("real verification conflict does not overwrite external changes");

  const unfinished = run(
    `const tx=$fs.useTransaction(); tx.saveText(${literal(never)},'never'); void $fs.readText(${literal(source)}); $println('pending');`,
    { nativeCallDelayMs: 100 },
  );
  assert.equal(unfinished.kind, "host-error");
  assert.equal(unfinished.nativeIo.unfinishedAtBoundary, true);
  assert.equal(unfinished.stdout, "pending\n");
  assert.equal(existsSync(never), false);
  pass("unawaited native call is stopped before transaction");

  const saturated = run(
    `const results=await Promise.allSettled(Array.from({length:33},()=>__invoke('exists_path',JSON.stringify({path:${literal(source)}})))); $println(results.filter(x=>x.status==='fulfilled').length+':'+results.filter(x=>x.status==='rejected').length);`,
    { nativeCallDelayMs: 100 },
  );
  success(saturated);
  assert.equal(saturated.stdout, "32:1\n");
  pass("32-operation admission limit claimed before async waiting");

  const scanPayload = literal(
    JSON.stringify({
      req: { rootPath: datasetRoot, dirConds: [], fileConds: [] },
    }),
  );
  const blocking = run(
    `void __invoke('scan_directory', ${scanPayload}); await $runtime.sleep(100); $println('before-stop');`,
    { scanProgressDelayMs: 400 },
  );
  assert.equal(blocking.kind, "host-error");
  assert.equal(blocking.nativeIo.unfinishedAtBoundary, true);
  assert.equal(blocking.nativeIo.scanStarted, true);
  assert.ok(
    blocking.nativeIo.cleanupMs >= 100,
    JSON.stringify(blocking.nativeIo),
  );
  assert.equal(blocking.stdout, "before-stop\n");
  pass("Work completion waits for unfinished real blocking scan release");

  for (const [name, options, kind] of [
    ["cancel during blocking scan", { cancelAfterMs: 60 }, "cancelled"],
    ["deadline during blocking scan", { deadlineMs: 250 }, "timed-out"],
  ]) {
    const stopped = run(`await __invoke('scan_directory', ${scanPayload});`, {
      scanProgressDelayMs: 500,
      ...options,
    });
    assert.equal(stopped.kind, kind, stopped.error);
    assert.equal(stopped.nativeIo.scanStarted, true);
    assert.ok(
      stopped.nativeIo.cleanupMs >= 100,
      JSON.stringify(stopped.nativeIo),
    );
    assert.ok(!stopped.calls.some((c) => mutations.has(c.command)));
    pass(name + " waits for actual native release");
  }

  const memory = run(
    `void __invoke('scan_directory', ${scanPayload}); await $runtime.sleep(100); globalThis.retained=new ArrayBuffer(64*1024*1024); while(true) {}`,
    { scanProgressDelayMs: 400 },
  );
  assert.equal(memory.kind, "host-error");
  assert.equal(memory.memoryLimitReached, true);
  assert.equal(memory.nativeIo.scanStarted, true);
  assert.ok(memory.nativeIo.cleanupMs >= 100, JSON.stringify(memory.nativeIo));
  pass("memory termination also stops and waits for native owners");

  const failedCleanup = run(
    `const tx=$fs.useTransaction();tx.saveText(${literal(never)},'never');try{await __invoke('scan_directory',${scanPayload});}catch(e){}$println('caught');`,
    { scanProgressPanic: true, expectCleanupFailure: true },
  );
  assert.equal(failedCleanup.kind, "host-error");
  assert.match(failedCleanup.nativeIo.cleanupError, /panicked/);
  assert.equal(existsSync(never), false);
  assert.ok(!failedCleanup.calls.some((c) => mutations.has(c.command)));
  pass(
    "caught native panic cannot bypass cleanup failure or apply transaction",
  );

  const retry = run(`$println(await $fs.readText(${literal(source)}));`);
  success(retry);
  assert.equal(retry.stdout, "external\n");
  pass("a fresh execution works after cancelled and failed executions");
} finally {
  const resolved = path.resolve(root);
  assert.ok(
    resolved.startsWith(base + path.sep),
    "Cleanup target escaped the fixture directory.",
  );
  rmSync(resolved, { recursive: true, force: true });
}
