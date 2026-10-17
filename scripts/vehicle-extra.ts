import fs from "node:fs";
import { recordAuthSlot } from "./auth-slots.js";
import { fetchFromApi, loadFetchConfig } from "./nio-api.js";
import { getDailyFile, getDailyHistoryFile, getJourneyFile, getJourneyHistoryFile } from "./paths.js";
import { writeJsonAtomic } from "./atomic-write.js";
import { normalizeBearerToken } from "./http-headers.js";
import { tripTimeMs, type DailyHistory, type JourneyHistoryItem } from "../src/lib/trip.js";
import { localDayKey } from "../src/lib/date-utils.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extraHeaders(): Record<string, string> {
  const headers = { ...loadFetchConfig().headers };
  const extra = process.env.NIO_VEHICLE_EXTRA_TOKEN?.trim();
  if (extra) {
    const auth = normalizeBearerToken(extra, "NIO_VEHICLE_EXTRA_TOKEN");
    if (auth) headers.Authorization = auth;
  }
  delete headers["Content-Type"];
  delete headers["content-type"];
  return headers;
}

function mergeStatus(target: Record<string, unknown>, extra: Record<string, unknown>): void {
  if (!isRecord(extra.data) || !isRecord(extra.data.status)) return;
  const data = isRecord(target.data) ? target.data : {};
  const status = isRecord(data.status) ? { ...data.status } : {};
  for (const [key, value] of Object.entries(extra.data.status)) {
    if (value && typeof value === "object") status[key] = value;
  }
  data.status = status;
  target.data = data;
}

async function readExtra(url: string, headers: Record<string, string>): Promise<Record<string, unknown>> {
  return fetchFromApi({ url, method: "GET", headers });
}

function writeJourney(body: {
  ok: boolean;
  error: string | null;
  month?: string;
  journey?: Record<string, unknown> | null;
}): void {
  writeJsonAtomic(getJourneyFile(), { ...body, at: Date.now() });
}

function writeDaily(body: {
  ok: boolean;
  error: string | null;
  daily_mileage?: number;
  mileage?: number;
  activate_days?: number;
}): void {
  writeJsonAtomic(getDailyFile(), { ...body, at: Date.now() });
}

const JOURNEY_HISTORY_MAX = 1000;

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function journeyPoint(loc: unknown): JourneyHistoryItem["start"] | null {
  if (!isRecord(loc)) return null;
  const lat = Number(loc.poi_latitude);
  const lng = Number(loc.poi_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01)) return null;
  const label = [loc.poi, loc.district, loc.road_name].filter((p) => typeof p === "string" && p).join(" · ");
  return { lat, lng, label: label || undefined };
}

/** 行程接口每次只回最近一段；按 trip_id 攒起来给每日行驶路径用 */
function appendJourneyHistory(journey: Record<string, unknown>): boolean {
  const tripId = journey.trip_id ?? journey.journey_id;
  const start = journeyPoint(journey.start_location);
  const end = journeyPoint(journey.end_location);
  const startMs = tripTimeMs(Number(journey.start_time));
  const endMs = tripTimeMs(Number(journey.end_time));
  if (tripId == null || !start || !end || !startMs || !endMs) return false;

  const file = getJourneyHistoryFile();
  const list = readJson<JourneyHistoryItem[]>(file, []).filter((j) => j.trip_id !== String(tripId));
  list.push({
    trip_id: String(tripId),
    start_time: startMs,
    end_time: endMs,
    trip_odometer: typeof journey.trip_odometer === "number" ? journey.trip_odometer : undefined,
    start,
    end,
  });
  list.sort((a, b) => a.start_time - b.start_time);
  writeJsonAtomic(file, list.slice(-JOURNEY_HISTORY_MAX));
  return true;
}

/** 每天保留最后一次 daily_data，历史趋势的日增里程优先用它 */
function appendDailyHistory(dailyMileage: number, mileage: number | undefined): void {
  const file = getDailyHistoryFile();
  const days = readJson<DailyHistory>(file, {});
  days[localDayKey()] = { daily_mileage: dailyMileage, mileage, at: Date.now() };
  writeJsonAtomic(file, days);
}

/** 用同一套登录信息再拉车况整包、最近行程和当日里程。失败不影响原来的车辆拉取。 */
export async function enrichVehicleFromExtraApis(payload: Record<string, unknown>): Promise<string[]> {
  const notes: string[] = [];
  let headers: Record<string, string>;
  try {
    headers = extraHeaders();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [`补充接口未请求：${message}`];
  }

  const statusUrl = process.env.NIO_VEHICLE_STATUS_URL?.trim();
  if (statusUrl) {
    try {
      mergeStatus(payload, await readExtra(statusUrl, headers));
      recordAuthSlot("status", true);
      notes.push("车况整包已合并");
    } catch (err) {
      recordAuthSlot("status", false, err);
      notes.push(`车况整包失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const journeyUrl = process.env.NIO_JOURNEY_API_URL?.trim();
  if (journeyUrl) {
    try {
      const body = await readExtra(journeyUrl, headers);
      const data = isRecord(body.data) ? body.data : {};
      const month = isRecord(data.ai_month_report) ? data.ai_month_report.month : undefined;
      writeJourney({
        ok: true,
        error: null,
        month: typeof month === "string" ? month : undefined,
        journey: isRecord(data.journey) ? data.journey : null,
      });
      const kept = isRecord(data.journey) && appendJourneyHistory(data.journey);
      recordAuthSlot("journey", true);
      notes.push(kept ? "最近行程已更新并记入路径" : "最近行程已更新");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordAuthSlot("journey", false, err);
      writeJourney({ ok: false, error: message, journey: null });
      notes.push(`最近行程失败：${message}`);
    }
  }

  const dailyUrl = process.env.NIO_DAILY_API_URL?.trim();
  if (dailyUrl) {
    try {
      const body = await readExtra(dailyUrl, headers);
      const data = isRecord(body.data) ? body.data : {};
      writeDaily({
        ok: true,
        error: null,
        daily_mileage: typeof data.daily_mileage === "number" ? data.daily_mileage : undefined,
        mileage: typeof data.mileage === "number" ? data.mileage : undefined,
        activate_days: typeof data.activate_days === "number" ? data.activate_days : undefined,
      });
      if (typeof data.daily_mileage === "number") {
        appendDailyHistory(data.daily_mileage, typeof data.mileage === "number" ? data.mileage : undefined);
      }
      recordAuthSlot("daily", true);
      notes.push("当日里程已更新");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordAuthSlot("daily", false, err);
      writeDaily({ ok: false, error: message });
      notes.push(`当日里程失败：${message}`);
    }
  }

  return notes;
}
