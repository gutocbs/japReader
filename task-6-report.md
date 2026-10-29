# Task 6 report

## RED (inherited)

The focused lifecycle test was run against the pre-fix implementation and
failed on the expected behavioral assertion: a hidden maximized Options window
had `maximizeCalls === 1` during creation, while the requirement is zero until
the explicit `openOptions` action. The visible maximized Reader assertion was
preserved as the control case.

## GREEN

The narrow fix defers `maximize()` for a restored maximized window whose
configuration has `show: false` by registering one `show` listener. Visible
windows still maximize immediately. The focused test verifies both paths and
the explicit `openOptions` flow.

Commands and results:

- Node 24.22.1 focused test: `1` passed, `0` failed.
- Node 24.22.1 source-tree suite (`test/*.test.js`): `1` passed, `0` failed.
- Prettier check for `src/index.js` and `test/window-lifecycle.test.js`: all
  matched code style.
- `git diff --check`: passed with no diagnostics.
- Bounded Electron startup with Node 24.22.1: process started for 8 seconds
  and was stopped. The available process inspection exposed only the Node
  host window handle, not a reliable Options-window visibility state.

## Runtime/manual check

Automated startup proves process launch only. Manual check remains required:
start the app with persisted `window_settings.options.isMaximized = true`,
confirm Options is not visible before the shortcut/IPC `openOptions` action,
then invoke that action and confirm Options appears maximized. Also confirm
`hideOptions` hides it again.

## Changed files

- `src/index.js`: defer hidden restored maximization until `show`.
- `test/window-lifecycle.test.js`: isolated fake Electron lifecycle regression
  test, with `Module._load` restoration and entrypoint cache cleanup.
- `task-6-report.md`: this evidence report.

## Concern

The runtime UI state could not be inspected reliably from the bounded startup
process in this environment; no success is inferred from process launch.
