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

export async function fetchRuntimeLog(): Promise<FetchLogSnapshot | null> {
  try {
    const res = await fetch(`/api/fetch-log?_=${Date.now()}`);
    if (!res.ok) return null;
    return (await res.json()) as FetchLogSnapshot;
  } catch {
    return null;
  }
}

export const SLOT_LABELS: Record<FetchLogSlot, string> = {
  vehicle: "车辆",
  change: "换电",
  checkin: "签到",
  system: "系统",
};

/** 日志按时间倒序；为「开始拉取」找到随后同 slot 的成功/失败记录 */
export function findPairedFetchResult(
  logs: FetchLogEntry[],
  startIndex: number,
): FetchLogEntry | null {
  const start = logs[startIndex];
  if (!start.message.includes("开始拉取")) return null;
  for (let i = startIndex - 1; i >= 0; i -= 1) {
    const entry = logs[i];
    if (entry.slot !== start.slot) continue;
    if (entry.at < start.at) break;
    if (entry.level === "success" || entry.level === "error") return entry;
  }
  return null;
}

export function entryHasDetail(
  entry: FetchLogEntry,
  logs: FetchLogEntry[],
  index: number,
  running?: Pick<FetchLogSnapshot["running"], "vehicle" | "change" | "checkin">,
): boolean {
  if (entry.detail) return true;
  if (entry.message.includes("开始拉取")) {
    if (findPairedFetchResult(logs, index)) return true;
    if (running) {
      if (entry.slot === "vehicle" && running.vehicle) return true;
      if (entry.slot === "change" && running.change) return true;
      if (entry.slot === "checkin" && running.checkin) return true;
    }
  }
  return false;
}

export function resolveEntryDetail(
  entry: FetchLogEntry,
  logs: FetchLogEntry[],
  index: number,
  running?: Pick<FetchLogSnapshot["running"], "vehicle" | "change" | "checkin">,
): Record<string, unknown> | null {
  if (entry.detail) return entry.detail;
  const paired = findPairedFetchResult(logs, index);
  if (paired?.detail) {
    return { ...paired.detail, _fromStartLog: true, pairedMessage: paired.message };
  }
  if (entry.message.includes("开始拉取")) {
    const isRunning =
      running &&
      ((entry.slot === "vehicle" && running.vehicle) ||
        (entry.slot === "change" && running.change) ||
        (entry.slot === "checkin" && running.checkin));
    if (isRunning) {
      return { kind: entry.slot, result: "pending", message: "拉取进行中，请稍后刷新或展开查看结果" };
    }
  }
  return null;
}

export interface DetailRow {
  label: string;
  value: string;
}

function fmtVal(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 0);
}

export function extractRawResponse(detail: Record<string, unknown>): unknown {
  if (detail.rawResponse !== undefined) return detail.rawResponse;
  if (detail.raw !== undefined) return detail.raw;
  return null;
}

export function hasRawResponse(detail: Record<string, unknown>): boolean {
  return extractRawResponse(detail) != null;
}

export function formatRawJson(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "object" && raw !== null && "_truncated" in raw) {
    const t = raw as { preview?: string; message?: string; originalSizeChars?: number };
    const header = [
      t.message ?? "响应体过大，以下为截断预览",
      t.originalSizeChars ? `（原始约 ${t.originalSizeChars.toLocaleString()} 字符）` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return `${header}\n\n${t.preview ?? ""}`;
  }
  return JSON.stringify(raw, null, 2);
}

export function formatApiRequest(detail: Record<string, unknown>): string | null {
  const apiRequest = detail.apiRequest as
    | { method?: string; url?: string; body?: string | null; bodyPreview?: string | null }
    | undefined;
  if (!apiRequest?.url) return null;
  const lines = [`${apiRequest.method ?? "GET"} ${apiRequest.url}`];
  const body = apiRequest.body ?? apiRequest.bodyPreview;
  if (body) lines.push(`Body:\n${body}`);
  return lines.join("\n\n");
}

