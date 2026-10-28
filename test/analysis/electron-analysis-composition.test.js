const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");

const {
  createReaderAnalysisRouter,
  registerDeepLClipboardDispatch,
  registerReaderClipboardAnalysis,
} = require("../../src/analysis/electron-analysis-composition");

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("composes reader API callbacks and keeps DeepL clipboard dispatch independent", async () => {
  const ipcMain = new EventEmitter();
  const readerMessages = [];
  const deepLMessages = [];
  const requests = [];
  const readerBox = {
    webContents: {
      send: (...args) => readerMessages.push(args),
    },
  };
  const deepLBox = {
    webContents: {
      send: (...args) => deepLMessages.push(args),
    },
  };
  const router = createReaderAnalysisRouter({
    adaptResponse: (body, text) => ({ words: body.words, fullText: text }),
    fetchImpl: () => {
      const request = deferred();
      requests.push(request);
      return request.promise;
    },
    readerBox,
  });

  registerReaderClipboardAnalysis(ipcMain, router);
  registerDeepLClipboardDispatch(ipcMain, deepLBox);

  ipcMain.emit("clipboardChanged", {}, "猫です");
  requests[0].resolve({
    status: 200,
    json: async () => ({ words: ["猫"] }),
  });
  await flush();
  await flush();

  assert.deepEqual(readerMessages, [
    ["receiveParsedData", ["猫"], "猫です"],
  ]);
  assert.deepEqual(deepLMessages, [["translateWithDeepL", "猫です"]]);

  ipcMain.emit("clipboardChanged", {}, "犬です");
  requests[1].resolve({ status: 503 });
  await flush();

  assert.deepEqual(readerMessages.at(-1), [
    "apiAnalysisError",
    "temporarilyUnavailable",
  ]);
  assert.deepEqual(deepLMessages.at(-1), ["translateWithDeepL", "犬です"]);
});
