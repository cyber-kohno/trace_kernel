import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const directory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceRoot = path.join(directory, "src");
const manifest = JSON.parse(
  readFileSync(path.join(directory, "package.json"), "utf8"),
);
const visit = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? visit(file)
      : /\.(ts|js)$/.test(file)
        ? [file]
        : [];
  });
const files = visit(sourceRoot);
for (const file of files) {
  const ast = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const check = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      const name = node.moduleSpecifier.text;
      if (name.startsWith(".")) {
        const target = path.resolve(path.dirname(file), name);
        assert.ok(
          target.startsWith(sourceRoot + path.sep),
          `Import escapes runtime-core: ${file}: ${name}`,
        );
      } else {
        const packageName = name.startsWith("@")
          ? name.split("/").slice(0, 2).join("/")
          : name.split("/")[0];
        assert.ok(
          Object.hasOwn(manifest.dependencies, packageName),
          `Unexpected runtime dependency: ${file}: ${name}`,
        );
        assert.ok(!/svelte|tauri|node:/.test(name), `Host dependency: ${name}`);
      }
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      assert.fail(`Dynamic imports need an explicit host port: ${file}`);
    }
    ts.forEachChild(node, check);
  };
  check(ast);
}
console.log(
  `runtime-core: ${files.length} modules stay inside the package and its declared dependencies.`,
);
