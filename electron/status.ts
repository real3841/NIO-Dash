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

export interface TrayStatus {
  title: string;
  tooltip: string;
}

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function fmtClock(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtPollSec(sec: number): string {
  if (sec % 3600 === 0) return `${sec / 3600} 小时`;
  if (sec % 60 === 0) return `${sec / 60} 分钟`;
  return `${sec} 秒`;
}

function loadEnvFromFile(envFile: string): Record<string, string> {
  try {
    if (!fs.existsSync(envFile)) return {};
    return parseEnvFromFile(fs.readFileSync(envFile, "utf8"));
  } catch {
    return {};
  }
}

export function readTrayStatus(dataDir: string, envFile: string): TrayStatus {
  const env = loadEnvFromFile(envFile);
  const vehiclePollSec = getVehiclePollIntervalSec(env, dataDir);
  const changePollSec = getChangePollIntervalSec(env);
  const vehicleState = readVehicleState(dataDir);
  const pollReason = vehiclePollReason(vehicleState);

  const vehicle = readJson<{
    data?: { status?: { soc_status?: { soc?: number; remaining_range?: number } } };
  }>(path.join(dataDir, "vehicle.json"));

  const vehicleMeta = readJson<{ ok?: boolean; at?: number; error?: string | null }>(
    path.join(dataDir, "last-fetch.json"),
  );
  const changeMeta = readJson<{ ok?: boolean; at?: number; error?: string | null }>(
    path.join(dataDir, "last-fetch-change.json"),
  );
  const change = readJson<{ resultData?: { data?: unknown[] } }>(path.join(dataDir, "change.json"));

  const soc = vehicle?.data?.status?.soc_status?.soc;
  const range = vehicle?.data?.status?.soc_status?.remaining_range;
  const orders = change?.resultData?.data;
  const orderCount = Array.isArray(orders) ? orders.length : null;

  let title = "蔚来";
  if (typeof soc === "number") {
    const socText = Number.isInteger(soc) ? `${soc}%` : `${soc.toFixed(1)}%`;
    title = typeof range === "number" ? `${socText} · ${range}km` : socText;
  }

  const lines = ["蔚来车辆看板"];
  if (typeof soc === "number") {
    lines.push(`电量 ${Number.isInteger(soc) ? soc : soc.toFixed(1)}%`);
  }
  if (typeof range === "number") lines.push(`续航 ${range} km`);
  if (orderCount !== null) lines.push(`换电/服务记录 ${orderCount} 条`);
  lines.push(
    `车辆拉取 · ${vehiclePollLabel(pollReason)} 每 ${fmtPollSec(vehiclePollSec)}（行驶/白天/夜间可配）`,
  );
  lines.push(`换电拉取 · 每 ${fmtPollSec(changePollSec)}`);
  if (vehicleMeta?.at) {
    lines.push(
      `车辆 ${vehicleMeta.ok ? "✓" : "✗"} ${fmtClock(vehicleMeta.at)}${vehicleMeta.error ? ` · ${vehicleMeta.error}` : ""}`,
    );
  }
  if (changeMeta?.at) {
    lines.push(
      `换电 ${changeMeta.ok ? "✓" : "✗"} ${fmtClock(changeMeta.at)}${changeMeta.error ? ` · ${changeMeta.error}` : ""}`,
    );
  }

  return { title, tooltip: lines.join("\n") };
}
