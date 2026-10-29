const assert = require("node:assert/strict");
const test = require("node:test");

const forgeConfig = require("../../forge.config");
const electronPackage = require("electron/package.json");
const electronChecksums = require("electron/checksums.json");
const {
  assertSupportedBuildRuntime,
} = require("../../scripts/build-runtime-preflight");

test("configures Forge to verify the installed Electron Windows x64 ZIP locally", () => {
  const artifactName = `electron-v${electronPackage.version}-win32-x64.zip`;

  assert.equal(
    forgeConfig.packagerConfig.download.checksums[artifactName],
    electronChecksums[artifactName],
  );
});

test("accepts Node 24.22.1 for Forge build lifecycles", () => {
  assert.doesNotThrow(() => assertSupportedBuildRuntime("v24.22.1"));
});

test("rejects Node 26 with an actionable Node 24 build instruction", () => {
  assert.throws(
    () => assertSupportedBuildRuntime("v26.5.0"),
    /Node 24\.22\.1 is required for npm run package and npm run make\. Use Node 24\.22\.1 and run npm install\./,
  );
});
