import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { gzipSync } from "node:zlib";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const supplied = process.argv.indexOf("--binary");
const binary = path.resolve(
  supplied >= 0
    ? process.argv[supplied + 1]
    : path.join(app, "target/release/trace-kernel-cli.exe"),
);
const base = path.join(app, "generated");
mkdirSync(base, { recursive: true });
const root = mkdtempSync(path.join(base, "verify-"));
const fixture = path.join(root, "日本語 Workspace.trk"),
  out = path.join(root, "created.txt"),
  license = path.join(root, "license.json");
const key = readFileSync(
  path.resolve(app, "../../packages/runtime-core/src/license/license-util.ts"),
  "utf8",
).match(/v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)[0];
writeFileSync(license, JSON.stringify({ key }));
const workspace = (source, method = "plain", extra = {}) => ({
  gen: { workspace: "0", api: "1" },
  envs: [{ varName: "OUT", value: out }],
  resources: [],
  datasets: [],
  processes: [],
  logics: [],
  declare: { source: "" },
  works: [{ name: "試験 Work", source, method }],
  ...extra,
});
const save = (ws) =>
  writeFileSync(fixture, gzipSync(JSON.stringify(ws)).toString("base64"));
const call = (args, options = {}) => {
  const r = spawnSync(options.binary ?? binary, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  return r;
};
const run = (source, flags = [], method = "plain", extra = {}) => {
  save(workspace(source, method, extra));
  return call([fixture, "試験 Work", "--license-file", license, ...flags]);
};
let count = 0;
const check = (name, body) => {
  body();
  count++;
  console.log("PASS CLI: " + name);
};
const success = (r) => assert.equal(r.status, 0, r.stderr);
check("help/version and missing arguments", () => {
  success(call(["--help"]));
  const version = call(["--version"]);
  success(version);
  assert.match(version.stdout, /Workspace 0, API 1/);
  assert.equal(call([]).status, 2);
  assert.equal(call([fixture]).status, 2);
  assert.equal(call(["--unknown"]).status, 2);
});
check("Unicode Work selection and plain joining", () => {
  const r = run('$print("日本語");$println(":OK");');
  success(r);
  assert.equal(r.stdout, "日本語:OK\n");
  assert.equal(r.stderr, "");
});
check("check never executes Work or file mutation", () => {
  save(
    workspace(
      'await $fs.saveText($env.OUT,"not-created");$println("not-run");',
    ),
  );
  const r = call(["--check", fixture, "試験 Work", "--license-file", license]);
  success(r);
  assert.equal(r.stdout, "");
  assert.equal(existsSync(out), false);
});
check("list uses JSON and preserves names", () => {
  save(workspace(""));
  const r = call(["--list", fixture, "--license-file", license]);
  success(r);
  assert.deepEqual(JSON.parse(r.stdout), [
    { name: "試験 Work", method: "plain" },
  ]);
});
check("exact Work name matching", () => {
  save(workspace(""));
  assert.equal(call([fixture, "試験", "--license-file", license]).status, 3);
});
check("multiple text/table channels", () => {
  const r = run(
    'const log=$channel.createTextStream("LOG");log.print("a");log.println("b");const table=$channel.createTableStream("ROWS",[{name:"count",type:"number",width:120}]);table.add({count:2});table.add({count:3});',
    [],
    "channel",
  );
  success(r);
  const events = r.stdout.trim().split("\n").map(JSON.parse);
  assert.deepEqual(
    events.filter((e) => e.type === "channel").map((e) => e.channelId),
    ["LOG", "ROWS"],
  );
  assert.equal(
    events
      .filter((e) => e.type === "text")
      .map((e) => e.text)
      .join(""),
    "ab\n",
  );
  assert.deepEqual(
    events.filter((e) => e.type === "record").map((e) => e.record),
    [{ count: 2 }, { count: 3 }],
  );
  assert.equal(events.find((e) => e.channelId === "ROWS").detail[0].width, 120);
});
check("empty channel registration", () => {
  const r = run('$channel.createTextStream("EMPTY");', [], "channel");
  success(r);
  assert.equal(JSON.parse(r.stdout).channelId, "EMPTY");
});
check("state stderr and counter semantics", () => {
  const r = run(
    'const p=$state.useProgress(2);p.tick();$state.useMonitor(1)[0]("working");$println(String(p.getCurrent()));',
  );
  success(r);
  assert.equal(r.stdout, "1\n");
  assert.deepEqual(
    r.stderr
      .trim()
      .split("\n")
      .map(JSON.parse)
      .map((e) => e.method),
    ["progress_start", "progress_tick", "monitor_init", "monitor_set"],
  );
});
check("unsupported API is rejected before execution", () => {
  const r = run('$println("not-run");new Blob(["x"]);');
  assert.equal(r.status, 3);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /Blob/);
});
check("unsupported referenced Logic", () => {
  const r = run("await $logic.BAD();", [], "plain", {
    logics: [{ name: "BAD", source: 'export default ()=>new Blob(["x"]);' }],
  });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /Logic BAD/);
});
check("unused incompatible Logic does not exclude Work", () => {
  const r = run('$println("ok");', [], "plain", {
    logics: [{ name: "BAD", source: 'export default ()=>new Blob(["x"]);' }],
  });
  success(r);
  assert.equal(r.stdout, "ok\n");
});
check("transitive Logic and context", () => {
  const r = run("$println(String(await $logic.ADD(2)));", [], "plain", {
    logics: [
      {
        name: "ADD",
        source: "export default async (n:number)=>await $logic.DOUBLE(n)+1;",
      },
      { name: "DOUBLE", source: "export default (n:number)=>n*2;" },
    ],
  });
  success(r);
  assert.equal(r.stdout, "5\n");
});
check("constant computed Logic lookup", () => {
  const r = run(
    'const name="GOOD";$println(String(await $logic[name]()));',
    [],
    "plain",
    {
      logics: [
        { name: "GOOD", source: "export default ()=>7;" },
        { name: "BAD", source: 'export default ()=>new Blob(["x"]);' },
      ],
    },
  );
  success(r);
  assert.equal(r.stdout, "7\n");
});
check("duplicate channel failure retains previous output", () => {
  const r = run(
    '$channel.createTextStream("D").println("first");$channel.createTextStream("D");',
    [],
    "channel",
  );
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes("first"));
});
check("runtime failure and undefined throw remain failures", () => {
  assert.equal(run('throw new Error("expected");').status, 1);
  assert.equal(run("throw undefined;").status, 1);
});
check("caught state output failure still blocks transaction", () => {
  const target = path.join(root, "state-never.txt");
  const r = run(
    `$fs.useTransaction().saveText(${JSON.stringify(target)},"never");try{$state.useMonitor(1)[0]("x".repeat(8*1024*1024));}catch{};`,
    ["--commit"],
  );
  assert.equal(r.status, 1, r.stderr);
  assert.equal(existsSync(target), false);
  assert.match(r.stderr, /Output failed/);
});
check("explicit bad license never falls back", () => {
  save(workspace('$println("not-run");'));
  const bad = path.join(root, "bad-license.json");
  writeFileSync(bad, JSON.stringify({ key: key.slice(0, -1) + "!" }));
  const r = call([fixture, "試験 Work", "--license-file", bad]);
  assert.equal(r.status, 4);
  assert.equal(r.stdout, "");
  assert.equal(
    call([
      fixture,
      "試験 Work",
      "--license-file",
      path.join(root, "missing.json"),
    ]).status,
    4,
  );
});
check("generation error", () => {
  save(workspace("", "plain", { gen: { workspace: "999", api: "1" } }));
  assert.equal(
    call([fixture, "試験 Work", "--license-file", license]).status,
    3,
  );
});
check("malformed Workspace", () => {
  writeFileSync(fixture, "invalid!");
  assert.equal(
    call([fixture, "試験 Work", "--license-file", license]).status,
    3,
  );
});
check("duplicate Work selection", () => {
  const ws = workspace("");
  ws.works.push({ ...ws.works[0] });
  save(ws);
  assert.equal(
    call([fixture, "試験 Work", "--license-file", license]).status,
    3,
  );
});
check("VFS pending does not apply", () => {
  const r = run('$fs.useTransaction().saveText($env.OUT,"new");');
  assert.equal(r.status, 5);
  assert.equal(existsSync(out), false);
});
check("VFS commit writes real UTF-8 data", () => {
  const r = run('$fs.useTransaction().saveText($env.OUT,"日本語");', [
    "--commit",
  ]);
  success(r);
  assert.equal(readFileSync(out, "utf8"), "日本語");
});
check("transaction verification preserves conflicting file", () => {
  const r = run('$fs.useTransaction().saveText($env.OUT,"overwrite");', [
    "--commit",
  ]);
  assert.equal(r.status, 1);
  assert.equal(readFileSync(out, "utf8"), "日本語");
});
check("direct file I/O executes without commit", () => {
  const r = run(
    'await $fs.saveText($env.OUT,"direct");$println(await $fs.readText($env.OUT));',
  );
  success(r);
  assert.equal(r.stdout, "direct\n");
});
check("DOM parser uses real native store", () => {
  const r = run(
    'const dom=await $parser.xml("<root><item>native</item></root>");const nodes=await dom.query("//item");$println(await nodes[0].text());await dom.dispose();',
  );
  success(r);
  assert.equal(r.stdout, "native\n");
});
check("dynamic dataset scan and content", () => {
  const datasetRoot = path.join(root, "dataset");
  mkdirSync(datasetRoot);
  writeFileSync(path.join(datasetRoot, "日本語.txt"), "data");
  const r = run(
    'for(const item of $dataset.DATA)$println(item.fileName+":"+await item.content());',
    [],
    "plain",
    {
      datasets: [
        {
          varName: "DATA",
          rootPath: datasetRoot,
          encoding: "utf8",
          targets: null,
          scanOption: { dirConds: [], fileConds: [] },
        },
      ],
    },
  );
  success(r);
  assert.equal(r.stdout, "日本語.txt:data\n");
});
const externalProcess = (funcName, code) => ({
  funcName,
  prgPath: process.execPath,
  scriptArgs: [],
  cmdArgs: ["-e", code],
  cwd: root,
  stdin: "",
  timeout: 20000,
  encoding: { stdin: "utf8", stdout: "utf8", stderr: "utf8" },
});
check("real process stdout, stderr and exit code", () => {
  const r = run(
    "const result=await $process.ECHO();$println(JSON.stringify(result));",
    [],
    "plain",
    {
      processes: [
        externalProcess(
          "ECHO",
          'process.stdout.write("日本語");process.stderr.write("err");process.exitCode=7;',
        ),
      ],
    },
  );
  success(r);
  assert.deepEqual(JSON.parse(r.stdout), {
    stdout: "日本語",
    stderr: "err",
    exitCode: 7,
  });
});
check("deadline reaps owned process and prevents transaction", () => {
  const pidFile = path.join(root, "child.pid"),
    target = path.join(root, "process-never.txt");
  const code = `require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000);`;
  const r = run(
    `$fs.useTransaction().saveText(${JSON.stringify(target)},"never");await $process.WAIT();`,
    ["--timeout", "3", "--commit"],
    "plain",
    { processes: [externalProcess("WAIT", code)] },
  );
  assert.equal(r.status, 124, r.stderr);
  assert.equal(existsSync(target), false);
  assert.ok(existsSync(pidFile), "Child must actually have started");
  const pid = Number(readFileSync(pidFile, "utf8"));
  assert.throws(() => process.kill(pid, 0), /ESRCH/);
});
check("verified standard Web APIs", () => {
  const r = run(
    'const url=new URL("https://example.invalid/?a=1");url.searchParams.append("a","2");const encoded=new TextEncoder().encode("日本語");const decoded=new TextDecoder().decode(encoded);const copy=structuredClone({decoded});let queued=false;queueMicrotask(()=>{queued=true;});await new Promise<void>(resolve=>setTimeout(resolve,5));$println(JSON.stringify({values:url.searchParams.getAll("a"),copy,base64:atob(btoa("ok")),queued,error:new DOMException("x","Test").name}));',
  );
  success(r);
  assert.deepEqual(JSON.parse(r.stdout), {
    values: ["1", "2"],
    copy: { decoded: "日本語" },
    base64: "ok",
    queued: true,
    error: "Test",
  });
});
check("math and Intl after V8 build profile changes", () => {
  const r = run(
    'const result={sin:Math.sin(1),cos:Math.cos(1),sinZero:Object.is(Math.sin(-0),-0),cosZero:Math.cos(-0),nan:Number.isNaN(Math.sin(Infinity)),largeSin:Math.sin(1e300),largeCos:Math.cos(1e300),number:new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(1234.5),date:new Intl.DateTimeFormat("en-US",{timeZone:"UTC",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date("2020-01-02T00:00:00Z"))};$println(JSON.stringify(result));',
  );
  success(r);
  const result = JSON.parse(r.stdout);
  assert.ok(Math.abs(result.sin - 0.8414709848078965) < 1e-15);
  assert.ok(Math.abs(result.cos - 0.5403023058681398) < 1e-15);
  assert.equal(result.sinZero, true);
  assert.equal(result.cosZero, 1);
  assert.equal(result.nan, true);
  assert.ok(Number.isFinite(result.largeSin) && Math.abs(result.largeSin) <= 1);
  assert.ok(Number.isFinite(result.largeCos) && Math.abs(result.largeCos) <= 1);
  assert.equal(result.number, "1,234.5");
  assert.equal(result.date, "01/02/2020");
});
check("exported Logic types", () => {
  const r = run(
    "$println(String(await $logic.VALUE({value:8})));",
    [],
    "plain",
    {
      logics: [
        {
          name: "VALUE",
          source:
            "export interface Item {value:number;} export type Count=number; export default (item:Item):Count=>item.value;",
        },
      ],
    },
  );
  success(r);
  assert.equal(r.stdout, "8\n");
});
const readyFile = path.join(root, "http-ready.json");
const server = spawn(
  process.execPath,
  [
    "-e",
    `const fs=require('fs');const server=require('http').createServer((req,res)=>{if(req.url==='/wait')return;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({native:true}));});server.listen(0,'127.0.0.1',()=>fs.writeFileSync(${JSON.stringify(readyFile)},JSON.stringify(server.address())));`,
  ],
  { windowsHide: true, stdio: "ignore" },
);
try {
  for (let attempts = 0; !existsSync(readyFile) && attempts < 100; attempts++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(existsSync(readyFile), "HTTP fixture did not start");
  const url = `http://127.0.0.1:${JSON.parse(readFileSync(readyFile, "utf8")).port}`;
  check("real HTTP dispatch", () => {
    const r = run(
      `$println(JSON.stringify(await $net.getJson(${JSON.stringify(url)})));`,
    );
    success(r);
    assert.deepEqual(JSON.parse(r.stdout), { native: true });
  });
  check("unfinished native HTTP blocks transaction", () => {
    const target = path.join(root, "http-never.txt");
    const r = run(
      `$fs.useTransaction().saveText(${JSON.stringify(target)},"never");void $net.getText(${JSON.stringify(url + "/wait")}).catch(()=>{});`,
      ["--commit"],
    );
    assert.equal(r.status, 1, r.stderr);
    assert.equal(existsSync(target), false);
    assert.match(r.stderr, /unfinished/);
  });
} finally {
  server.kill();
}
check("cwd defaults to Workspace parent and explicit override", () => {
  const cwdProcess = {
    ...externalProcess("CWD", "process.stdout.write(process.cwd());"),
    cwd: "",
  };
  const r = run("$println((await $process.CWD()).stdout);", [], "plain", {
    processes: [cwdProcess],
  });
  success(r);
  assert.equal(r.stdout, root + "\n");
  const other = path.join(root, "other");
  mkdirSync(other);
  const s = run(
    "$println((await $process.CWD()).stdout);",
    ["--cwd", other],
    "plain",
    { processes: [cwdProcess] },
  );
  success(s);
  assert.equal(s.stdout, other + "\n");
});
check("CPU deadline stops Work", () => {
  const r = run("while(true){}", ["--timeout", "1"]);
  assert.equal(r.status, 124, r.stderr);
});
check("pending Promise deadline wakes host", () => {
  const r = run("await new Promise<void>(()=>{});", ["--timeout", "1"]);
  assert.equal(r.status, 124, r.stderr);
});
check("memory stop prevents staged file", () => {
  const target = path.join(root, "memory-never.txt");
  const r = run(
    `$fs.useTransaction().saveText(${JSON.stringify(target)},"never");const bytes=new Uint8Array(96*1024*1024);$println(String(bytes.length));`,
    ["--memory-limit", "64", "--commit"],
  );
  assert.equal(r.status, 1, r.stderr);
  assert.equal(existsSync(target), false);
});
check("unlimited default exceeds experiment deadline", () => {
  const r = run('await $runtime.sleep(11000);$println("done");');
  success(r);
  assert.equal(r.stdout, "done\n");
});
check("standalone executable without Node path or repo cwd", () => {
  const standalone = path.join(root, "standalone");
  mkdirSync(standalone);
  const exe = path.join(standalone, "trace-kernel-cli.exe");
  copyFileSync(binary, exe);
  save(workspace('$println("standalone");'));
  const r = call([fixture, "試験 Work", "--license-file", license], {
    binary: exe,
    cwd: standalone,
    env: { ...process.env, PATH: "" },
  });
  success(r);
  assert.equal(r.stdout, "standalone\n");
});
console.log(`${count} CLI executable cases passed. Fixtures: ${root}`);
