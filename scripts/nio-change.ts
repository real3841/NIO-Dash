import { normalizeBearerToken, sanitizeHeaders } from "./http-headers.js";

const CHANGE_BASE =
  process.env.NIO_CHANGE_API_BASE?.trim() ??
  "https://gateway-front-external.nio.com/moat/1100367/api/v1/otd/car/ext/general/serviceOrder/getTabOrder";

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
    orderTypes:
      readChangeEnv(
        "ORDER_TYPES",
        "pe_shaman,pe_shaman_change,service_pe_discharge",
      )!,
    inProgressStatus: readChangeEnv("IN_PROGRESS_STATUS", "false")!,
    pagination_method: readChangeEnv("PAGINATION_METHOD", "2")!,
  };

  return params;
}

export function buildChangeUrl(): string {
  const explicit = process.env.NIO_CHANGE_API_URL?.trim();
  const useParams =
    process.env.NIO_CHANGE_API_MODE === "params" ||
    (!explicit && readChangeEnv("HASH_TYPE"));

  if (!useParams && explicit) {
    return explicit;
  }

  const params = changeParamsFromEnv();
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return `${CHANGE_BASE}?${qs}`;
}

/** Postman Headers（POST 空 body）；User-Agent / mobileinfo 仅在 .env 显式配置时发送 */
export function changeHeadersFromEnv(): Record<string, string> {
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

  const userAgent = readChangeEnv("USER_AGENT");
  if (userAgent) {
    headers["User-Agent"] = userAgent;
  }

  const mobileInfo = readChangeEnv("MOBILEINFO");
  if (mobileInfo) {
    headers.mobileinfo = mobileInfo;
  }

  const headersJson = process.env.NIO_CHANGE_API_HEADERS?.trim();
  if (headersJson) {
    Object.assign(headers, JSON.parse(headersJson) as Record<string, string>);
  }

  const token =
    process.env.NIO_CHANGE_ACCESS_TOKEN ??
    process.env.NIO_ACCESS_TOKEN ??
    process.env.NIO_VEHICLE_ACCESS_TOKEN;
  const auth = normalizeBearerToken(token, "NIO_CHANGE_ACCESS_TOKEN");
  if (auth && !headers.Authorization && !headers.authorization) {
    headers.Authorization = auth;
  }

  const cookie = readChangeEnv("COOKIE");
  if (cookie) {
    headers.Cookie = cookie;
  }

  return sanitizeHeaders(headers);
}

export function assertChangePayload(payload: Record<string, unknown>): void {
  const code = payload.resultCode ?? payload.result_code;
  if (code === "0000" || code === "success") return;

  const desc =
    payload.resultDesc ??
    payload.result_desc ??
    payload.debug_msg ??
    payload.resultMsg ??
    String(code);
  throw new Error(`换电接口失败: ${desc}`);
}
