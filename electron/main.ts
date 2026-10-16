import { app, BrowserWindow, Notification, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { startAppServer } from "../scripts/app-server.js";
import { setStockWatchAlertHandler } from "../scripts/stock-watch.js";
import { createTrayController, type TrayController } from "./tray.js";

/** macOS 26 + Electron 35 上 GPU 进程易崩溃（exit_code=15），禁用硬件加速 */
if (process.env.NIO_DISABLE_GPU !== "0") {
  app.disableHardwareAcceleration();
  for (const sw of [
    "disable-gpu",
    "disable-gpu-compositing",
    "disable-accelerated-2d-canvas",
    "disable-accelerated-video-decode",
  ]) {
    app.commandLine.appendSwitch(sw);
  }
}

let mainWindow: BrowserWindow | null = null;
let serverHandle: Awaited<ReturnType<typeof startAppServer>> | null = null;
let trayController: TrayController | null = null;
let isQuitting = false;
let serverPort = 0;
let userDataDir = "";
let userEnvFile = "";
let trayHiddenNotified = false;

function notifyHiddenToTray(): void {
  if (trayHiddenNotified) return;
  trayHiddenNotified = true;
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    title: "蔚来车辆看板",
    body: "窗口已隐藏，应用仍在菜单栏运行。点击菜单栏图标可重新打开。",
  });
  notification.show();
}

function getUserPaths() {
  const userData = app.getPath("userData");
  return {
    userData,
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
      "NIO_VEHICLE_API_URL=",
      "NIO_VEHICLE_POLL_DRIVING_SEC=900",
      "NIO_VEHICLE_POLL_DAY_SEC=1800",
      "NIO_VEHICLE_POLL_NIGHT_SEC=3600",
      "NIO_CHANGE_POLL_INTERVAL=86400",
      "NIO_TRAY_DISPLAY=soc,range",
      "NIO_VEHICLE_ACCESS_TOKEN=",
      "NIO_CHANGE_ACCESS_TOKEN=",
      "",
    ].join("\n"),
    "utf8",
  );
  return true;
}

function seedDataIfEmpty(dataDir: string): void {
  const vehicleDst = path.join(dataDir, "vehicle.json");
  if (fs.existsSync(vehicleDst)) return;

  const candidates = [
    path.join(app.getAppPath(), "data"),
    path.join(process.cwd(), "data"),
  ];

  for (const srcDir of candidates) {
    const vehicleSrc = path.join(srcDir, "vehicle.json");
    if (!fs.existsSync(vehicleSrc)) continue;
    fs.mkdirSync(dataDir, { recursive: true });
    for (const name of ["vehicle.json", "change.json", "history.json"]) {
      const src = path.join(srcDir, name);
      const dst = path.join(dataDir, name);
      if (fs.existsSync(src) && !fs.existsSync(dst)) {
        fs.copyFileSync(src, dst);
      }
    }
    return;
  }
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
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  const url = new URL(`http://127.0.0.1:${port}/`);
  if (firstRun) url.searchParams.set("setup", "1");
  await mainWindow.loadURL(url.toString());

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, desc, failedUrl) => {
    console.error(`[did-fail-load] ${code} ${desc} ${failedUrl}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[render-process-gone]", details);
    const port = serverPort;
    if (isQuitting || !port) return;
    const deadWindow = mainWindow;
    mainWindow = null;
    if (deadWindow && !deadWindow.isDestroyed()) {
      deadWindow.destroy();
    }
    setTimeout(() => {
      if (isQuitting || !port) return;
      void createWindow(port, false).catch((err) => {
        console.error("[window] recreate after renderer crash failed", err);
      });
    }, 400);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target);
    return { action: "deny" };
  });

  if (!app.isPackaged && process.env.NIO_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      notifyHiddenToTray();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function boot(): Promise<void> {
  process.env.NIO_APP_MODE = "electron";
  process.env.NIO_PROJECT_ROOT = app.getAppPath();

  const { userData, dataDir, envFile } = getUserPaths();
  process.env.NIO_USER_DATA = userData;
  userDataDir = dataDir;
  userEnvFile = envFile;
  process.env.NIO_DATA_DIR = dataDir;
  process.env.NIO_ENV_FILE = envFile;

  const firstRun = ensureConfigFile(envFile);
  sanitizeConfigPlaceholders(envFile);
  fs.mkdirSync(dataDir, { recursive: true });
  seedDataIfEmpty(dataDir);
  const staticDir = resolveStaticDir();

  setupTray();

  setStockWatchAlertHandler((items) => {
    if (!Notification.isSupported()) return;
    for (const item of items) {
      const notification = new Notification({
        title: `${item.name} 有货`,
        body: item.goodsName ? `${item.goodsName} 现在有货了` : "监控的商品现在有货了",
      });
      notification.on("click", () => {
        if (item.url) void shell.openExternal(item.url);
        showMainWindow();
      });
      notification.show();
    }
  });

  serverHandle = await startAppServer({
    host: "127.0.0.1",
    port: 17658,
    staticDir,
    dataDir,
    envFile,
    enableScheduler: true,
    deferInitialTick: true,
    onDataUpdated: () => trayController?.update(),
  });

  serverPort = serverHandle.port;
  serverHandle.rescheduleVehicle(true);
  serverHandle.armChangeSchedule();

  console.log(`蔚来看板 · http://127.0.0.1:${serverHandle.port}`);
  console.log(`配置: ${envFile}`);
  console.log(`数据: ${dataDir}`);

  await createWindow(serverHandle.port, firstRun);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    void boot().catch((err) => {
      console.error(err);
      app.quit();
    });
  });
}

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
