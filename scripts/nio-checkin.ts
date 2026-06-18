import { fetchWithAsciiHeaders, normalizeBearerToken, sanitizeHeaders } from "./http-headers.js";

const DEFAULT_CHECKIN_URL =
  "https://gateway-front-external.nio.com/moat/10086//n/c/award/square?event=checkin&collection_id=1843940587332317185";

const DEFAULT_USER_AGENT =
  "VehicleWidgetExtension/6.5.3 (com.do1.WeiLaiApp.NIOVehicleWidget; build:2612; iOS 26.5.0) Alamofire/5.9.1";

export interface CheckinFetchConfig {
  url: string;
  headers: Record<string, string>;
}

import { extractCheckinFields } from "../src/lib/checkin.js";

export function loadCheckinFetchConfig(): CheckinFetchConfig | null {
  const url = (process.env.NIO_CHECKIN_API_URL?.trim() || DEFAULT_CHECKIN_URL).trim();
  const token =
    process.env.NIO_CHECKIN_ACCESS_TOKEN?.trim() ||
    process.env.NIO_VEHICLE_ACCESS_TOKEN?.trim() ||
    process.env.NIO_ACCESS_TOKEN?.trim();

  if (!token) return null;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": process.env.NIO_CHECKIN_USER_AGENT ?? process.env.NIO_VEHICLE_USER_AGENT ?? DEFAULT_USER_AGENT,
  };

  const headersJson = process.env.NIO_CHECKIN_API_HEADERS?.trim();
  if (headersJson) {
    try {
      Object.assign(headers, JSON.parse(headersJson) as Record<string, string>);
    } catch {
      throw new Error("NIO_CHECKIN_API_HEADERS 不是合法 JSON");
    }
  }

  const auth = normalizeBearerToken(token, "NIO_CHECKIN_ACCESS_TOKEN");
  if (auth && !headers.Authorization && !headers.authorization) {
    headers.Authorization = auth;
  }

  return { url, headers: sanitizeHeaders(headers) };
}

export function assertCheckinPayload(payload: Record<string, unknown>): void {
  const code = payload.result_code ?? payload.resultCode;
  if (code === "success" || code === "0000") return;

  const desc =
    payload.display_msg ??
    payload.message ??
    payload.debug_msg ??
    payload.result_desc ??
    String(code ?? "unknown");
  throw new Error(`签到接口失败: ${desc}`);
}

export function normalizeCheckinPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const extracted = extractCheckinFields(raw);
  if (!extracted) {
    throw new Error("签到 API 响应中未找到 checked_in / continuous_days");
  }

  return {
    checked_in: extracted.checked_in,
    continuous_days: extracted.continuous_days,
    server_time: typeof raw.server_time === "number" ? raw.server_time : Date.now(),
    request_id: raw.request_id ?? null,
  };
}

export async function fetchCheckinFromApi(config: CheckinFetchConfig): Promise<Record<string, unknown>> {
  const res = await fetchWithAsciiHeaders(config.url, {
    method: "GET",
    headers: config.headers,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`签到 API ${res.status}: ${text.slice(0, 500)}`);
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.trim()) as Record<string, unknown>;
  } catch {
    throw new Error("签到 API 不是合法 JSON");
  }

  assertCheckinPayload(raw);
  return normalizeCheckinPayload(raw);
}
