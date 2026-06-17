/**
 * 蔚来 App Widget 接口（Postman GET + Params + Headers）
 *
 * 方式 1 — 推荐：拆参数 + Authorization（timestamp 每次自动刷新）
 *   NIO_API_MODE=widget
 *   NIO_VEHICLE_ID=cc9d1b377eaa4f611620092960004010
 *   NIO_DEVICE_ID=9e78a54fc7d74cd9ae97bac39fb10dca
 *   NIO_ACCESS_TOKEN=你的Bearer Token
 *   NIO_SIGN_SECRET=签名密钥（若不知道，见下方说明）
 *
 * 方式 2 — 临时：Postman 复制完整 URL（sign 会过期，不适合 NAS 定时）
 *   NIO_API_URL=https://app.nio.com/app/api/icar/v2/widget/info?region=cn&...
 *   NIO_API_METHOD=GET
 *   NIO_API_HEADERS={"Authorization":"Bearer xxx","User-Agent":"VehicleWidgetExtension/6.5.3 ..."}
 */

import { buildWidgetUrl, normalizeVehiclePayload, widgetHeadersFromEnv } from "./nio-widget.js";
import { fetchWithAsciiHeaders, normalizeBearerToken } from "./http-headers.js";

export interface FetchConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function readJsonResponse<T>(text: string, label: string): T {
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`${label} 返回空内容`);
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.startsWith("<!DOCTYPE")) {
    throw new Error(`${label} 返回 HTML 而非 JSON，请检查 Authorization / sign / timestamp`);
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`${label} 不是合法 JSON`);
  }
}

export function loadFetchConfig(): FetchConfig {
  const mode = (process.env.NIO_VEHICLE_API_MODE ?? process.env.NIO_API_MODE ?? "").toLowerCase();
  const explicitUrl = (process.env.NIO_VEHICLE_API_URL ?? process.env.NIO_API_URL)?.trim();

  if (
    mode === "widget" ||
    ((process.env.NIO_VEHICLE_ID || process.env.NIO_ID) &&
      (process.env.NIO_VEHICLE_DEVICE_ID || process.env.NIO_DEVICE_ID) &&
      !explicitUrl)
  ) {
    return {
      url: buildWidgetUrl(),
      method: "GET",
      headers: widgetHeadersFromEnv(),
    };
  }

  const headersJson = process.env.NIO_VEHICLE_API_HEADERS ?? process.env.NIO_API_HEADERS;
  let headers: Record<string, string> = { Accept: "application/json" };

  if (headersJson) {
    try {
      headers = { ...headers, ...JSON.parse(headersJson) };
    } catch {
      throw new Error("NIO_VEHICLE_API_HEADERS 不是合法 JSON");
    }
  }

  const token = process.env.NIO_VEHICLE_ACCESS_TOKEN ?? process.env.NIO_ACCESS_TOKEN;
  const auth = normalizeBearerToken(token, "NIO_VEHICLE_ACCESS_TOKEN");
  if (auth && !headers.Authorization && !headers.authorization) {
    headers.Authorization = auth;
  }

  if (explicitUrl) {
    const method = (process.env.NIO_VEHICLE_API_METHOD ?? process.env.NIO_API_METHOD ?? "GET").toUpperCase();
    const body = process.env.NIO_VEHICLE_API_BODY?.trim() || process.env.NIO_API_BODY?.trim() || undefined;

    if (method !== "GET" && method !== "HEAD" && body && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }

    if (!headers["User-Agent"] && explicitUrl.includes("widget/info")) {
      headers["User-Agent"] =
        process.env.NIO_VEHICLE_USER_AGENT ??
        process.env.NIO_USER_AGENT ??
        "VehicleWidgetExtension/6.5.3 (com.nio.app; build:6050300; iOS 18.0.0)";
    }

    return { url: explicitUrl, method, headers, body };
  }

  throw new Error("请设置 NIO_VEHICLE_API_MODE=widget + 参数，或 NIO_VEHICLE_API_URL（Postman 完整 URL）");
}

export async function fetchFromApi(config: FetchConfig): Promise<Record<string, unknown>> {
  const res = await fetchWithAsciiHeaders(config.url, {
    method: config.method,
    headers: config.headers,
    body: config.method === "GET" || config.method === "HEAD" ? undefined : config.body,
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${text.slice(0, 500)}`);
  }

  const raw = readJsonResponse<Record<string, unknown>>(text, "蔚来 API");
  return normalizeVehiclePayload(raw);
}
