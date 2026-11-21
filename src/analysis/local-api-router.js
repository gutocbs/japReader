const DEFAULT_ENDPOINT = "http://127.0.0.1:8080/analyze";

const failureCodeForStatus = (status) => {
  switch (status) {
    case 413:
      return "inputTooLarge";
    case 502:
      return "analysisFailed";
    case 503:
      return "temporarilyUnavailable";
    case 504:
      return "timeout";
    default:
      return "unexpected";
  }
};

const createLocalApiRouter = ({
  fetchImpl,
  adaptResponse,
  onSuccess,
  onFailure,
  endpoint = DEFAULT_ENDPOINT,
  diagnostics = { record: () => {} },
  now = () => performance.now(),
}) => {
  let activeController;
  let activeRequest;
  let disposed = false;
  let generation = 0;

  const isCurrent = (requestGeneration) =>
    !disposed && requestGeneration === generation;

  const complete = (controller) => {
    if (activeController === controller) {
      activeController = undefined;
      activeRequest = undefined;
    }
  };

  const cancel = () => {
    if (disposed) return;

    if (activeRequest?.context) {
      diagnostics.record({
        ...activeRequest.context,
        durationMs: now() - activeRequest.startedAt,
        event: "analysis.cancelled",
        reason: "superseded",
      });
    }
    generation += 1;
    activeController?.abort();
    activeController = undefined;
    activeRequest = undefined;
  };

  const analyze = (text, context) => {
    if (disposed) return;

    cancel();
    const requestGeneration = generation;
    const startedAt = now();
    const controller = new AbortController();
    activeController = controller;
    activeRequest = { context, controller, startedAt };

    const recordFailure = (stage, code, httpStatus) => {
      if (!context) return;
      diagnostics.record({
        ...context,
        code,
        durationMs: now() - startedAt,
        event: "analysis.failed",
        ...(httpStatus === undefined ? {} : { httpStatus }),
        stage,
      });
    };

    const recordDiscarded = () => {
      if (!context) return;
      diagnostics.record({
        ...context,
        durationMs: now() - startedAt,
        event: "analysis.discarded",
      });
    };

    let request;
    try {
      request = fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
    } catch {
      if (isCurrent(requestGeneration)) {
        complete(controller);
        recordFailure("request", "unavailable");
        onFailure("unavailable");
      }
      return;
    }

    const handleRequest = async () => {
      let response;
      try {
        response = await request;
      } catch {
        if (isCurrent(requestGeneration)) {
          complete(controller);
          recordFailure("request", "unavailable");
          onFailure("unavailable");
        } else {
          recordDiscarded();
        }
        return;
      }

      if (!isCurrent(requestGeneration)) {
        recordDiscarded();
        return;
      }

      if (response.status !== 200) {
        complete(controller);
        const code = failureCodeForStatus(response.status);
        recordFailure("response.status", code, response.status);
        onFailure(code);
        return;
      }

      let responseBody;
      try {
        responseBody = await response.json();
      } catch {
        if (isCurrent(requestGeneration)) {
          complete(controller);
          recordFailure("response.parse", "unexpected", response.status);
          onFailure("unexpected");
        } else {
          recordDiscarded();
        }
        return;
      }

      if (!isCurrent(requestGeneration)) {
        recordDiscarded();
        return;
      }

      diagnostics.record({
        ...context,
        event: "provider.response_received",
        httpStatus: response.status,
        response: responseBody,
      });

      let result;
      try {
        result = adaptResponse(responseBody, text);
      } catch {
        if (isCurrent(requestGeneration)) {
          complete(controller);
          recordFailure("response.transform", "unexpected", response.status);
          onFailure("unexpected");
        } else {
          recordDiscarded();
        }
        return;
      }

      if (isCurrent(requestGeneration)) {
        complete(controller);
        diagnostics.record({
          ...context,
          durationMs: now() - startedAt,
          event: "transformation.completed",
          readerResult: result,
        });
        onSuccess(result, context);
      } else {
        recordDiscarded();
      }
    };

    void handleRequest();
  };

  const dispose = () => {
    if (disposed) return;

    disposed = true;
    generation += 1;
    activeController?.abort();
    activeController = undefined;
    activeRequest = undefined;
  };

  return { analyze, cancel, dispose };
};

module.exports = { createLocalApiRouter };
