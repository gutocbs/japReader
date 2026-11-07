# Compatible package candidate matrix

**Date:** 2026-11-06
**Repository:** `japReader`
**Worktree:** `C:\Users\gutoc\.codex\worktrees\node-package-updates\japReader`
**Branch/commit:** `update-packages` / `2ae638a`
**Runtime:** Node `v24.22.1`, npm `11.19.1`

The matrix below records discovery before implementation. The compatible implementation result is recorded in the final section; the major-version plan remains intentionally out of scope.

## Registry and runtime evidence

PASS. The committed nvm-removal state is clean for tracked files, on `update-packages`, and uses Node `24.22.1`.

PASS. Clean `npm ci` completed with a temporary cache inside the worktree. It installed 535 packages, audited 536 packages, and reported 47 vulnerabilities: 4 low, 5 moderate, 37 high, and 1 critical. The install warnings no longer include `nvm@0.0.4`.

PASS WITH EXPECTED STATUS. `npm outdated --json --long` exited 1 because exact manifest pins have newer registry versions. Its JSON was parseable and no registry or transport error was reported. The `wanted` value remained the current version for every package because the manifest pins are exact.

PASS. For all 15 direct dependencies and development dependencies, the package metadata queries returned exit 0 with empty stderr. Candidate metadata was queried with `npm view <name>@<candidate> --json`; registry metadata and version lists were queried independently. No candidate was marked deprecated by the registry metadata.

The compatible classification uses the approved rules: current major for normal packages, `0.19.x` patches only for `furigana`, one exact version for the six-package Forge group, Electron within major 41, and Node requirements compatible with Node 24.22.1.

## Eligible standalone updates

| Package | Current | Compatible candidate | Registry latest | Candidate change | Candidate Node requirement | Status |
| --- | ---: | ---: | ---: | --- | --- | --- |
| `deepl-node` | 1.25.0 | 1.29.0 | 1.29.0 | minor within 1.x | `>=14.17` | Candidate; review exact 1.29.0 changelog and run configured DeepL manual flow |
| `module-alias` | 2.3.4 | 2.3.5 | 2.3.5 | patch | none declared | Candidate; run startup/package/manual smoke proof |
| `prettier` | 3.8.1 | 3.9.10 | 3.9.10 | minor within 3.x | `>=14` | Candidate; proof is explicit formatting only |

`deepl-node` remains a behavior-sensitive candidate even though its package engine accepts Node 24. Its exact 1.29.0 Node changelog entry was not available in the fetched official changelog page, so the candidate is not authorization to update yet.

`module-alias` 2.3.5 has no declared Node engine and no deprecation metadata. The registry result is sufficient for discovery, but its startup behavior still needs a focused wave test.

The official Prettier 3.9.10 release notes describe a Markdown GFM table parser dependency update; this is constrained to the formatting tool and should not cause source reformatting outside the files intentionally touched by that wave: <https://github.com/prettier/prettier/releases/tag/3.9.10>.

## Eligible grouped updates

### Electron Forge group

All six packages must move together to exactly `7.11.2`:

- `@electron-forge/cli` `7.11.1` -> `7.11.2`
- `@electron-forge/maker-deb` `7.11.1` -> `7.11.2`
- `@electron-forge/maker-dmg` `7.11.1` -> `7.11.2`
- `@electron-forge/maker-rpm` `7.11.1` -> `7.11.2`
- `@electron-forge/maker-squirrel` `7.11.1` -> `7.11.2`
- `@electron-forge/maker-zip` `7.11.1` -> `7.11.2`

The candidate declares Node `>=16.4.0`, so Node 24.22.1 is compatible. The official release notes list fixes, dependency updates, and the version bump from 7.11.1 to 7.11.2; they do not identify an application API break for this package group: <https://github.com/electron/forge/releases/tag/v7.11.2>.

Proof required in a later wave: focused Forge manifest tests, `npm test`, `npm run package`, `npm run make`, artifact inspection, and packaged-app manual startup/installer validation. The existing `DEP0147` and `DEP0187` owners must be rechecked after this group is installed.

### Electron patch

`electron` `41.10.6` -> `41.10.7` is the latest registry candidate within major 41. It declares Node `>=22.12.0`, compatible with Node 24.22.1.

The official release notes list Windows shutdown, detached DevTools, title-bar overlay, Linux theme, and upstream backport fixes. They also explicitly state that Electron 41.x is end-of-support, so this is a contained patch candidate, not a long-term support decision: <https://github.com/electron/electron/releases/tag/v41.10.7>.

Proof required in a later wave: Electron checksum/allow-script coherence, `npm run package`, `npm run make`, artifact hashes, packaged-app startup, and the manual reader/window flows.

## Excluded majors and breaking candidates

| Package/group | Current | Registry latest | Reason excluded from this wave |
| --- | ---: | ---: | --- |
| Electron Forge group | 7.11.1 | 8.0.1 | Major 8; requires a separate grouped migration |
| `electron` | 41.10.6 | 45.2.3 | Major change; Node requirement and Electron behavior need a separate wave |
| `electron-store` | 8.2.0 | 12.0.0 | Major change; persisted-store behavior needs migration proof |
| `jquery` | 3.7.1 | 4.0.0 | Major change; official project documents removed/deprecated APIs and 3.x is critical-only: <https://github.com/jquery/jquery/releases.html>, <https://github.com/jquery/jquery-migrate/blob/main/warnings.md> |

