/**
 * 车辆状态接口
 *
 * 推荐：完整 URL + Authorization Token（从 Postman 复制）
 *   NIO_VEHICLE_API_URL=https://icar.nio.com/api/2/rvs/vehicle/.../status?...
 *   NIO_VEHICLE_ACCESS_TOKEN=你的 Bearer Token
 */

import { normalizeRvsVehiclePayload } from "./nio-rvs.js";
import { buildWidgetUrl, normalizeVehiclePayload, widgetHeadersFromEnv } from "./nio-widget.js";
import { fetchWithAsciiHeaders, normalizeBearerToken } from "./http-headers.js";

export interface FetchConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

const DEFAULT_USER_AGENT =
  "VehicleWidgetExtension/6.5.3 (com.do1.WeiLaiApp.NIOVehicleWidget; build:2612; iOS 26.5.0) Alamofire/5.9.1";

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

function buildUrlModeConfig(explicitUrl: string): FetchConfig {
  const headersJson = process.env.NIO_VEHICLE_API_HEADERS ?? process.env.NIO_API_HEADERS;
  let headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": process.env.NIO_VEHICLE_USER_AGENT ?? process.env.NIO_USER_AGENT ?? DEFAULT_USER_AGENT,
  };

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

  const method = (process.env.NIO_VEHICLE_API_METHOD ?? process.env.NIO_API_METHOD ?? "GET").toUpperCase();
  const body = process.env.NIO_VEHICLE_API_BODY?.trim() || process.env.NIO_API_BODY?.trim() || undefined;

  if (method !== "GET" && method !== "HEAD" && body && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  return { url: explicitUrl, method, headers, body };
}

export function loadFetchConfig(): FetchConfig {
  const explicitUrl = (process.env.NIO_VEHICLE_API_URL ?? process.env.NIO_API_URL)?.trim();
  if (explicitUrl) {
    return buildUrlModeConfig(explicitUrl);
  }

  const mode = (process.env.NIO_VEHICLE_API_MODE ?? process.env.NIO_API_MODE ?? "").toLowerCase();
  if (
    mode === "widget" ||
    ((process.env.NIO_VEHICLE_ID || process.env.NIO_ID) &&
      (process.env.NIO_VEHICLE_DEVICE_ID || process.env.NIO_DEVICE_ID))
  ) {
    return {
      url: buildWidgetUrl(),
      method: "GET",
      headers: widgetHeadersFromEnv(),
    };
  }

  throw new Error("请设置 NIO_VEHICLE_API_URL（完整请求 URL）和 NIO_VEHICLE_ACCESS_TOKEN");
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
  const rvs = normalizeRvsVehiclePayload(raw);
  return normalizeVehiclePayload(rvs);
}
