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

export function getCheckinFile(): string {
  return path.join(getDataDir(), "checkin.json");
}

export function getCheckinMetaFile(): string {
  return path.join(getDataDir(), "last-fetch-checkin.json");
}

export function getPublicDataDir(): string {
  return path.join(getProjectRoot(), "public", "data");
}
