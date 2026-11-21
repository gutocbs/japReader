const createAnalysisSourceCoordinator = ({
  apiRouter,
  onIchiFailure,
  onIchiSuccess,
  requestIchiAnalysis,
  useIchiMoeForShortText,
  diagnostics = { record: () => {} },
  createRequestId = () => crypto.randomUUID(),
  now = () => performance.now(),
}) => {
  let activeSource;
  let submittedText;

  const analyze = (text) => {
    submittedText = text;
    const provider =
      useIchiMoeForShortText && text.length < 90 ? "ichi" : "api";
    const context = {
      provider,
      requestId: createRequestId(),
      startedAt: now(),
      text,
    };
    diagnostics.record({
      event: "analysis.started",
      provider: context.provider,
      requestId: context.requestId,
      text: context.text,
    });

    if (provider === "ichi") {
      activeSource = "ichi";
      apiRouter.cancel();
      requestIchiAnalysis(text, context);
      return;
    }

    activeSource = "api";
    apiRouter.analyze(text, context);
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
