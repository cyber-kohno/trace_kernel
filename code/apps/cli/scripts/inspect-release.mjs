import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Read-only inventory for a distribution design review. It does not build a ZIP,
// install prerequisites, or claim that metadata is a complete license audit.
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const option = process.argv.indexOf("--binary");
const binary =
  option < 0
    ? path.join(app, "target/release/trace-kernel-cli.exe")
    : path.resolve(process.argv[option + 1]);
const output = path.join(app, "generated/release-audit");
mkdirSync(output, { recursive: true });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const image = readFileSync(binary);
const pe = image.readUInt32LE(60);
if (image.readUInt16LE(0) !== 0x5a4d || image.readUInt32LE(pe) !== 0x4550)
  throw new Error("Not a PE image");
const optional = pe + 24;
if (
  image.readUInt16LE(pe + 4) !== 0x8664 ||
  image.readUInt16LE(optional) !== 0x20b
)
  throw new Error("Expected Windows x64 PE32+ executable");
const sectionCount = image.readUInt16LE(pe + 6),
  sections = optional + image.readUInt16LE(pe + 20);
const offset = (rva) => {
  for (let index = 0; index < sectionCount; index++) {
    const section = sections + index * 40,
      start = image.readUInt32LE(section + 12);
    const size = Math.max(
      image.readUInt32LE(section + 8),
      image.readUInt32LE(section + 16),
    );
    if (rva >= start && rva < start + size)
      return rva - start + image.readUInt32LE(section + 20);
  }
  throw new Error("Unmapped PE RVA");
};
const cstring = (start) => {
  const end = image.indexOf(0, start);
  if (end < 0) throw new Error("Unterminated PE name");
  return image.subarray(start, end).toString("utf8");
};
const dlls = new Set(),
  directory = optional + 112;
const imports = image.readUInt32LE(directory + 8);
if (imports)
  for (
    let position = offset(imports);
    image.readUInt32LE(position + 12);
    position += 20
  )
    dlls.add(cstring(offset(image.readUInt32LE(position + 12))).toLowerCase());
const delayImports = image.readUInt32LE(directory + 13 * 8);
if (delayImports)
  for (
    let position = offset(delayImports);
    image.readUInt32LE(position + 4);
    position += 32
  ) {
    if (!(image.readUInt32LE(position) & 1))
      throw new Error("Unsupported delay import VA layout");
    dlls.add(cstring(offset(image.readUInt32LE(position + 4))).toLowerCase());
  }
const cargo = JSON.parse(
  execFileSync(
    "cargo",
    [
      "metadata",
      "--offline",
      "--locked",
      "--filter-platform",
      "x86_64-pc-windows-msvc",
      "--format-version",
      "1",
      "--manifest-path",
      path.join(app, "Cargo.toml"),
    ],
    { encoding: "utf8", windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
  ),
);
const nodes = new Map(cargo.resolve.nodes.map((node) => [node.id, node])),
  reached = new Set();
const visit = (id) => {
  if (reached.has(id)) return;
  reached.add(id);
  for (const dependency of nodes.get(id)?.deps ?? []) visit(dependency.pkg);
};
visit(cargo.resolve.root);
const files = (root) => {
  const result = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (![".git", "target", "node_modules"].includes(entry.name))
          walk(path.join(directory, entry.name));
      } else if (
        entry.isFile() &&
        /^(license|licence|copying|notice|copyright)(?:$|[._-])|^ThirdPartyNoticeText\.txt$/i.test(
          entry.name,
        ) &&
        !/\.(rs|cc|cpp|c|h|hpp|py|sh|js|mjs|ts|toml|json)$/i.test(entry.name)
      ) {
        const filename = path.join(directory, entry.name),
          bytes = readFileSync(filename);
        result.push({
          path: path.relative(root, filename).replaceAll("\\", "/"),
          bytes: bytes.length,
          sha256: sha256(bytes),
        });
      }
    }
  };
  walk(root);
  return result.sort((a, b) => a.path.localeCompare(b.path));
};
const rust = cargo.packages
  .filter((pkg) => reached.has(pkg.id))
  .map((pkg) => ({
    name: pkg.name,
    version: pkg.version,
    license: pkg.license,
    repository: pkg.repository,
    registry: pkg.source != null,
    files: files(path.dirname(pkg.manifest_path)),
    sourceArchive: pkg.source?.startsWith("registry+")
      ? `https://static.crates.io/crates/${pkg.name}/${pkg.name}-${pkg.version}.crate`
      : null,
  }))
  .sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
