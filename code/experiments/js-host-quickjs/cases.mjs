const root = "C:\\fixture";
const source = root + "\\source.txt";
const fileStat = {
  isFile: true,
  isDir: false,
  readonly: false,
  modifiedAt: 10,
  size: 8,
};
const dirStat = {
  isFile: false,
  isDir: true,
  readonly: false,
  modifiedAt: 10,
  size: 0,
};
export const initialEntries = () => ({
  [root]: { stat: dirStat, children: [] },
  "C:\\empty": { stat: dirStat, children: [] },
  [source]: {
    stat: fileStat,
    bytes: Array.from(new TextEncoder().encode("original")),
  },
  [root + "\\copy.txt"]: {
    stat: fileStat,
    bytes: Array.from(new TextEncoder().encode("original")),
  },
  [root + "\\delete.txt"]: {
    stat: fileStat,
    bytes: Array.from(new TextEncoder().encode("original")),
  },
  [root + "\\old.txt"]: {
    stat: fileStat,
    bytes: Array.from(new TextEncoder().encode("original")),
  },
  [root + "\\sjis.txt"]: {
    stat: { ...fileStat, size: 2 },
    bytes: [0x82, 0xa0],
  },
});
const literal = (path) => JSON.stringify(path);
const context = (values) => ({
  envs: [],
  resources: [],
  datasets: [],
  processes: [],
  logics: [],
  ...values,
});

export const cases = [
  {
    name: "async-output",
    stdout: "first\nlast",
    kind: "success",
    source: '$println("first"); await $runtime.sleep(5); $print("last");',
  },
  {
    name: "return",
    stdout: "before\n",
    kind: "success",
    source: '$println("before"); return; $println("unreachable");',
  },
  {
    name: "exit",
    stdout: "exit\n",
    kind: "success",
    source: `const tx = $fs.useTransaction(); tx.saveText(${literal(root + "\\exit.txt")}, "exit"); $println("exit"); $runtime.exit(); $println("unreachable");`,
  },
  {
    name: "seven-operations",
    stdout: "original\nplanned\n",
    kind: "success",
    source: `
      const tx = $fs.useTransaction();
      tx.makeDir(${literal(root + "\\new")});
      tx.saveText(${literal(root + "\\new\\created.txt")}, "created");
      const opened = await tx.openText(${literal(source)});
      const content: string = opened.content;
      $println(content);
      tx.updateText(opened.token, "changed");
      tx.copyFile(${literal(root + "\\copy.txt")}, ${literal(root + "\\copied.txt")});
      tx.deleteFile(${literal(root + "\\delete.txt")});
      tx.renameFile(${literal(root + "\\old.txt")}, "renamed.txt");
      tx.deleteDir("C:\\\\empty");
      $println("planned");
    `,
  },
  {
    name: "shift-jis",
    stdout: String.fromCodePoint(0x3042) + "\n",
    kind: "success",
    source: `
      const tx = $fs.useTransaction();
      const opened = await tx.openText(${literal(root + "\\sjis.txt")}, "sjis");
      $println(opened.content);
      tx.updateText(opened.token, opened.content + "x");
    `,
  },
  {
    name: "runtime-error",
    stdout: "before-error\n",
    kind: "runtime-error",
    source: `const tx = $fs.useTransaction(); tx.saveText(${literal(root + "\\never.txt")}, "never"); $println("before-error"); throw new Error("work failed");`,
  },
  {
    name: "host-rejection",
    stdout: "",
    kind: "runtime-error",
    source: `await $fs.readText(${literal(root + "\\missing.txt")});`,
  },
  {
    name: "verification-conflict",
    stdout: "",
    kind: "verification-failed",
    source: `
      const tx = $fs.useTransaction();
      const opened = await tx.openText(${literal(source)});
      tx.updateText(opened.token, "planned");
      await $fs.saveText(${literal(source)}, "external");
    `,
  },
  {
    name: "partial-commit",
    stdout: "",
    kind: "commit-failed",
    failCommand: "save_binary",
    failAt: 2,
    source: `const tx = $fs.useTransaction(); tx.saveText(${literal(root + "\\one.txt")}, "one"); tx.saveText(${literal(root + "\\two.txt")}, "two"); tx.saveText(${literal(root + "\\three.txt")}, "three");`,
  },
  {
    name: "json-csv-parser",
    stdout: "3\n2\n",
    kind: "success",
    source:
      '$println(String($parser.json("{\\"value\\":3}").queryNumber("value"))); $println(String($parser.csv("name,value\\na,1\\nb,2").rowCount()));',
  },
  {
    name: "ordinary-javascript",
    stdout: "3:2:1:12\n",
    kind: "success",
    source:
      'const map = new Map([["a", 1], ["b", 2]]); const set = new Set([1, 1, 2]); const bytes = new Uint8Array([1, 2]); $println([map.get("a") + map.get("b"), set.size, bytes[0], String(10n + 2n)].join(":"));',
  },
  {
    name: "context-and-linked-logics",
    kind: "success",
    stdout: "original:3\n",
    contextData: context({
      envs: [{ varName: "ROOT", value: root }],
      resources: [{ varName: "rows", source: "n\n2", parse: "csv" }],
      datasets: [
        {
          varName: "DATA",
          rootPath: "%ROOT%",
          encoding: "utf8",
          targets: ["\\source.txt"],
          scanOption: { dirConds: [], fileConds: [] },
        },
      ],
      logics: [
        {
          name: "helper",
          source:
            'export default function(n: number) { return n + $parser.json("{\\"n\\":1}").queryNumber("n"); }',
        },
        {
          name: "read",
          source:
            'export default async function() { return await $dataset.DATA[0].content() + ":" + $logic.helper($resource.rows[0].n); }',
        },
      ],
    }),
    source: "$println(await $logic.read());",
  },
  {
    name: "dynamic-dataset",
    kind: "success",
    stdout: "source.txt:original\n",
    contextData: context({
      envs: [{ varName: "ROOT", value: root }],
      datasets: [
        {
          varName: "DATA",
          rootPath: "%ROOT%",
          encoding: "utf8",
          targets: null,
          scanOption: { dirConds: [], fileConds: [] },
        },
      ],
    }),
    scanTrees: {
      [root]: {
        name: "root-label",
        children: [
          { name: "source.txt", children: null },
          { name: "empty", children: [] },
        ],
      },
    },
    source:
      'for (const file of $dataset.DATA) $println(file.fileName + ":" + await file.content());',
  },
  {
    name: "process-context",
    kind: "success",
    stdout: "ok:err:7\n",
    contextData: context({
      processes: [
        {
          funcName: "run",
          prgPath: "fixture.exe",
          cmdArgs: ["__n__"],
          scriptArgs: [{ name: "n", type: "number" }],
          cwd: "",
          stdin: "__n__",
          timeout: 25000,
          encoding: { stdin: "utf8", stdout: "utf8", stderr: "utf8" },
        },
      ],
    }),
    processResults: {
      "fixture.exe": {
        stdout: [111, 107],
        stderr: [101, 114, 114],
        exitCode: 7,
      },
    },
    source:
      'const result = await $process.run(3); $println([result.stdout, result.stderr, result.exitCode].join(":"));',
  },
  {
    name: "channels-and-state",
    kind: "success",
    outputMethod: "channel",
    stdout: 'hello\n{"n":2}\n',
    source:
      '$channel.createTextStream("text").println("hello"); $channel.createTableStream("table", [{ name: "n", type: "number" }]).add({n:2}); const p = $state.useProgress(2); p.tick(); $state.useMonitor(1)[0](String(p.getCurrent()));',
  },
  {
    name: "free-plan-permissions",
    kind: "success",
    professional: false,
    stdout: "undefined:undefined:0:0\n",
    contextData: context({
      processes: [{ funcName: "hidden" }],
      logics: [{ name: "hidden", source: "invalid" }],
    }),
    source:
      '$println([typeof $fs, typeof $net, Object.keys($process).length, Object.keys($logic).length].join(":"));',
  },
  {
    name: "invalid-logic-export",
    kind: "runtime-error",
    stdout: "",
    contextData: context({
      logics: [{ name: "invalid", source: "export const n: number = 1;" }],
    }),
    source: "$logic.invalid();",
  },
  {
    name: "empty-channel-registration-failure",
    kind: "runtime-error",
    stdout: "",
    outputMethod: "channel",
    failCommand: "add_channel",
    failAt: 1,
    source: '$channel.createTextStream("empty");',
  },
  {
    name: "duplicate-channel",
    kind: "runtime-error",
    stdout: "",
    outputMethod: "channel",
    source:
      '$channel.createTextStream("same"); $channel.createTextStream("same");',
  },
];

