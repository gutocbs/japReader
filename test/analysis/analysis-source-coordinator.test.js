const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createAnalysisSourceCoordinator,
} = require("../../src/analysis/analysis-source-coordinator");

const createHarness = (useIchiMoeForShortText) => {
  const apiTexts = [];
  const cancelled = [];
  const ichiTexts = [];
  const ichiSuccesses = [];
  const ichiFailures = [];
  const coordinator = createAnalysisSourceCoordinator({
    apiRouter: {
      analyze: (text) => apiTexts.push(text),
      cancel: () => cancelled.push(true),
    },
    onIchiFailure: () => ichiFailures.push(true),
    onIchiSuccess: (words, fullText) => ichiSuccesses.push({ words, fullText }),
    requestIchiAnalysis: (text) => ichiTexts.push(text),
    useIchiMoeForShortText,
  });

  return {
    apiTexts,
    cancelled,
    coordinator,
    ichiFailures,
    ichiSuccesses,
    ichiTexts,
  };
};

test("disabled source selection routes short and long text only to the local API", () => {
  const { apiTexts, cancelled, coordinator, ichiTexts } = createHarness(false);

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

test("enabled source selection uses the JavaScript UTF-16 boundary", () => {
  const { apiTexts, coordinator, ichiTexts } = createHarness(true);
  const eightyNineCodeUnits = "😀".repeat(44) + "a";
  const ninetyCodeUnits = "😀".repeat(45);

  coordinator.analyze(eightyNineCodeUnits);
  coordinator.analyze(ninetyCodeUnits);

  assert.equal(eightyNineCodeUnits.length, 89);
  assert.equal(ninetyCodeUnits.length, 90);
  assert.deepEqual(ichiTexts, [eightyNineCodeUnits]);
  assert.deepEqual(apiTexts, [ninetyCodeUnits]);
});

test("switching from API to ichi cancels local work without publishing a local error", () => {
  const { cancelled, coordinator, ichiTexts } = createHarness(true);

  coordinator.analyze("a".repeat(90));
  coordinator.analyze("a".repeat(89));

  assert.deepEqual(cancelled, [true]);
  assert.deepEqual(ichiTexts, ["a".repeat(89)]);
});

test("switching from ichi to API suppresses late ichi success and failure", () => {
  const { apiTexts, coordinator, ichiFailures, ichiSuccesses } =
    createHarness(true);

  coordinator.analyze("a".repeat(89));
  coordinator.analyze("a".repeat(90));
  coordinator.receiveIchiResult(["stale"], "a".repeat(89));
  coordinator.receiveIchiFailure();

  assert.deepEqual(apiTexts, ["a".repeat(90)]);
  assert.deepEqual(ichiSuccesses, []);
  assert.deepEqual(ichiFailures, []);
});

test("only publishes an ichi result for the exact latest submitted text", () => {
  const { coordinator, ichiSuccesses } = createHarness(true);

  coordinator.analyze("first");
  coordinator.analyze("second");
  coordinator.receiveIchiResult(["first"], "first");
  coordinator.receiveIchiResult(["wrong"], "different");
  coordinator.receiveIchiResult(["second"], "second");

  assert.deepEqual(ichiSuccesses, [{ words: ["second"], fullText: "second" }]);
});

test("only publishes an ichi failure for the exact latest submitted text", () => {
  const { coordinator, ichiFailures } = createHarness(true);

  coordinator.analyze("first");
  coordinator.analyze("second");
  coordinator.receiveIchiFailure("first");
  coordinator.receiveIchiFailure("second");

  assert.deepEqual(ichiFailures, [true]);
});

test("ichi failures never retry or fall back to the local API", () => {
  const { apiTexts, coordinator, ichiFailures, ichiTexts } =
    createHarness(true);

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
