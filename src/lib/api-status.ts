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

export function isVehicleApiConfigured(values: Record<string, string> | null | undefined): boolean {
  if (!values) return false;
  return Boolean(
    values.NIO_VEHICLE_API_URL?.trim() ||
      values.NIO_VEHICLE_ACCESS_TOKEN?.trim(),
  );
}

export function isChangeApiConfigured(values: Record<string, string> | null | undefined): boolean {
  if (!values) return false;
  return Boolean(
    values.NIO_CHANGE_API_URL?.trim() ||
      values.NIO_CHANGE_ACCESS_TOKEN?.trim(),
  );
}

export function isCheckinApiConfigured(values: Record<string, string> | null | undefined): boolean {
  if (!values) return false;
  return Boolean(values.NIO_CHECKIN_API_URL?.trim());
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