export const stopCases = [
  {
    name: "cpu-deadline",
    source: "while (true) {}",
    deadlineMs: 300,
    kind: "timed-out",
  },
  {
    name: "microtask-deadline",
    source: "while (true) { await Promise.resolve(); }",
    deadlineMs: 300,
    kind: "timed-out",
  },
  {
    name: "pending-promise-deadline",
    source: "await new Promise(() => {});",
    deadlineMs: 300,
    kind: "timed-out",
  },
  {
    name: "host-wait-deadline",
    source: "await $runtime.sleep(5000);",
    deadlineMs: 300,
    kind: "timed-out",
  },
  {
    name: "external-cancel",
    source: "while (true) {}",
    deadlineMs: 1000,
    cancelAfterMs: 30,
    kind: "cancelled",
  },
];

export const safetyCases = [
  {
    name: "heap-limit",
    source:
      'const data = new Array(12000000).fill("x"); $println(String(data.length));',
  },
  {
    name: "stack-limit",
    source: "function recurse() { return recurse(); } recurse();",
  },
  {
    name: "heap-pressure",
    source:
      'globalThis.__probeRetained = []; while (true) { globalThis.__probeRetained.push(new Array(100000).fill("x")); }',
  },
  {
    name: "output-failure",
    source:
      'const tx = $fs.useTransaction(); tx.saveText("C:\\\\fixture\\\\never.txt", "never"); $println("lost");',
    failCommand: "append_output",
    failAt: 1,
  },
];
