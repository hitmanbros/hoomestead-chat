import { app, BrowserWindow, ipcMain } from "electron";
import { spawn, ChildProcess } from "child_process";
import path from "path";

let mainWindow: BrowserWindow | null = null;
let sidecar: ChildProcess | null = null;
let backendPort: number | null = null;

function getSidecarPath(): string {
  const isPackaged = app.isPackaged;
  if (isPackaged) {
    // In production, the binary is bundled as an extra resource
    const ext = process.platform === "win32" ? ".exe" : "";
    return path.join(process.resourcesPath, `hoomestead-chat-server${ext}`);
  }
  // In development, use the cargo-built binary
  const ext = process.platform === "win32" ? ".exe" : "";
  return path.join(__dirname, "..", "src-rust", "target", "release", `hoomestead-chat-server${ext}`);
}

function startSidecar(): Promise<number> {
  return new Promise((resolve, reject) => {
    const binPath = getSidecarPath();
    console.log(`Starting sidecar: ${binPath}`);

    sidecar = spawn(binPath, [], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let resolved = false;

    sidecar.stdout!.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!resolved) {
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.port) {
              resolved = true;
              resolve(parsed.port);
              continue;
            }
          } catch {
            // Not JSON, ignore
          }
        }
        console.log(`[backend] ${trimmed}`);
      }
    });

    sidecar.stderr!.on("data", (data: Buffer) => {
      console.error(`[backend] ${data.toString().trim()}`);
    });

    sidecar.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Failed to start backend: ${err.message}`));
      }
    });

    sidecar.on("exit", (code) => {
      console.log(`Backend exited with code ${code}`);
      if (!resolved) {
        resolved = true;
        reject(new Error(`Backend exited prematurely with code ${code}`));
      }
      sidecar = null;
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("Backend did not report port within 10 seconds"));
      }
    }, 10000);
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

  // IPC handlers for window controls
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
  try {
    backendPort = await startSidecar();
    console.log(`Backend running on port ${backendPort}`);
  } catch (err) {
    console.error("Failed to start backend:", err);
    app.quit();
    return;
  }

  ipcMain.handle("get-backend-url", () => `http://127.0.0.1:${backendPort}`);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (sidecar) {
    sidecar.kill();
    sidecar = null;
  }
  app.quit();
});

app.on("before-quit", () => {
  if (sidecar) {
    sidecar.kill();
    sidecar = null;
  }
});
