import fs from "node:fs";
import path from "node:path";
import { getCardLayoutFile } from "./card-layout-api.js";
import { getEnvFilePath } from "./env-file.js";
import {
  getChangeFile,
  getChangeLedgerFile,
  getChangeLedgerStateFile,
  getChangeMetaFile,
  getCheckinFile,
  getCheckinMetaFile,
  getFetchLogFile,
  getHistoryFile,
  getVehicleFile,
  getVehicleMetaFile,
} from "./paths.js";

export type StorageFileKind = "config" | "data";

export interface StorageFileDef {
  id: string;
  label: string;
  path: string;
  kind: StorageFileKind;
}

export interface StorageFileEntry extends StorageFileDef {
  exists: boolean;
  sizeBytes: number | null;
  modifiedAt: number | null;
}

export interface StorageFilesSnapshot {
  ok: true;
  dataDir: string;
  userDataDir: string;
  envFile: string;
  files: StorageFileEntry[];
}

function statEntry(filePath: string): Pick<StorageFileEntry, "exists" | "sizeBytes" | "modifiedAt"> {
  try {
    if (!fs.existsSync(filePath)) {
      return { exists: false, sizeBytes: null, modifiedAt: null };
    }
    const st = fs.statSync(filePath);
    if (!st.isFile()) {
      return { exists: false, sizeBytes: null, modifiedAt: null };
    }
    return { exists: true, sizeBytes: st.size, modifiedAt: st.mtimeMs };
  } catch {
    return { exists: false, sizeBytes: null, modifiedAt: null };
  }
}

function knownStorageFiles(dataDir: string, envFile: string, userDataDir: string): StorageFileDef[] {
  const layoutFile = getCardLayoutFile(dataDir);
  const defs: StorageFileDef[] = [
    { id: "config.env", label: "主配置", path: envFile, kind: "config" },
    { id: "app.log", label: "应用诊断日志", path: path.join(userDataDir, "app.log"), kind: "config" },
    { id: "crash.log", label: "崩溃日志（旧）", path: path.join(userDataDir, "crash.log"), kind: "config" },
    { id: "card-layout.json", label: "卡片布局", path: layoutFile, kind: "config" },
    { id: "vehicle.json", label: "最新车况", path: getVehicleFile(), kind: "data" },
    { id: "history.json", label: "位置历史", path: getHistoryFile(), kind: "data" },
    { id: "last-fetch.json", label: "车辆拉取记录", path: getVehicleMetaFile(), kind: "data" },
    { id: "change.json", label: "换电订单", path: getChangeFile(), kind: "data" },
    { id: "last-fetch-change.json", label: "换电拉取记录", path: getChangeMetaFile(), kind: "data" },
    { id: "change-ledger.json", label: "换电台账", path: getChangeLedgerFile(), kind: "data" },
    {
      id: "change-ledger-state.json",
      label: "换电台账状态",
      path: getChangeLedgerStateFile(),
      kind: "data",
    },
    { id: "checkin.json", label: "签到数据", path: getCheckinFile(), kind: "data" },
    { id: "last-fetch-checkin.json", label: "签到拉取记录", path: getCheckinMetaFile(), kind: "data" },
    { id: "fetch-log.json", label: "运行日志", path: getFetchLogFile(), kind: "data" },
  ];
  return defs.filter((entry, index, list) => list.findIndex((x) => x.path === entry.path) === index);
}

function extraDataFiles(dataDir: string, known: StorageFileDef[]): StorageFileDef[] {
  const knownPaths = new Set(known.map((f) => path.resolve(f.path)));
  if (!fs.existsSync(dataDir)) return [];
  return fs
    .readdirSync(dataDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(dataDir, name))
    .filter((filePath) => !knownPaths.has(path.resolve(filePath)))
    .map((filePath) => ({
      id: path.basename(filePath),
      label: "其他数据",
      path: filePath,
      kind: "data" as const,
    }));
}

export function getStorageFilesSnapshot(dataDir: string, envFile?: string): StorageFilesSnapshot {
  const resolvedEnv = envFile ?? getEnvFilePath();
  const userDataDir = path.dirname(dataDir);
  const known = knownStorageFiles(dataDir, resolvedEnv, userDataDir);
  const extras = extraDataFiles(dataDir, known);
  const files = [...known, ...extras].map((def) => ({
    ...def,
    ...statEntry(def.path),
  }));
  return {
    ok: true,
    dataDir,
    userDataDir,
    envFile: resolvedEnv,
    files,
  };
}
