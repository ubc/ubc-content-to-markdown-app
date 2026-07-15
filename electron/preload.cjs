/* eslint-disable @typescript-eslint/no-require-imports */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopSettings", {
  loadApiKey: () => ipcRenderer.invoke("settings:load-api-key"),
  saveApiKey: (apiKey) => ipcRenderer.invoke("settings:save-api-key", apiKey),
  clearApiKey: () => ipcRenderer.invoke("settings:clear-api-key"),
});
