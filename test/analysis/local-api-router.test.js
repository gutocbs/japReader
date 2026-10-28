const assert = require("node:assert/strict");
const test = require("node:test");

const { createLocalApiRouter } = require("../../src/analysis/local-api-router");

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

const successfulResponse = (body) => ({
  status: 200,
  json: async () => body,
});

const createHarness = (overrides = {}) => {
  const calls = [];
  const successes = [];
  const failures = [];
  const fetchImpl = overrides.fetchImpl || ((url, options) => {
    const request = deferred();
    calls.push({ ...request, options, url });
    return request.promise;
  });
  const adaptResponse =
    overrides.adaptResponse || ((response, text) => ({ words: response.words, fullText: text }));
  const router = createLocalApiRouter({
    adaptResponse,
    fetchImpl,
    onFailure: (code) => failures.push(code),
    onSuccess: (result) => successes.push(result),
    ...overrides,
  });

  return { calls, failures, router, successes };
};

test("posts the submitted text to the fixed local endpoint and publishes adapted data", async () => {
  const { calls, router, successes } = createHarness();

  router.analyze("猫です");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8080/analyze");
  assert.deepEqual(calls[0].options, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"text":"猫です"}',
    signal: calls[0].options.signal,
  });

  calls[0].resolve(successfulResponse({ words: ["adapted"] }));
  await flush();
  await flush();

  assert.deepEqual(successes, [{ words: ["adapted"], fullText: "猫です" }]);
});

test("uses the reader callback contract for successful and failed analyses", async (t) => {
  const readerWords = [{ word: "猫", rubyReading: "ねこ" }];
  const acceptedFailureCodes = new Set([
    "unavailable",
    "temporarilyUnavailable",
    "timeout",
    "inputTooLarge",
    "analysisFailed",
    "unexpected",
  ]);

  await t.test("publishes the exact reader result shape on success", async () => {
    const { calls, router, successes } = createHarness({
      adaptResponse: () => ({ words: readerWords, fullText: "猫です" }),
    });

    router.analyze("猫です");
    calls[0].resolve(successfulResponse({ ignored: true }));
    await flush();
    await flush();

    assert.deepEqual(successes, [{ words: readerWords, fullText: "猫です" }]);
  });

  const failures = [
    ["unavailable", (request) => request.reject(new Error("connection refused"))],
    ["temporarilyUnavailable", (request) => request.resolve({ status: 503 })],
    ["timeout", (request) => request.resolve({ status: 504 })],
    ["inputTooLarge", (request) => request.resolve({ status: 413 })],
    ["analysisFailed", (request) => request.resolve({ status: 502 })],
    ["unexpected", (request) => request.resolve({ status: 418 })],
  ];

  for (const [expectedCode, completeRequest] of failures) {
    await t.test(`publishes only the ${expectedCode} failure code`, async () => {
      const { calls, failures: receivedCodes, router } = createHarness();

      router.analyze("猫です");
      completeRequest(calls[0]);
      await flush();

      assert.deepEqual(receivedCodes, [expectedCode]);
      assert.equal(acceptedFailureCodes.has(receivedCodes[0]), true);
    });
  }
});

test("aborts the prior request and only publishes the latest successful analysis", async () => {
  const { calls, router, successes } = createHarness();

  router.analyze("first");
  router.analyze("second");

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.signal.aborted, true);
  assert.equal(calls[1].options.signal.aborted, false);

  calls[0].resolve(successfulResponse({ words: ["stale"] }));
  calls[1].resolve(successfulResponse({ words: ["fresh"] }));
  await flush();
  await flush();

  assert.deepEqual(successes, [{ words: ["fresh"], fullText: "second" }]);
});

test("keeps superseded aborts silent", async () => {
  const { calls, failures, router } = createHarness();

  router.analyze("old");
  router.analyze("new");
  calls[0].reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
  await flush();

  assert.deepEqual(failures, []);
});

test("maps HTTP failures without reading response bodies", async (t) => {
  const cases = [
    [413, "inputTooLarge"],
    [502, "analysisFailed"],
    [503, "temporarilyUnavailable"],
    [504, "timeout"],
    [418, "unexpected"],
  ];

  for (const [status, expectedCode] of cases) {
    await t.test(`maps ${status} to ${expectedCode}`, async () => {
      let bodyRead = false;
      const { calls, failures, router } = createHarness();

      router.analyze("猫");
      calls[0].resolve({
        status,
        json: async () => {
          bodyRead = true;
          return { secret: "do not read" };
        },
      });
      await flush();

      assert.deepEqual(failures, [expectedCode]);
      assert.equal(bodyRead, false);
    });
  }
});

test("maps a rejected fetch to unavailable without another request", async () => {
  const { calls, failures, router } = createHarness();

  router.analyze("猫");
  calls[0].reject(new Error("connection refused"));
  await flush();

  assert.deepEqual(failures, ["unavailable"]);
  assert.equal(calls.length, 1);
});

test("dispose aborts active work and suppresses late results and future callbacks", async () => {
  const { calls, failures, router, successes } = createHarness();

  router.analyze("before dispose");
  router.dispose();
  assert.equal(calls[0].options.signal.aborted, true);

  calls[0].resolve(successfulResponse({ words: ["late"] }));
  await flush();
  await flush();
  router.analyze("after dispose");

  assert.deepEqual(successes, []);
  assert.deepEqual(failures, []);
  assert.equal(calls.length, 1);
});
