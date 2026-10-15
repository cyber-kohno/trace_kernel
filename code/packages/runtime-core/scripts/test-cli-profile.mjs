import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { loadTypeScriptLibraries } from "../build/standard-libs.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url),
  cache = new Map();
const load = (file) => {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("require", "exports", "module", compiled)(
    (name) =>
      name.startsWith(".")
        ? load(path.resolve(path.dirname(file), name + ".ts"))
        : require(name),
    module.exports,
    module,
  );
  return module.exports;
};
const { validateWorkTypes } = load(
  path.join(root, "src/compiler/semantic-work-validator.ts"),
);
const { referencedLogics, logicAsWork } = load(
  path.join(root, "src/compiler/cli-profile.ts"),
);
const libs = loadTypeScriptLibraries(),
  declarations = { contextDeclarations: [], apiDeclarations: [], declare: "" };
let count = 0;
const net = load(
  path.join(root, "src/declarations/api-declarations.ts"),
).default.createUtilDeclareDef("net");
const netDeclarations = {
  ...declarations,
  apiDeclarations: [`${net.typeDec}\ndeclare const $net: ${net.valueDec};`],
};
for (const profile of ["cli", "worker"]) {
  const valid = await validateWorkTypes(
    {
      source:
        'const r=await $net.getJson<{value:number}>("http://example.invalid");const t=await $net.getText("http://example.invalid",{timeoutMs:100});const h=await $net.getHtml("http://example.invalid");const result=await $net.request({url:"http://example.invalid",query:{n:1},body:"x"});r.value+t.length+h.html.length+result.status;',
    },
    netDeclarations,
    libs,
    profile,
  );
  assert.deepEqual(valid, []);
  count++;
  assert.ok(
    (
      await validateWorkTypes(
        { source: "await $net.request({url:123});" },
        netDeclarations,
        libs,
        profile,
      )
    ).length,
  );
  count++;
}
for (const source of [
  'new Blob(["text"]);',
  'new Worker("worker.js");',
  'await crypto.subtle.digest("SHA-256",new Uint8Array([1]));',
  "performance.now();",
  'self.postMessage("x");',
  "new AbortController();",
  "URL.createObjectURL(null as any);",
  'const name="x"; await import(name);',
]) {
  assert.ok(
    (await validateWorkTypes({ source }, declarations, libs, "cli")).length,
    source,
  );
  count++;
}
assert.equal(
  (
    await validateWorkTypes(
      { source: 'new Blob(["text"]);' },
      declarations,
      libs,
    )
  ).length,
  0,
);
count++;
for (const source of [
  'const Blob=(v:string)=>v; Blob("x");',
  'const object={Worker:"local"}; object.Worker;',
  '// crypto\nconst value="Worker Blob"; value;',
  'new URL("https://example.test").searchParams.get("a");',
  'new TextDecoder().decode(new TextEncoder().encode("日本語"));',
  "await new Promise<void>(resolve=>setTimeout(resolve,1));",
  'structuredClone(new Map([["x",1]]));',
  'Intl.NumberFormat("ja-JP").format(2);',
]) {
  assert.equal(
    (await validateWorkTypes({ source }, declarations, libs, "cli")).length,
    0,
    source,
  );
  count++;
}
assert.deepEqual(
  referencedLogics('$logic.A(); $logic["B"]();', ["A", "B", "C"]),
  ["A", "B"],
);
count++;
assert.deepEqual(
  referencedLogics("const alias={$logic}; alias.$logic.A();", ["A", "B"]),
  ["A", "B"],
);
count++;
assert.deepEqual(
  referencedLogics("const $logic={A:()=>1};$logic.A(); // $logic.B()", [
    "A",
    "B",
  ]),
  [],
);
count++;
assert.deepEqual(
  referencedLogics('let name:string="A"; $logic[name]();', ["A", "B"]),
  ["A", "B"],
);
count++;
assert.deepEqual(
  referencedLogics('const name="A"; $logic[name]();', ["A", "B"]),
  ["A"],
);
count++;
for (const source of [
  "export default function(n:number){return n+1;}",
  "export default async (n:number)=>n+1;",
  "export interface Item { value:number; } export type Count=number; export default (item:Item):Count=>item.value;",
]) {
  assert.equal(
    (
      await validateWorkTypes(
        { source: logicAsWork(source) },
        declarations,
        libs,
        "cli",
      )
    ).length,
    0,
  );
  count++;
}
assert.ok(
  (
    await validateWorkTypes(
      { source: logicAsWork('export default ()=>new Blob(["x"]);') },
      declarations,
      libs,
      "cli",
    )
  ).length,
);
count++;
console.log(
  `${count} CLI profile cases passed; default Worker profile is unchanged.`,
);
