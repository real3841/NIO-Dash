import type { ChangeResponse } from "./change";
import type { CheckinData } from "./checkin";
import { normalizeCheckinData } from "./checkin";
import type { VehicleResponse, VehicleSnapshot } from "./vehicle";
import { extractVehicleStatus, isUsableVehicleResponse, normalizeVehicleResponse, parseSnapshotHistory } from "./vehicle";
import fallbackChange from "../../data/change.json";
import fallbackVehicle from "../../data/vehicle.json";

const HISTORY_KEY = "nio_vehicle_history_v1";

export interface FetchMeta {
  ok: boolean;
  at: number;
  error: string | null;
}

async function readJsonResponse<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error(`${label} 返回空内容`);
  }

  if (trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.startsWith("<!DOCTYPE")) {
    throw new Error(
      `${label} 返回了 HTML 页面而非 JSON。` +
        (label.includes("API")
          ? " 请关闭「启用蔚来 API」，或检查 Token / URL 是否正确。"
          : " 请确认 data/vehicle.json 存在，本地可运行 npm run fetch。"),
    );
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`${label} 不是合法 JSON`);
  }
}

export function loadHistory(): VehicleSnapshot[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistory(history: VehicleSnapshot[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export interface VehicleDataResult {
  source: "live" | "fallback";
  data: VehicleResponse;
}

export async function fetchVehicleData(): Promise<VehicleDataResult> {
  try {
    const res = await fetch(`/data/vehicle.json?_=${Date.now()}`);
    if (!res.ok) {
      throw new Error(`无法加载 /data/vehicle.json (${res.status})`);
    }
    const normalized = normalizeVehicleResponse(await readJsonResponse<VehicleResponse>(res, "vehicle.json"));
    if (!isUsableVehicleResponse(normalized)) {
      throw new Error("vehicle.json 缺少有效车况 data.status");
    }
    return { source: "live", data: normalized };
  } catch (err) {
    console.warn("[dashboard] 使用内置 fallback 数据:", err);
    const fallback = normalizeVehicleResponse(fallbackVehicle as unknown as VehicleResponse);
    if (!isUsableVehicleResponse(fallback)) {
      throw new Error("内置 fallback 车辆数据无效");
    }
    return { source: "fallback", data: fallback };
  }
}

export async function peekVehicleState(): Promise<number | null> {
  try {
    const res = await fetch(`/data/vehicle.json?_=${Date.now()}`);
    if (!res.ok) return null;
    const payload = normalizeVehicleResponse(await readJsonResponse<VehicleResponse>(res, "vehicle.json"));
    if (!isUsableVehicleResponse(payload)) return null;
    return extractVehicleStatus(payload)?.exterior_status.vehicle_state ?? null;
  } catch {
    return null;
  }
}

export async function fetchServerHistory(): Promise<VehicleSnapshot[] | null> {
  try {
    const res = await fetch(`/data/history.json?_=${Date.now()}`);
    if (!res.ok) return null;
    const raw = await readJsonResponse<unknown>(res, "history.json");
    return parseSnapshotHistory(raw);
  } catch {
    return null;
  }
}

export async function loadFetchMeta(): Promise<FetchMeta | null> {
  try {
    const res = await fetch(`/data/last-fetch.json?_=${Date.now()}`);
    if (!res.ok) return null;
    return readJsonResponse<FetchMeta>(res, "last-fetch.json");
  } catch {
    return null;
  }
}

export async function loadChangeFetchMeta(): Promise<FetchMeta | null> {
  try {
    const res = await fetch(`/data/last-fetch-change.json?_=${Date.now()}`);
    if (!res.ok) return null;
    return readJsonResponse<FetchMeta>(res, "last-fetch-change.json");
  } catch {
    return null;
  }
}

export async function fetchCheckinData(): Promise<CheckinData | null> {
  try {
    const [res, meta] = await Promise.all([
      fetch(`/data/checkin.json?_=${Date.now()}`),
      loadCheckinFetchMeta(),
    ]);
    if (!res.ok) return null;
    if (meta && !meta.ok) return null;
    const raw = await readJsonResponse<unknown>(res, "checkin.json");
    return normalizeCheckinData(raw);
  } catch {
    return null;
  }
}

export async function loadCheckinFetchMeta(): Promise<FetchMeta | null> {
  try {
    const res = await fetch(`/data/last-fetch-checkin.json?_=${Date.now()}`);
    if (!res.ok) return null;
    return readJsonResponse<FetchMeta>(res, "last-fetch-checkin.json");
  } catch {
    return null;
  }
}

export async function fetchChangeData(): Promise<ChangeResponse | null> {
  try {
    const res = await fetch(`/data/change.json?_=${Date.now()}`);
    if (!res.ok) return null;
    return readJsonResponse<ChangeResponse>(res, "change.json");
  } catch (err) {
    console.warn("[dashboard] 使用内置 fallback 换电数据:", err);
    return fallbackChange as ChangeResponse;
  }
}

export type FetchTarget = "vehicle" | "change" | "all";

async function triggerServerFetchTarget(target: FetchTarget): Promise<void> {
  const path =
    target === "vehicle"
      ? "/api/fetch-vehicle"
      : target === "change"
        ? "/api/fetch-change"
        : "/api/fetch-now";
  const label = target === "vehicle" ? "车辆" : target === "change" ? "换电" : "全部";

  let res: Response;
  try {
    res = await fetch(path, { method: "POST" });
  } catch {
    throw new Error(
      `无法连接拉取服务（${path}）。本地开发请另开终端运行 npm run serve:api；NAS 请确认 nio-fetcher 容器在运行。`,
    );
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = `: ${body.error}`;
    } catch {
      /* ignore */
    }
    throw new Error(`触发${label}拉取失败 (${res.status})${detail}`);
  }
}

export async function triggerServerFetchVehicle(): Promise<void> {
  return triggerServerFetchTarget("vehicle");
}

export async function triggerServerFetchChange(): Promise<void> {
  return triggerServerFetchTarget("change");
}

export async function triggerServerFetch(): Promise<void> {
  return triggerServerFetchTarget("all");
}
