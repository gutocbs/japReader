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
  assert.match(markup, /id="analysis-source"/);
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
    /Sends text under 90 characters to ichi\.moe\. Longer text stays on the local API\./,
  );
});
