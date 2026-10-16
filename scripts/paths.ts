import path from "node:path";

/** 运行时解析，避免 Electron 打包后 cwd=/ 时在模块加载阶段固定成 /data */
export function getProjectRoot(): string {
  return process.env.NIO_PROJECT_ROOT ?? process.cwd();
}

export function getDataDir(): string {
  return process.env.NIO_DATA_DIR ?? path.join(getProjectRoot(), "data");
}

export function getVehicleFile(): string {
  return path.join(getDataDir(), "vehicle.json");
}

export function getHistoryFile(): string {
  return path.join(getDataDir(), "history.json");
}

export function getVehicleMetaFile(): string {
  return path.join(getDataDir(), "last-fetch.json");
}

export function getChangeFile(): string {
  return path.join(getDataDir(), "change.json");
}

export function getChangeMetaFile(): string {
  return path.join(getDataDir(), "last-fetch-change.json");
}

export function getChangeLedgerFile(): string {
  return path.join(getDataDir(), "change-ledger.json");
}

export function getChangeLedgerStateFile(): string {
  return path.join(getDataDir(), "change-ledger-state.json");
}

export function getCheckinFile(): string {
  return path.join(getDataDir(), "checkin.json");
}

export function getJourneyFile(): string {
  return path.join(getDataDir(), "journey.json");
}

export function getDailyFile(): string {
  return path.join(getDataDir(), "daily.json");
}

export function getPowerFile(): string {
  return path.join(getDataDir(), "power.json");
}

export function getJourneyHistoryFile(): string {
  return path.join(getDataDir(), "journey-history.json");
}

export function getDailyHistoryFile(): string {
  return path.join(getDataDir(), "daily-history.json");
}

export function getCheckinMetaFile(): string {
  return path.join(getDataDir(), "last-fetch-checkin.json");
}

export function getFetchLogFile(): string {
  return path.join(getDataDir(), "fetch-log.json");
}

export function getPublicDataDir(): string {
  return path.join(getProjectRoot(), "public", "data");
}
