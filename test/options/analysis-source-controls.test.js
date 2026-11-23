const assert = require("node:assert/strict");
const test = require("node:test");

const {
  syncAnalysisSourceControls,
  validateAnalysisSourceControls,
} = require("../../src/boxes/options/analysis-source-controls");

const createInputs = (useIchiranApi = true, apiBaseUrl = "") => ({
  apiBaseUrlInput: { disabled: false, value: apiBaseUrl },
  errorElement: { hidden: true, textContent: "" },
  useIchiMoeForShortTextInput: { checked: true, disabled: false },
  useIchiranApiInput: { checked: useIchiranApi },
});

test("sync disables dependent controls without changing their values", () => {
  const inputs = createInputs(false, "not an origin");

  syncAnalysisSourceControls(inputs);

  assert.equal(inputs.apiBaseUrlInput.disabled, true);
  assert.equal(inputs.apiBaseUrlInput.value, "not an origin");
  assert.equal(inputs.useIchiMoeForShortTextInput.disabled, true);
  assert.equal(inputs.useIchiMoeForShortTextInput.checked, true);

  inputs.useIchiranApiInput.checked = true;
  syncAnalysisSourceControls(inputs);

  assert.equal(inputs.apiBaseUrlInput.disabled, false);
  assert.equal(inputs.apiBaseUrlInput.value, "not an origin");
  assert.equal(inputs.useIchiMoeForShortTextInput.disabled, false);
  assert.equal(inputs.useIchiMoeForShortTextInput.checked, true);
});

test("validation rejects an invalid enabled API URL", () => {
  const inputs = createInputs(true, "https://api.example.test/analyze");

  const result = validateAnalysisSourceControls(inputs);

  assert.deepEqual(result, { valid: false, normalizedBaseUrl: undefined });
  assert.equal(inputs.apiBaseUrlInput.ariaInvalid, "true");
  assert.equal(inputs.errorElement.hidden, false);
  assert.equal(inputs.errorElement.textContent, "Enter a valid API origin.");
});

test("validation normalizes a trailing slash on an enabled API URL", () => {
  const inputs = createInputs(true, "https://api.example.test:19090/");

  const result = validateAnalysisSourceControls(inputs);

  assert.deepEqual(result, {
    valid: true,
    normalizedBaseUrl: "https://api.example.test:19090",
  });
  assert.equal(inputs.apiBaseUrlInput.ariaInvalid, "false");
  assert.equal(inputs.errorElement.hidden, true);
});

test("validation permits a disabled API without changing its invalid stored URL", () => {
  const inputs = createInputs(false, "not an origin");

  const result = validateAnalysisSourceControls(inputs);

  assert.deepEqual(result, { valid: true, normalizedBaseUrl: undefined });
  assert.equal(inputs.apiBaseUrlInput.value, "not an origin");
  assert.equal(inputs.apiBaseUrlInput.ariaInvalid, "false");
  assert.equal(inputs.errorElement.hidden, true);
});
