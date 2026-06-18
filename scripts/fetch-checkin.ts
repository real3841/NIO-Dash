import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import {
  alreadyRanCheckinToday,
  localDayKey,
  readCheckinMeta,
  shouldRunCheckinNow,
  startCheckinScheduler,
  type CheckinScheduler,
} from "./checkin-schedule.js";
import { fetchCheckinFromApi, loadCheckinFetchConfig } from "./nio-checkin.js";
import { getCheckinFile, getCheckinMetaFile, getProjectRoot } from "./paths.js";
import { syncPublicData } from "./sync-public-data.js";

const ROOT = path.resolve(getProjectRoot());
loadEnv({ path: path.join(ROOT, "deploy", ".env") });
loadEnv({ path: path.join(ROOT, ".env") });

let runningCheckin: Promise<boolean> | null = null;

function writeMeta(ok: boolean, runDay: string, error?: string): void {
  const metaFile = getCheckinMetaFile();
  fs.mkdirSync(path.dirname(metaFile), { recursive: true });
  const prev = readCheckinMeta();
  fs.writeFileSync(
    metaFile,
    JSON.stringify(
      {
        ...prev,
        ok,
        at: Date.now(),
        run_day: runDay,
        error: error ?? null,
      },
      null,
      2,
    ),
  );
}

/** 强制执行签到拉取（CLI 调试用） */
export async function runCheckinOnce(): Promise<void> {
  const config = loadCheckinFetchConfig();
  if (!config) {
    console.log("未配置签到 Token，跳过签到拉取");
    return;
  }

  const dataFile = getCheckinFile();
  const day = localDayKey();

  console.log(`请求 GET ${config.url}`);
  const payload = await fetchCheckinFromApi(config);
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(payload, null, 2));
  writeMeta(true, day);
  syncPublicData();
  console.log(`已写入 ${dataFile}`);
}

/** 每天 9:00 拉取一次；9 点后首次启动补拉，当天不再重复 */
export async function runCheckinIfDue(now = new Date()): Promise<boolean> {
  if (runningCheckin) return runningCheckin;

  const job = (async () => {
    if (!loadCheckinFetchConfig()) return false;
    if (!shouldRunCheckinNow(now)) return false;

    const day = localDayKey(now);
    if (alreadyRanCheckinToday(now)) return false;

    try {
      await runCheckinOnce();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeMeta(false, day, message);
      console.warn("[checkin]", message);
      return false;
    }
  })().finally(() => {
    runningCheckin = null;
  });

  runningCheckin = job;
  return job;
}

export function startDailyCheckinScheduler(onComplete?: () => void): CheckinScheduler {
  return startCheckinScheduler(() => runCheckinIfDue(), onComplete);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runCheckinIfDue()
    .then((ran) => {
      if (!ran) console.log("今日签到已拉取或未到 9:00，跳过");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