const core = path.resolve(app, "../../packages/runtime-core");
const corePackage = JSON.parse(
  readFileSync(path.join(core, "package.json"), "utf8"),
);
const npm = Object.keys(corePackage.dependencies)
  .map((name) => {
    const root = path.join(core, "node_modules", name),
      pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    if (pkg.version !== corePackage.dependencies[name])
      throw new Error(`Unexpected npm version: ${name}`);
    return {
      name,
      version: pkg.version,
      license: pkg.license,
      files: files(root),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
const blockers = [
  "Distribution mode and archive naming require review of the proposal.",
  "Trace Kernel's own distribution terms are still a draft; no license is invented by this script.",
  "V8's local Cargo source omits license texts. Collect the pinned upstream V8, Rusty V8 and embedded C++/ICU notices before release.",
  "MPL source availability and third-party notices require a release-specific review.",
  "This machine has Visual C++ runtime installed. A clean Windows environment has not been verified.",
];
const report = {
  formatVersion: 1,
  target: "x86_64-pc-windows-msvc",
  binary: {
    name: path.basename(binary),
    bytes: image.length,
    sha256: sha256(image),
    version: execFileSync(binary, ["--version"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim(),
    imports: [...dlls].sort(),
  },
  scope:
    "Cargo target dependency closure including build dependencies; npm embedded direct dependencies. Not a final linkage/permission audit.",
  rust,
  npm,
  blockers,
};
writeFileSync(
  path.join(output, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
const mpl = rust.filter((pkg) => pkg.license?.includes("MPL-2.0"));
// A vendored component's nested copyright does not replace the crate's own notice.
const missing = rust.filter(
  (pkg) => pkg.registry && !pkg.files.some((file) => !file.path.includes("/")),
);
const table = (packages) =>
  packages
    .map(
      (pkg) =>
        `| ${pkg.name} | ${pkg.version} | ${pkg.license ?? "未設定"} | ${pkg.files.length} |`,
    )
    .join("\n");
writeFileSync(
  path.join(output, "report.md"),
  `# CLI配布調査\n\n- Target: ${report.target}\n- ${report.binary.version}\n- Binary: ${image.length} bytes\n- SHA-256: ${report.binary.sha256}\n- Rust: ${rust.length} packages（build依存を含む候補）\n- npm: ${npm.length} embedded dependency candidates\n\n## PE import（delay importを含む）\n\n${report.binary.imports.map((name) => "- " + name).join("\n")}\n\n## MPL候補\n\n| Package | Version | License | License files |\n|---|---|---|---|\n${table(mpl)}\n\n## local license textがないregistry package\n\n| Package | Version | License | License files |\n|---|---|---|---|\n${table(missing)}\n\n## 埋込npm\n\n| Package | Version | License | License files |\n|---|---|---|---|\n${table(npm)}\n\n## 未完了の配布条件\n\n${blockers.map((value) => "- " + value).join("\n")}\n`,
  "utf8",
);
console.log(
  JSON.stringify(
    {
      rustPackages: rust.length,
      npmPackages: npm.length,
      mplPackages: mpl.length,
      missingRegistryNotices: missing.map(
        (pkg) => `${pkg.name}@${pkg.version}`,
      ),
      msvcImports: report.binary.imports.filter((name) =>
        /^(msvcp|vcruntime)/.test(name),
      ),
      output,
    },
    null,
    2,
  ),
);
