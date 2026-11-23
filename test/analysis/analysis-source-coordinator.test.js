const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createAnalysisSourceCoordinator,
} = require("../../src/analysis/analysis-source-coordinator");

const createHarness = ({
  useIchiranApi = true,
  useIchiMoeForShortText = false,
} = {}) => {
  const apiTexts = [];
  const cancelled = [];
  const ichiTexts = [];
  const ichiSuccesses = [];
  const ichiFailures = [];
  const ichiInputTooLarge = [];
  const coordinator = createAnalysisSourceCoordinator({
    apiRouter: {
      analyze: (text) => apiTexts.push(text),
      cancel: () => cancelled.push(true),
    },
    onIchiFailure: () => ichiFailures.push(true),
    onIchiInputTooLarge: () => ichiInputTooLarge.push(true),
    onIchiSuccess: (words, fullText) => ichiSuccesses.push({ words, fullText }),
    requestIchiAnalysis: (text) => ichiTexts.push(text),
    useIchiMoeForShortText,
    useIchiranApi,
  });

  return {
    apiTexts,
    cancelled,
    coordinator,
    ichiFailures,
    ichiInputTooLarge,
    ichiSuccesses,
    ichiTexts,
  };
};

test("API-only mode routes short and long text only to the local API", () => {
  const { apiTexts, cancelled, coordinator, ichiTexts } = createHarness({
    useIchiranApi: true,
  });

  coordinator.analyze("a".repeat(89));
  coordinator.analyze("a".repeat(90));

  assert.deepEqual(apiTexts, ["a".repeat(89), "a".repeat(90)]);
  assert.deepEqual(ichiTexts, []);
  assert.deepEqual(cancelled, []);
});

test("records the selected provider with a unique correlation context", () => {
  const events = [];
  const contexts = [];
  let sequence = 0;
  const coordinator = createAnalysisSourceCoordinator({
    apiRouter: {
      analyze: (text, context) => contexts.push({ text, context }),
      cancel: () => {},
    },
    createRequestId: () => `request-${++sequence}`,
    diagnostics: { record: (entry) => events.push(entry) },
    now: () => 42,
    useIchiranApi: true,
    useIchiMoeForShortText: false,
  });

  coordinator.analyze("same");
  coordinator.analyze("same");

  assert.deepEqual(contexts, [
    {
      text: "same",
      context: {
        provider: "api",
        requestId: "request-1",
        startedAt: 42,
        text: "same",
      },
    },
    {
      text: "same",
      context: {
        provider: "api",
        requestId: "request-2",
        startedAt: 42,
        text: "same",
      },
    },
  ]);
  assert.deepEqual(events, [
    {
      event: "analysis.started",
      provider: "api",
      requestId: "request-1",
      text: "same",
    },
    {
      event: "analysis.started",
      provider: "api",
      requestId: "request-2",
      text: "same",
    },
  ]);
});

test("hybrid mode uses ichi below the JavaScript UTF-16 boundary", () => {
  const { apiTexts, coordinator, ichiTexts } = createHarness({
    useIchiranApi: true,
    useIchiMoeForShortText: true,
  });
  const eightyNineCodeUnits = "😀".repeat(44) + "a";
  const ninetyCodeUnits = "😀".repeat(45);

  coordinator.analyze(eightyNineCodeUnits);
  coordinator.analyze(ninetyCodeUnits);

  assert.equal(eightyNineCodeUnits.length, 89);
  assert.equal(ninetyCodeUnits.length, 90);
  assert.deepEqual(ichiTexts, [eightyNineCodeUnits]);
  assert.deepEqual(apiTexts, [ninetyCodeUnits]);
});

test("ichi-only mode rejects long text at the JavaScript UTF-16 boundary", () => {
  const { apiTexts, cancelled, coordinator, ichiInputTooLarge, ichiTexts } =
    createHarness({ useIchiranApi: false });
  coordinator.analyze("a".repeat(89));
  cancelled.length = 0;
  coordinator.analyze("a".repeat(90));

  assert.deepEqual(ichiTexts, ["a".repeat(89)]);
  assert.deepEqual(apiTexts, []);
  assert.deepEqual(cancelled, [true]);
  assert.deepEqual(ichiInputTooLarge, [true]);
});

test("ichi-only rejection records a bounded policy failure", () => {
  const events = [];
  const coordinator = createAnalysisSourceCoordinator({
    apiRouter: { analyze: () => {}, cancel: () => {} },
    createRequestId: () => "request-1",
    diagnostics: { record: (entry) => events.push(entry) },
    now: () => 10,
    onIchiInputTooLarge: () => {},
    useIchiranApi: false,
    useIchiMoeForShortText: false,
  });

  coordinator.analyze("a".repeat(90));

  assert.deepEqual(events, [
    {
      event: "analysis.started",
      provider: "ichi",
      requestId: "request-1",
      text: "a".repeat(90),
    },
    {
      code: "inputTooLarge",
      durationMs: 0,
      event: "analysis.failed",
      provider: "ichi",
      requestId: "request-1",
      stage: "policy",
      startedAt: 10,
      text: "a".repeat(90),
    },
  ]);
});

test("switching from API to ichi cancels local work without publishing a local error", () => {
  const { cancelled, coordinator, ichiTexts } = createHarness({
    useIchiranApi: true,
    useIchiMoeForShortText: true,
  });

  coordinator.analyze("a".repeat(90));
  coordinator.analyze("a".repeat(89));

  assert.deepEqual(cancelled, [true]);
  assert.deepEqual(ichiTexts, ["a".repeat(89)]);
});

