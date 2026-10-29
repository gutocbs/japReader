const assert = require("node:assert/strict");
const test = require("node:test");

const { createIchiMoeUrl } = require("../../src/analysis/ichi-url");

test("preserves reserved characters in ichi.moe's q parameter", () => {
  const text = "猫&犬+鳥#章";
  const url = new URL(createIchiMoeUrl(text));

  assert.equal(url.origin, "https://ichi.moe");
  assert.equal(url.pathname, "/cl/qr/");
  assert.equal(url.searchParams.get("q"), text);
  assert.equal(url.searchParams.get("r"), "kana");
});