The `jquery` 3.x-compatible candidate is still `3.7.1`; there is no newer 3.x registry version. jQuery 4.0 must remain a separate breaking-change plan because the migration documentation lists removed APIs and changed attribute/data behavior.

Node 26 is not a package candidate. It remains a separate runtime wave and is deferred while the current packaging toolchain still emits `DEP0147` and `DEP0187`.

## Remaining transitive deprecations and owners

The committed nvm-removal wave removed direct and lockfile `nvm@0.0.4`. The remaining relevant packaging warnings are unchanged:

- `DEP0147`: `cross-zip@4.0.1`, `node_modules/cross-zip/index.js:49`, calling `fs.rmdir(..., { recursive: true })`.
- `DEP0187`: `electron-winstaller@5.4.0`, `node_modules/electron-winstaller/lib/sign.js:131`, calling `fs.existsSync` with an invalid argument type in the no-signing path.

Other deprecated lockfile entries remain transitive and were not treated as direct update candidates: `rimraf@2.6.3`, `rimraf@3.0.2`, `glob@7.2.3`, `glob@8.1.0`, `inflight@1.0.6`, `lodash.get@4.4.2`, `@npmcli/move-file@2.0.1`, `boolean@3.2.0`, and `tar@6.2.1`.

## Recommended wave order

1. `module-alias` `2.3.5`: narrow startup/package wave with the existing manifest test and packaged-app smoke test.
2. `prettier` `3.9.10`: formatting-only wave with explicit Prettier verification and no opportunistic source reformatting.
3. `deepl-node` `1.29.0`: isolated translation wave after reviewing the exact release notes, with configured DeepL manual validation.
4. Electron Forge group `7.11.2`: six packages together, with package/make and artifact gates.
5. Electron `41.10.7`: separate patch wave, retaining local checksum verification and repeating all Electron/manual gates.
6. No update for `clipboard-event`, `electron-squirrel-startup`, `electron-store`, `furigana`, or `jquery` in the compatible wave because no eligible current-range candidate was found.

Each wave should add or extend behavior characterization before changing the version, run a focused RED/GREEN cycle where applicable, use Node 24.22.1, run the full static gate, run package and make separately, and stop for manual validation before its commit.

## Blockers and unknowns

- The exact official `deepl-node` 1.29.0 changelog entry was not located in the fetched Node client changelog; review it before implementation.
- No exact release note was located for `module-alias` 2.3.5 in the fetched official repository; treat it as a registry candidate requiring focused tests, not as pre-approved.
- Candidate discovery does not prove runtime behavior. No candidate package was installed or tested in this Task 4.
- The 47 npm audit findings were recorded but not auto-fixed.
- The current transitive `cross-zip` and `electron-winstaller` warnings remain a prerequisite for deciding whether Node 26 can be supported.

## Compatible update implementation

The following exact pins were updated and tested in isolated waves:

| Package/group | Before | After |
| --- | ---: | ---: |
| `module-alias` | 2.3.4 | 2.3.5 |
| `prettier` | 3.8.1 | 3.9.10 |
| `deepl-node` | 1.25.0 | 1.29.0 |
| Electron Forge group | 7.11.1 | 7.11.2 |
| `electron` | 41.10.6 | 41.10.7 |

The Forge manifest characterization test was updated from the old exact group pin to `7.11.2`. The Electron `allowScripts` entry was aligned from `electron@41.10.6` to `electron@41.10.7`. No application source, IPC contract, persisted schema, or reader behavior code changed.

Automated evidence after all updates:

- Focused packaging manifest tests: 6/6 passed.
- Full `npm test`: 108 passed, 0 failed, 0 cancelled, 0 skipped.
- Explicit Prettier check: passed.
- `git diff --check`: passed.
- `npm run package`: passed under Node 24.22.1 after elevated network access was required to obtain the Electron binary.
- `npm run make`: passed with Squirrel and ZIP makers under Node 24.22.1.
- Final npm install audit summary: 33 findings, consisting of 3 low, 2 moderate, 27 high, and 1 critical. No audit fix was run.

The final `make` still emits only the previously attributed transitive warnings: `DEP0147` from `cross-zip@4.0.1` and `DEP0187` from `electron-winstaller@5.4.0`. No Node 26 validation was attempted.

Final artifacts from the compatible update make run:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `out/make/squirrel.windows/x64/japreader-1.12.0 Setup.exe` | 207719424 | `A2433F190968A163560072FE8C185E245EC1E23DE07B4FE32D30466AA758440F` |
| `out/make/squirrel.windows/x64/japreader-1.12.0-full.nupkg` | 208147035 | `C43A04ACDF7011CB549787D9AB6C8223B04E5768F8C1165BEFC5EC2092AB24EB` |
| `out/make/squirrel.windows/x64/RELEASES` | 81 | `FFF02F3ED82B5707596D03CAA3233016C8BBD530E80A43C71CBAC42B3FCAFAD4` |
| `out/make/zip/win32/x64/japreader-win32-x64-1.12.0.zip` | 213674860 | `4D3B09B1F0589279FC1E1174AECC8327DBBF4C43C9B85BC831EB27FD1D71FBD2` |

## Discovery decision

The registry/runtime matrix and compatible implementation are complete. The next action for major versions requires a separate implementation plan; no major package or Node 26 update was applied in this wave.
