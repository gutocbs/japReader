# Node package baseline

**Date:** 2026-11-06
**Repository:** `japReader`
**Worktree:** `C:\Users\gutoc\.codex\worktrees\node-package-updates\japReader`
**Branch/base:** `update-packages` / `1a9d1b642e326ac5c810a66e38bdf7391e26b568`
**Runtime:** Node `v24.22.1`, npm `11.19.1`

## Checkout and runtime

PASS. The worktree is on `update-packages` at the planned base commit. No tracked product changes existed before the baseline. The SDD ledger is under the generated `.superpowers/` directory and is not a product change.

The first invocation of `C:\Program Files\nodejs\npm.cmd` was invalid for this baseline because it used Node `v26.5.0` and failed in the global npm cache. The approved Volta invocation, `C:\Program Files\Volta\npm.cmd`, used Node `v24.22.1` as required.

## Clean install

PASS. `npm ci` completed with the lockfile and installed 536 packages, auditing 537 packages. The command used a temporary `.npm-cache-baseline` inside the worktree because the global npm cache was denied by the environment. Registry access required elevated execution because the sandbox denied a tarball download.

Install warnings included the currently expected deprecated packages: `nvm@0.0.4`, `rimraf@2.6.3`, `rimraf@3.0.2`, `glob@7.2.3`, `glob@8.1.0`, `inflight@1.0.6`, `lodash.get@4.4.2`, `@npmcli/move-file@2.0.1`, `boolean@3.2.0`, and `tar@6.2.1`.

`package.json` and `package-lock.json` were unchanged by the clean install.

## Direct, deprecated, and audit inventory

`npm ls --depth=0 --json`: PASS, exit 0.

`npm outdated --json --long`: exit 1 with parseable candidate data, which is npm's status for outdated packages. The direct candidates reported were:

| Package/group | Current | Wanted | Latest |
| --- | ---: | ---: | ---: |
| `@electron-forge/cli` and five makers | 7.11.1 | 7.11.1 | 8.0.1 |
| `deepl-node` | 1.25.0 | 1.25.0 | 1.29.0 |
| `electron` | 41.10.6 | 41.10.6 | 45.2.3 |
| `electron-store` | 8.2.0 | 8.2.0 | 12.0.0 |
| `jquery` | 3.7.1 | 3.7.1 | 4.0.0 |
| `module-alias` | 2.3.4 | 2.3.4 | 2.3.5 |
| `prettier` | 3.8.1 | 3.8.1 | 3.9.10 |

The compatible candidate matrix must still verify package engines, changelogs, and current-major ranges before any update. The `wanted` column shows no update under the current exact manifest pins.

`npm audit --json`: exit 1 because the audit contains findings. Summary: 4 low, 5 moderate, 37 high, 1 critical; total 47. No audit fix command was run.

The lockfile/runtime inventory found 12 deprecated package entries:

- `@electron/node-gyp` nested `glob@8.1.0`;
- `@npmcli/move-file@2.0.1`;
- `boolean@3.2.0`;
- `cacache` nested `glob@8.1.0`;
- `gar@1.0.4`;
- `glob@7.2.3`;
- `inflight@1.0.6`;
- `lodash.get@4.4.2`;
- `nvm@0.0.4`;
- `rimraf@3.0.2`;
- `tar@6.2.1`;
- `temp` nested `rimraf@2.6.3`.

## Automated tests and formatting

PASS. `npm test` completed with 48 tests passed, 0 failed, 0 cancelled, and 0 skipped.

PASS. Explicit Prettier check covered `src/**/*.js`, `test/**/*.js`, `scripts/**/*.js`, `forge.config.js`, and `package.json`.

PASS. `git diff --check`.

## Package evidence

PASS. `npm run package` completed under Node 24.22.1 with `NODE_OPTIONS=--trace-deprecation`. No deprecation warning was emitted by this command.

## Make evidence

PASS after rerun with elevated access. The initial run reached the makers but was blocked by permission to read `C:\Users\gutoc\AppData\Roaming\NuGet\NuGet.Config`; this was an environment prerequisite failure, not a product result. The rerun completed the Squirrel and ZIP makers and returned exit 0.

The deprecation warnings are attributed as follows:

- `DEP0147`: `cross-zip@4.0.1`, `node_modules/cross-zip/index.js:49`, calling `fs.rmdir(outPath, { recursive: true, maxRetries: 3 }, ...)`.
- `DEP0187`: `electron-winstaller@5.4.0`, `node_modules/electron-winstaller/lib/sign.js:131`, calling `fs.existsSync(BACKUP_SIGN_TOOL_PATH)` with an invalid argument type in the no-signing path.

These are transitive toolchain findings. No code under `src/` was changed and no `node_modules/` file was patched.

## DEP0147 and DEP0187 ownership

Both warnings were reproduced under Node 24.22.1 with `--trace-deprecation` during `npm run make`. `DEP0147` was first observed during ZIP creation; `DEP0187` was observed during the Squirrel signing reset path. Their owning packages are now concrete candidates for later compatible/major dependency investigation.

