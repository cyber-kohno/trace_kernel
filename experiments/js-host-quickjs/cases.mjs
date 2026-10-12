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
    name: "output-failure",
    source:
      'const tx = $fs.useTransaction(); tx.saveText("C:\\\\fixture\\\\never.txt", "never"); $println("lost");',
    failCommand: "append_output",
    failAt: 1,
  },
];
