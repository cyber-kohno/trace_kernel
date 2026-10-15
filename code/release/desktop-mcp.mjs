// @ts-expect-error Node built-ins belong to this build-time module, not browser types.
import assert from "node:assert/strict";
// @ts-expect-error Node built-in (build time only).
import { readFileSync } from "node:fs";
// @ts-expect-error Node built-in (build time only).
import path from "node:path";
// @ts-expect-error Node built-in (build time only).
import { fileURLToPath } from "node:url";

const codeRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const identityInputs = [
  "release/desktop-mcp.json",
  "packages/runtime-core/src/metadata/gen-version.js",
  "apps/desktop/package.json",
  "apps/desktop/package-lock.json",
  "apps/desktop/src-tauri/Cargo.toml",
  "apps/desktop/src-tauri/tauri.conf.json",
  "apps/mcp/Cargo.toml",
].map((name) => path.join(codeRoot, name));

/** @param {unknown} value */
const validGeneration = (value) =>
  typeof value === "string" &&
  /^(0|[1-9]\d*)$/.test(value) &&
  Number.isSafeInteger(Number(value));

/** @param {string} source */
export const generationConstants = (source) => {
  /** @param {string} name */
  const readConstant = (name) => {
    const values = source.split(/\r?\n/).flatMap((line) => {
      const equal = line.indexOf("=");
      if (
        equal < 0 ||
        line.slice(0, equal).trim().split(/\s+/).join(" ") !==
          `export const ${name}`
      )
        return [];
      const value = JSON.parse(
        line
          .slice(equal + 1)
          .trim()
          .replace(/;$/, ""),
      );
      assert.ok(validGeneration(value), `Invalid ${name}`);
      return [value];
    });
    assert.equal(
      values.length,
      1,
      `Expected exactly one ${name} in gen-version.js`,
    );
    return values[0];
  };
  return {
    api: readConstant("API_GEN"),
    workspace: readConstant("WORKSPACE_GEN"),
  };
};

/**
 * @typedef {{releaseVersion: string, bridgeProtocolGen: number, apiGen: string, workspaceGen: string}} ProductIdentity
 * @param {{formatVersion: number, releaseVersion: string, bridgeProtocolGen: number}} release
 * @param {{api: string, workspace: string}} generations
 * @returns {Readonly<ProductIdentity>}
 */
export const validateIdentity = (release, generations) => {
  assert.deepEqual(
    Object.keys(release).sort(),
    ["formatVersion", "releaseVersion", "bridgeProtocolGen"].sort(),
  );
  assert.equal(release.formatVersion, 1, "Unknown release metadata format");
  assert.ok(
    typeof release.releaseVersion === "string" &&
      release.releaseVersion.split(".").length === 3 &&
      release.releaseVersion.split(".").every(validGeneration),
    "Invalid releaseVersion",
  );
  assert.ok(
    Number.isInteger(release.bridgeProtocolGen) &&
      release.bridgeProtocolGen > 0 &&
      release.bridgeProtocolGen <= 0xffff_ffff,
    "Invalid bridgeProtocolGen (expected a positive u32)",
  );
  assert.ok(validGeneration(generations.api), "Invalid API generation");
  assert.ok(
    validGeneration(generations.workspace),
    "Invalid Workspace generation",
  );
  return Object.freeze({
    releaseVersion: release.releaseVersion,
    bridgeProtocolGen: release.bridgeProtocolGen,
    apiGen: generations.api,
    workspaceGen: generations.workspace,
  });
};

/** @param {string} source */
export const cargoPackageVersion = (source) => {
  const section = source.match(
    /^\[package\]\s*\r?\n([\s\S]*?)(?=^\[|(?![\s\S]))/m,
  )?.[1];
  const versions = [
    ...(section ?? "").matchAll(/^version\s*=\s*"([^"]+)"\s*$/gm),
  ];
  assert.equal(versions.length, 1, "Expected one Cargo package version");
  return versions[0][1];
};

/** @param {ProductIdentity} identity @param {Record<string, string>} versions */
export const verifyVersions = (identity, versions) => {
  for (const [origin, version] of Object.entries(versions)) {
    assert.equal(
      version,
      identity.releaseVersion,
      `${origin} version differs from desktop-mcp.json`,
    );
  }
};

export const loadDesktopMcpIdentity = () => {
  /** @param {string} relative */
  const read = (relative) =>
    readFileSync(path.join(codeRoot, relative), "utf8");
  const identity = validateIdentity(
    JSON.parse(read("release/desktop-mcp.json")),
    generationConstants(
      read("packages/runtime-core/src/metadata/gen-version.js"),
    ),
  );
  verifyVersions(identity, {
    "Desktop npm": JSON.parse(read("apps/desktop/package.json")).version,
    "Desktop npm lock": JSON.parse(read("apps/desktop/package-lock.json"))
      .version,
    "Desktop npm locked root": JSON.parse(
      read("apps/desktop/package-lock.json"),
    ).packages[""].version,
    "Desktop Cargo": cargoPackageVersion(
      read("apps/desktop/src-tauri/Cargo.toml"),
    ),
    "Desktop Tauri": JSON.parse(read("apps/desktop/src-tauri/tauri.conf.json"))
      .version,
    "MCP Cargo": cargoPackageVersion(read("apps/mcp/Cargo.toml")),
  });
  return identity;
};

/** @returns {import('../apps/desktop/node_modules/vite').Plugin} */
export const desktopMcpIdentityPlugin = () => {
  const virtualId = "virtual:trace-kernel-product-info";
  const resolvedId = "\0" + virtualId;
  return {
    name: "trace-kernel-product-info",
    buildStart() {
      loadDesktopMcpIdentity();
      for (const file of identityInputs) this.addWatchFile(file);
    },
    resolveId(id) {
      return id === virtualId ? resolvedId : null;
    },
    load(id) {
      return id === resolvedId
        ? `export default ${JSON.stringify(loadDesktopMcpIdentity())};`
        : null;
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "product-identity.json",
        source: JSON.stringify(loadDesktopMcpIdentity()),
      });
    },
    handleHotUpdate(context) {
      if (!identityInputs.includes(context.file)) return;
      // Rust needs a rebuild as well; do not keep an old Frontend identity alive.
      void context.server.restart();
      return [];
    },
  };
};
