# Ichiran Analysis Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in, bounded JSONL diagnostics that trace each local API or `ichi.moe` analysis from provider response through transformation, word selection, and dictionary rendering without changing visible output.

**Architecture:** A main-process writer owns JSONL serialization and two-file rotation. The analysis coordinator creates correlation metadata, provider-specific code records raw and transformed data, and renderer helpers report the selected word and final dictionary HTML over dedicated IPC channels. Existing reader word fields and provider routing remain unchanged.

**Tech Stack:** Node.js 24.22.1, Electron 41 CommonJS, built-in `node:fs/promises`, `node:crypto`, `node:perf_hooks`, `node:test`, and `node:assert`.

**Spec:** `docs/superpowers/specs/2026-11-20-ichiran-analysis-diagnostics-design.md`

## Global Constraints

- Keep `recordIchiranAnalysisDiagnostics` disabled by default and preserve the existing Apply-and-restart Options behavior.
- Write only `logs/ichiran-analysis.jsonl` and `logs/ichiran-analysis.previous.jsonl`; rotate at `10 * 1024 * 1024` UTF-8 bytes and retain one previous file.
- Every persisted event has `schemaVersion: 1`, an ISO-8601 UTC `timestamp`, `requestId`, `provider`, `text`, and `event`.
- Do not log full `ichi.moe` pages, scripts, cookies, request or response headers, raw errors, stacks, or API Problem Details bodies.
- A diagnostic failure must never change provider selection, cancellation, failure mapping, reader IPC, dictionary output, or any other user-visible behavior.
- Do not add a package dependency or change the public API, reader word-object fields, endpoint, automatic retry, or fallback behavior.
- Keep DeepL, AnkiConnect, audio, external searches, and other network traffic outside this feature.
- Use Node.js 24.22.1 for every source test and the complete `npm.cmd test` suite.

## Review Focus

- A missing or read-only logs directory must produce at most one content-free warning per consecutive failure sequence while analysis still succeeds; Task 1 pins this.
- Rotation near 10 MB must count multibyte Japanese text in UTF-8 bytes, not JavaScript code units; Task 1 pins this.
- Consecutive identical phrases and late `ichi.moe` replies must keep distinct request IDs and reject only the stale request; Tasks 2 and 3 pin this.
- A word clicked after analysis must retain its provider and request correlation without adding diagnostic fields to the word object used by Anki and audio; Task 4 pins this.
- Circular or otherwise non-serializable diagnostic data must be contained like a file error and must not reject analysis callbacks; Task 1 pins this.

---

## File Structure

- Create `src/analysis/analysis-log-writer.js`: serialize, sequence, rotate, and append diagnostic events.
- Create `src/analysis/ichi-dom-snapshot.js`: extract only the approved `ichi.moe` DOM fragments.
- Create `src/analysis/renderer-analysis-diagnostics.js`: send selection and rendered-HTML diagnostic IPC without changing word objects.
- Create `test/analysis/analysis-log-writer.test.js`: writer, rotation, failure isolation, and shutdown-drain tests.
- Create `test/analysis/ichi-dom-snapshot.test.js`: approved DOM snapshot boundary tests.
- Create `test/analysis/renderer-analysis-diagnostics.test.js`: renderer helper IPC and word-object preservation tests.
- Modify `src/analysis/analysis-source-coordinator.js`: create correlation contexts and own the `ichi.moe` lifecycle.
- Modify `src/analysis/local-api-router.js`: record API response, transformation, failure, cancellation, and stale completion events.
- Modify `src/analysis/electron-analysis-composition.js`: propagate contexts and register diagnostic IPC handlers.
- Modify `src/boxes/ichi/script.js`: persist request context across navigation and return the DOM snapshot.
- Modify `src/boxes/reader/script.js`: associate rendered words with analysis context and report clicks through the renderer helper.
- Modify `src/boxes/dict/script.js`: report the actual `#dict` HTML after rendering.
- Modify `src/tools.js`: add the persisted boolean option.
- Modify `src/boxes/options/index.html`: expose the opt-in warning and checkbox.
- Modify `src/index.js`: create and inject the writer, preserve selection context through dictionary IPC, and drain on normal shutdown.
- Modify focused tests under `test/analysis/`, `test/options/analysis-source-options.test.js`, and `test/window-lifecycle.test.js` rather than adding a parallel integration framework.

### Task 1: Bounded JSONL writer

**Files:**
- Create: `src/analysis/analysis-log-writer.js`
- Create: `test/analysis/analysis-log-writer.test.js`

