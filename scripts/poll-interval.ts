import fs from "node:fs";
import path from "node:path";

export const VEHICLE_POLL_ENV_KEYS = [
  "NIO_VEHICLE_POLL_DRIVING_SEC",
  "NIO_VEHICLE_POLL_DAY_SEC",
  "NIO_VEHICLE_POLL_NIGHT_SEC",
] as const;

export const CHANGE_POLL_ENV_KEY = "NIO_CHANGE_POLL_INTERVAL" as const;

const DEFAULT_DRIVING_SEC = 900;
const DEFAULT_DAY_SEC = 1800;
const DEFAULT_NIGHT_SEC = 3600;
const DEFAULT_CHANGE_SEC = 3600;

export function parsePollSec(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(15, Math.floor(n));
}

/** 白天 09:00–17:00（含整点 17:00）；夜间 17:01–08:59 */
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

export function readVehicleState(dataDir: string): number | null {
  try {
    const file = path.join(dataDir, "vehicle.json");
    if (!fs.existsSync(file)) return null;
    const json = JSON.parse(fs.readFileSync(file, "utf8")) as {
      data?: { status?: { exterior_status?: { vehicle_state?: number } } };
    };
    const state = json.data?.status?.exterior_status?.vehicle_state;
    return typeof state === "number" ? state : null;
  } catch {
    return null;
  }
}

export function getVehiclePollInfo(
  env: Record<string, string>,
  dataDir: string,
  now = new Date(),
): { intervalSec: number; reason: "driving" | "day" | "night"; reasonLabel: string } {
  const driving = parsePollSec(env.NIO_VEHICLE_POLL_DRIVING_SEC, DEFAULT_DRIVING_SEC);
  const day = parsePollSec(env.NIO_VEHICLE_POLL_DAY_SEC, DEFAULT_DAY_SEC);
  const night = parsePollSec(env.NIO_VEHICLE_POLL_NIGHT_SEC, DEFAULT_NIGHT_SEC);
  const state = readVehicleState(dataDir);
  const reason = vehiclePollReason(state, now);
  const intervalSec = reason === "driving" ? driving : reason === "day" ? day : night;
  return { intervalSec, reason, reasonLabel: vehiclePollLabel(reason) };
}

export function getVehiclePollIntervalSec(
  env: Record<string, string>,
  dataDir: string,
  now = new Date(),
): number {
  return getVehiclePollInfo(env, dataDir, now).intervalSec;
}

export function getChangePollIntervalSec(env: Record<string, string>): number {
  const fromChange = env.NIO_CHANGE_POLL_INTERVAL;
  if (fromChange) return parsePollSec(fromChange, DEFAULT_CHANGE_SEC);
  return parsePollSec(env.NIO_POLL_INTERVAL, DEFAULT_CHANGE_SEC);
}

export function vehiclePollLabel(reason: "driving" | "day" | "night"): string {
  return { driving: "行驶中", day: "白天", night: "夜间" }[reason];
}

export function minVehiclePollSec(env: Record<string, string>): number {
  return Math.min(
    parsePollSec(env.NIO_VEHICLE_POLL_DRIVING_SEC, DEFAULT_DRIVING_SEC),
    parsePollSec(env.NIO_VEHICLE_POLL_DAY_SEC, DEFAULT_DAY_SEC),
    parsePollSec(env.NIO_VEHICLE_POLL_NIGHT_SEC, DEFAULT_NIGHT_SEC),
  );
}

export function parseEnvFromFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
