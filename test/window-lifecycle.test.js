const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const flush = () => new Promise((resolve) => setImmediate(resolve));

const startApplicationWithOptions = async (configuredOptions = {}) => {
  const windows = [];
  const ipcMain = new EventEmitter();

  class FakeBrowserWindow extends EventEmitter {
    constructor(config) {
      super();
      this.config = config;
      this.maximizeCalls = 0;
      this.alwaysOnTopCalls = [];
      this.webContents = { send: () => {} };
      windows.push(this);
    }

    getNormalBounds() {
      return { height: 600, width: 800, x: 0, y: 0 };
    }

    hide() {}

    loadFile() {}

    loadURL() {}

    setAlwaysOnTop(value) {
      this.alwaysOnTopCalls.push(value);
    }

    maximize() {
      this.maximizeCalls += 1;
      this.emit("maximize");
    }

    show() {
      this.emit("show");
    }
  }

  FakeBrowserWindow.getAllWindows = () => windows;

  class FakeStore {
    constructor(options) {
      this.name = options.name;
      this.store = {
        options:
          this.name === "options"
            ? {
                translationTransparent: false,
                useDeepL: false,
                useDeepLApi: false,
                useIchiMoeForShortText: false,
                useReader: true,
                ...configuredOptions,
              }
            : undefined,
      };
    }

    delete() {}

    get(key) {
      if (
        this.name === "window_settings" &&
        ["options", "reader"].includes(key)
      ) {
        return { isMaximized: true };
      }

      if (this.name === "options" && key === "options") {
        return this.store.options;
      }

      return undefined;
    }

    has(key) {
      return (
        this.name === "window_settings" && ["options", "reader"].includes(key)
      );
    }

    set(key, value) {
      this.store[key] = value;
    }
  }

  const app = new EventEmitter();
  app.exit = () => {};
  app.quit = () => {};
  app.relaunch = () => {};
  app.whenReady = () => Promise.resolve();

  ipcMain.handle = () => {};

  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === "electron") {
      return {
        app,
        BrowserWindow: FakeBrowserWindow,
        dialog: {},
        globalShortcut: { register: () => {}, unregister: () => {} },
        ipcMain,
        shell: {
          openExternal: () => {},
          openPath: () => {},
          showItemInFolder: () => {},
        },
      };
    }

    if (request === "electron-store") return FakeStore;
    if (request === "electron-squirrel-startup") return false;
    if (request === "module-alias/register") return {};
    if (request === "@tools") {
      return {
        dirname_path: (file) => file,
        getHistoryLogsOptions: () => ({ name: "history" }),
        getOptionsStoreOptions: () => ({ name: "options" }),
        getWindowStoreOptions: () => ({ name: "window_settings" }),
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  const entryPoint = path.resolve(__dirname, "../src/index.js");
  delete require.cache[entryPoint];
  try {
    require(entryPoint);
    await flush();
  } finally {
    Module._load = originalLoad;
    delete require.cache[entryPoint];
  }

  return { ipcMain, windows };
};

test("keeps restored maximized Options hidden until openOptions explicitly shows it", async () => {
  const { ipcMain, windows } = await startApplicationWithOptions();
  const optionsWindow = windows.find(
    (window) => window.config.identifier === "options",
  );
  const readerWindow = windows.find((window) => window.config.height === 200);

  assert.ok(optionsWindow);
  assert.ok(readerWindow);
  assert.equal(optionsWindow.maximizeCalls, 0);
  assert.equal(readerWindow.maximizeCalls, 1);

  ipcMain.emit("openOptions");
  assert.equal(optionsWindow.maximizeCalls, 1);

  optionsWindow.show();
  assert.equal(optionsWindow.maximizeCalls, 1);
});

test("applies independent persisted always-on-top values and flips an enabled reader on its first shortcut", async () => {
  const { ipcMain, windows } = await startApplicationWithOptions({
    dictAlwaysOnTop: false,
    readerAlwaysOnTop: true,
    translationAlwaysOnTop: true,
    useDeepL: true,
  });
  const readerWindow = windows.find(
    (window) =>
      window.config.height === 200 && window.config.closable === undefined,
  );
  const dictWindow = windows.find((window) => window.config.width === 400);
  const translationWindow = windows.find(
    (window) =>
      window.config.height === 200 && window.config.closable === false,
  );

  assert.deepEqual(readerWindow.alwaysOnTopCalls, [true]);
  assert.deepEqual(dictWindow.alwaysOnTopCalls, [false]);
  assert.deepEqual(translationWindow.alwaysOnTopCalls, [true]);

  ipcMain.emit("readerOnTop");
  assert.deepEqual(readerWindow.alwaysOnTopCalls, [true, false]);
});
