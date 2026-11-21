const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

test("keeps ichi diagnostic context until the successful IPC result is sent", () => {
  const domReadyHandlers = [];
  const ipcRenderer = new EventEmitter();
  const sent = [];
  const originalLoad = Module._load;
  const previousDocument = global.document;
  const previousSessionStorage = global.sessionStorage;
  const previousSetTimeout = global.setTimeout;
  const previousWindow = global.window;
  let storedContext = JSON.stringify({ requestId: "request-1" });
  let removed = false;

  global.window = {
    addEventListener: (event, handler) => {
      if (event === "DOMContentLoaded") domReadyHandlers.push(handler);
    },
  };
  global.document = {
    body: { children: [{}] },
    location: { href: "https://ichi.moe/cl/qr/?q=猫&r=kana" },
    querySelector: () => undefined,
    querySelectorAll: (selector) => {
      if (selector === ".gloss-row" || selector === ".word-chunk .jspPane") {
        return [];
      }
      if (selector === ".query-text") return [{ textContent: "猫" }];
      throw new Error(`unexpected selector: ${selector}`);
    },
  };
  global.sessionStorage = {
    getItem: () => storedContext,
    removeItem: () => {
      removed = true;
      storedContext = null;
    },
    setItem: () => {},
  };
  global.setTimeout = () => undefined;
  ipcRenderer.send = (...args) => {
    sent.push({ args, contextAtSend: storedContext });
  };

  Module._load = function load(request, parent, isMain) {
    if (request === "electron") return { ipcRenderer };
    if (request === "jquery") return () => ({ length: 0 });
    if (request === "module-alias/register") return {};
    return originalLoad.call(this, request, parent, isMain);
  };

  const entryPoint = path.resolve(__dirname, "../../src/boxes/ichi/script.js");
  delete require.cache[entryPoint];
  try {
    require(entryPoint);
    domReadyHandlers.forEach((handler) => handler());
  } finally {
    Module._load = originalLoad;
    delete require.cache[entryPoint];
    global.document = previousDocument;
    global.sessionStorage = previousSessionStorage;
    global.setTimeout = previousSetTimeout;
    global.window = previousWindow;
  }

  assert.deepEqual(sent, [
    {
      args: [
        "sendParsedData",
        [
          {
            definitions: "",
            dictForm: "",
            dictFormReading: "",
            rubyReading: "",
            word: "猫",
          },
        ],
        "猫",
        { requestId: "request-1" },
        { dom: { queryText: ["猫"], wordChunks: [] } },
      ],
      contextAtSend: JSON.stringify({ requestId: "request-1" }),
    },
  ]);
  assert.equal(removed, true);
});