**Interfaces:**
- Consumes: an enabled flag, logs directory, and optional test seams for `node:fs/promises`, wall clock, and warning sink.
- Produces: `createAnalysisLogWriter(options)` returning `{ record(event): void, close(): Promise<void> }`.
- Produces files named exactly `ichiran-analysis.jsonl` and `ichiran-analysis.previous.jsonl`.

- [ ] **Step 1: Write failing writer contract tests**

Add tests named:

- `disabled writer creates no directory or file`;
- `record appends ordered JSONL with fixed schema and timestamp`;
- `rotation counts UTF-8 bytes and retains only current and previous files`;
- `close waits for queued appends`;
- `write and serialization failures do not throw and warn once per failure sequence`.

Use a real temporary directory for successful I/O. Inject a fixed wall clock (`2026-11-20T18:42:31.123Z`) and assert the parsed line contains `schemaVersion: 1` plus the caller's exact `requestId`, `provider`, `text`, and `event`. For rotation, set `maxBytes` to a small boundary and include Japanese text whose `Buffer.byteLength(..., "utf8")` exceeds its `.length`. For failure isolation, inject rejected file-system operations and a circular event, call `record`, await `close`, and assert no rejection reaches the caller and only one warning is produced until an intervening successful append.

- [ ] **Step 2: Run the writer tests to verify RED**

Run: `node --test test/analysis/analysis-log-writer.test.js`

Expected: FAIL because `src/analysis/analysis-log-writer.js` does not exist.

- [ ] **Step 3: Implement the writer factory**

Export:

```js
const createAnalysisLogWriter = ({
  enabled,
  logsDirectory,
  fileSystem,
  maxBytes = 10 * 1024 * 1024,
  now = () => new Date().toISOString(),
  warn = console.warn,
}) => ({ record, close });
```

`fileSystem` defaults to `require("node:fs/promises")`. `record(event)` must enqueue one operation and return without exposing a promise. The operation creates the directory recursively, serializes `{ ...event, schemaVersion: 1, timestamp: now() }` plus a trailing newline, measures the complete line with `Buffer.byteLength`, and rotates before appending when current size plus line size would exceed `maxBytes`. Treat a missing current or previous file as normal. Catch serialization and file errors inside the queue, emit the fixed content-free warning `Unable to write Ichiran analysis diagnostics.` at most once per consecutive failure sequence, and reset that suppression only after a successful append. `close()` returns the queue tail so tests and normal shutdown can drain it.

- [ ] **Step 4: Run the writer tests to verify GREEN**

Run: `node --test test/analysis/analysis-log-writer.test.js`

Expected: all writer tests PASS with no warning containing diagnostic content.

- [ ] **Step 5: Commit the writer**

```powershell
git add src/analysis/analysis-log-writer.js test/analysis/analysis-log-writer.test.js
git commit -m "feat: add bounded Ichiran diagnostic writer"
```

### Task 2: Correlate analyses and record the local API lifecycle

**Files:**
- Modify: `src/analysis/analysis-source-coordinator.js`
- Modify: `src/analysis/local-api-router.js`
- Modify: `src/analysis/electron-analysis-composition.js`
- Modify: `test/analysis/analysis-source-coordinator.test.js`
- Modify: `test/analysis/local-api-router.test.js`
- Modify: `test/analysis/electron-analysis-composition.test.js`

**Interfaces:**
- Consumes from Task 1: an object with `record(event): void`.
- Produces analysis context `{ requestId, provider, text, startedAt }`; only `{ requestId, provider, text }` crosses renderer IPC.
- Changes internal calls to `apiRouter.analyze(text, context)` and `requestIchiAnalysis(text, context)`.
- Changes API callbacks to `onSuccess(result, context)` and `onFailure(code, context)` without changing Reader-visible failure codes.

- [ ] **Step 1: Write failing coordinator correlation tests**

Extend the coordinator harness with injected `diagnostics.record`, deterministic `createRequestId`, and monotonic `now`. Assert:

- API and `ichi.moe` calls receive contexts with providers `api` and `ichi`, respectively;
- two consecutive requests for the identical text receive different request IDs;
- `analysis.started` is recorded once per accepted clipboard value with all common fields;
- switching away from an active `ichi.moe` request records `analysis.cancelled` with reason `superseded` and `durationMs`;
- an `ichi.moe` response bearing an older request ID records `analysis.discarded` and is not published.

