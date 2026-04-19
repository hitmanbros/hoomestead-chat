import { contextBridge, ipcRenderer } from "electron";

let cachedBackendUrl: string | null = null;

// Fetch backend URL immediately — this resolves before the page finishes loading
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
  runUpdate: () => ipcRenderer.invoke("run-update"),
});
