import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(
  directory,
  "../../packages/runtime-core/generated/runtime-assets",
);
const manifest = JSON.parse(
  readFileSync(path.join(assets, "manifest.json"), "utf8"),
);
assert.equal(manifest.formatVersion, 1);
assert.equal(manifest.typescriptVersion, "5.6.3");
const read = (name) => {
  const bytes = readFileSync(path.join(assets, name));
  assert.equal(bytes.length, manifest.assets[name].bytes);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    manifest.assets[name].sha256,
  );
  return bytes.toString("utf8");
};
const runtime = read("runtime.js"),
  compiler = read("compiler.js");
const libs = JSON.parse(read("typescript-libs.json"));
for (const root of ["lib.es2020.d.ts", "lib.webworker.d.ts"])
  assert.ok(libs[root]);
for (const source of Object.values(libs)) {
  for (const [, name] of source.matchAll(
    /<reference\s+lib=["']([^"']+)["']\s*\/>/g,
  )) {
    assert.ok(libs[`lib.${name}.d.ts`], `Missing referenced library: ${name}`);
  }
}
const compilerFile = path.resolve(
  directory,
  "../../packages/runtime-core/node_modules/typescript/lib/typescript.js",
);
const reference = new Function(
  "require",
  "__filename",
  "__dirname",
  runtime + compiler + "\nreturn {RuntimeCore,CompilerCore};",
)(createRequire(import.meta.url), compilerFile, path.dirname(compilerFile));
const binary = path.join(
  directory,
  "target/release/trace-kernel-js-host-v8-spike.exe",
);
let count = 0;
const check = async (name, body, assertion) => {
  const expected = await new Function(
    "RuntimeCore",
    "CompilerCore",
    "standardLibs",
    `return (async()=>{${body}})()`,
  )(reference.RuntimeCore, reference.CompilerCore, libs);
  if (assertion) assertion(expected);
  const result = spawnSync(binary, [], {
    input: JSON.stringify({
      source:
        runtime +
        compiler +
        `\nconst standardLibs=${JSON.stringify(libs)};\n(async()=>JSON.stringify(await(async()=>{${body}})()))()`,
      deadlineMs: 6000,
      memoryLimitBytes: 128 * 1024 * 1024,
    }),
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 0, report.error ?? result.stderr);
  assert.equal(report.kind, "completed", report.error);
  assert.deepEqual(report.report, JSON.parse(JSON.stringify(expected)), name);
  assert.equal(report.nativeIo.activeAfterCleanup, false);
  assert.equal(report.nativeIo.cleanupError, null);
  count++;
  console.log(`PASS shared assets: ${name}`);
};
const workspace = {
  gen: reference.RuntimeCore.CURRENT_GEN,
  envs: [{ varName: "FACTOR", value: "3" }],
  resources: [{ varName: "TEXT", source: "日本語" }],
  datasets: [],
  processes: [],
  logics: [
    {
      name: "ADD",
      source: "export default (value: Amount) => value + Number($env.FACTOR);",
    },
  ],
  declare: { source: "type Amount = number;" },
  works: [],
};
const setup = `
  const workspace=${JSON.stringify(workspace)};
  const work={name:'fixture',method:'plain',source:''};
  const plan=RuntimeCore.createWorkExecutionPlan({workspace,work,disables:[],professional:true});
  const declarations={contextDeclarations:CompilerCore.ContextDeclarations.createDeclareDef(plan.contextData,workspace.declare.source),
    apiDeclarations:plan.usableUtils.map(name=>{const d=CompilerCore.ApiDeclarations.createUtilDeclareDef(name);return d.typeDec+' declare const $'+name+': '+d.valueDec+';';}),declare:workspace.declare.source};
`;
await check(
  "generation metadata and versioned Workspace decode",
  `
  const workspace=${JSON.stringify(workspace)};
  const prepared=RuntimeCore.WorkspaceCodec.prepareFile(RuntimeCore.WorkspaceCodec.gZip(JSON.stringify(workspace)),RuntimeCore.CURRENT_GEN);
  return {status:prepared.status,env:prepared.workspace.envs[0].value};
`,
  (value) => assert.equal(value.status, "ok"),
);
await check(
  "API and linked Logic declarations",
  setup + `return declarations;`,
  (value) => assert.match(value.contextDeclarations.join("\n"), /ADD.*number/),
);
for (const [name, source, valid] of [
  [
    "Work with Declare and linked Logic",
    "const value: Amount = $logic.ADD(2); $println(String(value));",
    true,
  ],
  ["context member type misuse", "$env.FACTOR.toFixed();", false],
  ["Logic argument type misuse", "$logic.ADD('wrong');", false],
  ["restricted global diagnostic", "await fetch('example');", false],
  [
    "ordinary local fetch binding",
    "const fetch = () => 1; $println(String(fetch()));",
    true,
  ],
  [
    "standard Promise/URL/Intl libraries",
    "const p: Promise<string> = Promise.resolve(new URL('https://example.test').href); $println(await p); const n = new Intl.NumberFormat().format(2); $println(n);",
    true,
  ],
]) {
  await check(
    name,
    setup +
      `return await CompilerCore.validateWorkTypes({source:${JSON.stringify(source)}},declarations,standardLibs);`,
    (value) => assert.equal(value.length === 0, valid, name),
  );
}
await check(
  "free-plan declarations hide FS and Logic",
  `
  const workspace=${JSON.stringify(workspace)};
  const plan=RuntimeCore.createWorkExecutionPlan({workspace,work:{name:'free',method:'plain',source:''},disables:[],professional:false});
  const apis=plan.usableUtils.map(name=>{const d=CompilerCore.ApiDeclarations.createUtilDeclareDef(name);return d.typeDec+' declare const $'+name+': '+d.valueDec+';';});
  return {apis:plan.usableUtils,logics:plan.contextData.logics.length,errors:(await CompilerCore.validateWorkTypes({source:"await $fs.exists('C:/file');"},{contextDeclarations:[],apiDeclarations:apis,declare:''},standardLibs)).map(d=>d.code)};
`,
  (value) => {
    assert.ok(!value.apis.includes("fs"));
    assert.equal(value.logics, 0);
    assert.ok(value.errors.includes(2304));
  },
);
await check(
  "table column types retain their declared members",
  `
  const d=CompilerCore.ApiDeclarations.createUtilDeclareDef('channel');
  return await CompilerCore.validateWorkTypes({source:"const stream=$channel.createTableStream('rows',[{name:'count',type:'number'}] as const); stream.add({count:'wrong'});"},{contextDeclarations:[],apiDeclarations:[d.typeDec+' declare const $channel: '+d.valueDec+';'],declare:''},standardLibs);
`,
  (value) => assert.ok(value.some((d) => d.code === 2322)),
);
await check(
  "shared compilation, context injection and execution",
  setup +
    `
  work.source="const value: Amount = $logic.ADD(2); $println($resource.TEXT + ':' + value);";
  const executablePlan=RuntimeCore.createWorkExecutionPlan({workspace,work,disables:[],professional:true});
  const execution=RuntimeCore.compileWorkExecution(executablePlan,source=>CompilerCore.TypeScript.transpileTsToJs(source));
  const output=[];
  const cache={progress:{current:0,total:0},preparation:{datasetMap:[]},vfs:null,rust:{executionId:'assets',logQueues:new Map()},scheduleFlush:()=>{},createVFS:()=>{throw new Error('unused VFS');}};
  const native={call:async()=>{throw new Error('Unexpected native request');}};
  const parser=()=>RuntimeCore.Parser.getObject(cache.rust,native);
  const outcome=await RuntimeCore.runPreparedWork(execution,{
    initialize:()=>{},onPrepared:()=>{},prepareOutput:()=>{},scanDirectory:()=>{throw new Error('unused scan');},
    createReservedApi:name=>RuntimeCore.createReservedApi(name,{
      plainChannelId:'__plain__',appendLines:(_,lines)=>output.push(lines.join('\\n')),registerChannel:()=>{},
      createFileSystem:()=>RuntimeCore.FileSystem.getObject(cache,native),createRuntime:()=>RuntimeCore.Runtime.getObject(),
      createNetwork:()=>RuntimeCore.Network.getObject(cache.rust,native),createParser:parser,createState:()=>RuntimeCore.State.getObject(cache,()=>{}),
    }),
    createContext:(data,datasets)=>RuntimeCore.createWorkContext(data,datasets,{
      readTextFile:()=>{throw new Error('unused read');},runProcess:()=>{throw new Error('unused process');},createParserObject:parser,
      transpileLogic:source=>CompilerCore.TypeScript.transpileTsModuleToCjs(source),
    }),
    isExitSignal:RuntimeCore.Runtime.isExitSignal,waitForRegistrations:()=>{},flushOutput:()=>{},
  });
  return {outcome,output:output.join('')};
`,
  (value) =>
    assert.deepEqual(value, {
      outcome: { status: "done" },
      output: "日本語:5\n",
    }),
);
console.log(`${count} generated asset cases passed in Node and V8.`);