- [ ] **Step 2: Write failing local API lifecycle tests**

Extend the router harness with `diagnostics` and a deterministic monotonic clock. Assert the exact event order on success:

```text
provider.response_received
transformation.completed
```

The first event contains `httpStatus: 200` and the unmodified parsed JSON; the second contains `readerResult` and `durationMs`. Add subtests for request rejection, non-200 status, invalid JSON, and adapter failure with stages `request`, `response.status`, `response.parse`, and `response.transform`. Preserve the existing assertion that non-200 response bodies are never read. Add tests that `cancel()` records `analysis.cancelled`, a late completion records `analysis.discarded`, and neither invokes a reader failure callback.

- [ ] **Step 3: Run the focused coordinator and router tests to verify RED**

Run: `node --test test/analysis/analysis-source-coordinator.test.js test/analysis/local-api-router.test.js test/analysis/electron-analysis-composition.test.js`

Expected: FAIL because current signatures do not create or propagate diagnostic contexts.

- [ ] **Step 4: Implement coordinator context creation and API recording**

Add optional injected defaults to `createAnalysisSourceCoordinator`:

```js
diagnostics = { record: () => {} }
createRequestId = randomUUID
now = performance.now
```

Create a new context at the start of `analyze(text)`, call `diagnostics.record` with `analysis.started`, and pass the context to the selected provider. Track only the active `ichi.moe` context in the coordinator; the API router continues to own its active request and cancellation. Match `ichi.moe` replies by request ID as well as provider, recording stale replies rather than publishing them.

Add optional `diagnostics` and `now` dependencies to `createLocalApiRouter`. Store the active context with the controller. Record raw JSON before `adaptResponse`, record the exact adapter result afterward, and include safe stage/code/status fields on failure. When `cancel()` or `dispose()` aborts active work, record cancellation once and clear the active pair. If already-superseded work completes later, record `analysis.discarded` using its original context without invoking reader callbacks.

- [ ] **Step 5: Propagate API context through Electron composition**

Make `createReaderAnalysisRouter` forward the public part of the context as the fourth `receiveParsedData` argument:

```js
readerBox.webContents.send(
  "receiveParsedData",
  result.words,
  result.fullText,
  { requestId, provider, text },
);
```

Keep `apiAnalysisError` arguments unchanged. Make `createReaderAnalysisCoordinator` pass its diagnostics dependencies and forward the same public context for accepted `ichi.moe` results. Update composition tests to assert existing messages remain unchanged except for the additional success metadata argument.

- [ ] **Step 6: Run focused tests to verify GREEN**

Run: `node --test test/analysis/analysis-source-coordinator.test.js test/analysis/local-api-router.test.js test/analysis/electron-analysis-composition.test.js`

Expected: all focused tests PASS, including existing latest-request-wins and no-fallback tests.

- [ ] **Step 7: Commit lifecycle diagnostics**

```powershell
git add src/analysis/analysis-source-coordinator.js src/analysis/local-api-router.js src/analysis/electron-analysis-composition.js test/analysis/analysis-source-coordinator.test.js test/analysis/local-api-router.test.js test/analysis/electron-analysis-composition.test.js
git commit -m "feat: trace Ichiran analysis lifecycle"
```

### Task 3: Capture the relevant `ichi.moe` DOM and correlate navigation

**Files:**
- Create: `src/analysis/ichi-dom-snapshot.js`
- Create: `test/analysis/ichi-dom-snapshot.test.js`
- Modify: `src/boxes/ichi/script.js`
- Modify: `src/analysis/analysis-source-coordinator.js`
- Modify: `src/analysis/electron-analysis-composition.js`
- Modify: `test/analysis/analysis-source-coordinator.test.js`
- Modify: `test/analysis/electron-analysis-composition.test.js`

**Interfaces:**
- Consumes from Task 2: the public analysis context passed to `requestIchiAnalysis(text, context)`.
- Produces `collectIchiDomSnapshot(document)` returning `{ queryText: string[], wordChunks: { text: string, html: string }[] }`.
- Produces IPC payloads `sendParsedData(words, fullText, context, dom)` and `ichiConnectionError(fullText, context)`.

- [ ] **Step 1: Write failing DOM boundary tests**

Create fake document nodes with `.textContent` and `.innerHTML` and a fake `querySelectorAll`. Assert `collectIchiDomSnapshot(document)`:

