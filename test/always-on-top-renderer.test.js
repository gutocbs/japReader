const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const startRenderer = (script, enabledOption) => {
  const domReadyHandlers = [];
  const ipcRenderer = new EventEmitter();
  const keyHandlers = [];
  const toggleInputs = [];
  const sentChannels = [];
  const originalLoad = Module._load;
  const previousWindow = global.window;
  const previousDocument = global.document;
  const element = () => ({
    classList: { add: () => {}, remove: () => {} },
    style: {},
  });
  const jqueryObject = {
    append: () => {},
    html: () => {},
    on: (event, handler) => {
      if (event === "keydown") keyHandlers.push(handler);
    },
  };

  global.window = {
    addEventListener: (event, handler) => {
      if (event === "DOMContentLoaded") domReadyHandlers.push(handler);
    },
  };
  global.document = {
    body: element(),
    documentElement: element(),
    querySelector: () => element(),
  };
  ipcRenderer.send = (channel) => sentChannels.push(channel);

  Module._load = function load(request, parent, isMain) {
    if (request === "electron") return { ipcRenderer };
    if (request === "electron-store") {
      return class FakeStore {
        get() {
          return {
            ankiDeckName: "japReader",
            ankiDefinitions: "Definitions",
            ankiDictForm: "DictForm",
            ankiDictFormFurigana: "DictFormFurigana",
            ankiDictFormReading: "DictFormReading",
            ankiEnglish: "English",
            ankiIntegration: false,
            ankiJapanese: "Japanese",
            ankiModelName: "japReader",
            ankiWord: "Word",
            ankiWordFurigana: "WordFurigana",
            ankiWordReading: "WordReading",
            darkMode: false,
            dictFontSize: 12,
            fadeText: false,
            fontFamily: "NotoSansJP",
            leftClickDisregardStatus: false,
            readerFontSize: 18,
            translationFontSize: 12,
            translationTransparent: false,
            tvMode: false,
            useDeepL: false,
            useDeepLApi: false,
            [enabledOption]: true,
          };
        }
      };
    }
    if (request === "@tools") {
      return {
        getOptionsStoreOptions: () => ({}),
        getStatusDataStoreOptions: () => ({}),
        toggle_onTop: (onTop) => {
          toggleInputs.push(onTop);
          return !onTop;
        },
      };
    }
    if (request === "jquery") return () => jqueryObject;
    if (request === "furigana") return { fit: () => "" };
    if (request === "module-alias/register") return {};
    return originalLoad.call(this, request, parent, isMain);
  };

  const entryPoint = path.resolve(
    __dirname,
    `../src/boxes/${script}/script.js`,
  );
  delete require.cache[entryPoint];
  try {
    require(entryPoint);
    domReadyHandlers.forEach((handler) => handler());
    keyHandlers.forEach((handler) => handler({ key: "s" }));
  } finally {
    Module._load = originalLoad;
    delete require.cache[entryPoint];
    global.window = previousWindow;
    global.document = previousDocument;
  }

  return { sentChannels, toggleInputs };
};

test("initially enabled renderer shortcuts flip their own persisted on-top state", () => {
  const renderers = [
    ["reader", "readerAlwaysOnTop", "readerOnTop"],
    ["dict", "dictAlwaysOnTop", "dictOnTop"],
    ["translation", "translationAlwaysOnTop", "translationOnTop"],
  ];

  for (const [script, option, channel] of renderers) {
    const { sentChannels, toggleInputs } = startRenderer(script, option);
    assert.deepEqual(toggleInputs, [true]);
    assert.ok(sentChannels.includes(channel));
  }
});
