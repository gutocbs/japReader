# Repository Guidance

## Project Overview

japReader is an Electron desktop reader for Japanese clipboard text. It presents parsed words, readings, definitions, translations, word-status data, and Anki actions across several coordinated windows. Reader analysis normally uses the local `ichiran-api` service at `http://127.0.0.1:8080`; the optional ichi.moe route is enabled only by its setting.

## Tech Stack

- Node.js `24.22.1`, pinned by `package.json`, `.nvmrc`, and Volta.
- Electron `41.10.6` with Electron Forge `7.11.1`; the codebase uses CommonJS.
- `electron-store` for options, window state, status data, and history.
- `clipboard-event`, `jquery`, `furigana`, and `deepl-node` for clipboard, UI, reading, and translation behavior.
- Built-in `node:test`/`node:assert` tests and JSON fixtures under `test/`.
- Prettier is available, but `npm run lint` is only a placeholder.

## Architecture

`src/index.js` is the Electron main process. It creates windows, restores their persisted bounds, owns IPC handlers, and wires clipboard, reader, dictionary, translation, DeepL, options, and analysis lifecycles.

Renderer pages live under `src/boxes/<name>/` with colocated HTML and preload/renderer scripts. Shared visual rules live under `src/styles/`; persisted schemas and store configuration live in `src/tools.js`.

The analysis pipeline is isolated under `src/analysis/`: clipboard text enters the source coordinator, which selects the local API or optional ichi.moe path. The local router owns cancellation/latest-request behavior and adapts successful API responses into the existing reader contract before publishing them over IPC.

## Main Components

- `src/index.js`: application/window lifecycle and top-level IPC composition.
- `src/tools.js`: schemas for options, window settings, word statuses, and history.
- `src/analysis/local-api-router.js`: `POST /analyze`, cancellation, HTTP failure mapping, and disposal.
- `src/analysis/analysis-source-coordinator.js`: local API versus ichi.moe selection and stale-result suppression.
- `src/analysis/api-result-adapter.js`: local API response validation and conversion to reader word objects.
- `src/analysis/electron-analysis-composition.js`: bridges analysis modules to Electron windows and IPC.
- `src/boxes/`: clipboard watcher and the options, reader, dictionary, translation, DeepL, and ichi.moe window code.
- `forge.config.js` and `scripts/build-runtime-preflight.js`: packaging, makers, local Electron checksums, and the required build runtime.
- `test/`: focused analysis, options, packaging, and window-lifecycle tests plus Ichiran API fixtures.

## Project Conventions

- Follow the existing CommonJS and Prettier style: `require`, `module.exports`, double quotes, semicolons, and trailing commas where formatted.
- Keep IPC channel names and payload shapes stable; renderer and main-process consumers are coupled through those contracts.
- Add option defaults and types to the schema in `src/tools.js`, then keep the Options markup/script consistent with the same property name.
- Managed auxiliary windows start hidden, intercept `close` to hide, and open through explicit IPC. Persisted maximization for a hidden window is restored only when it is shown.
- With `useIchiMoeForShortText` disabled, all text uses the local API. When enabled, JavaScript UTF-16 `text.length < 90` uses ichi.moe and longer text uses the API. Failures do not retry or switch sources.
- Analysis is latest-request-wins: cancel superseded API work and ignore stale ichi.moe results or failures.
- Keep the reader-facing failure codes and adapted word-object contract covered by focused tests.
- Put behavioral tests in `test/**/*.test.js`; use fixtures from `test/fixtures/ichiran-api/` for API response shapes.
- Treat `out/` and `node_modules/` as generated content; do not edit or commit them.

## Instructions for AI Assistants

- Preserve the main-process/renderer/analysis separation and make changes at the narrowest owning layer.
- Do not change the local API endpoint, request body, IPC payloads, persisted option names, reader word objects, or failure codes without validating every producer and consumer.
- Do not introduce automatic retries or ichi.moe fallback for local API failures.
- Use strict regression-first development for behavior changes. Run a focused test with `node --test <test-file>` and then the full `npm test` suite.
- Run relevant Prettier checks explicitly and `git diff --check`; do not claim `npm run lint` provides lint coverage.
- Use Node.js `24.22.1` for install, start, test, package, and make commands. Do not bypass `scripts/build-runtime-preflight.js` or disable Electron checksum validation.
- For packaging changes, separately verify `npm run package`, `npm run make`, and the expected artifacts under `out/make/`; unit tests alone do not prove packaging.
- For window or Electron lifecycle changes, keep automated tests separate from bounded/manual runtime validation.
- Preserve unrelated worktree changes and generated/user configuration. Do not edit files under the platform-specific japReader configuration directory as part of source changes.
- Keep changes objective and consistent with existing code. Do not invent undocumented conventions or expand scope through opportunistic cleanup.