- reads `.query-text` into an ordered string array;
- reads only `.word-chunk .jspPane` into ordered `{ text, html }` entries;
- preserves HTML verbatim;
- returns empty arrays when selectors match nothing; and
- never queries `html`, `body`, `script`, headers, cookies, or unrelated page nodes.

- [ ] **Step 2: Run the snapshot test to verify RED**

Run: `node --test test/analysis/ichi-dom-snapshot.test.js`

Expected: FAIL because the snapshot module does not exist.

- [ ] **Step 3: Implement the snapshot helper**

Export `collectIchiDomSnapshot(document)` from `src/analysis/ichi-dom-snapshot.js`. Use exactly the two approved selectors and copy `textContent` / `innerHTML` without normalization or sanitization.

- [ ] **Step 4: Preserve correlation across the hidden-window navigation**

In `src/boxes/ichi/script.js`, accept `(event, text, context)` on `parseWithIchi`, serialize the public context under the fixed session-storage key `japReaderIchiranAnalysisContext`, and then navigate using the unchanged `createIchiMoeUrl(text)`. On the result page, read the context, build the DOM snapshot before sending, and emit `sendParsedData` with `words`, `fullText`, `context`, and `{ dom: snapshot }`. Emit the same context on the timeout failure and remove the session value only after success or failure has been emitted. A storage or snapshot failure must not prevent the existing parsing result; omit diagnostic context/snapshot when unavailable.

- [ ] **Step 5: Record accepted, failed, and stale `ichi.moe` results**

Update `registerIchiAnalysisEvents` and the coordinator receive methods to accept the new payloads. For a matching request, record `provider.response_received` with the DOM payload, then `transformation.completed` with `{ words, fullText }` and duration before publishing to the Reader. Record `analysis.failed` with stage `provider` for a matching failure. For a mismatched request ID, record `analysis.discarded` against the returned context and do not publish it. Do not retry or call the API.

If diagnostic session storage is unavailable and the returned context is absent, retain the pre-feature compatibility check against the exact active `fullText`; publish that matching result without diagnostic records rather than breaking analysis. Never use this fallback when a non-matching request ID is present.

- [ ] **Step 6: Run all `ichi.moe` focused tests to verify GREEN**

Run: `node --test test/analysis/ichi-dom-snapshot.test.js test/analysis/analysis-source-coordinator.test.js test/analysis/electron-analysis-composition.test.js test/analysis/ichi-url.test.js`

Expected: all tests PASS, including the unchanged URL and UTF-16 routing boundary tests.

- [ ] **Step 7: Commit `ichi.moe` diagnostics**

```powershell
git add src/analysis/ichi-dom-snapshot.js src/boxes/ichi/script.js src/analysis/analysis-source-coordinator.js src/analysis/electron-analysis-composition.js test/analysis/ichi-dom-snapshot.test.js test/analysis/analysis-source-coordinator.test.js test/analysis/electron-analysis-composition.test.js
git commit -m "feat: capture correlated ichi.moe diagnostics"
```

### Task 4: Trace the clicked word and rendered dictionary HTML

**Files:**
- Create: `src/analysis/renderer-analysis-diagnostics.js`
- Create: `test/analysis/renderer-analysis-diagnostics.test.js`
- Modify: `src/boxes/reader/script.js`
- Modify: `src/boxes/dict/script.js`
- Modify: `src/analysis/electron-analysis-composition.js`
- Modify: `test/analysis/electron-analysis-composition.test.js`

**Interfaces:**
- Consumes from Tasks 2-3: public analysis context `{ requestId, provider, text }` received with parsed words.
- Produces `sendSelectedWord(ipcRenderer, context, wordIndex, wordData)` and `sendRenderedDictionary(ipcRenderer, selectionContext, html)`.
- Produces dedicated IPC events `analysisWordSelected(selectionContext, wordData)` and `analysisDictionaryRendered(selectionContext, html)`.

- [ ] **Step 1: Write failing renderer helper tests**

With a fake `ipcRenderer.send`, assert `sendSelectedWord`:

- creates `selectionContext` by adding `wordIndex` without mutating the analysis context;
- sends `analysisWordSelected` with the selection context and the exact word object reference;
- sends the existing `sendWordData` channel with the exact word object and selection context; and
- does not add `requestId`, `provider`, `text`, or `wordIndex` properties to `wordData`.

Assert `sendRenderedDictionary` sends `analysisDictionaryRendered` with the same selection context and the exact HTML string.

- [ ] **Step 2: Run the helper test to verify RED**

Run: `node --test test/analysis/renderer-analysis-diagnostics.test.js`

