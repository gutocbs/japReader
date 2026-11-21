const fileSystem = require("node:fs/promises");
const path = require("node:path");

const CURRENT_FILE = "ichiran-analysis.jsonl";
const PREVIOUS_FILE = "ichiran-analysis.previous.jsonl";
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const WRITE_WARNING = "Unable to write Ichiran analysis diagnostics.";

const fileSize = async (fs, file) => {
  try {
    return (await fs.stat(file)).size;
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
};

const removeIfPresent = async (fs, file) => {
  try {
    await fs.unlink(file);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
};

const createAnalysisLogWriter = ({
  enabled,
  logsDirectory,
  fileSystem: injectedFileSystem = fileSystem,
  maxBytes = DEFAULT_MAX_BYTES,
  now = () => new Date().toISOString(),
  warn = console.warn,
}) => {
  if (!enabled) {
    return { close: async () => {}, record: () => {} };
  }

  const currentFile = path.join(logsDirectory, CURRENT_FILE);
  const previousFile = path.join(logsDirectory, PREVIOUS_FILE);
  let queue = Promise.resolve();
  let warned = false;

  const write = async (event) => {
    try {
      const line = `${JSON.stringify({
        ...event,
        schemaVersion: 1,
        timestamp: now(),
      })}\n`;
      const lineBytes = Buffer.byteLength(line, "utf8");

      await injectedFileSystem.mkdir(logsDirectory, { recursive: true });
      if (
        (await fileSize(injectedFileSystem, currentFile)) + lineBytes >
        maxBytes
      ) {
        await removeIfPresent(injectedFileSystem, previousFile);
        try {
          await injectedFileSystem.rename(currentFile, previousFile);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
      await injectedFileSystem.appendFile(currentFile, line, "utf8");
      warned = false;
    } catch {
      if (!warned) {
        warned = true;
        warn(WRITE_WARNING);
      }
    }
  };

  const record = (event) => {
    queue = queue.then(
      () => write(event),
      () => write(event),
    );
  };

  return { close: () => queue, record };
};

module.exports = { createAnalysisLogWriter };
