import assert from "node:assert/strict";
import test from "node:test";
import {
  cargoPackageVersion,
  desktopMcpIdentityPlugin,
  generationConstants,
  identityInputs,
  loadDesktopMcpIdentity,
  validateIdentity,
  verifyVersions,
} from "./desktop-mcp.mjs";

const release = {
  formatVersion: 1,
  releaseVersion: "0.2.0",
  bridgeProtocolGen: 1,
};
const generations = { api: "1", workspace: "0" };

test("shared generation constants are parsed strictly without stale module caching", () => {
  const source =
    'export const API_GEN = "1";\nexport const WORKSPACE_GEN = "0";';
  assert.deepEqual(generationConstants(source), generations);
  assert.deepEqual(generationConstants(source.replace('"1"', '"2"')), {
    api: "2",
    workspace: "0",
  });
  for (const changed of [
    "",
    source.replace('"1"', "1"),
    source.replace('"1"', "String(1)"),
    source.replace('"1"', '"01"'),
    source + '\nexport const API_GEN = "2";',
  ]) {
    assert.throws(() => generationConstants(changed));
  }
});

test("release identity is derived from the authoritative release and shared generation sources", () => {
  assert.deepEqual(
    loadDesktopMcpIdentity(),
    validateIdentity(release, generations),
  );
  assert.ok(Object.isFrozen(loadDesktopMcpIdentity()));
});
test("metadata is strict, with no legacy defaults or unknown fields", () => {
  for (const key of Object.keys(release)) {
    const missing = { ...release };
    delete missing[key];
    assert.throws(() => validateIdentity(missing, generations));
  }
  for (const change of [
    { formatVersion: 2 },
    { bridgeProtocolGen: 0 },
    { bridgeProtocolGen: -1 },
    { bridgeProtocolGen: 1.5 },
    { bridgeProtocolGen: 0x1_0000_0000 },
    { bridgeProtocolGen: "1" },
    { releaseVersion: "v0.2.0" },
    { releaseVersion: "0.02.0" },
    { releaseVersion: "0.2" },
    { extra: 1 },
  ]) {
    assert.throws(() =>
      validateIdentity({ ...release, ...change }, generations),
    );
  }
  for (const value of ["", "01", "-1", "1.0", "9007199254740992", 1]) {
    assert.throws(() =>
      validateIdentity(release, { ...generations, api: value }),
    );
    assert.throws(() =>
      validateIdentity(release, { ...generations, workspace: value }),
    );
  }
});
test("the release definition owns the bridge generation without a second fixed constant", () => {
  for (const bridgeProtocolGen of [1, 2, 0xffff_ffff]) {
    assert.equal(
      validateIdentity({ ...release, bridgeProtocolGen }, generations)
        .bridgeProtocolGen,
      bridgeProtocolGen,
    );
  }
});
test("every independently declared application version must match", () => {
  const identity = validateIdentity(release, generations);
  const versions = {
    npm: "0.2.0",
    desktop: "0.2.0",
    tauri: "0.2.0",
    mcp: "0.2.0",
  };
  verifyVersions(identity, versions);
  for (const field of Object.keys(versions)) {
    assert.throws(() =>
      verifyVersions(identity, { ...versions, [field]: "0.1.0" }),
    );
  }
});
test("Cargo version lookup never reads a dependency or profile version", () => {
  assert.equal(
    cargoPackageVersion(
      '[package]\nname = "fixture"\nversion = "0.2.0"\n\n[dependencies]\nversion = "9.0.0"\n',
    ),
    "0.2.0",
  );
  assert.equal(cargoPackageVersion('[package]\nversion = "0.2.0"'), "0.2.0");
  assert.throws(() => cargoPackageVersion('[dependencies]\nversion = "0.2.0"'));
  assert.throws(() =>
    cargoPackageVersion('[package]\nversion = "0.2.0"\nversion = "0.2.1"'),
  );
});

test("Vite embeds and records the same identity and watches all authoritative inputs", () => {
  const plugin = desktopMcpIdentityPlugin();
  const watched = [],
    emitted = [];
  plugin.buildStart.call({ addWatchFile: (file) => watched.push(file) });
  assert.deepEqual(watched, identityInputs);
  const id = plugin.resolveId("virtual:trace-kernel-product-info");
  assert.equal(plugin.resolveId("another-module"), null);
  const module = plugin.load(id);
  assert.deepEqual(
    JSON.parse(module.replace(/^export default /, "").replace(/;$/, "")),
    loadDesktopMcpIdentity(),
  );
  plugin.generateBundle.call({ emitFile: (file) => emitted.push(file) });
  assert.equal(emitted[0].fileName, "product-identity.json");
  assert.deepEqual(JSON.parse(emitted[0].source), loadDesktopMcpIdentity());
});

test("identity edits restart the dev server instead of retaining cached identity", () => {
  const plugin = desktopMcpIdentityPlugin();
  let restarts = 0;
  const server = {
    restart: async () => {
      restarts++;
    },
  };
  plugin.handleHotUpdate({ file: "unrelated", server });
  assert.equal(restarts, 0);
  for (const file of identityInputs) plugin.handleHotUpdate({ file, server });
  assert.equal(restarts, identityInputs.length);
});