Expected: FAIL because the renderer helper does not exist.

- [ ] **Step 3: Implement renderer diagnostic helpers**

Export the two exact helper functions from `src/analysis/renderer-analysis-diagnostics.js`. They perform only IPC dispatch and return no value. If context is absent because diagnostics are disabled or unavailable, preserve the existing `sendWordData` behavior and emit no diagnostic channel.

- [ ] **Step 4: Use the helpers at the actual reader and dictionary boundaries**

In `src/boxes/reader/script.js`, retain the fourth `receiveParsedData` argument as the current analysis context. Change `handleWords` to keep each word's array index in its click closure and replace every direct `sendWordData` call with `sendSelectedWord`; do not change status transitions or the word object.

In `src/boxes/dict/script.js`, accept `selectionContext` as the additional `receiveWordData` argument. Immediately after `handleWordData(wordData)` has assigned `currentWordData.definitions` to `#dict`, call `sendRenderedDictionary` with `document.querySelector("#dict").innerHTML`. Keep translation, Anki, audio, and status behavior unchanged.

- [ ] **Step 5: Register and test main-process diagnostic IPC**

Export `registerReaderDictionaryDiagnosticEvents(ipcMain, diagnostics)` from `electron-analysis-composition.js`. It records:

- `word.selected` with common context fields, `wordIndex`, and `wordData`;
- `dictionary.rendered` with common context fields, `wordIndex`, and `html`.

Extend the composition test to emit both channels and assert the exact records. Include a word containing the current simplified API `definitions` HTML and assert it is preserved byte-for-byte.

- [ ] **Step 6: Run renderer and composition tests to verify GREEN**

Run: `node --test test/analysis/renderer-analysis-diagnostics.test.js test/analysis/electron-analysis-composition.test.js`

Expected: all tests PASS and the exact input `wordData` remains free of diagnostic properties.

- [ ] **Step 7: Commit click-to-render tracing**

```powershell
git add src/analysis/renderer-analysis-diagnostics.js src/boxes/reader/script.js src/boxes/dict/script.js src/analysis/electron-analysis-composition.js test/analysis/renderer-analysis-diagnostics.test.js test/analysis/electron-analysis-composition.test.js
git commit -m "feat: trace Ichiran dictionary rendering"
```

### Task 5: Expose the option and wire diagnostics into application lifecycle

**Files:**
- Modify: `src/tools.js`
- Modify: `src/boxes/options/index.html`
- Modify: `src/index.js`
- Modify: `test/options/analysis-source-options.test.js`
- Modify: `test/window-lifecycle.test.js`

**Interfaces:**
- Consumes from Task 1: `createAnalysisLogWriter` and its `close()` drain.
- Consumes from Tasks 2-4: `diagnostics` injection points and `registerReaderDictionaryDiagnosticEvents`.
- Produces persisted option `recordIchiranAnalysisDiagnostics: boolean`, default `false`.

- [ ] **Step 1: Write failing option tests**

Extend `analysis-source-options.test.js` to assert:

```js
schema.options.properties.recordIchiranAnalysisDiagnostics
// equals { default: false, type: "boolean" }
```

Assert the Analysis source section contains a checkbox and label `Record Ichiran analysis diagnostics`, and visible copy states that copied Japanese text and provider results are stored in the logs folder and may contain sensitive content. Keep the existing Open logs folder control unchanged.

- [ ] **Step 2: Write failing application wiring tests**

Extend the `window-lifecycle.test.js` module harness to replace `./analysis/analysis-log-writer` with a fake factory. Give the fake history store path `C:\\diagnostics\\logs\\history.json`. Assert:

- default options create the writer with `enabled: false`;
- enabling `recordIchiranAnalysisDiagnostics` creates it with `enabled: true` and `logsDirectory: "C:\\diagnostics\\logs"`;
- the same writer is passed to the API router, source coordinator, and reader/dictionary diagnostic registration;
- `sendWordData` still forwards the exact word object and now forwards selection context to `receiveWordData`; and
- `before-quit` disposes the API router and calls the writer's `close()` without surfacing a rejection.

- [ ] **Step 3: Run option and lifecycle tests to verify RED**

Run: `node --test test/options/analysis-source-options.test.js test/window-lifecycle.test.js`

Expected: FAIL because the option and application writer do not exist.

- [ ] **Step 4: Add the opt-in Options control**