## Artifact metadata

All expected artifacts were created by the successful baseline make run on 2026-11-06:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `out/make/squirrel.windows/x64/japreader-1.12.0 Setup.exe` | 221164544 | `78539F5A6FB4E51A454E8141F62FD4E0A5FFA6A60DC0285B2B0D9D67B552EEA2` |
| `out/make/squirrel.windows/x64/japreader-1.12.0-full.nupkg` | 221730938 | `E65E70B5F76204B3297DAD21172A13707BEA0BE8ACD645929BC50A57840155D3` |
| `out/make/squirrel.windows/x64/RELEASES` | 81 | `8F87D3B8F3D70988A2F34F8CB0A319E453DC7AF63617057678DC6DAE87ED3A7D` |
| `out/make/zip/win32/x64/japreader-win32-x64-1.12.0.zip` | 227034224 | `C8DF3E7165B8D23C8065CC9A4B204F0F013D34030688040E14BB22A4B68FFD9B` |

Hashes prove artifact identity only; they do not prove manual application behavior.

## nvm removal RED/GREEN evidence

The characterization test initially failed because `package.json` declared `nvm` as `^0.0.4`. After `npm uninstall nvm --ignore-scripts`, the focused packaging suite passed 9/9. The resulting manifest diff removes only the direct `nvm` dependency; the lockfile diff removes only its root dependency entry and `node_modules/nvm` package block.

## Post-removal clean install and automated gates

PASS. A clean `npm ci` under Node 24.22.1 installed 535 packages, audited 536 packages, and produced the same 47 audit findings. No `nvm` package remained in the installed tree.

The first post-removal static rerun exposed a packaging-test discovery issue: after `npm run package`, `node --test` also discovered the copied test under `out/japreader-win32-x64/resources/app/test/`. That copy could not resolve the source-only `package-lock.json`, producing 102 passed and 1 failed. The root cause was the test's unconditional lockfile import in the packaged copy.

The test now conditionally loads the lockfile when it exists, while retaining the lockfile assertions in the source worktree. After rebuilding the package, full `npm test` completed with 108 tests passed, 0 failed, 0 cancelled, and 0 skipped. Explicit Prettier passed and `git diff --check` passed.

## Post-removal package and make evidence

PASS. After the packaged-test correction, `npm run package` completed under Node 24.22.1 with `NODE_OPTIONS=--trace-deprecation`, exit 0, with no deprecation warning.

PASS. After the packaged-test correction, `npm run make` completed with elevated NuGet access, exit 0, producing both Squirrel and ZIP distributables. The same two transitive warnings remained: `DEP0147` from `cross-zip@4.0.1` and `DEP0187` from `electron-winstaller@5.4.0`. No new warning appeared and no `nvm` warning remained.

The post-removal artifacts were:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `out/make/squirrel.windows/x64/japreader-1.12.0 Setup.exe` | 179777536 | `53085EE7F7BB14ED441F9743222F116E7E493F586BAA84449CB355DCDD1252AB` |
| `out/make/squirrel.windows/x64/japreader-1.12.0-full.nupkg` | 179488372 | `047604FE1DC3D60F5374FDFEBEEF92F4B97A50BCA5BE8DE9AD9E136F0744B060` |
| `out/make/squirrel.windows/x64/RELEASES` | 81 | `E92E46F2C227376117DD1CFA9E23684D30535BE5A46294BAF0EDDC35DD89D960` |
| `out/make/zip/win32/x64/japreader-win32-x64-1.12.0.zip` | 185461784 | `961D052A95CDF3BC8D165265589D088C3C64D3732B137FC952828112C5613575` |

## Post-removal deprecation inventory

The direct deprecated `nvm@0.0.4` package is removed. The remaining deprecated entries are transitive toolchain or runtime packages recorded above; resolving them belongs to the later compatible-update candidate matrix and must not be folded into this narrow removal.

## Manual validation handoff

Automated validation is complete for this task, but the worktree remains uncommitted by design. Manual validation is required before any commit:

1. Launch the packaged application and verify the primary reader window opens.
2. Exercise clipboard capture and a representative local analysis flow.
3. Open the options, dictionary, translation, DeepL, and ichi.moe-related windows as applicable; verify they show/hide normally and preserve expected state.
4. Verify representative Anki and history/status flows without changing persisted contracts.
5. Exercise the packaged installer/update artifact if that is part of the normal release procedure.

Record any failure before authorizing the commit. Do not begin the compatible candidate matrix, major-version waves, or Node 26 validation until this manual gate and explicit commit authorization are complete.

## Task 3 decision

TASK 3 AUTOMATED VALIDATION PASSED WITH WARNINGS. The unused direct `nvm@0.0.4` package was removed without changing application behavior contracts. Node 24.22.1 tests, package, and make pass; the remaining deprecation warnings are attributed to `cross-zip@4.0.1` and `electron-winstaller@5.4.0`; the 47 audit findings remain unchanged and were not auto-fixed. Await manual validation and explicit commit authorization before proceeding.
