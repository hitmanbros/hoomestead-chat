import { contextBridge, ipcRenderer } from "electron";

let cachedBackendUrl: string | null = null;

const backendUrlPromise = ipcRenderer.invoke("get-backend-url").then((url: string) => {
  cachedBackendUrl = url;
  return url;
});

contextBridge.exposeInMainWorld("electronAPI", {
  getBackendUrl: () => cachedBackendUrl,
  getBackendUrlAsync: () => backendUrlPromise,
  minimize: () => ipcRenderer.invoke("window-minimize"),
  maximize: () => ipcRenderer.invoke("window-maximize"),
  close: () => ipcRenderer.invoke("window-close"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdateAvailable: (cb: (info: { version: string }) => void) =>
    ipcRenderer.on("update-available", (_e, info) => cb(info)),
  onUpdateProgress: (cb: (info: { percent: number }) => void) =>
    ipcRenderer.on("update-progress", (_e, info) => cb(info)),
  onUpdateDownloaded: (cb: () => void) =>
    ipcRenderer.on("update-downloaded", () => cb()),
  onUpdateError: (cb: (msg: string) => void) =>
    ipcRenderer.on("update-error", (_e, msg) => cb(msg)),
});
