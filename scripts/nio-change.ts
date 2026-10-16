import { ALL_ORDER_TYPES } from "../src/lib/orders-ledger.js";
import { classifyChangeApiFailure } from "../src/lib/nio-api-errors.js";
import type { ServiceOrder } from "../src/lib/change.js";
import { normalizeBearerToken, sanitizeHeaders } from "./http-headers.js";

const CHANGE_BASE =
  process.env.NIO_CHANGE_API_BASE?.trim() ??
  "https://gateway-front-external.nio.com/moat/1100367/api/v1/otd/car/ext/general/serviceOrder/getTabOrder";

/** 与 ha-nio ORDERS_USER_AGENT 一致；网关靠此识别 App 客户端，缺省会报「用户名不能为空」 */
const DEFAULT_CHANGE_USER_AGENT =
  "NextevCar/6.3.0 (com.do1.WeiLaiApp; build:2586; iOS 26.2.1)";

export interface ChangeQueryParams {
  hash_type: string;
  lang: string;
  region: string;
  tz_offset: string;
  nioAppVersion: string;
  appVersion: string;
  orderConfVersion: string;
  app_ver: string;
  offset: string;
  limit: string;
  orderTypes: string;
  inProgressStatus: string;
  pagination_method: string;
}

function readChangeEnv(name: string, fallback?: string): string | undefined {
  return process.env[`NIO_CHANGE_${name}`]?.trim() ?? fallback;
}

export function changeParamsFromEnv(): ChangeQueryParams {
  const params: ChangeQueryParams = {
    hash_type: readChangeEnv("HASH_TYPE", "sha256")!,
    lang: readChangeEnv("LANG", "zh")!,
    region: readChangeEnv("REGION", "US")!,
    tz_offset: readChangeEnv("TZ_OFFSET", "28800")!,
    nioAppVersion: readChangeEnv("NIO_APP_VERSION", "6.5.3")!,
    appVersion: readChangeEnv("APP_VERSION", "5.31.0")!,
    orderConfVersion: readChangeEnv("ORDER_CONF_VERSION", "5.31.0")!,
    app_ver: readChangeEnv("APP_VER", "6.5.3")!,
    offset: readChangeEnv("OFFSET", "0")!,
    limit: readChangeEnv("LIMIT", "200")!,
    orderTypes: readChangeEnv("ORDER_TYPES", ALL_ORDER_TYPES.join(","))!,
    inProgressStatus: readChangeEnv("IN_PROGRESS_STATUS", "false")!,
    pagination_method: readChangeEnv("PAGINATION_METHOD", "2")!,
  };

  return params;
}

const SERVICE_ORDER_URL =
  "https://gateway-front-external.nio.com/moat/1100367/api/v1/otd/car/ext/general/serviceOrder/getTabOrder";

/** App 订单列表每页 10 条，下滑时带上一页的 lastCursorCreateTime / lastCursorId */
export const CURSOR_PAGE_SIZE = 10;
export const CURSOR_MAX_PAGES = 200;

const CURSOR_DEFAULT_PARAMS: Record<string, string> = {
  hash_type: "sha256",
  lang: "zh",
  region: "US",
  tz_offset: "28800",
  nioAppVersion: "6.9.0",
  appVersion: "5.31.0",
  orderConfVersion: "5.31.0",
  app_ver: "6.9.0",
  inProgressStatus: "false",
  pagination_method: "2",
};

const CURSOR_PAGING_KEYS = ["offset", "limit", "lastCursorCreateTime", "lastCursorId", "orderTypes"];

/** 默认按 App 的换电订单列表翻页拉全量；raw / params 保留旧行为 */
export function usesCursorSync(): boolean {
  const mode = process.env.NIO_CHANGE_API_MODE?.trim();
  return !mode || mode === "cursor";
}

export function buildCursorPageUrl(page: {
  offset: number;
  cursorTime?: string;
  cursorId?: string;
}): string {
  const explicit = process.env.NIO_CHANGE_API_URL?.trim();
  const url = new URL(explicit?.includes("/serviceOrder/getTabOrder") ? explicit : SERVICE_ORDER_URL);
  for (const key of CURSOR_PAGING_KEYS) url.searchParams.delete(key);
  for (const [key, value] of Object.entries(CURSOR_DEFAULT_PARAMS)) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  url.searchParams.set("offset", String(page.offset));
  url.searchParams.set("limit", String(CURSOR_PAGE_SIZE));
  if (page.cursorTime && page.cursorId) {
    url.searchParams.set("lastCursorCreateTime", page.cursorTime);
    url.searchParams.set("lastCursorId", page.cursorId);
  }
  return url.toString();
}

