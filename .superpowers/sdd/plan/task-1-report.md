# Task 1 Report: Adapt Equivalent Digit Forms

## Files changed

- `src/analysis/api-result-adapter.js`
- `test/analysis/api-result-adapter.test.js`
- `.superpowers/sdd/plan/task-1-report.md`

## RED evidence

1. Added the full-width submitted-text regression with an otherwise valid API
   response containing ASCII `10分` in the top-level text, chunk text, and
   first lexical candidate.
2. Ran Node 24.22.1:

   ```powershell
   & 'C:\Users\gutoc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test test\analysis\api-result-adapter.test.js
   ```

   Result: 7 passed, 1 failed. The new test threw
   `ApiResponseValidationError` at the adapter's exact top-level text
   comparison.

3. During self-review, added the contract-preservation test for a non-string
   top-level response text. Before its type guard, it failed as expected with
   `TypeError: Cannot read properties of null (reading 'replace')` rather than
   `ApiResponseValidationError`.

## Implementation

- Added a narrowly scoped comparison that maps only Unicode full-width ASCII
  digits (`０` through `９`) to ASCII digits before comparing API and submitted
  text.
- Used that comparison for top-level text, chunk text, and lexical-candidate
  alignment.
- Kept reader surfaces sourced from the submitted text, so the emitted word is
  `１０分`, while dictionary form and readings remain the API's canonical
  values.
- Added a response-text type guard before normalization to preserve malformed
  envelope validation behavior.

## GREEN evidence

All commands used Node 24.22.1.

```powershell
& $node24 --test test\analysis\api-result-adapter.test.js
```

Result: 9 passed, 0 failed.

```powershell
& $node24 --test
```

Result: 86 passed, 0 failed.

```powershell
& $node24 'node_modules\prettier\bin\prettier.cjs' --check src\analysis\api-result-adapter.js test\analysis\api-result-adapter.test.js
git diff --check
```

Result: Prettier reported all matched files use its code style; `git diff
--check` reported no whitespace errors.

## Self-review

- Normalization is limited to `０-９`; no punctuation, kana, kanji, whitespace,
  or other Unicode forms are normalized.
- Non-digit equal-length changes remain rejected by the focused regression
  test.
- Existing dictionary values, readings, definitions, word order, and
  punctuation behavior remain covered by the prior adapter tests; the new
  regression asserts the required full-width surface and canonical API values.
- No router, UI, formatter, dependency, or packaging files changed.
- `AGENTS.md` remains an untracked user file and is intentionally excluded
  from staging and the commit.

## Commit

- `f072a3c fix: accept normalized digits from local API` (implementation and
  regression tests)

## Concerns

None. The test runner's ambient `node` command is Node 26.5.0, so each
verification command explicitly used the available Node 24.22.1 runtime.