test("switching from ichi to API suppresses late ichi success and failure", () => {
  const { apiTexts, coordinator, ichiFailures, ichiSuccesses } = createHarness({
    useIchiranApi: true,
    useIchiMoeForShortText: true,
  });

  coordinator.analyze("a".repeat(89));
  coordinator.analyze("a".repeat(90));
  coordinator.receiveIchiResult(["stale"], "a".repeat(89));
  coordinator.receiveIchiFailure();

  assert.deepEqual(apiTexts, ["a".repeat(90)]);
  assert.deepEqual(ichiSuccesses, []);
  assert.deepEqual(ichiFailures, []);
});

test("only publishes an ichi result for the exact latest submitted text", () => {
  const { coordinator, ichiSuccesses } = createHarness({
    useIchiranApi: true,
    useIchiMoeForShortText: true,
  });

  coordinator.analyze("first");
  coordinator.analyze("second");
  coordinator.receiveIchiResult(["first"], "first");
  coordinator.receiveIchiResult(["wrong"], "different");
  coordinator.receiveIchiResult(["second"], "second");

  assert.deepEqual(ichiSuccesses, [{ words: ["second"], fullText: "second" }]);
});

test("only publishes an ichi failure for the exact latest submitted text", () => {
  const { coordinator, ichiFailures } = createHarness({
    useIchiranApi: true,
    useIchiMoeForShortText: true,
  });

  coordinator.analyze("first");
  coordinator.analyze("second");
  coordinator.receiveIchiFailure("first");
  coordinator.receiveIchiFailure("second");

  assert.deepEqual(ichiFailures, [true]);
});

test("ichi failures never retry or fall back to the local API", () => {
  const { apiTexts, coordinator, ichiFailures, ichiTexts } = createHarness({
    useIchiranApi: true,
    useIchiMoeForShortText: true,
  });

  coordinator.analyze("short");
  coordinator.receiveIchiFailure("short");

  assert.deepEqual(ichiTexts, ["short"]);
  assert.deepEqual(ichiFailures, [true]);
  assert.deepEqual(apiTexts, []);
});

test("records matching ichi DOM input and transformed reader result", () => {
  const events = [];
  let requestedContext;
  const coordinator = createAnalysisSourceCoordinator({
    apiRouter: { analyze: () => {}, cancel: () => {} },
    createRequestId: () => "request-ichi",
    diagnostics: { record: (entry) => events.push(entry) },
    now: () => 10,
    onIchiSuccess: () => {},
    requestIchiAnalysis: (text, context) => {
      requestedContext = context;
    },
    useIchiMoeForShortText: true,
    useIchiranApi: true,
  });

  coordinator.analyze("育った");
  coordinator.receiveIchiResult(["育った"], "育った", requestedContext, {
    dom: { queryText: ["育った"], wordChunks: [] },
  });

  assert.deepEqual(events.slice(1), [
    {
      ...requestedContext,
      event: "provider.response_received",
      dom: { queryText: ["育った"], wordChunks: [] },
    },
    {
      ...requestedContext,
      durationMs: 0,
      event: "transformation.completed",
      readerResult: { fullText: "育った", words: ["育った"] },
    },
  ]);
});

test("does not cancel an ichi request that has already completed", () => {
  const events = [];
  const contexts = [];
  let sequence = 0;
  const coordinator = createAnalysisSourceCoordinator({
    apiRouter: { analyze: () => {}, cancel: () => {} },
    createRequestId: () => `request-${++sequence}`,
    diagnostics: { record: (entry) => events.push(entry) },
    now: () => 10,
    onIchiFailure: () => {},
    onIchiSuccess: () => {},
    requestIchiAnalysis: (text, context) => contexts.push(context),
    useIchiMoeForShortText: true,
    useIchiranApi: true,
  });

  coordinator.analyze("first");
  coordinator.receiveIchiResult([], "first", contexts[0], { dom: {} });
  coordinator.analyze("second");

  assert.equal(
    events.some(
      (entry) =>
        entry.event === "analysis.cancelled" && entry.requestId === "request-1",
    ),
    false,
  );
});

test("records a discarded stale ichi failure", () => {
  const events = [];
  const contexts = [];
  let sequence = 0;
  const coordinator = createAnalysisSourceCoordinator({
    apiRouter: { analyze: () => {}, cancel: () => {} },
    createRequestId: () => `request-${++sequence}`,
    diagnostics: { record: (entry) => events.push(entry) },
    now: () => 10,
    onIchiFailure: () => {},
    onIchiSuccess: () => {},
    requestIchiAnalysis: (text, context) => contexts.push(context),
    useIchiMoeForShortText: true,
    useIchiranApi: true,
  });

  coordinator.analyze("first");
  coordinator.analyze("second");
  coordinator.receiveIchiFailure("first", contexts[0]);

  assert.deepEqual(events.at(-1), {
    ...contexts[0],
    durationMs: 0,
    event: "analysis.discarded",
  });
});

test("a blocked ichi-only request invalidates a pending ichi result and failure", () => {
  const { cancelled, coordinator, ichiFailures, ichiSuccesses } = createHarness(
    { useIchiranApi: false },
  );

  coordinator.analyze("short");
  cancelled.length = 0;
  coordinator.analyze("a".repeat(90));
  coordinator.receiveIchiResult(["stale"], "short");
  coordinator.receiveIchiFailure("short");

  assert.deepEqual(cancelled, [true]);
  assert.deepEqual(ichiSuccesses, []);
  assert.deepEqual(ichiFailures, []);
});
