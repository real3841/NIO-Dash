/** 与 scripts/poll-interval.ts 对齐的纯函数（浏览器可用） */

export function parsePollSec(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(15, Math.floor(n));
}

export function isDaytime(now = new Date()): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 9 * 60 && minutes <= 17 * 60;
}

export function vehiclePollReason(
  vehicleState: number | null,
  now = new Date(),
): "driving" | "day" | "night" {
  if (vehicleState === 1) return "driving";
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

export function getVehiclePollIntervalSec(
  env: VehiclePollEnv,
  vehicleState: number | null,
  now = new Date(),
): number {
  const driving = parsePollSec(env.NIO_VEHICLE_POLL_DRIVING_SEC, 900);
  const day = parsePollSec(env.NIO_VEHICLE_POLL_DAY_SEC, 1800);
  const night = parsePollSec(env.NIO_VEHICLE_POLL_NIGHT_SEC, 3600);
  const reason = vehiclePollReason(vehicleState, now);
  return reason === "driving" ? driving : reason === "day" ? day : night;
}

export function getVehiclePollInfo(
  env: VehiclePollEnv,
  vehicleState: number | null,
  now = new Date(),
): { intervalSec: number; reason: "driving" | "day" | "night"; reasonLabel: string } {
  const reason = vehiclePollReason(vehicleState, now);
  const intervalSec = getVehiclePollIntervalSec(env, vehicleState, now);
  return { intervalSec, reason, reasonLabel: vehiclePollLabel(reason) };
}

export function minVehiclePollSec(env: VehiclePollEnv): number {
  return Math.min(
    parsePollSec(env.NIO_VEHICLE_POLL_DRIVING_SEC, 900),
    parsePollSec(env.NIO_VEHICLE_POLL_DAY_SEC, 1800),
    parsePollSec(env.NIO_VEHICLE_POLL_NIGHT_SEC, 3600),
  );
}
