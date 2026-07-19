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

export function vehiclePollLabel(reason: "driving" | "day" | "night"): string {
  return { driving: "行驶中", day: "白天", night: "夜间" }[reason];
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
): number {
  const intervals = getVehiclePollIntervals(env);
  const reason = vehiclePollReason(vehicleState, now);
  return reason === "driving" ? intervals.driving : reason === "day" ? intervals.day : intervals.night;
}

export function getVehiclePollInfo(
  env: VehiclePollEnv,
  vehicleState: number | null,
  now = new Date(),
): {
  intervalSec: number;
  reason: "driving" | "day" | "night";
  reasonLabel: string;
  intervals: VehiclePollIntervals;
} {
  const intervals = getVehiclePollIntervals(env);
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
