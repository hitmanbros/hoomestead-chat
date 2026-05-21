import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";

let mainWindow: BrowserWindow | null = null;

// VPS backend URL (Tailscale IP — reachable from both desktop and mobile)
const BACKEND_URL = "http://100.64.108.87:8787";

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    console.log(`Update available: v${info.version}`);
    mainWindow?.webContents.send("update-available", {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("update-progress", {
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on("update-downloaded", () => {
    console.log("Update downloaded, ready to install");
    mainWindow?.webContents.send("update-downloaded");
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-updater error:", err.message);
    mainWindow?.webContents.send("update-error", err.message);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 500,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#1e1f22",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  ipcMain.handle("window-minimize", () => mainWindow?.minimize());
  ipcMain.handle("window-maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.handle("window-close", () => mainWindow?.close());

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:1420");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  ipcMain.handle("get-backend-url", () => BACKEND_URL);

  ipcMain.handle("check-for-updates", () => {
    if (app.isPackaged) {
      autoUpdater.checkForUpdates();
    }
  });

  ipcMain.handle("download-update", () => {
    autoUpdater.downloadUpdate();
  });

  ipcMain.handle("install-update", () => {
    autoUpdater.quitAndInstall();
  });

  setupAutoUpdater();
  createWindow();

  if (app.isPackaged) {
    autoUpdater.checkForUpdates();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  // no-op
});
