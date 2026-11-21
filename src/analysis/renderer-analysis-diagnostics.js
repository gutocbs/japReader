const sendSelectedWord = (ipcRenderer, context, wordIndex, wordData) => {
  if (!context) {
    ipcRenderer.send("sendWordData", wordData);
    return undefined;
  }

  const selectionContext = { ...context, wordIndex };
  ipcRenderer.send("analysisWordSelected", selectionContext, wordData);
  ipcRenderer.send("sendWordData", wordData, selectionContext);
  return selectionContext;
};

const sendRenderedDictionary = (ipcRenderer, selectionContext, html) => {
  if (!selectionContext) return;
  ipcRenderer.send("analysisDictionaryRendered", selectionContext, html);
};

const sendDictionaryRenderFailed = (ipcRenderer, selectionContext, error) => {
  if (!selectionContext) return;

  const errorDetails = {
    name: error?.name || "Error",
    message: error?.message || String(error),
  };

  ipcRenderer.send(
    "analysisDictionaryRenderFailed",
    selectionContext,
    errorDetails,
  );
};

module.exports = {
  sendDictionaryRenderFailed,
  sendRenderedDictionary,
  sendSelectedWord,
};
