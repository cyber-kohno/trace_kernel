// Single offline/locked verification entry point. No installs, GUI launch,
// live Workspace access, AI-client setting changes, Homepage or CLI build.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktop = path.join(root, "apps/desktop");
const core = path.join(root, "packages/runtime-core");
const steps = [];
const node = (label, args, cwd = root) =>
  steps.push({ label, command: process.execPath, args, cwd });
const cargo = (label, args) =>
  steps.push({
    label,
    command: "cargo",
    args: [...args, "--offline", "--locked"],
    cwd: root,
  });

node("release metadata", ["release/check-desktop-mcp.mjs"]);
node("release helper tests", ["release/test-desktop-mcp.mjs"]);
for (const [label, manifest, extra] of [
  ["shared contract", "crates/mcp-protocol/Cargo.toml", []],
  ["native core", "crates/native-core/Cargo.toml", []],
  ["MCP adapter", "apps/mcp/Cargo.toml", []],
  ["Desktop Rust", "apps/desktop/src-tauri/Cargo.toml", ["--lib"]],
])
  cargo(label, ["test", "--manifest-path", manifest, ...extra]);
node(
  "Svelte sync",
  ["node_modules/@sveltejs/kit/svelte-kit.js", "sync"],
  desktop,
);
node(
  "Svelte check",
  [
    "node_modules/svelte-check/bin/svelte-check",
    "--tsconfig",
    "./tsconfig.json",
  ],
  desktop,
);
for (const script of [
  "check-mcp-api-coverage.mjs",
  "test-mcp-api-behavior.mjs",
  "test-mcp-context-consistency.mjs",
  "test-transaction.mjs",
  "test-runtime-lifecycle.mjs",
  "test-workspace-load.mjs",
  "test-work-execution-plan.mjs",
  "test-io-context.mjs",
  "test-execute-work.mjs",
  "test-mcp-diagnostics.mjs",
  "test-shared-runtime-dev.mjs",
])
  node(script, ["scripts/" + script], desktop);
node(
  "shared TypeScript",
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  core,
);
node("shared import boundaries", ["scripts/check-boundaries.mjs"], core);
node(
  "CLI API profile (no executable build)",
  ["scripts/test-cli-profile.mjs"],
  core,
);
node(
  "Desktop production Frontend",
  ["node_modules/vite/bin/vite.js", "build"],
  desktop,
);
cargo("MCP executable and isolated native fixture", [
  "build",
  "--manifest-path",
  "apps/mcp/Cargo.toml",
  "--bin",
  "trace-kernel-mcp",
  "--example",
  "compatibility_host",
]);
node("MCP stdio smoke", ["apps/mcp/scripts/test-stdio.mjs"]);
node("real-process isolated acceptance", [
  "apps/mcp/scripts/test-acceptance.mjs",
]);

for (const [index, step] of steps.entries()) {
  console.log(`\n[${index + 1}/${steps.length}] ${step.label}`);
  await new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      cwd: step.cwd,
      stdio: "inherit",
      windowsHide: true,
      shell: false,
    });
    const timer = setTimeout(
      () => {
        child.kill();
        reject(new Error(`Verification deadline exceeded: ${step.label}`));
      },
      10 * 60 * 1000,
    );
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error(`Cannot start verification: ${step.label}`));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve()
        : reject(
            new Error(`Verification failed: ${step.label} (exit ${code})`),
          );
    });
  });
}
console.log(
  "\nDesktop/MCP automated acceptance passed. Native GUI, real license verification and internal rollout remain manual gates.",
);
