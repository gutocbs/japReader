const assert = require("node:assert/strict");
const test = require("node:test");

const {
  collectIchiDomSnapshot,
} = require("../../src/analysis/ichi-dom-snapshot");

test("collects only ordered query text and word chunk fragments", () => {
  const queried = [];
  const document = {
    querySelectorAll: (selector) => {
      queried.push(selector);
      if (selector === ".query-text") {
        return [{ textContent: "育った" }, { textContent: "。" }];
      }
      if (selector === ".word-chunk .jspPane") {
        return [
          { innerHTML: "<dt>育った</dt>", textContent: "育った そだった" },
        ];
      }
      throw new Error(`unexpected selector: ${selector}`);
    },
  };

  assert.deepEqual(collectIchiDomSnapshot(document), {
    queryText: ["育った", "。"],
    wordChunks: [{ html: "<dt>育った</dt>", text: "育った そだった" }],
  });
  assert.deepEqual(queried, [".query-text", ".word-chunk .jspPane"]);
});

test("returns empty collections when the approved selectors have no matches", () => {
  const document = { querySelectorAll: () => [] };

  assert.deepEqual(collectIchiDomSnapshot(document), {
    queryText: [],
    wordChunks: [],
  });
});
