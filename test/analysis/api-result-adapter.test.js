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
  assert.deepEqual(
    result.words.map(({ word }) => word),
    ["猫", "が", "好き", "です", "。"],
  );
  assert.match(result.words[0].definitions, /<dl class="alternatives">/);
  assert.match(result.words[0].definitions, /<dt>猫 【ねこ】<\/dt>/);
  assert.match(result.words[2].definitions, /<dl class="alternatives">/);
  assert.match(result.words[2].definitions, /<dt>好き 【すき】<\/dt>/);
  assert.equal(result.words[4].definitions, "");
});

test("renders a non-conjugated verb in the ichi.moe dictionary structure", () => {
  const response = {
    text: "落ち着く",
    chunks: [
      {
        analysis: [
          [
            [
              [
                "ochitsuku",
                {
                  text: "落ち着く",
                  kana: "おちつく",
                  gloss: [
                    {
                      pos: "[v5k,vi]",
                      gloss: "to calm down; to compose oneself",
                    },
                    {
                      pos: "[v5k,vi]",
                      gloss: "to be unobtrusive; to be quiet",
                      info: "usu. before a noun as 落ち着いた",
                    },
                  ],
                  conj: [],
                },
                [],
              ],
            ],
          ],
        ],
        index: 0,
        length: "落ち着く".length,
        start: 0,
        text: "落ち着く",
      },
    ],
  };

  const { words } = adaptAnalyzeResponse(response, response.text);

  assert.equal(
    words[0].definitions,
    '<dl class="alternatives"><dt>落ち着く 【おちつく】</dt><dd><ol class="gloss-definitions"><li><span class="pos-desc">[<span title="Godan verb with &#39;ku&#39; ending">v5k</span>,<span title="intransitive verb">vi</span>]</span> <span class="gloss-desc">to calm down; to compose oneself</span></li><li><span class="pos-desc">[<span title="Godan verb with &#39;ku&#39; ending">v5k</span>,<span title="intransitive verb">vi</span>]</span> <span class="gloss-desc">to be unobtrusive; to be quiet</span> <span class="gloss-info">usu. before a noun as 落ち着いた</span></li></ol></dd></dl>',
  );
});

test("renders compound candidates from their components", () => {
  const response = {
    text: "なっています",
    chunks: [
      {
        analysis: [
          [
            [
              [
                "natteimasu",
                {
                  reading: "なっています",
                  text: "なっています",
                  kana: "なっています",
                  compound: ["なって", "います"],
                  components: [
                    {
                      reading: "なって",
                      text: "なって",
                      kana: "なって",
                      conj: [
                        {
                          prop: [{ pos: "v5r", type: "Conjunctive (~te)" }],
                          reading: "成る 【なる】",
                          gloss: [{ pos: "[v5r,vi]", gloss: "to become" }],
                          readok: true,
                        },
                      ],
                    },
                    {
                      reading: "います",
                      text: "います",
                      kana: "います",
                      suffix: "indicates continuing action (to be ...ing)",
                      conj: [
                        {
                          prop: [{ pos: "v1", type: "Non-past", fml: true }],
                          reading: "居る 【いる】",
                          gloss: [{ pos: "[v1,vi]", gloss: "to exist" }],
                          readok: true,
                        },
                      ],
                    },
                  ],
                },
                [],
              ],
            ],
          ],
        ],
        index: 0,
        length: "なっています".length,
        start: 0,
        text: "なっています",
      },
    ],
  };

  const { words } = adaptAnalyzeResponse(response, response.text);
  const word = words[0];

  assert.equal(word.dictForm, "成る");
  assert.equal(word.dictFormReading, "なる");
  assert.match(
    word.definitions,
    /^<dl class="alternatives"><dt>なっています<\/dt>/,
  );
  assert.match(
    word.definitions,
    /<span class="compound-desc">Compound word: <span class="compound-desc-word">なって \+ います<\/span><\/span>/,
  );
  assert.match(word.definitions, /<dl class="compounds">/);
  assert.match(word.definitions, /<dt>なって<\/dt>/);
  assert.match(word.definitions, /Conjunctive \(~te\)/);
  assert.match(word.definitions, /<dt>います<\/dt>/);
  assert.match(
    word.definitions,
    /<span class="suffix-desc">\[indicates continuing action \(to be \.\.\.ing\)\]<\/span>/,
  );
  assert.match(word.definitions, /<span class="conj-formal">Formal<\/span>/);
});

