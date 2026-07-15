import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, shell } from "electron";

const electronDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
let serverProcess = null;
let isQuitting = false;

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

function waitForServer(url, child) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 45_000;

    const check = async () => {
      if (child.exitCode !== null) {
        reject(new Error(`The local parser server exited with code ${child.exitCode}.`));
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
  const args = app.isPackaged
    ? [entry]
    : [entry, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)];

  serverProcess = spawn(process.execPath, args, {
    cwd: serverRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: "127.0.0.1",
      ...(app.isPackaged
        ? { NODE_PATH: path.join(process.resourcesPath, "app.asar", "node_modules") }
        : {}),
      NODE_ENV: app.isPackaged ? "production" : "development",
      PORT: String(port),
    },
    stdio: app.isPackaged ? "ignore" : "inherit",
    windowsHide: true,
  });

  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url, serverProcess);
  return url;
}

function stopServer() {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
  }
  serverProcess = null;
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
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith("https://")) void shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  await mainWindow.loadURL(url);
}

app.whenReady().then(async () => {
  try {
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
