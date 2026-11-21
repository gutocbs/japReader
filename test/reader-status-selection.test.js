const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const startReader = () => {
  const domReadyHandlers = [];
  const ipcRenderer = new EventEmitter();
  const sent = [];
  const wordElements = [];
  const originalLoad = Module._load;
  const previousWindow = global.window;
  const previousDocument = global.document;
  const statusData = { known: [], seen: [], ignored: [] };
  const app = {
    classList: { add: () => {}, remove: () => {} },
    style: {},
  };
  const element = () => ({
    classList: { add: () => {}, remove: () => {} },
    style: {},
  });
  const jquery = (value) => {
    if (value === global.window) return { on: () => {} };
    if (value === "#app") {
      return {
        append: (child) => {
          if (typeof child === "object") wordElements.push(child);
        },
        empty: () => {},
        html: () => {},
      };
    }
    if (typeof value === "string") {
      return {
        addClass: () => {},
        mousedownHandler: undefined,
        on(event, handler) {
          if (event === "mousedown") this.mousedownHandler = handler;
        },
      };
    }
    return value;
  };

  global.window = {
    addEventListener: (event, handler) => {
      if (event === "DOMContentLoaded") domReadyHandlers.push(handler);
    },
  };
  global.document = {
    body: element(),
    documentElement: element(),
    querySelector: (selector) => (selector === "#app" ? app : element()),
    querySelectorAll: () => [],
  };
  ipcRenderer.send = (...args) => sent.push(args);

  Module._load = function load(request, parent, isMain) {
    if (request === "electron") return { ipcRenderer };
    if (request === "electron-store") {
      return class FakeStore {
        get(key) {
          if (key === "status_data") return statusData;
          return {
            addFuriganaIgnored: false,
            addFuriganaKnown: false,
            addFuriganaNew: false,
            addFuriganaSeen: false,
            darkMode: false,
            fadeText: false,
            fontFamily: "Noto Sans JP",
            leftClickDisregardStatus: false,
            readerAlwaysOnTop: false,
            readerFontSize: 18,
            tvMode: false,
            useDeepL: false,
          };
        }

        set() {}
      };
    }
    if (request === "@tools") {
      return {
        getOptionsStoreOptions: () => ({}),
        getStatusDataStoreOptions: () => ({}),
        toggle_onTop: () => false,
      };
    }
    if (request === "jquery") return jquery;
    if (request === "furigana")
      return { fit: (word, reading) => [{ w: word, r: reading }] };
    if (request === "module-alias/register") return {};
    return originalLoad.call(this, request, parent, isMain);
  };

  const entryPoint = path.resolve(__dirname, "../src/boxes/reader/script.js");
  delete require.cache[entryPoint];
  require(entryPoint);
  domReadyHandlers.forEach((handler) => handler());

  return {
    dispose: () => {
      Module._load = originalLoad;
      delete require.cache[entryPoint];
      global.window = previousWindow;
      global.document = previousDocument;
    },
    ipcRenderer,
    sent,
    wordElements,
  };
};

test("selecting a new word records its numeric word index after marking it seen", () => {
  const reader = startReader();
  try {
    const context = {
      provider: "ichi",
      requestId: "request-1",
      text: "今では",
    };
    const word = {
      definitions: "<dl>definition</dl>",
      dictForm: "今では",
      dictFormReading: "いまでは",
      rubyReading: "いまでは",
      word: "今では",
    };

    reader.ipcRenderer.emit("receiveParsedData", {}, [word], "今では", context);
    reader.wordElements[0].mousedownHandler({ ctrlKey: false, which: 1 });

    assert.deepEqual(
      reader.sent.find(([channel]) => channel === "analysisWordSelected"),
      [
        "analysisWordSelected",
        {
          provider: "ichi",
          requestId: "request-1",
          text: "今では",
          wordIndex: 0,
        },
        { ...word, fullText: "今では", status: "seen" },
      ],
    );
  } finally {
    reader.dispose();
  }
});
