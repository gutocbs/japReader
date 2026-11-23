const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const tools = require("../../src/tools");

test("analysis source option defaults to local API and exposes the approved Options control", () => {
  const schema = tools.getOptionsStoreOptions().schema;
  const markup = fs.readFileSync(
    path.join(__dirname, "../../src/boxes/options/index.html"),
    "utf8",
  );
  const normalizedMarkup = markup.replace(/\s+/g, " ");

  assert.equal(schema.options.properties.useIchiMoeForShortText.default, false);
  assert.deepEqual(schema.options.properties.useIchiranApi, {
    default: true,
    type: "boolean",
  });
  assert.deepEqual(schema.options.properties.ichiranApiBaseUrl, {
    default: "http://127.0.0.1:18080",
    type: "string",
  });
  assert.match(markup, /id="analysis-source"/);
  assert.match(
    markup,
    /<input[^>]+id="useIchiranApi"[^>]+name="useIchiranApi"/,
  );
  assert.match(
    markup,
    /<label for="useIchiranApi"\s*>Use local Ichiran API<\/label\s*>/,
  );
  assert.match(
    markup,
    /<input[^>]+id="ichiranApiBaseUrl"[^>]+name="ichiranApiBaseUrl"/,
  );
  assert.match(
    markup,
    /<label for="ichiranApiBaseUrl"\s*>Ichiran API URL<\/label\s*>/,
  );
  assert.match(markup, /id="ichiranApiBaseUrl-error"[^>]+role="alert"/);
  assert.match(
    markup,
    /<input[^>]+id="useIchiMoeForShortText"[^>]+name="useIchiMoeForShortText"/,
  );
  assert.match(
    markup,
    /<label for="useIchiMoeForShortText"\s*>Use ichi\.moe for short text<\/label\s*>/,
  );
  assert.match(
    normalizedMarkup,
    /With the local API enabled, all text uses it unless ichi\.moe is enabled for text under 90 characters\. Text with 90 or more characters always uses the local API\. With the local API disabled, ichi\.moe analyzes all text\./,
  );
});

test("diagnostic recording is opt-in and warns that copied content is stored", () => {
  const schema = tools.getOptionsStoreOptions().schema;
  const markup = fs.readFileSync(
    path.join(__dirname, "../../src/boxes/options/index.html"),
    "utf8",
  );
  const normalizedMarkup = markup.replace(/\s+/g, " ");

  assert.deepEqual(schema.options.properties.recordIchiranAnalysisDiagnostics, {
    default: false,
    type: "boolean",
  });
  assert.match(
    markup,
    /<input[^>]+id="recordIchiranAnalysisDiagnostics"[^>]+name="recordIchiranAnalysisDiagnostics"/,
  );
  assert.match(
    markup,
    /<label for="recordIchiranAnalysisDiagnostics"\s*>Record Ichiran analysis diagnostics<\/label\s*>/,
  );
  assert.match(
    normalizedMarkup,
    /Copied Japanese text and provider results are stored in the logs folder and may contain sensitive content\./,
  );
});

test("always-on-top options use independent false defaults and expose their approved controls", () => {
  const schema = tools.getOptionsStoreOptions().schema;
  const markup = fs.readFileSync(
    path.join(__dirname, "../../src/boxes/options/index.html"),
    "utf8",
  );

  const options = [
    ["readerAlwaysOnTop", "Keep reader always on top", "reader"],
    ["dictAlwaysOnTop", "Keep dictionary always on top", "dictionary"],
    ["translationAlwaysOnTop", "Keep translation always on top", "translation"],
  ];

  for (const [property, label, fieldset] of options) {
    assert.deepEqual(schema.options.properties[property], {
      default: false,
      type: "boolean",
    });
    assert.match(
      markup,
      new RegExp(
        `<fieldset id="${fieldset}">[\\s\\S]*?<input[^>]+id="${property}"[^>]+name="${property}"[\\s\\S]*?<label for="${property}"\\s*>${label}</label\\s*>`,
      ),
    );
  }
});
