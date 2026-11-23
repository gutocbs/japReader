const createAnalysisSourceCoordinator = ({
  apiRouter,
  onIchiFailure,
  onIchiInputTooLarge,
  onIchiSuccess,
  requestIchiAnalysis,
  useIchiranApi,
  useIchiMoeForShortText,
  diagnostics = { record: () => {} },
  createRequestId = () => crypto.randomUUID(),
  now = () => performance.now(),
}) => {
  let activeSource;
  let activeIchiContext;
  let submittedText;

  const analyze = (text) => {
    if (activeSource === "ichi" && activeIchiContext) {
      diagnostics.record({
        ...activeIchiContext,
        durationMs: now() - activeIchiContext.startedAt,
        event: "analysis.cancelled",
        reason: "superseded",
      });
    }
    submittedText = text;
    const provider =
      !useIchiranApi || (useIchiMoeForShortText && text.length < 90)
        ? "ichi"
        : "api";
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

    if (!useIchiranApi && text.length >= 90) {
      activeSource = undefined;
      activeIchiContext = undefined;
      apiRouter.cancel();
      diagnostics.record({
        ...context,
        code: "inputTooLarge",
        durationMs: now() - context.startedAt,
        event: "analysis.failed",
        stage: "policy",
      });
      onIchiInputTooLarge();
      return;
    }

    if (provider === "ichi") {
      activeSource = "ichi";
      activeIchiContext = context;
      apiRouter.cancel();
      requestIchiAnalysis(text, context);
      return;
    }

    activeSource = "api";
    activeIchiContext = undefined;
    apiRouter.analyze(text, context);
  };

  const receiveIchiResult = (words, fullText, context, response) => {
    const isMatchingContext =
      !context || context.requestId === activeIchiContext?.requestId;
    if (
      activeSource !== "ichi" ||
      fullText !== submittedText ||
      !isMatchingContext
    ) {
      if (context) {
        diagnostics.record({
          ...context,
          durationMs: now() - context.startedAt,
          event: "analysis.discarded",
        });
      }
      return;
    }

    if (context && response) {
      diagnostics.record({
        ...context,
        event: "provider.response_received",
        ...response,
      });
      diagnostics.record({
        ...context,
        durationMs: now() - context.startedAt,
        event: "transformation.completed",
        readerResult: { fullText, words },
      });
    }
    activeSource = undefined;
    activeIchiContext = undefined;
    onIchiSuccess(words, fullText, context);
  };

  const receiveIchiFailure = (fullText, context) => {
    if (
      activeSource !== "ichi" ||
      fullText !== submittedText ||
      (context && context.requestId !== activeIchiContext?.requestId)
    ) {
      if (context) {
        diagnostics.record({
          ...context,
          durationMs: now() - context.startedAt,
          event: "analysis.discarded",
        });
      }
      return;
    }

    if (context) {
      diagnostics.record({
        ...context,
        durationMs: now() - context.startedAt,
        event: "analysis.failed",
        stage: "provider",
      });
    }

    activeSource = undefined;
    activeIchiContext = undefined;
    onIchiFailure();
  };

  return { analyze, receiveIchiFailure, receiveIchiResult };
};

module.exports = { createAnalysisSourceCoordinator };
