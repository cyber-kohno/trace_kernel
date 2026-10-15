import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const libraryDirectory = path.dirname(require.resolve("typescript"));
export const typescriptVersion = require("typescript/package.json").version;

/** Collect the standard libraries from this package's pinned compiler. */
export const loadTypeScriptLibraries = () => {
  const files = {};
  const add = (name) => {
    const fileName = `lib.${name}.d.ts`;
    if (Object.hasOwn(files, fileName)) return;
    const source = readFileSync(path.join(libraryDirectory, fileName), "utf8");
    files[fileName] = source;
    for (const [, referenced] of source.matchAll(
      /<reference\s+lib=["']([^"']+)["']\s*\/>/g,
    ))
      add(referenced);
  };
  add("es2020");
  add("webworker");
  return files;
};
