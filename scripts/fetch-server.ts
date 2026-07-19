import { appendFetchLog, setSlotSchedule } from "./fetch-log.js";
import { runChangeOnce } from "./fetch-change.js";
import { runVehicleOnce } from "./fetch-vehicle.js";

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
): FetchScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const scheduleNext = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    const sec = Math.max(15, getIntervalSec());
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
    else scheduleNext();
  };

  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  if (!deferInitialTick) {
    void tick();
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
