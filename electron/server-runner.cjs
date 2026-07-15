/* eslint-disable @typescript-eslint/no-require-imports */

const path = require("node:path");
const Module = require("node:module");

const reportError = (...values) => {
  const text = values
    .map((value) => (value instanceof Error ? value.stack || value.message : String(value)))
    .join(" ");
  process.parentPort?.postMessage({ type: "server-error", text });
};
const originalConsoleError = console.error;
console.error = (...values) => {
  reportError(...values);
  originalConsoleError(...values);
};
process.on("uncaughtException", reportError);
process.on("unhandledRejection", reportError);

const entry = process.env.NEXT_SERVER_ENTRY;
if (!entry) throw new Error("Missing local parser server entry point.");

const runtimeNodeModules = process.env.NEXT_SERVER_NODE_MODULES;
if (runtimeNodeModules) {
  // Electron utility processes do not inherit NODE_PATH's module search list.
  // Initialise it here so the standalone Next server can resolve its runtime.
  process.env.NODE_PATH = runtimeNodeModules;
  Module._initPaths();
}

if (process.env.NEXT_SERVER_MODE === "development") {
  // utilityProcess.fork loads a module rather than executing a CLI. Set the
  // argument list Next's CLI expects before loading it.
  const args = JSON.parse(process.env.NEXT_SERVER_ARGS || "[]");
  process.argv = [process.execPath, entry, ...args];
  require(path.resolve(entry));
} else {
  require(path.resolve(entry));
}