export function formatLogDetailRows(detail: Record<string, unknown>): DetailRow[] {
  const rows: DetailRow[] = [];
  const kind = String(detail.kind ?? "");
  const result = String(detail.result ?? "");

  if (result === "pending") {
    rows.push({ label: "状态", value: "拉取中" });
    if (detail.message) rows.push({ label: "说明", value: fmtVal(detail.message) });
    return rows;
  }

  if (result === "error") {
    rows.push({ label: "结果", value: "失败" });
    if (detail.reason) rows.push({ label: "失败原因", value: fmtVal(detail.reason) });
    if (detail.hint) rows.push({ label: "建议", value: fmtVal(detail.hint) });
    const api = detail.api as Record<string, unknown> | undefined;
    if (api?.resultCode) rows.push({ label: "响应代码", value: fmtVal(api.resultCode) });
    if (api?.displayMsg) rows.push({ label: "API 消息", value: fmtVal(api.displayMsg) });
    if (detail.httpStatus) rows.push({ label: "HTTP 状态", value: fmtVal(detail.httpStatus) });
    return rows;
  }

  if (kind === "vehicle" && result === "success") {
    rows.push({ label: "结果", value: "成功" });
    if (detail.sampleTime) rows.push({ label: "采样时间", value: fmtVal(detail.sampleTime) });
    if (detail.socPercent != null) rows.push({ label: "电量", value: `${detail.socPercent}%` });
    const range = detail.rangeKm as { standard?: number; actual?: number } | undefined;
    if (range) {
      rows.push({
        label: "续航",
        value: `标准 ${range.standard ?? "—"} km / 实际 ${range.actual ?? "—"} km`,
      });
    }
    if (detail.mileageKm != null) rows.push({ label: "里程", value: `${detail.mileageKm} km` });
    const loc = detail.location as { lat?: number; lng?: number; address?: string } | undefined;
    if (loc?.address) rows.push({ label: "位置", value: fmtVal(loc.address) });
    else if (loc?.lat != null && loc?.lng != null) {
      rows.push({ label: "坐标", value: `${loc.lat}, ${loc.lng}` });
    }
    const temp = detail.temperature as { insideC?: number; outsideC?: number } | undefined;
    if (temp) {
      rows.push({
        label: "温度",
        value: `车内 ${temp.insideC ?? "—"}°C / 车外 ${temp.outsideC ?? "—"}°C`,
      });
    }
    if (detail.vehicleState) rows.push({ label: "车辆状态", value: fmtVal(detail.vehicleState) });
    if (detail.connected != null) rows.push({ label: "在线", value: fmtVal(detail.connected) });
    if (detail.chargeState) rows.push({ label: "充电状态", value: fmtVal(detail.chargeState) });
    if (detail.resultCode) rows.push({ label: "响应代码", value: fmtVal(detail.resultCode) });
    return rows;
  }

  if (kind === "change" && result === "success") {
    rows.push({ label: "结果", value: "成功" });
    const count = detail.orderCount;
    const total = detail.total;
    if (total != null && total !== count) {
      rows.push({ label: "订单数", value: `${count} 条（接口 total ${total}）` });
    } else {
      rows.push({ label: "订单数", value: `${count} 条` });
    }
    const byType = detail.byType as { label: string; count: number }[] | undefined;
    if (byType?.length) {
      rows.push({
        label: "类型分布",
        value: byType.map((item) => `${item.label} ${item.count} 条`).join(" · "),
      });
    }
    const recentOrders = detail.recentOrders as
      | {
          index?: number;
          time?: string | null;
          type?: string | null;
          location?: string | null;
          status?: string | null;
          amount?: string | null;
        }[]
      | undefined;
    if (recentOrders?.length) {
      recentOrders.forEach((order) => {
        const parts = [order.type, order.location, order.status, order.amount].filter(Boolean);
        rows.push({
          label: order.time ?? `最近 ${order.index ?? "?"}`,
          value: parts.join(" · ") || "—",
        });
      });
    } else {
      const legacyOrders = detail.orders as Record<string, unknown>[] | undefined;
      legacyOrders?.slice(0, 5).forEach((order) => {
        const idx = order.index ?? "?";
        rows.push({ label: `订单 ${idx}`, value: fmtVal(order) });
      });
    }
    return rows;
  }

  if (kind === "checkin" && result === "success") {
    rows.push({ label: "结果", value: "成功" });
    rows.push({ label: "今日签到", value: detail.checkedIn ? "已签到" : "未签到" });
    if (detail.continuousDays != null) {
      rows.push({ label: "连续天数", value: `${detail.continuousDays} 天` });
    }
    if (detail.accumulateDays != null) {
      rows.push({ label: "累计天数", value: `${detail.accumulateDays} 天` });
    }
    return rows;
  }

  rows.push({ label: "详情", value: fmtVal(detail) });
  return rows;
}
