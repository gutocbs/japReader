const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_ICHIRAN_API_BASE_URL,
  normalizeIchiranApiBaseUrl,
  resolveIchiranApiEndpoint,
} = require("../../src/analysis/ichiran-api-url");

test("normalizes supported Ichiran API origins", () => {
  assert.equal(DEFAULT_ICHIRAN_API_BASE_URL, "http://127.0.0.1:18080");
  assert.equal(
    normalizeIchiranApiBaseUrl("https://api.example.test:19090/"),
    "https://api.example.test:19090",
  );
  assert.equal(
    normalizeIchiranApiBaseUrl("http://127.0.0.1:18080"),
    "http://127.0.0.1:18080",
  );
  assert.equal(
    normalizeIchiranApiBaseUrl("http://[::1]:18080/"),
    "http://[::1]:18080",
  );
});

test("rejects Ichiran API URLs that are not origins", () => {
  for (const value of [
    "",
    "api.example.test",
    "ftp://api.example.test",
    "https://user:password@api.example.test",
    "https://api.example.test/analyze",
    "https://api.example.test?",
    "https://api.example.test#",
    "https://api.example.test/?",
    "https://api.example.test/#",
    "https://api.example.test/?debug=true",
    "https://api.example.test/#fragment",
  ]) {
    assert.throws(() => normalizeIchiranApiBaseUrl(value));
  }
});

test("resolves a normalized origin to the analyze endpoint", () => {
  assert.equal(
    resolveIchiranApiEndpoint("https://api.example.test:19090/"),
    "https://api.example.test:19090/analyze",
  );
});

test("falls back without exposing an invalid configured URL", () => {
  const warnings = [];

  assert.equal(
    resolveIchiranApiEndpoint(
      "https://user:secret@api.example.test/analyze?token=top-secret",
      (message) => warnings.push(message),
    ),
    "http://127.0.0.1:18080/analyze",
  );
  assert.deepEqual(warnings, [
    "Invalid Ichiran API base URL; using the default.",
  ]);
});
