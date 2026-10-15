import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
// Locate code/ from this script, independently of the invocation directory.
const codeRoot = path.resolve(directory, "../..");
const summaries = [];
for (const engine of ["quickjs", "v8"]) {
  const experiment = path.join(codeRoot, "experiments", "js-host-" + engine);
  const result = spawnSync(
    process.execPath,
    [path.join(experiment, "compare.mjs"), "--release"],
    {
      cwd: codeRoot,
      encoding: "utf8",
      windowsHide: true,
      timeout: 180000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(engine + " comparison failed");
  }
  process.stdout.write(
    engine +
      ": " +
      result.stdout
        .split("\n")
        .filter((line) => /^(PASS|DIFFERENCE)/.test(line))
        .join("\n") +
      "\n",
  );
  summaries.push(
    JSON.parse(
      readFileSync(path.join(experiment, "generated/results.json"), "utf8"),
    ),
  );
}
const [quickjs, v8] = summaries;
assert.equal(
  quickjs.bundleBytes,
  v8.bundleBytes,
  "Different Work bundles were compared",
);
assert.equal(
  quickjs.compiler.bundleBytes,
  v8.compiler.bundleBytes,
  "Different compilers were compared",
);
assert.deepEqual(
  quickjs.results.map((result) => result.name),
  v8.results.map((result) => result.name),
);
const metrics = (summary) => ({
  candidate: summary.candidate,
  engine: summary.engine,
  binaryBytes: summary.binaryBytes,
  minimalProcessMedianMs: summary.minimalProcessMedianMs,
  compiler: summary.compiler,
  profileGlobals: summary.profileGlobals,
  profileBehavior: summary.profileBehavior,
  allocationProbe: summary.allocationProbe,
});
const comparison = {
  measuredAt: new Date().toISOString(),
  productIntegration: false,
  reference: quickjs.reference,
  rustTarget: quickjs.rustTarget,
  bundleBytes: quickjs.bundleBytes,
  caseCount: quickjs.results.length,
  quickjs: metrics(quickjs),
  v8: metrics(v8),
  differences: quickjs.results.flatMap((result, index) =>
    result.outcome === v8.results[index].outcome
      ? []
      : [{ name: result.name, quickjs: result, v8: v8.results[index] }],
  ),
};
const generated = path.join(directory, "generated");
mkdirSync(generated, { recursive: true });
writeFileSync(
  path.join(generated, "comparison.json"),
  JSON.stringify(comparison, null, 2) + "\n",
);
process.stdout.write(JSON.stringify(comparison, null, 2) + "\n");
