import crypto from "node:crypto";

import { normalizeBearerToken, sanitizeHeaders } from "./http-headers.js";

const WIDGET_BASE = "https://app.nio.com/app/api/icar/v2/widget/info";

function readVehicleEnv(name: string): string | undefined {
  return process.env[`NIO_VEHICLE_${name}`] ?? process.env[`NIO_${name}`];
}

export interface WidgetParams {
  region: string;
  app_id: string;
  timestamp: string;
  lang: string;
  vehicle_id: string;
  app_ver: string;
  device_id: string;
  widget_functions: string;
  widget_size: string;
  sign?: string;
}

export function widgetParamsFromEnv(): WidgetParams {
  const vehicleId = readVehicleEnv("ID")?.trim();
  const deviceId = readVehicleEnv("DEVICE_ID")?.trim();

  if (!vehicleId) {
    throw new Error("NIO_VEHICLE_ID 未设置");
  }
  if (!deviceId) {
    throw new Error("NIO_DEVICE_ID 未设置（Postman Params 里的 device_id）");
  }

  return {
    region: readVehicleEnv("REGION") ?? "cn",
    app_id: readVehicleEnv("APP_ID") ?? "10002",
    timestamp: String(Math.floor(Date.now() / 1000)),
    lang: readVehicleEnv("LANG") ?? "zh-CN",
    vehicle_id: vehicleId,
    app_ver: readVehicleEnv("APP_VER") ?? "6.5.3",
    device_id: deviceId,
    widget_functions:
      readVehicleEnv("WIDGET_FUNCTIONS") ??
      "rvs_run_frequent_appointment,rvs_set_defender_mode,rvs_rpa_out,rvs_exe_findme",
    widget_size: readVehicleEnv("WIDGET_SIZE") ?? "medium",
  };
}

function md5(text: string): string {
  return crypto.createHash("md5").update(text, "utf8").digest("hex");
}

/** 按 key 字典序拼接 query（不含 sign） */
function sortedQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

/**
 * 尝试用 secret 计算 sign（32 位 hex，与 Postman 中 sign 格式一致）。
 * 若算法不匹配，请在 Postman Scripts 里找到 sign 逻辑，或暂时用 NIO_API_URL 粘贴完整 URL。
 */
export function computeWidgetSign(params: WidgetParams, secret: string, algo = "md5_append"): string {
  const base = sortedQuery({
    region: params.region,
    app_id: params.app_id,
    timestamp: params.timestamp,
    lang: params.lang,
    vehicle_id: params.vehicle_id,
    app_ver: params.app_ver,
    device_id: params.device_id,
    widget_functions: params.widget_functions,
    widget_size: params.widget_size,
  });

  switch (algo) {
    case "md5_prepend":
      return md5(secret + base);
    case "md5_append_key":
      return md5(`${base}&key=${secret}`);
    case "md5_append":
    default:
      return md5(base + secret);
  }
}

export function buildWidgetUrl(): string {
  const params = widgetParamsFromEnv();
  const fixedSign = (process.env.NIO_VEHICLE_API_SIGN ?? process.env.NIO_API_SIGN)?.trim();
  const fixedTimestamp = (process.env.NIO_VEHICLE_API_TIMESTAMP ?? process.env.NIO_API_TIMESTAMP)?.trim();
  const secret = (process.env.NIO_VEHICLE_SIGN_SECRET ?? process.env.NIO_SIGN_SECRET)?.trim();

  if (fixedSign && fixedTimestamp) {
    params.timestamp = fixedTimestamp;
    params.sign = fixedSign;
  } else if (secret) {
    const algo = process.env.NIO_VEHICLE_SIGN_ALGO ?? process.env.NIO_SIGN_ALGO ?? "md5_append";
    params.sign = computeWidgetSign(params, secret, algo);
  } else if (fixedSign) {
    params.sign = fixedSign;
  } else {
    throw new Error(
      "请设置 NIO_API_TIMESTAMP + NIO_API_SIGN（Postman 复制），或 NIO_SIGN_SECRET 自动签名",
    );
  }

  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return `${WIDGET_BASE}?${qs}`;
}

export function widgetHeadersFromEnv(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "*/*",
    Connection: "keep-alive",
    "User-Agent":
      process.env.NIO_VEHICLE_USER_AGENT ??
      process.env.NIO_USER_AGENT ??
      "VehicleWidgetExtension/6.5.3 (com.nio.app; build:6050300; iOS 18.0.0)",
  };

  const headersJson = process.env.NIO_VEHICLE_API_HEADERS ?? process.env.NIO_API_HEADERS;
  if (headersJson) {
    Object.assign(headers, JSON.parse(headersJson));
  }

  const token =
    process.env.NIO_VEHICLE_ACCESS_TOKEN ??
    process.env.NIO_ACCESS_TOKEN ??
    process.env.NIO_VEHICLE_AUTHORIZATION ??
    process.env.NIO_AUTHORIZATION;
  const auth = normalizeBearerToken(token, "NIO_VEHICLE_ACCESS_TOKEN");
  if (auth && !headers.Authorization && !headers.authorization) {
    headers.Authorization = auth;
  }

  if (process.env.NIO_VEHICLE_COOKIE ?? process.env.NIO_COOKIE) {
    headers.Cookie = process.env.NIO_VEHICLE_COOKIE ?? process.env.NIO_COOKIE ?? "";
  }

  return sanitizeHeaders(headers);
}

/** widget 接口返回结构与看板一致则原样使用 */
export function normalizeVehiclePayload(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.data && typeof raw.data === "object") {
    const data = raw.data as Record<string, unknown>;
    if (data.status && typeof data.status === "object") {
      return raw;
    }
  }
  return raw;
}
