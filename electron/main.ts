import { app, BrowserWindow, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { startAppServer } from "../scripts/app-server.js";
import { createTrayController, type TrayController } from "./tray.js";

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let serverHandle: Awaited<ReturnType<typeof startAppServer>> | null = null;
let trayController: TrayController | null = null;
let isQuitting = false;
let serverPort = 0;
let userDataDir = "";
let userEnvFile = "";

function getUserPaths() {
  const userData = app.getPath("userData");
  return {
    dataDir: path.join(userData, "data"),
    envFile: path.join(userData, "config.env"),
  };
}

function sanitizeConfigPlaceholders(envFile: string): void {
  if (!fs.existsSync(envFile)) return;
  const content = fs.readFileSync(envFile, "utf8");
  const next = content
    .replace(/NIO_VEHICLE_ACCESS_TOKEN=你的BearerToken/g, "NIO_VEHICLE_ACCESS_TOKEN=")
    .replace(/NIO_CHANGE_ACCESS_TOKEN=你的BearerToken/g, "NIO_CHANGE_ACCESS_TOKEN=")
    .replace(/NIO_CHANGE_COOKIE=tgw_l7_route=你的cookie/g, "NIO_CHANGE_COOKIE=");
  if (next !== content) {
    fs.writeFileSync(envFile, next, "utf8");
  }
}

function ensureConfigFile(envFile: string): boolean {
  if (fs.existsSync(envFile)) return false;

  const candidates = [
    path.join(process.resourcesPath, "config.env.example"),
    path.join(app.getAppPath(), "deploy", ".env.example"),
    path.join(app.getAppPath(), "config.env.example"),
  ];

  for (const src of candidates) {
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(envFile), { recursive: true });
      fs.copyFileSync(src, envFile);
      return true;
    }
  }

  fs.mkdirSync(path.dirname(envFile), { recursive: true });
  fs.writeFileSync(
    envFile,
    [
      "# 蔚来看板 Mac 版配置",
      "NIO_VEHICLE_API_MODE=widget",
      "NIO_VEHICLE_POLL_DRIVING_SEC=900",
      "NIO_VEHICLE_POLL_DAY_SEC=1800",
      "NIO_VEHICLE_POLL_NIGHT_SEC=3600",
      "NIO_CHANGE_POLL_INTERVAL=3600",
      "NIO_VEHICLE_ACCESS_TOKEN=",
      "NIO_CHANGE_ACCESS_TOKEN=",
      "",
    ].join("\n"),
    "utf8",
  );
  return true;
}

function resolveStaticDir(): string {
  const candidates = [
    path.join(app.getAppPath(), "dist"),
    path.join(process.resourcesPath, "dist"),
    path.join(__dirname, "../dist"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  }
  throw new Error("找不到前端 dist 目录，请先运行 npm run build");
}

function showMainWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  if (serverPort) {
    void createWindow(serverPort, false);
  }
}

async function triggerRefreshAll(): Promise<void> {
  if (!serverPort) return;
  const res = await fetch(`http://127.0.0.1:${serverPort}/api/fetch-now`, { method: "POST" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `刷新失败 (${res.status})`);
  }
}

function setupTray(): void {
  trayController?.destroy();
  trayController = createTrayController({
    dataDir: userDataDir,
    envFile: userEnvFile,
    onRefresh: triggerRefreshAll,
    onShowWindow: showMainWindow,
    onQuit: () => {
      isQuitting = true;
      app.quit();
    },
  });
}

async function createWindow(port: number, firstRun: boolean): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "蔚来车辆看板",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const url = `http://127.0.0.1:${port}/${firstRun ? "?setup=1" : ""}`;
  await mainWindow.loadURL(url);

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target);
    return { action: "deny" };
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function boot(): Promise<void> {
  process.env.NIO_APP_MODE = "electron";

  const { dataDir, envFile } = getUserPaths();
  userDataDir = dataDir;
  userEnvFile = envFile;
  process.env.NIO_DATA_DIR = dataDir;
  process.env.NIO_ENV_FILE = envFile;

  const firstRun = ensureConfigFile(envFile);
  sanitizeConfigPlaceholders(envFile);
  const staticDir = resolveStaticDir();

  setupTray();

  serverHandle = await startAppServer({
    host: "127.0.0.1",
    staticDir,
    dataDir,
    envFile,
    enableScheduler: true,
    deferInitialTick: true,
    onDataUpdated: () => trayController?.update(),
  });

  serverPort = serverHandle.port;
  serverHandle.reschedule();

  console.log(`蔚来看板 · http://127.0.0.1:${serverHandle.port}`);
  console.log(`配置: ${envFile}`);
  console.log(`数据: ${dataDir}`);

  await createWindow(serverHandle.port, firstRun);
}

app.whenReady().then(() => {
  void boot().catch((err) => {
    console.error(err);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  // 保留托盘常驻，关闭窗口不退出
});

app.on("activate", () => {
  showMainWindow();
});

app.on("before-quit", () => {
  isQuitting = true;
  trayController?.destroy();
  void serverHandle?.close();
});
