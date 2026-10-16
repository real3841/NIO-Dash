/** 与 scripts/poll-interval.ts 对齐的纯函数（浏览器可用） */

export const VEHICLE_POLL_DEFAULTS = {
  driving: 900,
  day: 1800,
  night: 3600,
} as const;

export const VEHICLE_POLL_KEYS = [
  "NIO_VEHICLE_POLL_DRIVING_SEC",
  "NIO_VEHICLE_POLL_DAY_SEC",
  "NIO_VEHICLE_POLL_NIGHT_SEC",
] as const;

export function parsePollSec(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(15, Math.floor(n));
}

export function isDaytime(now = new Date()): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 9 * 60 && minutes <= 17 * 60;
}

/** 蔚来 vehicle_state：1 = 行驶中 */
export function isDrivingVehicleState(vehicleState: number | null): boolean {
  return vehicleState === 1;
}

/** 行驶中不论几点都用行驶间隔；非行驶才按白天/夜间 */
export function vehiclePollReason(
  vehicleState: number | null,
  now = new Date(),
): "driving" | "day" | "night" {
  if (isDrivingVehicleState(vehicleState)) return "driving";
  return isDaytime(now) ? "day" : "night";
}

export const FOTA_POLL_SEC = 120;

export function isFotaUpdating(fota: { fota_status?: number } | null | undefined): boolean {
  return typeof fota?.fota_status === "number" && fota.fota_status !== 0;
}

export function vehiclePollLabel(reason: "driving" | "day" | "night" | "fota"): string {
  return { driving: "行驶中", day: "白天", night: "夜间", fota: "系统更新" }[reason];
}

export interface VehiclePollEnv {
  NIO_VEHICLE_POLL_DRIVING_SEC?: string;
  NIO_VEHICLE_POLL_DAY_SEC?: string;
  NIO_VEHICLE_POLL_NIGHT_SEC?: string;
}

export interface VehiclePollIntervals {
  driving: number;
  day: number;
  night: number;
}

/** 将设置页/env 中的拉取间隔规范化为字符串（空值用默认） */
export function normalizeVehiclePollEnv(env: VehiclePollEnv): Required<VehiclePollEnv> {
  return {
    NIO_VEHICLE_POLL_DRIVING_SEC:
      env.NIO_VEHICLE_POLL_DRIVING_SEC?.trim() || String(VEHICLE_POLL_DEFAULTS.driving),
    NIO_VEHICLE_POLL_DAY_SEC:
      env.NIO_VEHICLE_POLL_DAY_SEC?.trim() || String(VEHICLE_POLL_DEFAULTS.day),
    NIO_VEHICLE_POLL_NIGHT_SEC:
      env.NIO_VEHICLE_POLL_NIGHT_SEC?.trim() || String(VEHICLE_POLL_DEFAULTS.night),
  };
}

export function getVehiclePollIntervals(env: VehiclePollEnv): VehiclePollIntervals {
  const n = normalizeVehiclePollEnv(env);
  return {
    driving: parsePollSec(n.NIO_VEHICLE_POLL_DRIVING_SEC, VEHICLE_POLL_DEFAULTS.driving),
    day: parsePollSec(n.NIO_VEHICLE_POLL_DAY_SEC, VEHICLE_POLL_DEFAULTS.day),
    night: parsePollSec(n.NIO_VEHICLE_POLL_NIGHT_SEC, VEHICLE_POLL_DEFAULTS.night),
  };
}

export function getVehiclePollIntervalSec(
  env: VehiclePollEnv,
  vehicleState: number | null,
  now = new Date(),
  fota?: { fota_status?: number } | null,
): number {
  return getVehiclePollInfo(env, vehicleState, now, fota).intervalSec;
}

export function getVehiclePollInfo(
  env: VehiclePollEnv,
  vehicleState: number | null,
  now = new Date(),
  fota?: { fota_status?: number } | null,
): {
  intervalSec: number;
  reason: "driving" | "day" | "night" | "fota";
  reasonLabel: string;
  intervals: VehiclePollIntervals;
} {
  const intervals = getVehiclePollIntervals(env);
  if (isFotaUpdating(fota)) {
    return {
      intervalSec: FOTA_POLL_SEC,
      reason: "fota",
      reasonLabel: vehiclePollLabel("fota"),
      intervals,
    };
  }
  const reason = vehiclePollReason(vehicleState, now);
  const intervalSec =
    reason === "driving" ? intervals.driving : reason === "day" ? intervals.day : intervals.night;
  return { intervalSec, reason, reasonLabel: vehiclePollLabel(reason), intervals };
}

export function minVehiclePollSec(env: VehiclePollEnv): number {
  const intervals = getVehiclePollIntervals(env);
  return Math.min(intervals.driving, intervals.day, intervals.night);
}

export function isVehiclePollKey(key: string): boolean {
  return (VEHICLE_POLL_KEYS as readonly string[]).includes(key);
}

export const DEFAULT_CHANGE_POLL_SEC = 86400;

export const CHANGE_POLL_OPTIONS = [
  { sec: 86400, label: "每 1 天" },
  { sec: 43200, label: "每 12 小时" },
  { sec: 21600, label: "每 6 小时" },
] as const;

export function changePollLabel(sec: number | undefined): string {
  if (!sec) return "—";
  const preset = CHANGE_POLL_OPTIONS.find((o) => o.sec === sec);
  if (preset) return preset.label;
  if (sec % 3600 === 0) return `每 ${sec / 3600} 小时`;
  if (sec % 60 === 0) return `每 ${sec / 60} 分钟`;
  return `每 ${sec} 秒`;
}

export function formatPollSummary(
  intervals: VehiclePollIntervals | null | undefined,
  reasonLabel: string | undefined,
  vehiclePollSec: number | undefined,
  changePollSec: number | undefined,
): string {
  if (intervals) {
    return `行驶 ${intervals.driving}s · 白天 ${intervals.day}s · 夜间 ${intervals.night}s · 当前「${reasonLabel ?? "—"}」${vehiclePollSec ?? "—"}s · 换电${changePollLabel(changePollSec)}`;
  }
  return `页面重读 ${vehiclePollSec ?? "—"}s · 换电${changePollLabel(changePollSec)}`;
}
