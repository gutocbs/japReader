# Ichiran Analysis Diagnostics Design

## Objective

Add an opt-in diagnostic log to japReader that records the complete Ichiran
analysis lifecycle for both the local `ichiran-api` route and the optional
`ichi.moe` scraping route. The log must make it possible to compare the raw
provider data, the transformed reader word objects, the word selected by the
user, and the HTML finally rendered in the dictionary window.

This increment is diagnostic only. It must identify where the two routes begin
to format equivalent Ichiran data differently without changing the current
reader or dictionary output. Aligning the API-produced dictionary display with
the `ichi.moe` display is a separate follow-up change.

## Confirmed Formatting Difference

The two routes currently create the `definitions` field differently:

- The `ichi.moe` scraper copies the relevant word block's `innerHTML`. That HTML
  retains the inflected form and reading, conjugation properties, dictionary
  form and reading, and numbered gloss markup.
- `api-result-adapter.js` extracts the dictionary form and reading, then formats
  only a gloss array into a simplified definition fragment. Although the API
  response contains fields such as `reading`, `conj[].prop`, the conjugation's
  dictionary-form `reading`, and `conj[].gloss`, not all of them are represented
  in `definitions`.
- The dictionary renderer does not reconstruct either representation. It places
  `currentWordData.definitions` directly into `#dict`.

For example, an API candidate for `育った` contains its inflected reading,
`v5t` / `Past (~ta)` conjugation metadata, the dictionary form `育つ 【そだつ】`,
and its gloss. The current adapter retains the dictionary form fields and gloss
but omits the richer conjugation presentation from `definitions`.

## Scope

### In scope

- Local API analyses and optional `ichi.moe` analyses initiated from accepted
  clipboard text.
- Provider selection, start, raw relevant response, transformation, success,
  failure, cancellation, and stale-result rejection.
- The selected word object sent after a reader click.
- The final HTML inserted into the dictionary's `#dict` element.
- An opt-in Options setting, JSONL persistence, bounded rotation, and access
  through the existing Open logs folder action.
- Automated coverage of the logging boundaries and a manual comparison of the
  same phrase through both providers.

### Out of scope

- Changing API, scraper, reader, or dictionary formatting.
- Running both providers automatically for one clipboard value.
- A diagnostic viewer or comparison UI.
- DeepL, AnkiConnect, audio, external searches, or other network activity.
- Full `ichi.moe` page HTML, scripts, cookies, request headers, response headers,
  and API Problem Details response bodies.
- Automatic deletion of diagnostic files when logging is disabled.

## Architecture

The main process owns a single analysis diagnostic writer. The source
coordinator creates a unique request identifier for every accepted analysis,
selects the provider, and propagates the diagnostic context through the
existing internal analysis flow.

```text
clipboardChanged(text)
  -> AnalysisSourceCoordinator
       -> create requestId and record selected provider
       -> LocalApiRouter
            -> raw API JSON
            -> ApiResultAdapter
            -> transformed reader result
       or
       -> hidden ichi.moe BrowserWindow
            -> relevant DOM snapshot
            -> scraper-produced reader result
       -> accept or reject provider result
  -> Reader
       -> selected wordData
  -> Dictionary
       -> final #dict HTML
```

Add `src/analysis/analysis-log-writer.js` as the only component that creates,
rotates, or appends to diagnostic files. Analysis modules and renderer scripts
emit structured diagnostic events; they do not write files themselves. The
writer is injected from `index.js` and is inert when diagnostics are disabled.

The internal correlation context includes at least `requestId`, `provider`, and
the submitted text. The `ichi.moe` request identifier must survive the page
navigation and return with the scraper IPC payload, so consecutive requests for
the same text remain distinguishable. A session-scoped value in the hidden
window is sufficient; it must not be sent as part of the query to `ichi.moe`.

The reader receives diagnostic metadata alongside the existing IPC arguments,
not by changing the public word-object fields. It uses that metadata to emit a
`word.selected` event containing the word index and the actual `wordData` sent
to the dictionary. The dictionary then reports the applied `#dict` HTML with
the same correlation data. Existing reader word fields and consumers remain
unchanged.

## Configuration and Files

Add a boolean option named `recordIchiranAnalysisDiagnostics` to the existing
options schema. It defaults to `false` and appears in the Analysis source group
with a warning that copied Japanese text and provider results may be sensitive.
It follows the existing Apply-and-restart behavior.

When enabled, the writer uses the existing japReader logs directory:

```text
logs/
  ichiran-analysis.jsonl
  ichiran-analysis.previous.jsonl
```

The existing Open logs folder action is the only file-access UI. Disabling the
option stops new records but does not delete either file.

Before appending a line, the writer checks whether its UTF-8 bytes would make
the current file exceed 10 MB. If so, it removes only the exact previous path,
renames the exact current path to the previous path, and starts a new current
file. Writes are serialized so rotation and append operations cannot reorder or
interleave lines. Only these two diagnostic files are managed.

## JSONL Event Contract

Each line is one independently understandable JSON object. Common fields are:

```json
{
  "schemaVersion": 1,
  "timestamp": "2026-11-20T18:42:31.123Z",
  "requestId": "uuid",
  "event": "analysis.started",
  "provider": "api",
  "text": "解析する文章"
}
```

Every event includes `requestId`, `provider`, and `text` so manual inspection
does not depend on joining incomplete lines. Event-specific fields are added as
described below.

### Lifecycle events

- `analysis.started`: provider selection and analysis start.
- `provider.response_received`: the raw relevant provider response.
- `transformation.completed`: the reader result produced by the adapter or
  scraper.
- `word.selected`: selected word index and the actual clicked `wordData`.
- `dictionary.rendered`: the final HTML present in `#dict` after applying
  `wordData.definitions`.
- `dictionary.renderFailed`: a dictionary-rendering exception, recorded with
  its name and message after `word.selected` when rendering cannot complete.
- `analysis.failed`: failure stage, safe failure code, optional HTTP status, and
  elapsed duration.
- `analysis.cancelled`: cancellation caused by a newer accepted clipboard
  value, including elapsed duration.
- `analysis.discarded`: a provider result received but rejected as stale,
  including elapsed duration.

Successful and terminal lifecycle records include `durationMs` where the value
is meaningful. Timestamps are UTC ISO 8601 strings and durations use a monotonic
clock.

### Local API response

A successful `provider.response_received` event contains:

```json
{
  "httpStatus": 200,
  "response": {}
}
```

The response is the parsed JSON before `adaptAnalyzeResponse` changes it. The
subsequent `transformation.completed` event contains the complete `{ words,
fullText }` reader result. HTTP failures record the status and mapped safe
failure code, but do not read or log the Problem Details body. Headers, raw
errors, and stacks are excluded. Dictionary rendering failures instead record
only a structured exception name and message; they do not record raw error
objects or stacks.

### `ichi.moe` response

The relevant DOM snapshot contains:

```json
{
  "dom": {
    "queryText": ["解析する文章"],
    "wordChunks": [
      {
        "text": "解析",
        "html": "<div>...</div>"
      }
    ]
  }
}
```

`queryText` is collected from `.query-text`. Each word chunk corresponds to a
`.word-chunk .jspPane` element and includes its `textContent` and unmodified
`innerHTML`. The subsequent `transformation.completed` event contains the
scraper-produced `{ words, fullText }` result. No full-page HTML is captured.

## Failure and Shutdown Behavior

Diagnostic failure must never block, fail, retry, or change an analysis. Folder
creation, serialization, rotation, and append errors are contained by the
writer. It may emit one content-free technical console warning for a consecutive
failure sequence; another warning is permitted only after an intervening
successful write.

Normal shutdown makes a best effort to finish queued writes. A forced exit or
process crash may lose only events that have not reached the file. The writer
must not alter options, history, or unrelated log files.

Analysis cancellation and latest-request-wins behavior remain unchanged.
Diagnostic transport must not turn a stale result into an accepted result or
expose diagnostic failures in the Reader UI.

## Verification

### Automated tests

The diagnostic writer tests must prove that it:

- creates no file while disabled;
- emits one valid JSON object per line with the required common fields;
- preserves event order;
- rotates before an append would cross 10 MB;
- retains only the current and previous files; and
- contains file and serialization failures without throwing to the caller.

Coordinator and router tests must prove that they:

- record the selected provider and keep one request identifier through the
  lifecycle;
- record replacement, cancellation, accepted results, and stale results;
- distinguish consecutive requests containing identical text;
- record the local API JSON before adaptation and the transformed result after
  adaptation; and
- record HTTP failure status and safe code without a response body.

Scraper and Electron composition coverage must prove that they:

- collect only `.query-text` and `.word-chunk .jspPane` diagnostic data;
- preserve both `textContent` and `innerHTML`;
- return the same request identifier with the DOM snapshot and extracted result;
- record the selected word with provider, index, and correlation data; and
- record the final dictionary HTML without changing renderer behavior.

Run focused analysis and diagnostic tests, then the complete suite with
`npm.cmd test` under Node.js 24.22.1. Run Prettier checks for changed files and
`git diff --check`. Automated renderer tests do not replace the manual Electron
validation below.

### Manual validation

Analyze the same short phrase once through the local API and once through the
enabled `ichi.moe` short-text route. For `育った`, verify that the JSONL shows:

1. the API response contains the inflected reading, `conj[].prop`, dictionary
   form reading, and gloss;
2. the current API adapter's `definitions` contains only the simplified
   definition presentation;
3. the `ichi.moe` DOM snapshot contains the inflected form, conjugation,
   dictionary form, and numbered gloss presentation;
4. the clicked `wordData` matches the transformation produced by its provider;
   and
5. the final dictionary HTML matches the corresponding current UI display.

The increment succeeds when the diagnostic file identifies the exact stage at
which each field is retained or omitted without changing either provider's
visible output.

## Follow-up Boundary

After this diagnostic increment is implemented and manually validated, use its
evidence to design the smallest adapter-side change that makes API dictionary
output match the `ichi.moe` output. That formatting correction requires its own
approval and is not authorized by this specification.
