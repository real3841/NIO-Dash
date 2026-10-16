import fs from "node:fs";
import { appendFetchLog, setSlotSchedule } from "./fetch-log.js";
import { runChangeOnce } from "./fetch-change.js";
import { runVehicleOnce } from "./fetch-vehicle.js";
import { getChangeMetaFile } from "./paths.js";

function readChangeLastSuccessAt(): number | null {
  try {
    const meta = JSON.parse(fs.readFileSync(getChangeMetaFile(), "utf8")) as { ok?: boolean; at?: number };
    return meta.ok && typeof meta.at === "number" ? meta.at : null;
  } catch {
    return null;
  }
}

export type FetchSlot = "all" | "vehicle" | "change";

let runningVehicle: Promise<void> | null = null;
let runningChange: Promise<void> | null = null;

function withVehicleLock(task: () => Promise<void>): Promise<void> {
  if (runningVehicle) return runningVehicle;
  const job = task().finally(() => {
    runningVehicle = null;
  });
  runningVehicle = job;
  return job;
}

function withChangeLock(task: () => Promise<void>): Promise<void> {
  if (runningChange) return runningChange;
  const job = task().finally(() => {
    runningChange = null;
  });
  runningChange = job;
  return job;
}

export async function runBothOnce(): Promise<void> {
  await withVehicleLock(runVehicleOnce);
  await withChangeLock(runChangeOnce);
}

export function withLock(slot: FetchSlot, task: () => Promise<void>): Promise<void> {
  if (slot === "change") return withChangeLock(task);
  return withVehicleLock(task);
}

export function triggerFetch(slot: FetchSlot): Promise<void> {
  if (slot === "all") return runBothOnce();
  if (slot === "vehicle") return withVehicleLock(runVehicleOnce);
  return withChangeLock(runChangeOnce);
}

export function isFetchRunning(): { all: boolean; vehicle: boolean; change: boolean } {
  const vehicle = Boolean(runningVehicle);
  const change = Boolean(runningChange);
  return {
    all: vehicle || change,
    vehicle,
    change,
  };
}

export interface FetchScheduler {
  reschedule: (immediate?: boolean) => void;
  stop: () => void;
}

export interface DualFetchScheduler {
  reschedule: () => void;
  rescheduleVehicle: (immediate?: boolean) => void;
  rescheduleChange: (immediate?: boolean) => void;
  armChangeSchedule: () => void;
  stop: () => void;
}

let onVehicleFetchComplete: (() => void) | null = null;
let onChangeFetchComplete: (() => void) | null = null;

/** @deprecated use setOnVehicleFetchComplete / setOnChangeFetchComplete */
export function setOnBothFetchComplete(handler: (() => void) | null): void {
  onVehicleFetchComplete = handler;
  onChangeFetchComplete = handler;
}

export function setOnVehicleFetchComplete(handler: (() => void) | null): void {
  onVehicleFetchComplete = handler;
}

export function setOnChangeFetchComplete(handler: (() => void) | null): void {
  onChangeFetchComplete = handler;
}

function startSlotScheduler(
  slot: "vehicle" | "change",
  getIntervalSec: () => number,
  runOnce: () => Promise<void>,
  onComplete: (() => void) | null,
  deferInitialTick: boolean,
  getScheduleDetail?: () => string | null,
  getLastSuccessAt?: () => number | null,
): FetchScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  /** 距上次成功还没满一个间隔时，只等剩下的时间（重启 App 不会立刻重拉） */
  const remainingSec = (): number | null => {
    const last = getLastSuccessAt?.();
    if (!last) return null;
    const left = Math.ceil((last + Math.max(15, getIntervalSec()) * 1000 - Date.now()) / 1000);
    return left > 0 ? Math.max(15, left) : null;
  };

  const scheduleNext = (delaySec?: number) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    const sec = delaySec ?? Math.max(15, getIntervalSec());
    const nextAt = Date.now() + sec * 1000;
    const detail = getScheduleDetail?.() ?? null;
    setSlotSchedule(slot, { nextAt, intervalSec: sec, detail });
    console.log(`[fetch:${slot}] 下次拉取 ${sec} 秒后`);
    timer = setTimeout(() => void tick(), sec * 1000);
  };

  const tick = async () => {
    if (stopped) return;
    const label = slot === "vehicle" ? "车辆" : "换电";
    appendFetchLog(slot, "info", `${label} · 开始拉取…`);
    try {
      await (slot === "vehicle" ? withVehicleLock(runOnce) : withChangeLock(runOnce));
      onComplete?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[fetch:${slot}]`, message);
      onComplete?.();
    } finally {
      scheduleNext();
    }
  };

  const reschedule = (immediate = true) => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (stopped) return;
    if (immediate) void tick();
    else scheduleNext(remainingSec() ?? undefined);
  };

  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  if (!deferInitialTick) {
    const left = remainingSec();
    if (left !== null) scheduleNext(left);
    else void tick();
  }

  return { reschedule, stop };
}

export function startDualFetchScheduler(options: {
  getVehicleIntervalSec: () => number;
  getChangeIntervalSec: () => number;
  getVehicleScheduleDetail?: () => string | null;
  deferInitialTick?: boolean;
}): DualFetchScheduler {
  const vehicle = startSlotScheduler(
    "vehicle",
    options.getVehicleIntervalSec,
    runVehicleOnce,
    onVehicleFetchComplete,
    options.deferInitialTick ?? false,
    options.getVehicleScheduleDetail,
  );
  const change = startSlotScheduler(
    "change",
    options.getChangeIntervalSec,
    runChangeOnce,
    onChangeFetchComplete,
    options.deferInitialTick ?? false,
    undefined,
    readChangeLastSuccessAt,
  );

  return {
    reschedule: () => {
      vehicle.reschedule(true);
      change.reschedule(true);
    },
    rescheduleVehicle: (immediate = true) => vehicle.reschedule(immediate),
    rescheduleChange: (immediate = true) => change.reschedule(immediate),
    armChangeSchedule: () => change.reschedule(false),
    stop: () => {
      vehicle.stop();
      change.stop();
    },
  };
}

/** @deprecated use startDualFetchScheduler */
export function startFetchScheduler(getIntervalSec: () => number): FetchScheduler {
  const dual = startDualFetchScheduler({
    getVehicleIntervalSec: getIntervalSec,
    getChangeIntervalSec: getIntervalSec,
  });
  return {
    reschedule: () => dual.reschedule(),
    stop: () => dual.stop(),
  };
}
