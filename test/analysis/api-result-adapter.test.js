const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const {
  adaptAnalyzeResponse,
  ApiResponseValidationError,
} = require("../../src/analysis/api-result-adapter");

const fixture = (name) =>
  JSON.parse(
    readFileSync(resolve(__dirname, "../fixtures/ichiran-api", name), "utf8"),
  );

const assertChunkCoverage = (response) => {
  const ordered = [...response.chunks].sort(
    (left, right) => left.index - right.index,
  );
  let offset = 0;

  for (const chunk of ordered) {
    assert.equal(chunk.start, offset);
    assert.equal(chunk.length, chunk.text.length);
    assert.equal(
      response.text.slice(chunk.start, chunk.start + chunk.length),
      chunk.text,
    );
    offset += chunk.length;
  }

  assert.equal(offset, response.text.length);
};

test("adapts a simple API analysis into the reader word contract", () => {
  const response = fixture("simple.json");
  assertChunkCoverage(response);

  const result = adaptAnalyzeResponse(response, response.text);

  assert.equal(result.fullText, "猫が好きです。");
  assert.deepEqual(result.words, [
    {
      word: "猫",
      dictForm: "猫",
      dictFormReading: "ねこ",
      rubyReading: "ねこ",
      definitions:
        '<div class="ichiran-definition"><div class="ichiran-gloss"><span class="ichiran-pos">[n]</span><span class="ichiran-gloss-text">cat</span></div></div>',
    },
    {
      word: "が",
      dictForm: "が",
      dictFormReading: "が",
      rubyReading: "が",
      definitions:
        '<div class="ichiran-definition"><div class="ichiran-gloss"><span class="ichiran-pos">[prt]</span><span class="ichiran-gloss-text">subject marker</span></div></div>',
    },
    {
      word: "好き",
      dictForm: "好く",
      dictFormReading: "すく",
      rubyReading: "すき",
      definitions:
        '<div class="ichiran-definition"><div class="ichiran-gloss"><span class="ichiran-pos">[adj-na,n]</span><span class="ichiran-gloss-text">liking</span></div></div>',
    },
    {
      word: "です",
      dictForm: "です",
      dictFormReading: "です",
      rubyReading: "です",
      definitions:
        '<div class="ichiran-definition"><div class="ichiran-gloss"><span class="ichiran-pos">[aux-v,cop]</span><span class="ichiran-gloss-text">be; is</span></div></div>',
    },
    {
      word: "。",
      dictForm: "",
      dictFormReading: "",
      rubyReading: "",
      definitions: "",
    },
  ]);
});

test("uses a conjugation root while preserving the surface reading", () => {
  const response = fixture("conjugation.json");
  assertChunkCoverage(response);

  const { words } = adaptAnalyzeResponse(response, response.text);
  const conjugated = words.at(-2);

  assert.deepEqual(conjugated, {
    word: "だった",
    dictForm: "だ",
    dictFormReading: "だ",
    rubyReading: "だった",
    definitions:
      '<div class="ichiran-definition"><div class="ichiran-gloss"><span class="ichiran-pos">[exp]</span><span class="ichiran-gloss-text">was</span></div></div>',
  });
});

test("uses the selected conjugation gloss when the surface candidate has none", () => {
  const response = fixture("conjugation-gloss.json");
  assertChunkCoverage(response);

  const { words } = adaptAnalyzeResponse(response, response.text);
  const conjugated = words.at(-2);

  assert.deepEqual(conjugated, {
    word: "上げた",
    dictForm: "上げる",
    dictFormReading: "あげる",
    rubyReading: "あげた",
    definitions:
      '<div class="ichiran-definition"><div class="ichiran-gloss"><span class="ichiran-pos">[v1,vt]</span><span class="ichiran-gloss-text">raise &lt;something&gt; &amp; &quot;up&quot;</span><span class="ichiran-info">usu. transitive</span></div></div>',
  });
});

