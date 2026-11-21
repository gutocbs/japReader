const { adaptAnalyzeResponse } = require("./api-result-adapter");
const {
  createAnalysisSourceCoordinator,
} = require("./analysis-source-coordinator");
const { createLocalApiRouter } = require("./local-api-router");

const createReaderAnalysisRouter = ({
  readerBox,
  fetchImpl,
  adaptResponse = adaptAnalyzeResponse,
  diagnostics,
}) =>
  createLocalApiRouter({
    adaptResponse,
    diagnostics,
    fetchImpl,
    onSuccess: ({ words, fullText }, context) => {
      const message = ["receiveParsedData", words, fullText];
      if (context) {
        message.push({
          provider: context.provider,
          requestId: context.requestId,
          text: context.text,
        });
      }
      readerBox.webContents.send(...message);
    },
    onFailure: (code) => {
      readerBox.webContents.send("apiAnalysisError", code);
    },
  });

const registerReaderClipboardAnalysis = (ipcMain, router) => {
  ipcMain.on("clipboardChanged", (event, text) => {
    router.analyze(text);
  });
};

const createReaderAnalysisCoordinator = ({
  apiRouter,
  readerBox,
  requestIchiAnalysis,
  useIchiMoeForShortText,
  diagnostics,
  createRequestId,
  now,
}) =>
  createAnalysisSourceCoordinator({
    apiRouter,
    onIchiFailure: () => {
      readerBox.webContents.send("ichiConnectionError");
    },
    onIchiSuccess: (words, fullText, context) => {
      const message = ["receiveParsedData", words, fullText];
      if (context) {
        message.push({
          provider: context.provider,
          requestId: context.requestId,
          text: context.text,
        });
      }
      readerBox.webContents.send(...message);
    },
    diagnostics,
    createRequestId,
    now,
    requestIchiAnalysis,
    useIchiMoeForShortText,
  });

const registerIchiAnalysisEvents = (ipcMain, coordinator) => {
  ipcMain.on("sendParsedData", (event, words, fullText, context, response) => {
    coordinator.receiveIchiResult(words, fullText, context, response);
  });
  ipcMain.on("ichiConnectionError", (event, fullText, context) => {
    coordinator.receiveIchiFailure(fullText, context);
  });
};

const createOptionalIchiMoeWindow = ({ BrowserWindow, enabled, tools }) => {
  if (!enabled) return undefined;

  const ichiBox = new BrowserWindow({
    icon: "images/logo/icon.png",
    show: false,
    width: 800,
    height: 600,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      enableRemoteModule: false,
      preload: tools.dirname_path("./boxes/ichi/script.js"),
      nodeIntegration: true,
    },
  });

  ichiBox.loadURL("https://ichi.moe/cl/qr/?q=&r=kana");
  ichiBox.on("close", (event) => {
    event.preventDefault();
    ichiBox.hide();
  });

  return ichiBox;
};

const registerDeepLClipboardDispatch = (ipcMain, deepLBox) => {
  ipcMain.on("clipboardChanged", (event, text) => {
    deepLBox.webContents.send("translateWithDeepL", text);
  });
};

module.exports = {
  createOptionalIchiMoeWindow,
  createReaderAnalysisCoordinator,
  createReaderAnalysisRouter,
  registerDeepLClipboardDispatch,
  registerIchiAnalysisEvents,
  registerReaderClipboardAnalysis,
};
