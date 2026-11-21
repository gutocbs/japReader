const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createAnalysisLogWriter,
} = require("../../src/analysis/analysis-log-writer");

const createDirectory = async () =>
  fs.mkdtemp(path.join(os.tmpdir(), "japreader-analysis-log-"));

const event = (overrides = {}) => ({
  event: "analysis.started",
  provider: "api",
  requestId: "request-1",
  text: "猫です",
  ...overrides,
});

test("disabled writer creates no directory or file", async () => {
  const logsDirectory = path.join(await createDirectory(), "logs");
  const writer = createAnalysisLogWriter({ enabled: false, logsDirectory });

  writer.record(event());
  await writer.close();

  await assert.rejects(fs.access(logsDirectory), { code: "ENOENT" });
});

test("record appends ordered JSONL with fixed schema and timestamp", async () => {
  const logsDirectory = await createDirectory();
  const writer = createAnalysisLogWriter({
    enabled: true,
    logsDirectory,
    now: () => "2026-11-20T18:42:31.123Z",
  });

  writer.record(event());
  writer.record(event({ event: "analysis.succeeded", requestId: "request-2" }));
  await writer.close();

  const content = await fs.readFile(
    path.join(logsDirectory, "ichiran-analysis.jsonl"),
    "utf8",
  );
  const records = content.trim().split("\n").map(JSON.parse);

  assert.deepEqual(records, [
    {
      ...event(),
      schemaVersion: 1,
      timestamp: "2026-11-20T18:42:31.123Z",
    },
    {
      ...event({ event: "analysis.succeeded", requestId: "request-2" }),
      schemaVersion: 1,
      timestamp: "2026-11-20T18:42:31.123Z",
    },
  ]);
});

test("rotation counts UTF-8 bytes and retains current and previous files", async () => {
  const logsDirectory = await createDirectory();
  const first = event({ text: "猫" });
  const firstLine = `${JSON.stringify({
    ...first,
    schemaVersion: 1,
    timestamp: "2026-11-20T18:42:31.123Z",
  })}\n`;
  const writer = createAnalysisLogWriter({
    enabled: true,
    logsDirectory,
    maxBytes: Buffer.byteLength(firstLine, "utf8") + 1,
    now: () => "2026-11-20T18:42:31.123Z",
  });

  writer.record(first);
  writer.record(event({ requestId: "request-2", text: "猫" }));
  await writer.close();

  const names = (await fs.readdir(logsDirectory)).sort();
  assert.deepEqual(names, [
    "ichiran-analysis.jsonl",
    "ichiran-analysis.previous.jsonl",
  ]);
  assert.match(
    await fs.readFile(path.join(logsDirectory, names[1]), "utf8"),
    /request-1/,
  );
  assert.match(
    await fs.readFile(path.join(logsDirectory, names[0]), "utf8"),
    /request-2/,
  );
});

test("close waits for queued appends", async () => {
  const logsDirectory = await createDirectory();
  const writer = createAnalysisLogWriter({ enabled: true, logsDirectory });

  writer.record(event());
  await writer.close();

  assert.match(
    await fs.readFile(
      path.join(logsDirectory, "ichiran-analysis.jsonl"),
      "utf8",
    ),
    /request-1/,
  );
});

test("write and serialization failures do not throw and warn once per failure sequence", async () => {
  const warnings = [];
  const writer = createAnalysisLogWriter({
    enabled: true,
    logsDirectory: "unusable",
    fileSystem: {
      mkdir: async () => {
        throw new Error("denied");
      },
    },
    warn: (message) => warnings.push(message),
  });
  const circular = event();
  circular.circular = circular;

  assert.doesNotThrow(() => writer.record(event()));
  assert.doesNotThrow(() => writer.record(circular));
  await writer.close();

  assert.deepEqual(warnings, ["Unable to write Ichiran analysis diagnostics."]);
});