test("orders compound and alternative chunks by source offsets", () => {
  const response = fixture("compound-alternatives.json");
  assertChunkCoverage(response);

  const { words } = adaptAnalyzeResponse(response, response.text);

  assert.deepEqual(
    words.map(({ word }) => word),
    ["国際連合", "。", "猫", "。"],
  );
  assert.equal(words[2].rubyReading, "ねこ");
});

test("emits placeholders for punctuation and gaps and escapes definitions", () => {
  const response = fixture("gaps-punctuation.json");
  assertChunkCoverage(response);

  const { words } = adaptAnalyzeResponse(response, response.text);

  assert.deepEqual(
    words.map(({ word }) => word),
    ["「", "猫", "」", "…", "好き", "？"],
  );
  assert.deepEqual(words[0], {
    word: "「",
    dictForm: "",
    dictFormReading: "",
    rubyReading: "",
    definitions: "",
  });
  assert.match(
    words[1].definitions,
    /cat &lt;feline&gt; &amp; &quot;friend&quot;/,
  );
  assert.match(words[4].definitions, /&lt;usage&gt; &amp; &quot;note&quot;/);
  assert.doesNotMatch(words[1].definitions, /<feline>|& "friend"/);
});

test("adapts ASCII API digits onto the submitted full-width source text", () => {
  const submittedText =
    "１０分だけでも、何も考えない、全てを手放す時間を持ってみてください。";
  const responseText =
    "10分だけでも、何も考えない、全てを手放す時間を持ってみてください。";
  const response = {
    text: responseText,
    chunks: [
      {
        index: 0,
        start: 0,
        length: responseText.length,
        text: responseText,
        analysis: [
          [
            [
              [
                "juppun",
                {
                  text: "10分",
                  kana: "じゅっぷん",
                  gloss: [{ pos: "[n]", gloss: "ten minutes" }],
                  conj: [],
                },
                [],
              ],
            ],
          ],
        ],
      },
    ],
  };

  const result = adaptAnalyzeResponse(response, submittedText);

  assert.equal(result.fullText, submittedText);
  assert.deepEqual(result.words[0], {
    word: "１０分",
    dictForm: "10分",
    dictFormReading: "じゅっぷん",
    rubyReading: "じゅっぷん",
    definitions:
      '<div class="ichiran-definition"><div class="ichiran-gloss"><span class="ichiran-pos">[n]</span><span class="ichiran-gloss-text">ten minutes</span></div></div>',
  });
  assert.deepEqual(
    result.words.slice(1).map(({ word }) => word),
    [...submittedText.slice("１０分".length)],
  );
});

test("rejects a same-length non-digit mismatch in a normalized response", () => {
  const submittedText =
    "１０分だけでも、何も考えない、全てを手放す時間を持ってみてください。";
  const responseText =
    "20分だけでも、何も考えない、全てを手放す時間を持ってみてください。";
  const response = {
    text: responseText,
    chunks: [
      {
        index: 0,
        start: 0,
        length: responseText.length,
        text: responseText,
        analysis: [
          [
            [
              [
                "nijuppun",
                {
                  text: "20分",
                  kana: "にじゅっぷん",
                  gloss: [{ pos: "[n]", gloss: "twenty minutes" }],
                  conj: [],
                },
                [],
              ],
            ],
          ],
        ],
      },
    ],
  };

  assert.throws(
    () => adaptAnalyzeResponse(response, submittedText),
    ApiResponseValidationError,
  );
});

test("preserves validation errors for a non-string top-level response text", () => {
  const response = fixture("simple.json");
  response.text = null;

  assert.throws(
    () => adaptAnalyzeResponse(response, "猫が好きです。"),
    ApiResponseValidationError,
  );
});

test("rejects malformed envelopes without including response values", () => {
  const response = fixture("simple.json");
  response.text = "secret response content";

  assert.throws(
    () => adaptAnalyzeResponse(response, "猫が好きです。"),
    (error) => {
      assert.ok(error instanceof ApiResponseValidationError);
      assert.equal(error.message, "Invalid analysis response.");
      assert.doesNotMatch(error.message, /secret response content/);
      return true;
    },
  );
});
