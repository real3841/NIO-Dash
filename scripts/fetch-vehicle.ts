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

const ROOT = path.resolve(getProjectRoot());
loadEnv({ path: path.join(ROOT, "deploy", ".env") });
loadEnv({ path: path.join(ROOT, ".env") });

interface Snapshot {
  ts: number;
  soc: number;
  range: number;
  actualRange: number;
  mileage: number;
  lat: number;
  lng: number;
  insideTemp: number;
  outsideTemp: number;
}

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

function snapshotFromPayload(payload: Record<string, unknown>): Snapshot {
  assertVehiclePayload(payload);
  const data = payload.data as Record<string, unknown> | undefined;
  const status = data?.status as Record<string, unknown> | undefined;
  if (!status) {
    throw new Error("API 响应缺少 data.status，请检查 URL 或 Token 是否有效");
  }
  const soc = (status.soc_status ?? {}) as Record<string, number>;
  const ext = (status.exterior_status ?? {}) as Record<string, number>;
  const pos = (status.position_status ?? {}) as Record<string, number>;
  const hvac = (status.hvac_status ?? {}) as Record<string, number>;
  return {
    ts: soc.sample_time ?? Date.now(),
    soc: soc.soc ?? 0,
    range: soc.remaining_range ?? 0,
    actualRange: soc.remaining_actual_range ?? 0,
    mileage: ext.mileage ?? 0,
    lat: pos.latitude ?? 0,
    lng: pos.longitude ?? 0,
    insideTemp: hvac.temperature ?? 0,
    outsideTemp: hvac.outside_temperature ?? 0,
  };
}

function appendHistory(snapshot: Snapshot): void {
  const historyFile = getHistoryFile();
  let history: Snapshot[] = [];
  if (fs.existsSync(historyFile)) {
    history = JSON.parse(fs.readFileSync(historyFile, "utf8"));
  }
  if (!history.some((p) => p.ts === snapshot.ts)) {
    history.push(snapshot);
  }
  history.sort((a, b) => a.ts - b.ts);
  history = history.slice(-2000);
  fs.mkdirSync(path.dirname(historyFile), { recursive: true });
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

function writeMeta(ok: boolean, error?: string): void {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    getVehicleMetaFile(),
    JSON.stringify(
      {
        ok,
        at: Date.now(),
        error: error ?? null,
      },
      null,
      2,
    ),
  );
}

export async function runVehicleOnce(): Promise<void> {
  let payload: Record<string, unknown>;
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
      console.log(`请求 ${apiConfig.method} ${apiConfig.url}`);
      if (apiConfig.body) {
        console.log(`Body: ${apiConfig.body.slice(0, 120)}${apiConfig.body.length > 120 ? "…" : ""}`);
      }
      payload = await fetchFromApi(apiConfig);
    } else if (fs.existsSync(dataFile)) {
      payload = JSON.parse(fs.readFileSync(dataFile, "utf8"));
      console.log("未配置 API，跳过网络请求，仅刷新本地 vehicle.json");
    } else {
      throw new Error("请配置 NIO_API_URL 或放置 data/vehicle.json");
    }

    const snap = snapshotFromPayload(payload);

    const dataDir = getDataDir();
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify(payload, null, 2));
    appendHistory(snap);
    writeMeta(true);

    syncPublicData();

    console.log(`已写入 ${dataFile}`);
    console.log(`历史 ${getHistoryFile()} · 采样 ${new Date(snap.ts).toLocaleString("zh-CN")}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
