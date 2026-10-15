import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { CURRENT_GEN } from "../src/metadata/gen-version.js";
import {
  loadTypeScriptLibraries,
  typescriptVersion,
} from "./standard-libs.mjs";

const directory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const source = path.join(directory, "src");
const output = path.join(directory, "generated/runtime-assets");
mkdirSync(output, { recursive: true });
const assets = {};
const write = (name, text) => {
  writeFileSync(path.join(output, name), text, "utf8");
  assets[name] = {
    bytes: Buffer.byteLength(text),
    sha256: createHash("sha256").update(text).digest("hex"),
  };
};
for (const [entry, name, globalName] of [
  ["runtime-entry", "runtime.js", "RuntimeCore"],
  ["compiler-entry", "compiler.js", "CompilerCore"],
]) {
  const result = await build({
    entryPoints: [path.join(source, "host", entry + ".ts")],
    bundle: true,
    write: false,
    format: "iife",
    globalName,
    platform: "browser",
    target: "es2020",
    metafile: true,
    external: [
      "fs",
      "path",
      "os",
      "crypto",
      "buffer",
      "perf_hooks",
      "inspector",
    ],
  });
  for (const input of Object.keys(result.metafile.inputs)) {
    const relative = path.relative(directory, path.resolve(input));
    if (relative === ".." || relative.startsWith(".." + path.sep)) {
      throw new Error(`Asset dependency escapes runtime-core: ${input}`);
    }
  }
  write(name, result.outputFiles[0].text);
}
write("typescript-libs.json", JSON.stringify(loadTypeScriptLibraries()));
writeFileSync(
  path.join(output, "manifest.json"),
  JSON.stringify(
    {
      formatVersion: 1,
      typescriptVersion,
      generation: CURRENT_GEN,
      assets,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
console.log(
  `Built shared runtime/compiler/libraries with TypeScript ${typescriptVersion}.`,
);
