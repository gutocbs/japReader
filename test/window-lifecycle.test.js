const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const flush = () => new Promise((resolve) => setImmediate(resolve));

const startApplicationWithMaximizedHiddenOptions = async () => {
  const windows = [];
  const ipcMain = new EventEmitter();

  class FakeBrowserWindow extends EventEmitter {
    constructor(config) {
      super();
      this.config = config;
      this.maximizeCalls = 0;
      this.webContents = { send: () => {} };
      windows.push(this);
    }

    getNormalBounds() {
      return { height: 600, width: 800, x: 0, y: 0 };
    }

    hide() {}

    loadFile() {}

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
  const { ipcMain, windows } =
    await startApplicationWithMaximizedHiddenOptions();
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
