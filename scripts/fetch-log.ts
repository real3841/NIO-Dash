import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "./atomic-write.js";
import { getFetchLogFile } from "./paths.js";

export type FetchLogSlot = "vehicle" | "change" | "checkin" | "system";
export type FetchLogLevel = "info" | "success" | "error";

export interface FetchLogEntry {
  id: string;
  at: number;
  slot: FetchLogSlot;
  level: FetchLogLevel;
  message: string;
  detail: Record<string, unknown> | null;
}

export interface SlotScheduleState {
  nextAt: number | null;
  intervalSec: number | null;
  detail: string | null;
}

export interface FetchLogSnapshot {
  ok: true;
  at: number;
  logCount: number;
  logLimit: number;
  schedule: {
    vehicle: SlotScheduleState;
    change: SlotScheduleState;
    checkin: SlotScheduleState;
  };
  running: {
    all: boolean;
    vehicle: boolean;
    change: boolean;
    checkin: boolean;
  };
  logs: FetchLogEntry[];
}

export const MAX_LOGS = 500;

function loadPersistedLogs(): FetchLogEntry[] {
  try {
    const file = getFetchLogFile();
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-MAX_LOGS) as FetchLogEntry[];
  } catch {
    return [];
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersistLogs(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const file = getFetchLogFile();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      writeFileAtomic(file, JSON.stringify(logs));
    } catch {
      // ignore persist errors
    }
  }, 400);
}

const logs: FetchLogEntry[] = loadPersistedLogs();

const schedule: Record<"vehicle" | "change" | "checkin", SlotScheduleState> = {
  vehicle: { nextAt: null, intervalSec: null, detail: null },
  change: { nextAt: null, intervalSec: null, detail: null },
  checkin: { nextAt: null, intervalSec: null, detail: null },
};

let checkinRunning = false;

const SENSITIVE_KEY = /token|authorization|password|secret|cookie|bearer/i;
const MAX_RAW_JSON_CHARS = 800_000;

function sanitizeLogMessage(message: string): string {
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500);
}

function sanitizeDetailValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return sanitizeLogMessage(value).slice(0, 2000);
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeDetailValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : sanitizeDetailValue(val, depth + 1);
    }
    return out;
  }
  return String(value);
}

/** 完整 API 响应：仅脱敏敏感字段，不做字段/数组截断 */
function sanitizeRawPayloadValue(value: unknown, depth = 0): unknown {
  if (depth > 64) return "[max depth exceeded]";
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeRawPayloadValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : sanitizeRawPayloadValue(val, depth + 1);
    }
    return out;
  }
  return String(value);
}

function sanitizeRawPayload(value: unknown): unknown {
  const sanitized = sanitizeRawPayloadValue(value);
  const json = JSON.stringify(sanitized);
  if (json.length <= MAX_RAW_JSON_CHARS) return sanitized;
  return {
    _truncated: true,
    originalSizeChars: json.length,
    message: "响应体过大，以下为截断预览（可复制后在编辑器中查看完整文件 data/*.json）",
    preview: json.slice(0, MAX_RAW_JSON_CHARS),
  };
}

function redactInlineSecrets(text: string): string {
  return text.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

function sanitizeApiRequest(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const req = value as Record<string, unknown>;
  const url = typeof req.url === "string" ? redactInlineSecrets(req.url) : req.url;
  const bodyRaw =
    typeof req.body === "string"
      ? req.body
      : typeof req.bodyPreview === "string"
        ? req.bodyPreview
        : null;
  const body = bodyRaw ? redactInlineSecrets(bodyRaw) : null;
  return {
    method: req.method ?? "GET",
    url,
    body,
  };
}

function sanitizeDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const { rawResponse, apiRequest, ...rest } = detail;
  const out = sanitizeDetailValue(rest) as Record<string, unknown>;
  if (apiRequest !== undefined) {
    const sanitized = sanitizeApiRequest(apiRequest);
    if (sanitized) out.apiRequest = sanitized;
  }
  if (rawResponse !== undefined) {
    out.rawResponse = sanitizeRawPayload(rawResponse);
  }
  return out;
}

export function appendFetchLog(
  slot: FetchLogSlot,
  level: FetchLogLevel,
  message: string,
  detail?: Record<string, unknown> | null,
): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  logs.push({
    id,
    at: Date.now(),
    slot,
    level,
    message: sanitizeLogMessage(message),
    detail: detail ? sanitizeDetail(detail) : null,
  });
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }
  schedulePersistLogs();
  return id;
}

export function inferFetchFailureHint(message: string, slot: FetchLogSlot): string | null {
  const m = message.toLowerCase();
  if (/sign|签名|403|401|unauthorized|token|登录|鉴权/.test(m)) {
    return "可能是 Token 或 sign 过期/无效，请在「数据同步」里更新 API 配置后重试";
  }
  if (/html|502|503|504|gateway|timeout|etimedout|econnrefused|network|fetch failed/.test(m)) {
    return "网络或服务端异常，请稍后重试或检查网络连接";
  }
  if (slot === "vehicle" && /缺少 data\.status|data\.status/.test(message)) {
    return "API 返回格式异常，请确认车辆 API URL 指向正确的车辆状态接口";
  }
  if (slot === "change" && /html|json/.test(m)) {
    return "换电接口返回非 JSON，请检查换电 URL、Header 与 sign 参数";
  }
  if (slot === "checkin" && /未配置/.test(message)) {
    return "请在配置中填写签到 Token（NIO_CHECKIN_ACCESS_TOKEN）";
  }
  return null;
}

export function setSlotSchedule(
  slot: "vehicle" | "change" | "checkin",
  patch: Partial<SlotScheduleState>,
): void {
  schedule[slot] = { ...schedule[slot], ...patch };
}

export function setCheckinRunning(running: boolean): void {
  checkinRunning = running;
}

export function getFetchLogSnapshot(running: {
  all: boolean;
  vehicle: boolean;
  change: boolean;
}): FetchLogSnapshot {
  return {
    ok: true,
    at: Date.now(),
    logCount: logs.length,
    logLimit: MAX_LOGS,
    schedule: {
      vehicle: { ...schedule.vehicle },
      change: { ...schedule.change },
      checkin: { ...schedule.checkin },
    },
    running: {
      ...running,
      checkin: checkinRunning,
    },
    logs: [...logs].reverse(),
  };
}
