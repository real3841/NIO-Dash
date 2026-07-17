import { inferFetchFailureHint } from "./fetch-log.js";
import {
  fmtSwapDate,
  orderLocation,
  orderTypeLabel,
  type ServiceOrder,
} from "../src/lib/change.js";

const MAX_REQUEST_BODY_CHARS = 32_000;

export interface ApiRequestInfo {
  method: string;
  url: string;
  body?: string | null;
}

export function buildApiRequestDetail(config: {
  url: string;
  method?: string;
  body?: string | null;
}): ApiRequestInfo {
  const body = config.body?.trim();
  return {
    method: (config.method ?? "GET").toUpperCase(),
    url: config.url,
    body: body
      ? body.length > MAX_REQUEST_BODY_CHARS
        ? `${body.slice(0, MAX_REQUEST_BODY_CHARS)}\n…[Body 已截断，共 ${body.length} 字符]`
        : body
      : null,
  };
}

function withApiRequest(
  detail: Record<string, unknown>,
  apiRequest?: ApiRequestInfo | null,
): Record<string, unknown> {
  if (apiRequest) detail.apiRequest = apiRequest;
  return detail;
}

export function vehicleSuccessDetail(
  payload: Record<string, unknown>,
  snap: {
    ts: number;
    soc: number;
    range: number;
    actualRange: number;
    mileage: number;
    lat: number;
    lng: number;
    insideTemp: number;
    outsideTemp: number;
  },
  apiRequest?: ApiRequestInfo | null,
): Record<string, unknown> {
  const data = payload.data as Record<string, unknown> | undefined;
  const status = data?.status as Record<string, unknown> | undefined;
  const soc = status?.soc as Record<string, unknown> | undefined;
  const ext = status?.exterior as Record<string, unknown> | undefined;
  const conn = status?.connection as Record<string, unknown> | undefined;
  const position = status?.position as Record<string, unknown> | undefined;

  return withApiRequest(
    {
      kind: "vehicle",
      result: "success",
      resultCode: payload.result_code ?? payload.resultCode ?? "success",
      serverTime: data?.server_time ?? null,
      sampleTime: new Date(snap.ts).toISOString(),
      socPercent: snap.soc,
      rangeKm: { standard: snap.range, actual: snap.actualRange },
      mileageKm: snap.mileage,
      location: {
        lat: snap.lat,
        lng: snap.lng,
        address: position?.address ?? null,
      },
      temperature: { insideC: snap.insideTemp, outsideC: snap.outsideTemp },
      vehicleState: ext?.vehicle_state ?? null,
      lockState: ext?.lock_state ?? null,
      connected: conn?.connected ?? null,
      chargeState: soc?.charger_state ?? soc?.charge_state ?? null,
      charging: soc?.charging ?? null,
      rawResponse: payload,
    },
    apiRequest,
  );
}

export function vehicleErrorDetail(
  message: string,
  payload?: Record<string, unknown>,
  apiRequest?: ApiRequestInfo | null,
): Record<string, unknown> {
  const detail: Record<string, unknown> = {
    kind: "vehicle",
    result: "error",
    reason: message,
    hint: inferFetchFailureHint(message, "vehicle"),
  };
  if (payload) {
    detail.resultCode = payload.result_code ?? payload.resultCode ?? null;
    detail.api = {
      resultCode: payload.result_code ?? payload.resultCode ?? null,
      displayMsg: payload.display_msg ?? payload.message ?? payload.result_desc ?? null,
      debugMsg: payload.debug_msg ?? null,
    };
    detail.rawResponse = payload;
  }
  return withApiRequest(detail, apiRequest);
}

export function changeSuccessDetail(
  payload: Record<string, unknown>,
  apiRequest?: ApiRequestInfo | null,
): Record<string, unknown> {
  const resultData = payload.resultData as
    | { data?: Record<string, unknown>[]; total?: number | null }
    | undefined;
  const orders = Array.isArray(resultData?.data) ? resultData.data : [];
  const typed = orders as ServiceOrder[];

  const typeCounts = new Map<string, { label: string; count: number }>();
  for (const order of typed) {
    const label = orderTypeLabel(order);
    const prev = typeCounts.get(order.orderType) ?? { label, count: 0 };
    prev.count += 1;
    typeCounts.set(order.orderType, prev);
  }

  const recentOrders = [...typed]
    .sort((a, b) => b.createTime - a.createTime)
    .slice(0, 5)
    .map((order, index) => ({
      index: index + 1,
      time: order.createTime ? fmtSwapDate(order.createTime) : null,
      type: orderTypeLabel(order),
      location: orderLocation(order),
      status: order.orderStatusName || order.orderStatus || null,
      amount: order.payDesc || order.priceCash || null,
      orderNo: order.orderNo || null,
    }));

  return withApiRequest(
    {
      kind: "change",
      result: "success",
      orderCount: orders.length,
      total: resultData?.total ?? null,
      byType: [...typeCounts.values()].sort((a, b) => b.count - a.count),
      recentOrders,
      rawResponse: payload,
    },
    apiRequest,
  );
}

export function changeErrorDetail(
  message: string,
  httpStatus?: number,
  rawBody?: string,
  apiRequest?: ApiRequestInfo | null,
): Record<string, unknown> {
  const detail: Record<string, unknown> = {
    kind: "change",
    result: "error",
    reason: message,
    httpStatus: httpStatus ?? null,
    hint: inferFetchFailureHint(message, "change"),
  };
  if (rawBody) {
    try {
      detail.rawResponse = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      detail.rawResponse = { _rawText: rawBody };
    }
  }
  return withApiRequest(detail, apiRequest);
}

export function checkinSuccessDetail(
  payload: Record<string, unknown>,
  apiRequest?: ApiRequestInfo | null,
): Record<string, unknown> {
  return withApiRequest(
    {
      kind: "checkin",
      result: "success",
      checkedIn: payload.checked_in === true,
      continuousDays: payload.continuous_days ?? null,
      accumulateDays: payload.accumulate_days ?? null,
      todayChecked: payload.today_checked ?? null,
      rawResponse: payload,
    },
    apiRequest,
  );
}

export function checkinErrorDetail(
  message: string,
  apiRequest?: ApiRequestInfo | null,
): Record<string, unknown> {
  return withApiRequest(
    {
      kind: "checkin",
      result: "error",
      reason: message,
      hint: inferFetchFailureHint(message, "checkin"),
    },
    apiRequest,
  );
}
