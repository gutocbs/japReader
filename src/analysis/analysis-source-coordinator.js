const createAnalysisSourceCoordinator = ({
  apiRouter,
  onIchiFailure,
  onIchiSuccess,
  requestIchiAnalysis,
  useIchiMoeForShortText,
}) => {
  let activeSource;
  let submittedText;

  const analyze = (text) => {
    submittedText = text;

    if (useIchiMoeForShortText && text.length < 90) {
      activeSource = "ichi";
      apiRouter.cancel();
      requestIchiAnalysis(text);
      return;
    }

    activeSource = "api";
    apiRouter.analyze(text);
  };

  const receiveIchiResult = (words, fullText) => {
    if (activeSource !== "ichi" || fullText !== submittedText) return;

    onIchiSuccess(words, fullText);
  };

  const receiveIchiFailure = (fullText) => {
    if (activeSource !== "ichi" || fullText !== submittedText) return;

    onIchiFailure();
  };

  return { analyze, receiveIchiFailure, receiveIchiResult };
};

module.exports = { createAnalysisSourceCoordinator };
