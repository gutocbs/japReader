const {
  normalizeIchiranApiBaseUrl,
} = require("../../analysis/ichiran-api-url");

const syncAnalysisSourceControls = ({
  useIchiranApiInput,
  apiBaseUrlInput,
  useIchiMoeForShortTextInput,
}) => {
  const disabled = !useIchiranApiInput.checked;

  apiBaseUrlInput.disabled = disabled;
  useIchiMoeForShortTextInput.disabled = disabled;
};

const validateAnalysisSourceControls = ({
  useIchiranApiInput,
  apiBaseUrlInput,
  errorElement,
}) => {
  apiBaseUrlInput.ariaInvalid = "false";
  errorElement.hidden = true;
  errorElement.textContent = "";

  if (!useIchiranApiInput.checked) {
    return { valid: true, normalizedBaseUrl: undefined };
  }

  try {
    return {
      valid: true,
      normalizedBaseUrl: normalizeIchiranApiBaseUrl(apiBaseUrlInput.value),
    };
  } catch {
    apiBaseUrlInput.ariaInvalid = "true";
    errorElement.hidden = false;
    errorElement.textContent = "Enter a valid API origin.";
    return { valid: false, normalizedBaseUrl: undefined };
  }
};

module.exports = {
  syncAnalysisSourceControls,
  validateAnalysisSourceControls,
};
