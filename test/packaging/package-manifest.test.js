const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const electronChecksums = require("electron/checksums.json");
const electronPackage = require("electron/package.json");
const forgeConfig = require("../../forge.config");
const packageJson = require("../../package.json");
const packageLockPath = path.join(__dirname, "../..", "package-lock.json");
const packageLock = fs.existsSync(packageLockPath)
  ? require(packageLockPath)
  : undefined;
const { requiredVersion } = require("../../scripts/build-runtime-preflight");

const readText = (fileName) =>
  fs.readFileSync(path.join(__dirname, "../..", fileName), "utf8");

test("keeps every Node build-runtime pin aligned", () => {
  assert.equal(requiredVersion, "24.22.1");
  assert.equal(readText(".nvmrc").trim(), requiredVersion);
  assert.equal(packageJson.engines.node, requiredVersion);
  assert.equal(packageJson.volta.node, requiredVersion);
  assert.match(readText("README.md"), /Node\.js 24\.22\.1/);
  assert.match(readText("AGENTS.md"), /Node\.js `24\.22\.1`/);
});

test("keeps every Electron Forge package on one exact version", () => {
  const forgePackages = [
    "@electron-forge/cli",
    ...forgeConfig.makers.map((maker) => maker.name),
  ];
  const forgeVersions = forgePackages.map(
    (packageName) => packageJson.devDependencies[packageName],
  );

  assert.deepEqual([...new Set(forgeVersions)], ["7.11.2"]);
  forgePackages.forEach((packageName) => {
    assert.equal(typeof packageJson.devDependencies[packageName], "string");
  });
});

test("keeps configured makers declared as development dependencies", () => {
  const configuredMakers = forgeConfig.makers.map((maker) => maker.name).sort();
  const declaredMakers = Object.keys(packageJson.devDependencies)
    .filter((packageName) => packageName.startsWith("@electron-forge/maker-"))
    .sort();

  assert.deepEqual(configuredMakers, declaredMakers);
});

test("keeps Electron install permission aligned with the direct Electron pin", () => {
  assert.equal(
    packageJson.allowScripts[`electron@${electronPackage.version}`],
    true,
  );
  assert.deepEqual(
    Object.keys(packageJson.allowScripts).filter((key) =>
      key.startsWith("electron@"),
    ),
    [`electron@${electronPackage.version}`],
  );
});

test("keeps local Electron checksum verification enabled", () => {
  assert.strictEqual(
    forgeConfig.packagerConfig.download.checksums,
    electronChecksums,
  );
});

test("does not package the deprecated npm nvm shim", () => {
  assert.equal(packageJson.dependencies.nvm, undefined);
  if (packageLock) {
    assert.equal(packageLock.packages[""].dependencies.nvm, undefined);
    assert.equal(packageLock.packages["node_modules/nvm"], undefined);
  }
});
