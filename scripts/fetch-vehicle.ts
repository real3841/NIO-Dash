import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { fetchFromApi, loadFetchConfig } from "./nio-api.js";
import {
  getDataDir,
  getHistoryFile,
  getProjectRoot,
  getVehicleFile,
  getVehicleMetaFile,
} from "./paths.js";
import { syncPublicData } from "./sync-public-data.js";
import { isDirectCliInvocation } from "./cli-main.js";
import { appendFetchLog } from "./fetch-log.js";
import { buildApiRequestDetail, vehicleErrorDetail, vehicleSuccessDetail } from "./fetch-log-detail.js";
import { normalizeRvsVehiclePayload } from "./nio-rvs.js";
import { writeJsonAtomic } from "./atomic-write.js";
import {
  appendSnapshotHistory,
  HISTORY_MAX_POINTS,
  snapshotFromResponse,
  type VehicleSnapshot,
} from "../src/lib/vehicle.js";

const ROOT = path.resolve(getProjectRoot());
loadEnv({ path: path.join(ROOT, "deploy", ".env") });
loadEnv({ path: path.join(ROOT, ".env") });

function assertVehiclePayload(payload: Record<string, unknown>): void {
  const code = payload.result_code ?? payload.resultCode;
  if (code && code !== "success" && code !== "0000") {
    const desc =
      payload.display_msg ??
      payload.message ??
      payload.debug_msg ??
      payload.result_desc ??
      String(code);
    throw new Error(`车辆 API 失败: ${desc}`);
  }
}

function normalizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  assertVehiclePayload(payload);
  return normalizeRvsVehiclePayload(payload) as Record<string, unknown>;
}

function snapshotFromPayload(payload: Record<string, unknown>): VehicleSnapshot {
  return snapshotFromResponse(payload as never);
}

function appendHistory(snapshot: VehicleSnapshot): void {
  const historyFile = getHistoryFile();
  let history: VehicleSnapshot[] = [];
  if (fs.existsSync(historyFile)) {
    history = JSON.parse(fs.readFileSync(historyFile, "utf8")) as VehicleSnapshot[];
  }
  history = appendSnapshotHistory(history, snapshot, HISTORY_MAX_POINTS);
  writeJsonAtomic(historyFile, history);
}

function writeMeta(ok: boolean, error?: string): void {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  writeJsonAtomic(getVehicleMetaFile(), {
    ok,
    at: Date.now(),
    error: error ?? null,
  });
}

export async function runVehicleOnce(): Promise<void> {
  let payload: Record<string, unknown> | undefined;
  let apiRequest = null as ReturnType<typeof buildApiRequestDetail> | null;
  const dataFile = getVehicleFile();

  try {
    if (
      process.env.NIO_VEHICLE_API_URL ||
      process.env.NIO_API_URL ||
      process.env.NIO_VEHICLE_API_MODE === "widget" ||
      process.env.NIO_API_MODE === "widget" ||
      process.env.NIO_VEHICLE_ID ||
      process.env.NIO_ID ||
      process.env.NIO_VEHICLE_API_HEADERS ||
      process.env.NIO_API_HEADERS ||
      process.env.NIO_VEHICLE_ACCESS_TOKEN ||
      process.env.NIO_ACCESS_TOKEN
    ) {
      const apiConfig = loadFetchConfig();
      apiRequest = buildApiRequestDetail(apiConfig);
      console.log(`请求 ${apiConfig.method} ${apiConfig.url}`);
      if (apiConfig.body) {
        console.log(`Body: ${apiConfig.body.slice(0, 120)}${apiConfig.body.length > 120 ? "…" : ""}`);
      }
      payload = await fetchFromApi(apiConfig);
    } else if (fs.existsSync(dataFile)) {
      payload = JSON.parse(fs.readFileSync(dataFile, "utf8"));
      apiRequest = buildApiRequestDetail({ method: "LOCAL", url: dataFile });
      console.log("未配置 API，跳过网络请求，仅刷新本地 vehicle.json");
    } else {
      throw new Error("请配置 NIO_API_URL 或放置 data/vehicle.json");
    }

    const normalized = normalizePayload(payload!);
    const snap = snapshotFromPayload(normalized);

    const dataDir = getDataDir();
    fs.mkdirSync(dataDir, { recursive: true });
    writeJsonAtomic(dataFile, normalized);
    appendHistory(snap);
    writeMeta(true);

    syncPublicData();

    appendFetchLog(
      "vehicle",
      "success",
      `采样 ${new Date(snap.ts).toLocaleString("zh-CN")} · 电量 ${snap.soc}% · 标准续航 ${snap.range}km · 实际 ${snap.actualRange}km · 里程 ${snap.mileage.toLocaleString()}km`,
      vehicleSuccessDetail(normalized, snap, apiRequest),
    );

    console.log(`已写入 ${dataFile}`);
    console.log(`历史 ${getHistoryFile()} · 采样 ${new Date(snap.ts).toLocaleString("zh-CN")}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendFetchLog("vehicle", "error", `拉取失败：${message}`, vehicleErrorDetail(message, payload, apiRequest));
    writeMeta(false, message);
    throw err;
  }
}

if (isDirectCliInvocation("fetch-vehicle.ts")) {
  void runVehicleOnce().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
