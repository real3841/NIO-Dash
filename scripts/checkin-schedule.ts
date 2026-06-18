import fs from "node:fs";
import { getCheckinMetaFile } from "./paths.js";

export const CHECKIN_HOUR = 9;
export const CHECKIN_MINUTE = 0;

interface CheckinMeta {
  ok?: boolean;
  at?: number;
  error?: string | null;
  run_day?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/** 本地日历日 YYYY-MM-DD */
export function localDayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 当天 09:00（含）之后可拉取签到 */
export function isCheckinWindowOpen(now = new Date()): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= CHECKIN_HOUR * 60 + CHECKIN_MINUTE;
}

export function readCheckinMeta(): CheckinMeta {
  const file = getCheckinMetaFile();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as CheckinMeta;
  } catch {
    return {};
  }
}

export function alreadyRanCheckinToday(now = new Date()): boolean {
  const meta = readCheckinMeta();
  return meta.run_day === localDayKey(now);
}

export function shouldRunCheckinNow(now = new Date()): boolean {
  return isCheckinWindowOpen(now) && !alreadyRanCheckinToday(now);
}

function atCheckinTime(day: Date, hour = CHECKIN_HOUR, minute = CHECKIN_MINUTE): Date {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** 距离下次应唤醒签到拉取的毫秒数 */
export function msUntilNextCheckinWake(now = new Date()): number {
  const todayKey = localDayKey(now);
  const meta = readCheckinMeta();

  if (meta.run_day === todayKey) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const next = atCheckinTime(tomorrow);
    return Math.max(1000, next.getTime() - now.getTime());
  }

  const todaySlot = atCheckinTime(now);
  if (now.getTime() < todaySlot.getTime()) {
    return Math.max(1000, todaySlot.getTime() - now.getTime());
  }

  return 0;
}

export interface CheckinScheduler {
  stop: () => void;
}

export function startCheckinScheduler(runDue: () => Promise<void>, onComplete?: () => void): CheckinScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let running: Promise<void> | null = null;

  const scheduleNext = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    const ms = msUntilNextCheckinWake();
    const min = Math.round(ms / 60000);
    console.log(`[fetch:checkin] 下次签到拉取 ${min} 分钟后（每天 ${CHECKIN_HOUR}:00）`);
    timer = setTimeout(() => void tick(), ms);
  };

  const tick = async () => {
    if (stopped) return;
    if (running) {
      scheduleNext();
      return;
    }
    running = (async () => {
      try {
        await runDue();
        onComplete?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[fetch:checkin]", message);
      }
    })().finally(() => {
      running = null;
      scheduleNext();
    });
    await running;
  };

  void tick();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