export function usesLedgerBackfill(): boolean {
  if (usesCursorSync()) return false;
  if (process.env.NIO_CHANGE_API_MODE === "raw") return false;
  const explicit = process.env.NIO_CHANGE_API_URL?.trim();
  if (!explicit) return true;
  if (process.env.NIO_CHANGE_API_MODE === "params") return true;
  if (readChangeEnv("HASH_TYPE")) return true;
  return false;
}

export function buildChangeUrlWithPaging(offset: number, limit: number): string {
  const params = changeParamsFromEnv();
  params.offset = String(offset);
  params.limit = String(limit);
  params.orderTypes = ALL_ORDER_TYPES.join(",");
  const qs = Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return `${CHANGE_BASE}?${qs}`;
}

export function buildChangeUrl(): string {
  const explicit = process.env.NIO_CHANGE_API_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const useParams =
    process.env.NIO_CHANGE_API_MODE === "params" ||
    readChangeEnv("HASH_TYPE");

  if (!useParams) {
    throw new Error("请设置 NIO_CHANGE_API_URL（完整请求 URL）和 NIO_CHANGE_ACCESS_TOKEN");
  }

  return buildChangeUrlWithPaging(Number(changeParamsFromEnv().offset), Number(changeParamsFromEnv().limit));
}

export function changeAuthTokensFromEnv(): string[] {
  const candidates = [
    process.env.NIO_CHANGE_ACCESS_TOKEN,
    process.env.NIO_ACCESS_TOKEN,
    process.env.NIO_VEHICLE_ACCESS_TOKEN,
  ];
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of candidates) {
    const auth = normalizeBearerToken(raw?.trim(), "NIO_CHANGE_ACCESS_TOKEN");
    if (auth && !seen.has(auth)) {
      seen.add(auth);
      tokens.push(auth);
    }
  }
  return tokens;
}

/** Postman Headers（POST body 默认 `{}`）；mobileinfo 仅在 .env 显式配置时发送 */
export function changeHeadersFromEnv(authorization?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: readChangeEnv("ACCEPT") ?? "application/json, text/plain, */*",
    "Accept-Encoding": readChangeEnv("ACCEPT_ENCODING") ?? "gzip, deflate, br, zstd",
    "Accept-Language": readChangeEnv("ACCEPT_LANGUAGE") ?? "zh-CN,zh-Hans;q=0.9",
    "Content-Type": readChangeEnv("CONTENT_TYPE") ?? "application/json",
    Connection: readChangeEnv("CONNECTION") ?? "keep-alive",
    Origin: readChangeEnv("ORIGIN") ?? "null",
    Priority: readChangeEnv("PRIORITY") ?? "u=3, i",
    "Sec-Fetch-Dest": readChangeEnv("SEC_FETCH_DEST") ?? "empty",
    "Sec-Fetch-Mode": readChangeEnv("SEC_FETCH_MODE") ?? "cors",
    "Sec-Fetch-Site": readChangeEnv("SEC_FETCH_SITE") ?? "cross-site",
  };

  headers["User-Agent"] = readChangeEnv("USER_AGENT") || DEFAULT_CHANGE_USER_AGENT;

  const mobileInfo = readChangeEnv("MOBILEINFO");
  if (mobileInfo) {
    headers.mobileinfo = mobileInfo;
  }

  const headersJson = process.env.NIO_CHANGE_API_HEADERS?.trim();
  if (headersJson) {
    Object.assign(headers, JSON.parse(headersJson) as Record<string, string>);
  }

  const auth = authorization ?? changeAuthTokensFromEnv()[0];
  if (auth && !headers.Authorization && !headers.authorization) {
    headers.Authorization = auth;
  }

  const cookie = readChangeEnv("COOKIE");
  if (cookie) {
    headers.Cookie = cookie;
  }

  return sanitizeHeaders(headers);
}

export function extractOrdersFromPayload(payload: Record<string, unknown>): {
  orders: ServiceOrder[];
  hasMore: boolean;
  cursorTime?: string;
  cursorId?: string;
} {
  const resultData = (payload.resultData ?? {}) as Record<string, unknown>;
  const cursorTime = resultData.lastCursorCreateTime;
  const cursorId = resultData.lastCursorId;
  return {
    orders: Array.isArray(resultData.data) ? (resultData.data as ServiceOrder[]) : [],
    hasMore: Boolean(resultData.hasMore),
    cursorTime: cursorTime == null || cursorTime === "" ? undefined : String(cursorTime),
    cursorId: cursorId == null || cursorId === "" ? undefined : String(cursorId),
  };
}

export function assertChangePayload(payload: Record<string, unknown>, httpStatus = 200): void {
  const code = payload.resultCode ?? payload.result_code;
  if (code === "0000" || code === "success") return;
  throw classifyChangeApiFailure(payload, httpStatus);
}
