import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  shell,
  utilityProcess,
} from "electron";

const electronDirectory = path.dirname(fileURLToPath(import.meta.url));
const MAX_API_KEY_LENGTH = 512;
let mainWindow = null;
let serverProcess = null;
let serverExitCode = null;
let serverErrorOutput = "";
let isQuitting = false;
let trustedOrigin = "";

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

async function saveApiKey(apiKey) {
  const value = apiKey.trim();
  const filePath = settingsPath();
  if (!value) {
    await rm(filePath, { force: true });
    return;
  }
  if (value.length > MAX_API_KEY_LENGTH) {
    throw new Error("The OpenAI API key is too long.");
  }
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error("Secure key storage is unavailable on this computer.");
  }

  const encryptedApiKey = await safeStorage.encryptStringAsync(value);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    JSON.stringify({ encryptedApiKey: encryptedApiKey.toString("base64") }),
    { mode: 0o600 },
  );
}

async function loadApiKey() {
  try {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) return "";
    const settings = JSON.parse(await readFile(settingsPath(), "utf8"));
    if (!settings || typeof settings.encryptedApiKey !== "string") return "";
    const decrypted = await safeStorage.decryptStringAsync(
      Buffer.from(settings.encryptedApiKey, "base64"),
    );
    if (decrypted.shouldReEncrypt) await saveApiKey(decrypted.result);
    return decrypted.result;
  } catch {
    return "";
  }
}

function requireTrustedSender(event) {
  const origin = new URL(event.senderFrame.url).origin;
  if (!trustedOrigin || origin !== trustedOrigin) {
    throw new Error("This request was not sent by the local app.");
  }
}

function installSettingsHandlers() {
  ipcMain.handle("settings:load-api-key", async (event) => {
    requireTrustedSender(event);
    return loadApiKey();
  });
  ipcMain.handle("settings:save-api-key", async (event, apiKey) => {
    requireTrustedSender(event);
    if (typeof apiKey !== "string") throw new Error("The OpenAI API key is invalid.");
    await saveApiKey(apiKey);
  });
  ipcMain.handle("settings:clear-api-key", async (event) => {
    requireTrustedSender(event);
    await saveApiKey("");
  });
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a local port."));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function waitForServer(url) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 45_000;

    const check = async () => {
      if (serverExitCode !== null) {
        const details = serverErrorOutput.trim();
        reject(
          new Error(
            `The local parser server exited with code ${serverExitCode ?? "unknown"}.` +
              (details ? `\n\n${details}` : ""),
          ),
        );
        return;
      }

      try {
        const response = await fetch(url);
        if (response.ok) {
          resolve();
          return;
        }
      } catch {
        // The local server is still starting.
      }

      if (Date.now() >= deadline) {
        reject(new Error("The local parser server did not start in time."));
        return;
      }
      setTimeout(check, 150);
    };

    check();
  });
}

async function startServer() {
  const port = await reservePort();
  const projectRoot = path.join(electronDirectory, "..");
  const serverRoot = app.isPackaged
    ? path.join(process.resourcesPath, "server")
    : projectRoot;
  const entry = app.isPackaged
    ? path.join(serverRoot, "server.js")
    : path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
  const runner = app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked", "electron", "server-runner.cjs")
    : path.join(electronDirectory, "server-runner.cjs");
  const args = app.isPackaged
    ? [entry]
    : [entry, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)];

  // utilityProcess is Electron's native background-process API. Unlike spawning
  // an Electron executable directly, macOS will not add it as a second Dock app.
  serverExitCode = null;
  serverErrorOutput = "";
  serverProcess = utilityProcess.fork(runner, [], {
    cwd: serverRoot,
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      NEXT_SERVER_ENTRY: entry,
      NEXT_SERVER_MODE: app.isPackaged ? "production" : "development",
      NEXT_SERVER_ARGS: JSON.stringify(app.isPackaged ? [] : args.slice(1)),
      NEXT_SERVER_NODE_MODULES: app.isPackaged
        ? path.join(process.resourcesPath, "app.asar", "node_modules")
        : path.join(projectRoot, "node_modules"),
      ...(app.isPackaged
        ? { NODE_PATH: path.join(process.resourcesPath, "app.asar", "node_modules") }
        : {}),
      NODE_ENV: app.isPackaged ? "production" : "development",
      PORT: String(port),
    },
    stdio: app.isPackaged ? "pipe" : "inherit",
    serviceName: "Document Parser Server",
  });
  serverProcess.once("exit", (code) => {
    serverExitCode = code;
  });
  serverProcess.on("message", (message) => {
    if (message?.type === "server-error" && typeof message.text === "string") {
      serverErrorOutput = `${serverErrorOutput}${message.text}\n`.slice(-8_000);
    }
  });
  serverProcess.stderr?.on("data", (chunk) => {
    serverErrorOutput = `${serverErrorOutput}${chunk}`.slice(-8_000);
  });

  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  trustedOrigin = new URL(url).origin;
  return url;
}

function stopServer() {
  if (serverProcess?.pid) {
    serverProcess.kill();
  }
  serverProcess = null;
  serverExitCode = null;
  serverErrorOutput = "";
}

async function createWindow() {
  const url = await startServer();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 900,
    minHeight: 680,
    show: false,
    backgroundColor: "#f5f3ed",
    title: "Document Parser Audit Lab",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(electronDirectory, "preload.cjs"),
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith("https://")) void shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (new URL(target).origin !== trustedOrigin) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  await mainWindow.loadURL(url);
}

app.whenReady().then(async () => {
  try {
    installSettingsHandlers();
    await createWindow();
  } catch (error) {
    stopServer();
    const detail = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("Document Parser Audit Lab could not start", detail);
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && !serverProcess) {
    void createWindow();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  stopServer();
});

app.on("window-all-closed", () => {
  stopServer();
  if (process.platform !== "darwin" || isQuitting) app.quit();
});
