const assert = require("node:assert/strict");
const test = require("node:test");

const {
  sendRenderedDictionary,
  sendSelectedWord,
} = require("../../src/analysis/renderer-analysis-diagnostics");

test("sends selection context without adding diagnostic fields to word data", () => {
  const messages = [];
  const context = { provider: "api", requestId: "request-1", text: "育った" };
  const wordData = { definitions: "<div>definition</div>", word: "育った" };

  const selectionContext = sendSelectedWord(
    { send: (...args) => messages.push(args) },
    context,
    2,
    wordData,
  );

  assert.deepEqual(selectionContext, { ...context, wordIndex: 2 });
  assert.deepEqual(messages, [
    ["analysisWordSelected", selectionContext, wordData],
    ["sendWordData", wordData, selectionContext],
  ]);
  assert.deepEqual(wordData, {
    definitions: "<div>definition</div>",
    word: "育った",
  });
});

test("sends the final dictionary HTML with the selected word context", () => {
  const messages = [];
  const selectionContext = {
    provider: "ichi",
    requestId: "request-2",
    text: "育った",
    wordIndex: 0,
  };

  sendRenderedDictionary(
    { send: (...args) => messages.push(args) },
    selectionContext,
    "<dl>育った</dl>",
  );

  assert.deepEqual(messages, [
    ["analysisDictionaryRendered", selectionContext, "<dl>育った</dl>"],
  ]);
});
