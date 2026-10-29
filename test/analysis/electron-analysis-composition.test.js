const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");

const {
  createOptionalIchiMoeWindow,
  createReaderAnalysisCoordinator,
  createReaderAnalysisRouter,
  registerDeepLClipboardDispatch,
  registerIchiAnalysisEvents,
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

  assert.deepEqual(readerMessages, [["receiveParsedData", ["猫"], "猫です"]]);
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

test("API-only composition creates no ichi.moe window and routes clipboard analysis locally", () => {
  const ipcMain = new EventEmitter();
  const messages = [];
  const deepLMessages = [];
  const apiTexts = [];
  const readerBox = { webContents: { send: (...args) => messages.push(args) } };
  const deepLBox = {
    webContents: { send: (...args) => deepLMessages.push(args) },
  };
  const apiRouter = {
    analyze: (text) => apiTexts.push(text),
    cancel: () => {},
  };
  let browserWindows = 0;

  const ichiBox = createOptionalIchiMoeWindow({
    BrowserWindow: class {
      constructor() {
        browserWindows += 1;
      }
    },
    enabled: false,
    tools: { dirname_path: () => "unused" },
  });
  const coordinator = createReaderAnalysisCoordinator({
    apiRouter,
    readerBox,
    useIchiMoeForShortText: false,
  });

  registerReaderClipboardAnalysis(ipcMain, coordinator);
  registerDeepLClipboardDispatch(ipcMain, deepLBox);
  ipcMain.emit("clipboardChanged", {}, "short");

  assert.equal(ichiBox, undefined);
  assert.equal(browserWindows, 0);
  assert.deepEqual(apiTexts, ["short"]);
  assert.deepEqual(messages, []);
  assert.deepEqual(deepLMessages, [["translateWithDeepL", "short"]]);
});

test("composition routes ichi IPC through the latest-only coordinator", () => {
  const ipcMain = new EventEmitter();
  const messages = [];
  const readerBox = { webContents: { send: (...args) => messages.push(args) } };
  const ichiRequests = [];
  const coordinator = createReaderAnalysisCoordinator({
    apiRouter: { analyze: () => {}, cancel: () => {} },
    readerBox,
    requestIchiAnalysis: (text) => ichiRequests.push(text),
    useIchiMoeForShortText: true,
  });

  registerReaderClipboardAnalysis(ipcMain, coordinator);
  registerIchiAnalysisEvents(ipcMain, coordinator);
  ipcMain.emit("clipboardChanged", {}, "short");
  ipcMain.emit("clipboardChanged", {}, "a".repeat(90));
  ipcMain.emit("sendParsedData", {}, ["stale"], "short");
  ipcMain.emit("ichiConnectionError", {}, "short");

  assert.deepEqual(ichiRequests, ["short"]);
  assert.deepEqual(messages, []);
});
