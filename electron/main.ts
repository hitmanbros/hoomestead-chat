import { app, BrowserWindow, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";

let mainWindow: BrowserWindow | null = null;

// VPS backend URL (Tailscale IP — reachable from both desktop and mobile)
const BACKEND_URL = "http://100.64.108.87:18080";

const UPDATE_REPO = "hitmanbros/hoomestead-chat";

/** semver compare: returns >0 if a is newer than b. */
function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/**
 * macOS update check. Squirrel.Mac auto-update needs a signed + notarized app,
 * which we don't have, so we only DETECT here and let the user download the
 * dmg manually. Reads the version from latest-mac.yml on the GitHub release.
 */
async function checkMacUpdate(): Promise<void> {
  try {
    const rel = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "openclaw-client" },
    });
    if (!rel.ok) return;
    const data: any = await rel.json();
    const ymlAsset = (data.assets || []).find((a: any) => a.name === "latest-mac.yml");
    if (!ymlAsset) return;
    const ymlRes = await fetch(ymlAsset.browser_download_url, {
      headers: { "User-Agent": "openclaw-client" },
    });
    if (!ymlRes.ok) return;
    const m = (await ymlRes.text()).match(/^version:\s*(.+)$/m);
    if (!m) return;
    const latest = m[1].trim();
    if (isNewer(latest, app.getVersion())) {
      mainWindow?.webContents.send("update-available", {
        version: latest,
        manual: true,
        url: data.html_url,
      });
    }
  } catch {
    // network/parse errors are non-fatal — silently skip
  }
}

/** Trigger an update check appropriate for the platform. */
function triggerUpdateCheck(): void {
  if (!app.isPackaged) return;
  if (process.platform === "darwin") {
    void checkMacUpdate();
  } else {
    autoUpdater.checkForUpdates();
  }
}

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

  ipcMain.handle("get-app-version", () => app.getVersion());

  ipcMain.handle("check-for-updates", () => {
    triggerUpdateCheck();
  });

  ipcMain.handle("open-external", (_e, url: string) => shell.openExternal(url));

  ipcMain.handle("download-update", () => {
    autoUpdater.downloadUpdate();
  });

  ipcMain.handle("install-update", () => {
    autoUpdater.quitAndInstall();
  });

  setupAutoUpdater();
  createWindow();

  triggerUpdateCheck();

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
