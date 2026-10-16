import fs from "node:fs";
import { writeJsonAtomic } from "./atomic-write.js";
import { getPowerFile } from "./paths.js";
import type { PowerFile, PowerMonth, PowerService } from "../src/lib/power.js";

/** HAR 里的一条请求，只留解析加电数据需要的部分 */
export interface CapturedEntry {
  url: string;
  method: string;
  status: number;
  startedAt: number;
  responseText: string;
}

const MAX_SERVICES = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function num(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function loadPowerFile(): PowerFile {
  try {
    const raw = JSON.parse(fs.readFileSync(getPowerFile(), "utf8")) as PowerFile;
    if (raw && typeof raw === "object") return { ...raw, months: raw.months ?? {}, services: raw.services ?? [] };
  } catch {
    /* 首次导入 */
  }
  return { at: 0, months: {}, services: [] };
}

function parseData(entry: CapturedEntry): Record<string, unknown> | null {
  if (entry.status !== 200 || !entry.responseText) return null;
  try {
    const body = JSON.parse(entry.responseText) as Record<string, unknown>;
    if (body.result_code !== "success" || !isRecord(body.data)) return null;
    return body.data;
  } catch {
    return null;
  }
}

function powerPath(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    const idx = pathname.indexOf("/powerhome/");
    return idx >= 0 ? pathname.slice(idx + "/powerhome/".length).replace(/^NPC-[^/]+\//, "{spot}/") : null;
  } catch {
    return null;
  }
}

/** 从 HAR 的加电响应合并到 power.json；不保存桩的地址、坐标、序列号 */
export function importPowerFromEntries(entries: CapturedEntry[]): string | null {
  const power = loadPowerFile();
  let latest = 0;
  let sawSpot = false;
  let sawRealtime = false;

  const sorted = [...entries].sort((a, b) => a.startedAt - b.startedAt);
  const services = new Map<string, PowerService>(
    (power.services ?? []).map((s) => [String(s.order_id), s]),
  );
  let serviceCount = 0;
  let monthCount = 0;

  for (const entry of sorted) {
    const path = powerPath(entry.url);
    if (!path) continue;
    const data = parseData(entry);
    if (!data) continue;
    latest = Math.max(latest, entry.startedAt);

    if (path === "entrance" && Array.isArray(data.spots) && isRecord(data.spots[0])) {
      const spot = data.spots[0];
      power.spot = {
        name: str(spot.name),
        model: str(spot.model),
        resource_type: str(spot.resource_type),
        work_state: str(spot.work_state),
        is_online: bool(spot.is_online),
        mobile_network_state: bool(spot.mobile_network_state),
        reservation_state: bool(spot.reservation_state),
        reservation_starttime: str(spot.reservation_starttime),
        reservation_endtime: str(spot.reservation_endtime),
        charging_mode: num(spot.charging_mode),
        battery_care: num(spot.battery_care),
        quiet_mode: num(spot.quiet_mode),
        share_state: isRecord(spot.share_info) ? str(spot.share_info.share_state) : undefined,
        software_version: str(spot.software_version),
        hardware_version: str(spot.hardware_version),
        at: entry.startedAt,
      };
      sawSpot = true;
    } else if (path === "realtime/status") {
      sawRealtime = true;
      power.realtime = {
        effective_state: str(data.effective_state),
        effective_state_desc: str(data.effective_state_desc),
        at: entry.startedAt,
      };
    } else if (path === "{spot}/charge/services" && Array.isArray(data.services)) {
      for (const raw of data.services) {
        if (!isRecord(raw) || raw.order_id == null) continue;
        services.set(String(raw.order_id), {
          order_id: String(raw.order_id),
          consume_power: num(raw.display_consume_power) ?? num(raw.consume_power),
          start_time: num(raw.start_time),
          end_time: num(raw.end_time),
          charge_duration: num(raw.charge_duration),
          status: str(raw.status),
        });
        serviceCount += 1;
      }
    } else if (path === "{spot}/statistics/daily" && isRecord(data.statistic_summary)) {
      const summary = data.statistic_summary;
      const start = num(summary.start_time);
      if (!start) continue;
      const month: PowerMonth = {
        total_charging_times: num(summary.total_charging_times) ?? 0,
        total_charging_duration: num(summary.total_charging_duration) ?? 0,
        total_real_charge_kwh: num(summary.total_real_charge_kwh) ?? 0,
        last_update_time: num(summary.last_update_time),
        reports: (Array.isArray(data.statistic_reports) ? data.statistic_reports : [])
          .filter(isRecord)
          .map((r) => ({
            date: str(r.date) ?? "",
            charging_times: num(r.charging_times) ?? 0,
            charging_duration: num(r.charging_duration) ?? 0,
            real_charge_kwh: num(r.real_charge_kwh) ?? 0,
          }))
          .filter((r) => r.date)
          .sort((a, b) => a.date.localeCompare(b.date)),
        at: entry.startedAt,
      };
      power.months = { ...power.months, [monthKey(start)]: month };
      monthCount += 1;
    }
  }

  if (latest === 0) return null;
  const notes: string[] = [];
  if (sawSpot) notes.push("充电桩");
  if (sawRealtime) notes.push("实时状态");
  if (serviceCount > 0) notes.push(`充电记录 ${serviceCount} 条`);
  if (monthCount > 0) notes.push(`月统计 ${monthCount} 个月`);
  power.services = [...services.values()]
    .sort((a, b) => (b.start_time ?? 0) - (a.start_time ?? 0))
    .slice(0, MAX_SERVICES);
  power.capturedAt = latest;
  power.at = Date.now();
  writeJsonAtomic(getPowerFile(), power);
  return notes.join(" · ");
}