test("uses a conjugation root while preserving the surface reading", () => {
  const response = fixture("conjugation.json");
  assertChunkCoverage(response);

  const { words } = adaptAnalyzeResponse(response, response.text);
  const conjugated = words.at(-2);

  assert.deepEqual(
    { ...conjugated, definitions: undefined },
    {
      word: "だった",
      dictForm: "だ",
      dictFormReading: "だ",
      rubyReading: "だった",
      definitions: undefined,
    },
  );
  assert.match(conjugated.definitions, /<dt>だった 【だった】<\/dt>/);
});

test("uses the selected conjugation gloss when the surface candidate has none", () => {
  const response = fixture("conjugation-gloss.json");
  assertChunkCoverage(response);

  const { words } = adaptAnalyzeResponse(response, response.text);
  const conjugated = words.at(-2);

  assert.deepEqual(
    { ...conjugated, definitions: undefined },
    {
      word: "上げた",
      dictForm: "上げる",
      dictFormReading: "あげる",
      rubyReading: "あげた",
      definitions: undefined,
    },
  );
  assert.match(
    conjugated.definitions,
    /raise &lt;something&gt; &amp; &quot;up&quot;/,
  );
});

test("renders readok conjugations in the ichi.moe dictionary structure", () => {
  const response = fixture("conjugation-gloss.json");
  response.chunks[0].analysis[0][0][2][1].conj[0].prop = [
    { neg: true, pos: "v1", type: "Past (~ta)" },
  ];
  const { words } = adaptAnalyzeResponse(response, response.text);
  const definitions = words.at(-2).definitions;

  assert.match(
    definitions,
    /^<dl class="alternatives"><dt>上げた 【あげた】<\/dt>/,
  );
  assert.match(definitions, /<div class="conjugations">/);
  assert.match(definitions, /<div class="conj-prop">/);
  assert.match(
    definitions,
    /<span class="pos-desc">\[<span title="Ichidan verb">v1<\/span>\]<\/span>/,
  );
  assert.match(definitions, /<div class="conj-gloss">/);
  assert.match(definitions, /<span class="conj-neg">Negative<\/span>/);
  assert.match(definitions, /<dt>上げる 【あげる】<\/dt>/);
  assert.match(definitions, /<ol class="gloss-definitions"><li>/);
  assert.match(definitions, /raise &lt;something&gt; &amp; &quot;up&quot;/);
});

test("renders every readok conjugation while keeping the first as dictionary form", () => {
  const response = {
    text: "書かせられた",
    chunks: [
      {
        analysis: [
          [
            [
              [
                "kakaserareta",
                {
                  text: "書かせられた",
                  kana: "かかせられた",
                  conj: [
                    {
                      prop: [
                        { pos: "v5k", type: "Passive" },
                        { pos: "vt", type: "Causative" },
                      ],
                      reading: "書く 【かく】",
                      readok: true,
                      gloss: [{ pos: "[vt]", gloss: "to write" }],
                    },
                    {
                      prop: [{ pos: "v5k", type: "Past (~ta)" }],
                      reading: "書かせる 【かかせる】",
                      readok: true,
                      gloss: [{ pos: "[vt]", gloss: "to make write" }],
                    },
                  ],
                },
                [],
              ],
            ],
          ],
        ],
        index: 0,
        length: "書かせられた".length,
        start: 0,
        text: "書かせられた",
      },
    ],
  };

  const { words } = adaptAnalyzeResponse(response, response.text);
  const word = words[0];

  assert.equal(word.dictForm, "書く");
  assert.equal(word.dictFormReading, "かく");
  assert.match(
    word.definitions,
    /title="Godan verb with &#39;ku&#39; ending">v5k/,
  );
  assert.match(word.definitions, /title="transitive verb">vt/);
  assert.equal(
    (word.definitions.match(/class="conjugation"/g) || []).length,
    2,
  );
  assert.match(word.definitions, /<dt>書く 【かく】<\/dt>/);
  assert.match(word.definitions, /<dt>書かせる 【かかせる】<\/dt>/);
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
      '<dl class="alternatives"><dt>10分 【じゅっぷん】</dt><dd><ol class="gloss-definitions"><li><span class="pos-desc">[n]</span> <span class="gloss-desc">ten minutes</span></li></ol></dd></dl>',
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
