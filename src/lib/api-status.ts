import type { FetchMeta } from "./storage";

export type ApiConfigStatus = "ok" | "error" | "pending" | "unset";

export function resolveApiStatus(
  meta: FetchMeta | null | undefined,
  configured: boolean,
): ApiConfigStatus {
  if (!configured) return "unset";
  if (!meta) return "pending";
  return meta.ok ? "ok" : "error";
}

export function apiStatusLabel(status: ApiConfigStatus): string {
  switch (status) {
    case "ok":
      return "API 配置正确，最近拉取成功";
    case "error":
      return "API 配置错误或拉取失败";
    case "pending":
      return "已填写配置，等待首次拉取验证";
    case "unset":
      return "尚未配置";
  }
}

function str(values: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const v = values[key]?.trim();
    if (v) return v;
  }
  return "";
}

export function isVehicleApiConfigured(values: Record<string, string> | null | undefined): boolean {
  if (!values) return false;
  if (
    str(values, "NIO_VEHICLE_API_URL", "NIO_API_URL") ||
    str(values, "NIO_VEHICLE_ACCESS_TOKEN", "NIO_ACCESS_TOKEN")
  ) {
    return true;
  }
  const mode = str(values, "NIO_VEHICLE_API_MODE", "NIO_API_MODE").toLowerCase();
  if (mode === "widget") return true;
  const vehicleId = str(values, "NIO_VEHICLE_ID", "NIO_ID");
  const deviceId = str(values, "NIO_VEHICLE_DEVICE_ID", "NIO_DEVICE_ID");
  return Boolean(vehicleId && deviceId);
}

export function isChangeApiConfigured(values: Record<string, string> | null | undefined): boolean {
  if (!values) return false;
  return Boolean(
    str(values, "NIO_CHANGE_API_URL") ||
      str(values, "NIO_CHANGE_ACCESS_TOKEN") ||
      values.NIO_CHANGE_API_MODE === "params" ||
      values.NIO_CHANGE_HASH_TYPE?.trim(),
  );
}

export function isCheckinApiConfigured(values: Record<string, string> | null | undefined): boolean {
  if (!values) return false;
  return Boolean(
    str(values, "NIO_CHECKIN_API_URL") ||
      str(values, "NIO_CHECKIN_ACCESS_TOKEN") ||
      str(values, "NIO_VEHICLE_ACCESS_TOKEN", "NIO_ACCESS_TOKEN"),
  );
}

export function apiStatusDetail(
  status: ApiConfigStatus,
  meta: FetchMeta | null | undefined,
): string {
  const base = apiStatusLabel(status);
  if (status === "error" && meta?.error) {
    return `${base}：${meta.error}`;
  }
  return base;
}
