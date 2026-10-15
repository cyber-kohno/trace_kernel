import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const binary = path.join(
  directory,
  "target/release/trace-kernel-js-host-v8-spike.exe",
);
const bundle = readFileSync(
  path.join(directory, "generated/fixture.js"),
  "utf8",
);
const base = path.resolve(directory, "generated/channels");
mkdirSync(base, { recursive: true });
const root = mkdtempSync(path.join(base, "case-"));
assert.ok(path.resolve(root).startsWith(base + path.sep));
const staged = path.join(root, "never.txt");
let count = 0;
const run = (source, options = {}, execution = {}) => {
  const result = spawnSync(binary, [], {
    input: JSON.stringify({
      nativeFiles: true,
      deadlineMs: 5000,
      ...options,
      source:
        bundle +
        `\n(async()=>JSON.stringify(await SpikeWork.run(${JSON.stringify(source)},${JSON.stringify({ nativeChannels: true, outputMethod: "channel", ...execution })})))()`,
    }),
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.ok(result.stdout.trim(), result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(
    result.status,
    report.kind === "completed" ? 0 : 1,
    report.error ?? result.stderr,
  );
  assert.equal(report.nativeIo.activeAfterCleanup, false);
  assert.equal(report.nativeIo.cleanupError, null);
  assert.equal(report.channelsAfterCleanup, 0);
  return report;
};
const success = (report) => {
  assert.equal(report.kind, "completed", report.error);
  assert.equal(report.report.kind, "success", report.report.error?.message);
};
const failure = (report, pattern) => {
  assert.equal(report.kind, "completed", report.error);
  assert.equal(report.report.kind, "runtime-error");
  assert.match(report.report.error.message, pattern);
  assert.equal(existsSync(staged), false);
};
const pass = (name) => {
  count++;
  console.log(`PASS native channels: ${name}`);
};
const transaction = `const tx=$fs.useTransaction();tx.saveText(${JSON.stringify(staged)},'never');`;
try {
  const streams = run(`
    const text=$channel.createTextStream('TEXT');text.print('first');text.println('+');text.println('last');
    const table=$channel.createTableStream('TABLE',[{name:'name'},{name:'count',type:'number'}]);table.add({name:'alpha',count:2});
  `);
  success(streams);
  assert.deepEqual(streams.channels.TEXT, ["first+", "last", ""]);
  assert.deepEqual(streams.channels.TABLE, ['{"name":"alpha","count":2}', ""]);
  assert.deepEqual(
    streams.report.channels.map((c) => c.id),
    ["TEXT", "TABLE"],
  );
  pass("text/table metadata and separate production-format line buffers");

  const plain = run(
    `$print('a');$println('b');$println('last');`,
    {},
    { outputMethod: "plain" },
  );
  success(plain);
  assert.deepEqual(plain.channels.__plain__, ["ab", "last", ""]);
  pass("plain output retains print/println joining");

  const ranges = run(`
    const invoke=async(command,args)=>JSON.parse(await __invoke(command,JSON.stringify(args)));
    if(!(await invoke('add_channel',{channelId:'RANGE'})).ok)throw new Error('registration');
    if(!(await invoke('append_lines',{channelId:'RANGE',batches:[['a','b','']]})).ok)throw new Error('append');
    const len=await invoke('get_line_len',{channelId:'RANGE'}), range=await invoke('get_range_lines',{channelId:'RANGE',from:1,to:999});
    if(len.value!==2 || JSON.stringify(range.value)!==JSON.stringify(['b','']))throw new Error('range shape');
    const missing=await invoke('get_range_lines',{channelId:'missing',from:0,to:1});
    if(JSON.stringify(missing.value)!=='[]')throw new Error('missing range');
  `);
  success(ranges);
  assert.deepEqual(ranges.channels.RANGE, ["a", "b", ""]);
  pass("typed read dispatch preserves range and visible-line count rules");

  const duplicate = run(
    `${transaction}const stream=$channel.createTextStream('duplicate');stream.println('kept');$channel.createTextStream('duplicate');`,
  );
  failure(duplicate, /already exists/);
  assert.deepEqual(duplicate.channels.duplicate, ["kept", ""]);
  pass(
    "duplicate registration keeps earlier output and prevents staged file effects",
  );

  const rawDuplicate = run(`
    const invoke=async(command,args)=>JSON.parse(await __invoke(command,JSON.stringify(args)));
    const first=await invoke('add_channel',{channelId:'duplicate'}),second=await invoke('add_channel',{channelId:'duplicate'});
    if(!first.ok || second.ok || !second.error.includes('already exists'))throw new Error('native duplicate rule');
  `);
  success(rawDuplicate);
  assert.deepEqual(rawDuplicate.channels.duplicate, []);
  pass(
    "native duplicate validation is retained independently of JS validation",
  );

  const oversizedId = run(
    `${transaction}$channel.createTextStream('あ'.repeat(86));`,
  );
  failure(oversizedId, /256 bytes/);
  assert.deepEqual(oversizedId.channels, {});
  pass("channel ID budget counts UTF-8 bytes");

  const tooMany = run(
    `${transaction}for(let i=0;i<129;i++){ $channel.createTextStream('C'+i);await $runtime.sleep(5); }`,
  );
  failure(tooMany, /Channel count exceeds 128/);
  assert.equal(Object.keys(tooMany.channels).length, 128);
  pass("channel count overflow rejects without a partial channel");

  const bytes = run(
    `${transaction}const text=$channel.createTextStream('TEXT');text.println('before');await $runtime.sleep(60);text.print('x'.repeat(8*1024*1024));`,
    { memoryLimitBytes: 128 * 1024 * 1024 },
  );
  failure(bytes, /Channel output exceeds 8388608 bytes/);
  assert.deepEqual(bytes.channels.TEXT, ["before", ""]);
  pass("byte overflow rejects the whole append and retains accepted lines");

  const lines = run(
    `${transaction}const text=$channel.createTextStream('TEXT');text.println('before');await $runtime.sleep(60);text.print('\\n'.repeat(100000));`,
    { memoryLimitBytes: 128 * 1024 * 1024 },
  );
  failure(lines, /Channel output exceeds 100000 lines/);
  assert.deepEqual(lines.channels.TEXT, ["before", ""]);
  pass("line overflow rejects the whole append");

  for (const [reason, options, ending, kind] of [
    [
      "cancel",
      { cancelAfterMs: 250 },
      "await new Promise(()=>{});",
      "cancelled",
    ],
    [
      "deadline",
      { deadlineMs: 500 },
      "await new Promise(()=>{});",
      "timed-out",
    ],
    [
      "memory",
      { memoryLimitBytes: 32 * 1024 * 1024 },
      "const values=new Array(16*1024*1024).fill(1);while(true){};",
      "host-error",
    ],
  ]) {
    const stopped = run(
      `${transaction}const text=$channel.createTextStream('TEXT');text.println('before');await $runtime.sleep(60);${ending}`,
      options,
    );
    assert.equal(stopped.kind, kind, stopped.error);
    assert.deepEqual(stopped.channels.TEXT, ["before", ""]);
    assert.equal(existsSync(staged), false);
    pass(`${reason} keeps accepted output and releases all channel owners`);
  }
} finally {
  const target = path.resolve(root);
  assert.ok(target.startsWith(base + path.sep));
  rmSync(target, { recursive: true, force: true });
}
console.log(`${count} actual native channel cases passed.`);
