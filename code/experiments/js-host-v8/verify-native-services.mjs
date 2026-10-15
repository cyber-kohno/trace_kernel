import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
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
const base = path.resolve(directory, "generated/native-services");
mkdirSync(base, { recursive: true });
const root = mkdtempSync(path.join(base, "case-"));
assert.ok(path.resolve(root).startsWith(base + path.sep));
const literal = JSON.stringify;
const file = (name) => path.join(root, name);
const context = (processes = []) => ({
  envs: [],
  resources: [],
  datasets: [],
  processes,
  logics: [],
});
const request = (funcName, code, stdin = "", timeout = 5000) => ({
  funcName,
  prgPath: process.execPath,
  scriptArgs: [],
  cmdArgs: ["-e", code],
  cwd: root,
  stdin,
  timeout,
  encoding: { stdin: "utf8", stdout: "utf8", stderr: "utf8" },
});
const run = async (code, processes = [], options = {}) => {
  const input = {
    nativeFiles: true,
    deadlineMs: 10000,
    ...options,
    source:
      bundle +
      `\n(async()=>JSON.stringify(await SpikeWork.run(${literal(code)},${literal({ contextData: context(processes) })})))()`,
  };
  const result = await new Promise((resolve, reject) => {
    const child = spawn(binary, [], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Native service fixture exceeded 15 seconds"));
    }, 15000);
    child.stdout.setEncoding("utf8").on("data", (value) => {
      stdout += value;
    });
    child.stderr.setEncoding("utf8").on("data", (value) => {
      stderr += value;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, status });
    });
    child.stdin.end(JSON.stringify(input));
  });
  assert.ok(result.stdout.trim(), result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(
    result.status,
    report.kind === "completed" ? 0 : 1,
    result.stderr,
  );
  assert.equal(report.nativeIo.activeAfterCleanup, false);
  assert.equal(report.nativeIo.cleanupError, null);
  assert.equal(report.domDocumentsAfterCleanup, 0);
  return report;
};
const success = (report) => {
  assert.equal(report.kind, "completed", report.error);
  assert.equal(report.report.kind, "success", JSON.stringify(report.report));
};
const pass = (name) => process.stdout.write(`PASS native service: ${name}\n`);
const dead = (pid) =>
  assert.throws(
    () => process.kill(pid, 0),
    (error) => error.code === "ESRCH",
    "Owned child was not reaped",
  );

// Minimal stored ZIP fixture, equivalent to the native Excel tests' inline-string workbook.
const crc32 = (bytes) => {
  let n = 0xffffffff;
  for (const byte of bytes) {
    n ^= byte;
    for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  }
  return (n ^ 0xffffffff) >>> 0;
};
const xlsx = () => {
  const entries = {
    "[Content_Types].xml":
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    "xl/workbook.xml":
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml":
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="3"><c r="B3" t="inlineStr"><is><t>name</t></is></c><c r="C3" t="inlineStr"><is><t>count</t></is></c></row><row r="4"><c r="B4" t="inlineStr"><is><t>alpha</t></is></c><c r="C4"><v>3</v></c></row></sheetData></worksheet>',
  };
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const filename = Buffer.from(name),
      bytes = Buffer.from(text),
      crc = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, bytes);
    const index = Buffer.alloc(46);
    index.writeUInt32LE(0x02014b50);
    index.writeUInt16LE(20, 4);
    index.writeUInt16LE(20, 6);
    index.writeUInt32LE(crc, 16);
    index.writeUInt32LE(bytes.length, 20);
    index.writeUInt32LE(bytes.length, 24);
    index.writeUInt16LE(filename.length, 28);
    index.writeUInt32LE(offset, 42);
    central.push(index, filename);
    offset += header.length + filename.length + bytes.length;
  }
  const end = Buffer.alloc(22),
    size = central.reduce((sum, item) => sum + item.length, 0);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
};

let server;
const requests = [],
  connections = new Set();
