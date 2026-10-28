const { adaptAnalyzeResponse } = require("./api-result-adapter");
const { createLocalApiRouter } = require("./local-api-router");

const createReaderAnalysisRouter = ({
  readerBox,
  fetchImpl,
  adaptResponse = adaptAnalyzeResponse,
}) =>
  createLocalApiRouter({
    adaptResponse,
    fetchImpl,
    onSuccess: ({ words, fullText }) => {
      readerBox.webContents.send("receiveParsedData", words, fullText);
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

const registerDeepLClipboardDispatch = (ipcMain, deepLBox) => {
  ipcMain.on("clipboardChanged", (event, text) => {
    deepLBox.webContents.send("translateWithDeepL", text);
  });
};

module.exports = {
  createReaderAnalysisRouter,
  registerDeepLClipboardDispatch,
  registerReaderClipboardAnalysis,
};
