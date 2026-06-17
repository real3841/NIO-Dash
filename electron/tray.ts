import { app, Menu, nativeImage, Tray, type NativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";
import {
  getChangePollIntervalSec,
  getVehiclePollIntervalSec,
  parseEnvFromFile,
  vehiclePollLabel,
  vehiclePollReason,
  readVehicleState,
} from "../scripts/poll-interval.js";
import { readTrayStatus } from "./status.js";

export interface TrayControllerOptions {
  dataDir: string;
  envFile: string;
  onRefresh: () => Promise<void>;
  onShowWindow: () => void;
  onQuit: () => void;
}

export interface TrayController {
  update: () => void;
  destroy: () => void;
}

function loadEnvFromFile(envFile: string): Record<string, string> {
  try {
    if (!fs.existsSync(envFile)) return {};
    return parseEnvFromFile(fs.readFileSync(envFile, "utf8"));
  } catch {
    return {};
  }
}

function fmtPollSec(sec: number): string {
  if (sec % 3600 === 0) return `${sec / 3600} 小时`;
  if (sec % 60 === 0) return `${sec / 60} 分钟`;
  return `${sec} 秒`;
}

function resolveTrayIcon(): NativeImage {
  const candidates = [
    path.join(__dirname, "icons", "trayTemplate.png"),
    path.join(app.getAppPath(), "electron", "icons", "trayTemplate.png"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      const img = nativeImage.createFromPath(file);
      img.setTemplateImage(true);
      return img;
    }
  }
  const fallback =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACp5lNzAAAAMUlEQVQ4T2P8//8/AyWYYWQgCigwMjAw/GdgYGBg+M/AwMDwn4GBgYEBACxABJdQ8n3vAAAAAElFTkSuQmCC";
  const img = nativeImage.createFromDataURL(fallback);
  img.setTemplateImage(true);
  return img;
}

export function createTrayController(opts: TrayControllerOptions): TrayController {
  const tray = new Tray(resolveTrayIcon());
  tray.setToolTip("蔚来车辆看板");

  const refreshMenu = async () => {
    try {
      await opts.onRefresh();
    } catch (err) {
      console.error("[tray] refresh failed", err);
    } finally {
      update();
    }
  };

  const update = () => {
    const env = loadEnvFromFile(opts.envFile);
    const vehiclePollSec = getVehiclePollIntervalSec(env, opts.dataDir);
    const changePollSec = getChangePollIntervalSec(env);
    const pollReason = vehiclePollReason(readVehicleState(opts.dataDir));
    const status = readTrayStatus(opts.dataDir, opts.envFile);
    if (process.platform === "darwin") {
      tray.setTitle(status.title);
    }
    tray.setToolTip(status.tooltip);

    const menu = Menu.buildFromTemplate([
      { label: status.title, enabled: false },
      { type: "separator" },
      {
        label: "立即刷新（车辆 + 换电）",
        click: () => void refreshMenu(),
      },
      {
        label: "打开看板",
        click: () => opts.onShowWindow(),
      },
      { type: "separator" },
      {
        label: `车辆拉取：${vehiclePollLabel(pollReason)} · ${fmtPollSec(vehiclePollSec)}`,
        enabled: false,
      },
      {
        label: `换电拉取：每 ${fmtPollSec(changePollSec)}`,
        enabled: false,
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => opts.onQuit(),
      },
    ]);
    tray.setContextMenu(menu);
  };

  tray.on("click", () => opts.onShowWindow());

  update();
  const timer = setInterval(update, 30_000);

  return {
    update,
    destroy: () => {
      clearInterval(timer);
      tray.destroy();
    },
  };
}