try {
  const echo = await run(
    `const r=await $process.echo();$println(r.stdout+':'+r.stderr+':'+r.exitCode);`,
    [
      request(
        "echo",
        "let data='';process.stdin.setEncoding('utf8');process.stdin.on('data',v=>data+=v);process.stdin.on('end',()=>{process.stdout.write('out:'+data);process.stderr.write('err');process.exitCode=7;});",
        "あ",
      ),
    ],
  );
  success(echo);
  assert.equal(echo.stdout, "out:あ:err:7\n");
  pass("process stdin/stdout/stderr/exit status");
  const sjis = request(
    "echo",
    "const parts=[];process.stdin.on('data',v=>parts.push(v));process.stdin.on('end',()=>process.stdout.write(Buffer.concat(parts).toString('hex')));",
    "あ",
  );
  sjis.encoding.stdin = "sjis";
  const encoded = await run(`$println((await $process.echo()).stdout);`, [
    sjis,
  ]);
  success(encoded);
  assert.equal(encoded.stdout, "82a0\n");
  pass("process Shift-JIS input");

  for (const [name, code, options, kind] of [
    ["cancel", `await $process.hold();`, { cancelAfterMs: 700 }, "cancelled"],
    ["deadline", `await $process.hold();`, { deadlineMs: 1200 }, "timed-out"],
    [
      "unfinished",
      `void $process.hold();await $runtime.sleep(500);$println('before-stop');`,
      {},
      "host-error",
    ],
    [
      "memory",
      `void $process.hold();await $runtime.sleep(500);globalThis.retained=new ArrayBuffer(64*1024*1024);while(true){}`,
      {},
      "host-error",
    ],
  ]) {
    const marker = file(name + ".pid");
    const held = request(
      "hold",
      `require('node:fs').writeFileSync(${literal(marker)},String(process.pid));setInterval(()=>{},1000);`,
      "",
      25000,
    );
    const stopped = await run(code, [held], options);
    assert.equal(stopped.kind, kind, stopped.error);
    assert.ok(existsSync(marker), "Child never started");
    dead(Number(readFileSync(marker, "utf8")));
    if (name === "unfinished")
      assert.equal(stopped.nativeIo.unfinishedAtBoundary, true);
    if (name === "memory") assert.equal(stopped.memoryLimitReached, true);
    pass(name + " stops and reaps the directly owned child");
  }
  const overflow = await run(
    `const tx=$fs.useTransaction();tx.saveText(${literal(file("never.txt"))},'never');$println('before-overflow');await $process.spam();`,
    [
      request(
        "spam",
        "process.stdout.write(Buffer.alloc(17*1024*1024,120));setInterval(()=>{},1000);",
        "",
        25000,
      ),
    ],
  );
  assert.equal(overflow.report.kind, "runtime-error");
  assert.match(overflow.report.error.message, /output exceeded/);
  assert.equal(overflow.stdout, "before-overflow\n");
  assert.equal(existsSync(file("never.txt")), false);
  pass("process output budget prevents staged effects");

  server = createServer((req, res) => {
    requests.push(req.url);
    if (req.url.startsWith("/stall")) {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Content-Length": "10",
      });
      res.write("x");
      return;
    }
    if (req.url.startsWith("/large")) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(Buffer.alloc(2 * 1024 * 1024 + 1, 120));
      return;
    }
    if (req.url.startsWith("/html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end('<html><body><p id="x">hello</p></body></html>');
      return;
    }
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (v) => (body += v));
    req.on("end", () => {
      res.writeHead(201, {
        "Content-Type": "application/json",
        "X-Fixture": "yes",
      });
      res.end(
        JSON.stringify({
          url: req.url,
          method: req.method,
          body,
          header: req.headers["x-input"],
        }),
      );
    });
  });
  server.on("connection", (socket) => {
    connections.add(socket);
    socket.on("close", () => connections.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const http = await run(
    `const r=await $net.request({url:${literal(url + "/echo")},method:'POST',query:{n:2,keep:true,skip:null},headers:{'X-Input':'input'},body:'payload'});$println(JSON.stringify({status:r.status,ok:r.ok,header:r.headers['x-fixture'],body:JSON.parse(r.body)}));`,
  );
  success(http);
  const response = JSON.parse(http.stdout);
  assert.equal(response.status, 201);
  assert.equal(response.ok, true);
  assert.equal(response.header, "yes");
  assert.equal(response.body.method, "POST");
  assert.equal(response.body.body, "payload");
  assert.equal(response.body.header, "input");
  const query = new URL(response.body.url, url).searchParams;
  assert.equal(query.get("n"), "2");
  assert.equal(query.get("keep"), "true");
  assert.equal(query.has("skip"), false);
  pass("HTTP method/query/headers/body/response");
  const json = await run(
    `$println((await $net.getJson(${literal(url + "/json")})).method);`,
  );
  success(json);
  assert.equal(json.stdout, "GET\n");
  pass("HTTP JSON API");
  const html = await run(
    `const source=await $net.getHtml(${literal(url + "/html")});const doc=await $parser.html(source.html);const nodes=await doc.query('//p');$println(await nodes[0].attr('id')+':'+await nodes[0].text());await doc.dispose();`,
  );
  success(html);
  assert.equal(html.stdout, "x:hello\n");
  pass("HTML fetch and DOM query/dispose");
  const before = requests.length;
  const queue = await run(
    `await $net.getText(${literal(url + "/queue")});try{await $net.getText(${literal(url + "/queue")},{timeoutMs:30});}catch(e){$println(e.message);}`,
  );
  success(queue);
  assert.equal(queue.stdout, "Timeout\n");
  assert.equal(requests.length - before, 1);
  pass("HTTP deadline includes domain queue wait");
  const large = await run(
    `const tx=$fs.useTransaction();tx.saveText(${literal(file("never.txt"))},'never');$println('before-http');await $net.getText(${literal(url + "/large")});`,
  );
  assert.equal(large.report.kind, "runtime-error");
  assert.equal(large.report.error.message, "ResponseTooLarge");
  assert.equal(large.stdout, "before-http\n");
  assert.equal(existsSync(file("never.txt")), false);
  pass("HTTP body budget prevents staged effects");
  for (const [name, options, kind] of [
    ["cancel", { cancelAfterMs: 700 }, "cancelled"],
    ["deadline", { deadlineMs: 1200 }, "timed-out"],
    ["unfinished", {}, "host-error"],
  ]) {
    const code =
      name === "unfinished"
        ? `void $net.getText(${literal(url + "/stall")});await $runtime.sleep(500);$println('before-stop');`
        : `await $net.getText(${literal(url + "/stall")});`;
    const stopped = await run(code, [], options);
    assert.equal(stopped.kind, kind, stopped.error);
    const until = Date.now() + 2000;
    while (connections.size && Date.now() < until)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(
      connections.size,
      0,
      "Stopped response connection remained open",
    );
    pass(name + " stops the in-flight HTTP body");
  }

  const xml = await run(
    `const doc=await $parser.xml('<root><item id="x">value</item></root>');const root=await doc.root();const item=(await root.query('item'))[0];$println([await root.name(),await item.attr('id'),await item.text(),await (await item.parent()).name(),(await root.children()).length].join(':'));await doc.dispose();try{await doc.root();}catch(e){$println(e.message);}`,
  );
  success(xml);
  assert.equal(xml.stdout, "root:x:value:root:1\ndom not found\n");
  pass("XML nodes, parent/children and disposed handles");
  const limited = await run(
    `const tx=$fs.useTransaction();tx.saveText(${literal(file("never.txt"))},'never');await $parser.xml('x'.repeat(2*1024*1024+1));`,
  );
  assert.equal(limited.report.kind, "runtime-error");
  assert.match(
    limited.report.error.message,
    /DOM source exceeds 2097152 bytes/,
  );
  assert.equal(existsSync(file("never.txt")), false);
  pass("DOM source budget rejects before transaction");
  writeFileSync(file("fixture.xlsx"), xlsx());
  const excel = await run(
    `const book=await $parser.excel(${literal(file("fixture.xlsx"))});const sheet=book.sheet('Data');$println(sheet.cellAt('C4').value+':'+sheet.cellAt('B4').address+':'+sheet.toTable(2)[0].name+':'+String(book.sheet('Missing')===null));`,
  );
  success(excel);
  assert.equal(excel.stdout, "3:B4:alpha:true\n");
  pass("actual XLSX through Book/Sheet/Cell APIs");
  const missing = await run(
    `await $parser.excel(${literal(file("missing.xlsx"))});`,
  );
  assert.equal(missing.report.kind, "runtime-error");
  pass("Excel missing file rejects without partial results");
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  const resolved = path.resolve(root);
  assert.ok(resolved.startsWith(base + path.sep));
  rmSync(resolved, { recursive: true, force: true });
}
