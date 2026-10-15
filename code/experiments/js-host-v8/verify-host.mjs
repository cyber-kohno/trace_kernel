import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const bootstrapOverride = process.argv.includes("--bootstrap-source")
  ? readFileSync(path.join(directory, "src/bootstrap.js"), "utf8") + "\n"
  : "";
const binary = path.join(
  directory,
  "target/release/trace-kernel-js-host-v8-spike.exe",
);
const run = (source, options = {}) => {
  const result = spawnSync(binary, [], {
    input: JSON.stringify({
      source: bootstrapOverride + source,
      deadlineMs: 3000,
      ...options,
    }),
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  assert.ok(result.stdout.trim(), result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(
    result.status,
    report.kind === "completed" ? 0 : 1,
    result.stderr,
  );
  return report;
};
const expect = (name, source, value) => {
  const actual = run(`(async () => JSON.stringify(await (${source})))()`);
  assert.equal(actual.kind, "completed", actual.error);
  assert.deepEqual(actual.report, value, name);
  process.stdout.write(`PASS Web API: ${name}\n`);
};
expect(
  "Base64 bytes and invalid input",
  `(() => {
    const bytes = String.fromCharCode(0, 127, 128, 255);
    let encodeError = false, decodeError = false;
    try { btoa('日本語'); } catch(e) { encodeError = e instanceof DOMException && e.name === 'InvalidCharacterError'; }
    try { atob('!'); } catch(e) { decodeError = e instanceof DOMException && e.name === 'InvalidCharacterError'; }
    return [btoa(bytes), Array.from(atob(' AH+A/w== '), c => c.charCodeAt(0)), atob('YQ'), encodeError, decodeError];
  })()`,
  ["AH+A/w==", [0, 127, 128, 255], "a", true, true],
);
expect(
  "URL parameters",
  `(() => {
  const u = new URL('/日本語?a=1&a=2', 'https://example.test');
  u.searchParams.append('q', 'a b');
  return [u.pathname, u.searchParams.getAll('a'), u.searchParams.get('q'), u.href];
})()`,
  [
    "/%E6%97%A5%E6%9C%AC%E8%AA%9E",
    ["1", "2"],
    "a b",
    "https://example.test/%E6%97%A5%E6%9C%AC%E8%AA%9E?a=1&a=2&q=a+b",
  ],
);
expect(
  "decoder streaming and fatal",
  `(() => {
  const d = new TextDecoder();
  const first = d.decode(new Uint8Array([0xe3, 0x81]), {stream:true});
  const last = d.decode(new Uint8Array([0x82]));
  let fatal = false;
  try { new TextDecoder('utf-8', {fatal:true}).decode(new Uint8Array([0xff])); } catch(e) { fatal = e instanceof TypeError; }
  return [first, last, fatal, new TextDecoder('shift_jis').decode(new Uint8Array([0x82,0xa0]))];
})()`,
  ["", "あ", true, "あ"],
);
expect(
  "structured clone cycles and transfer",
  `(() => {
  const original = {map:new Map([['x',2]]), date:new Date('2020-01-01Z')};
  original.self = original;
  const copied = structuredClone(original);
  const buffer = new Uint8Array([1,2]).buffer;
  const transferred = structuredClone(buffer, {transfer:[buffer]});
  let rejected = false;
  try { structuredClone(() => {}); } catch(e) { rejected = e.name === 'DataCloneError'; }
  return [copied !== original, copied.self === copied, copied.map.get('x'), copied.date.toISOString(), buffer.byteLength, Array.from(new Uint8Array(transferred)), rejected];
})()`,
  [true, true, 2, "2020-01-01T00:00:00.000Z", 0, [1, 2], true],
);
expect(
  "interval, arguments and cross clear",
  `new Promise(resolve => {
  let n=0;
  const id = setInterval((increment) => {
    n += increment;
    if(n===6) { clearTimeout(id); resolve(n); }
  }, 2, 2);
})`,
  6,
);
expect(
  "awaited timeout and Work disposal",
  `(async () => {
  await new Promise(resolve => setTimeout(resolve, 5));
  setInterval(() => {throw new Error('late interval');}, 10000);
  setTimeout(() => {throw new Error('late timeout');}, 10000);
  __finishWork();
  return 'finished';
})()`,
  "finished",
);

for (const [name, allocation, tail] of [
  [
    "single retained array",
    `globalThis.retained = new Array(12000000).fill('x');`,
    `Promise.resolve(JSON.stringify({ok:true}))`,
  ],
  [
    "ArrayBuffer backing store",
    `globalThis.retained = new ArrayBuffer(64*1024*1024);`,
    `Promise.resolve(JSON.stringify({ok:true}))`,
  ],
  [
    "CPU loop after allocation",
    `globalThis.retained = new Array(12000000).fill('x');`,
    `while(true) {}`,
  ],
  [
    "microtask loop after allocation",
    `globalThis.retained = new ArrayBuffer(64*1024*1024);`,
    `(async () => {while(true) await Promise.resolve();})()`,
  ],
]) {
  const actual = run(`__beginWork(); ${allocation} ${tail}`);
  assert.equal(actual.kind, "host-error", name + ": " + actual.error);
  assert.equal(actual.memoryLimitReached, true, name);
  assert.ok(actual.elapsedMs < 1500, name);
  process.stdout.write(`PASS memory stop: ${name}\n`);
}
const bundle = readFileSync(
  path.join(directory, "generated/fixture.js"),
  "utf8",
);
const finishedWork = run(
  bundle +
    `\n(async () => JSON.stringify(await SpikeWork.run(${JSON.stringify(
      `await $runtime.sleep(5);
       setTimeout(() => {throw new Error('late timeout');}, 10000);
       setInterval(() => {throw new Error('late interval');}, 10000);
       $println('finished');`,
    )})))()`,
);
assert.equal(finishedWork.kind, "completed", finishedWork.error);
assert.equal(finishedWork.report.kind, "success");
assert.equal(finishedWork.stdout, "finished\n");
process.stdout.write(
  "PASS Work lifecycle: background timers cleared before output drain\n",
);
const timerFailure = run(
  bundle +
    `\n(async () => JSON.stringify(await SpikeWork.run(${JSON.stringify(
      `const tx=$fs.useTransaction(); tx.saveText('C:\\\\fixture\\\\never.txt', 'never');
       setTimeout(() => {throw new Error('timer failed');}, 2); await $runtime.sleep(100);`,
    )})))()`,
);
assert.equal(timerFailure.kind, "host-error", timerFailure.error);
assert.match(timerFailure.error, /timer failed/);
assert.ok(!timerFailure.calls.some((c) => c.command === "save_binary"));
process.stdout.write("PASS timer failure: transaction is not applied\n");
const work = `const tx=$fs.useTransaction(); tx.saveText('C:\\\\fixture\\\\never.txt', 'never');
  try {globalThis.retained=new Array(12000000).fill('x'); await $runtime.sleep(5);} catch(e) {}
  $println('must not commit');`;
const guarded = run(
  bundle +
    `\n(async () => JSON.stringify(await SpikeWork.run(${JSON.stringify(work)})))()`,
);
assert.equal(guarded.kind, "host-error", guarded.error);
assert.equal(guarded.memoryLimitReached, true);
assert.ok(!guarded.calls.some((c) => c.command === "save_binary"));
process.stdout.write(
  "PASS memory stop: catch cannot resume staged transaction\n",
);