Add `{ default: false, type: "boolean" }` for `recordIchiranAnalysisDiagnostics` in `src/tools.js`. Add the checkbox and warning copy under the existing Analysis source section in `src/boxes/options/index.html`. Rely on the existing generic Options load/save loop and Apply/restart behavior; do not add a second save path or a second logs-folder button.

- [ ] **Step 5: Instantiate and inject one writer in `index.js`**

Import `node:path`, `createAnalysisLogWriter`, and `registerReaderDictionaryDiagnosticEvents`. Read `recordIchiranAnalysisDiagnostics` with the existing options destructuring. Create exactly one writer using:

```js
createAnalysisLogWriter({
  enabled: recordIchiranAnalysisDiagnostics,
  logsDirectory: path.dirname(HISTORY.path),
});
```

Pass it as `diagnostics` to the API router and source coordinator and register the reader/dictionary diagnostic IPC once. Preserve selection context as the additional argument when forwarding `sendWordData` to the dictionary. On `before-quit`, keep router disposal and invoke `void diagnostics.close().catch(() => {})` as a best-effort drain; the writer already contains failures, and shutdown must continue.

- [ ] **Step 6: Run option and lifecycle tests to verify GREEN**

Run: `node --test test/options/analysis-source-options.test.js test/window-lifecycle.test.js`

Expected: all tests PASS with diagnostics disabled by default and no real file access from the test harness.

- [ ] **Step 7: Run the complete automated gate**

Run:

```powershell
node --version
node --test test/analysis/analysis-log-writer.test.js test/analysis/analysis-source-coordinator.test.js test/analysis/local-api-router.test.js test/analysis/ichi-dom-snapshot.test.js test/analysis/electron-analysis-composition.test.js test/analysis/renderer-analysis-diagnostics.test.js test/options/analysis-source-options.test.js test/window-lifecycle.test.js
cmd.exe /d /c npm.cmd test
./node_modules/.bin/prettier.cmd --check "src/**/*.js" "src/boxes/options/index.html" "test/**/*.js"
git diff --check
```

Expected: Node reports `v24.22.1`; focused tests and the complete suite pass with zero failures; Prettier reports all matched files formatted; `git diff --check` prints nothing.

- [ ] **Step 8: Commit application wiring**

```powershell
git add src/tools.js src/boxes/options/index.html src/index.js test/options/analysis-source-options.test.js test/window-lifecycle.test.js
git commit -m "feat: enable opt-in Ichiran diagnostics"
```

### Task 6: Validate the diagnostic evidence in Electron

**Files:**
- Verify only: `logs/ichiran-analysis.jsonl`
- Verify only: `logs/ichiran-analysis.previous.jsonl`

**Interfaces:**
- Consumes the complete implementation from Tasks 1-5.
- Produces manual evidence only; it must not change formatting in this task.

- [ ] **Step 1: Start the application with the required runtime**

Verify `node --version` is `v24.22.1`, start the local `ichiran-api`, enable `Record Ichiran analysis diagnostics`, apply Options, and launch japReader with `npm.cmd start`.

- [ ] **Step 2: Record the local API path**

Disable `Use ichi.moe for short text`, copy the approved short phrase containing `育った`, click that word, and confirm the dictionary still shows the current simplified API presentation.

- [ ] **Step 3: Record the `ichi.moe` path**

Enable `Use ichi.moe for short text`, apply/restart, copy the same phrase, click `育った`, and confirm the dictionary still shows the current richer `ichi.moe` presentation.

- [ ] **Step 4: Compare the correlated JSONL events**

For each request ID, verify the ordered evidence includes provider response, transformation, selected word, and rendered HTML. Confirm the API response contains `reading`, `conj[].prop`, dictionary-form `reading`, and `conj[].gloss`, while its transformed `definitions` is simplified. Confirm the `ichi.moe` DOM snapshot and transformed `definitions` retain inflected form, conjugation, dictionary form, and numbered gloss markup. Confirm the clicked object and rendered HTML match each provider's current UI.

- [ ] **Step 5: Exercise cancellation without changing formatting**

Copy two phrases rapidly and verify cancellation or stale discard is correlated without a reader error. Confirm the application continues analyzing normally; the 10 MB rotation boundary remains covered by the automated writer test rather than manufacturing a large live diagnostic file.

- [ ] **Step 6: Record verification status without changing product code**

Report automated and manual evidence separately. If Electron, `ichi.moe`, or the local API is unavailable, state exactly which manual checks remain pending; do not treat passing unit tests as live integration proof. No commit is required unless the user separately requests a durable verification report.
