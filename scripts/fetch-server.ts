import { runChangeOnce } from "./fetch-change.js";
import { runVehicleOnce } from "./fetch-vehicle.js";

export type FetchSlot = "all" | "vehicle" | "change";

let runningAll: Promise<void> | null = null;
let runningVehicle: Promise<void> | null = null;
let runningChange: Promise<void> | null = null;

export async function runBothOnce(): Promise<void> {
  await runVehicleOnce();
  await runChangeOnce();
}

export function withLock(slot: FetchSlot, task: () => Promise<void>): Promise<void> {
  const pick = () => {
    if (slot === "all") return runningAll;
    if (slot === "vehicle") return runningVehicle;
    return runningChange;
  };
  const set = (p: Promise<void> | null) => {
    if (slot === "all") runningAll = p;
    else if (slot === "vehicle") runningVehicle = p;
    else runningChange = p;
  };

  const current = pick();
  if (current) return current;

  const job = task().finally(() => set(null));
  set(job);
  return job;
}

export function triggerFetch(slot: FetchSlot): Promise<void> {
  const task =
    slot === "all" ? runBothOnce : slot === "vehicle" ? runVehicleOnce : runChangeOnce;
  return withLock(slot, task);
}

export function isFetchRunning(): { all: boolean; vehicle: boolean; change: boolean } {
  return {
    all: Boolean(runningAll),
    vehicle: Boolean(runningVehicle),
    change: Boolean(runningChange),
  };
}

export interface FetchScheduler {
  reschedule: () => void;
  stop: () => void;
}

export interface DualFetchScheduler {
  reschedule: () => void;
  rescheduleVehicle: () => void;
  rescheduleChange: () => void;
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
): FetchScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const scheduleNext = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    const sec = Math.max(15, getIntervalSec());
    console.log(`[fetch:${slot}] 下次拉取 ${sec} 秒后`);
    timer = setTimeout(() => void tick(), sec * 1000);
  };

  const tick = async () => {
    if (stopped) return;
    try {
      await withLock(slot, runOnce);
      onComplete?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[fetch:${slot}]`, message);
      onComplete?.();
    } finally {
      scheduleNext();
    }
  };

  const reschedule = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (stopped) return;
    void tick();
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
  deferInitialTick?: boolean;
}): DualFetchScheduler {
  const vehicle = startSlotScheduler(
    "vehicle",
    options.getVehicleIntervalSec,
    runVehicleOnce,
    onVehicleFetchComplete,
    options.deferInitialTick ?? false,
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
      vehicle.reschedule();
      change.reschedule();
    },
    rescheduleVehicle: () => vehicle.reschedule(),
    rescheduleChange: () => change.reschedule(),
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
