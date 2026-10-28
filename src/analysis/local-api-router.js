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
}) => {
  let activeController;
  let disposed = false;
  let generation = 0;

  const isCurrent = (requestGeneration) =>
    !disposed && requestGeneration === generation;

  const complete = (controller) => {
    if (activeController === controller) activeController = undefined;
  };

  const analyze = (text) => {
    if (disposed) return;

    generation += 1;
    activeController?.abort();
    const requestGeneration = generation;
    const controller = new AbortController();
    activeController = controller;

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
          onFailure("unavailable");
        }
        return;
      }

      if (!isCurrent(requestGeneration)) return;

      if (response.status !== 200) {
        complete(controller);
        onFailure(failureCodeForStatus(response.status));
        return;
      }

      let responseBody;
      try {
        responseBody = await response.json();
      } catch {
        if (isCurrent(requestGeneration)) {
          complete(controller);
          onFailure("unexpected");
        }
        return;
      }

      if (!isCurrent(requestGeneration)) return;

      let result;
      try {
        result = adaptResponse(responseBody, text);
      } catch {
        if (isCurrent(requestGeneration)) {
          complete(controller);
          onFailure("unexpected");
        }
        return;
      }

      if (isCurrent(requestGeneration)) {
        complete(controller);
        onSuccess(result);
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
  };

  return { analyze, dispose };
};

module.exports = { createLocalApiRouter };
