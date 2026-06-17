export type VehicleEnv = {
  NIO_VEHICLE_API_MODE: string;
  NIO_VEHICLE_API_METHOD: string;
  NIO_VEHICLE_REGION: string;
  NIO_VEHICLE_APP_ID: string;
  NIO_VEHICLE_LANG: string;
  NIO_VEHICLE_ID: string;
  NIO_VEHICLE_APP_VER: string;
  NIO_VEHICLE_DEVICE_ID: string;
  NIO_VEHICLE_WIDGET_FUNCTIONS: string;
  NIO_VEHICLE_WIDGET_SIZE: string;
  NIO_VEHICLE_API_TIMESTAMP: string;
  NIO_VEHICLE_API_SIGN: string;
  NIO_VEHICLE_ACCESS_TOKEN: string;
  NIO_VEHICLE_USER_AGENT: string;
  NIO_VEHICLE_POLL_DRIVING_SEC: string;
  NIO_VEHICLE_POLL_DAY_SEC: string;
  NIO_VEHICLE_POLL_NIGHT_SEC: string;
};

export type ChangeEnv = {
  NIO_CHANGE_API_MODE: string;
  NIO_CHANGE_API_METHOD: string;
  NIO_CHANGE_HASH_TYPE: string;
  NIO_CHANGE_LANG: string;
  NIO_CHANGE_REGION: string;
  NIO_CHANGE_TZ_OFFSET: string;
  NIO_CHANGE_NIO_APP_VERSION: string;
  NIO_CHANGE_APP_VERSION: string;
  NIO_CHANGE_ORDER_CONF_VERSION: string;
  NIO_CHANGE_APP_VER: string;
  NIO_CHANGE_OFFSET: string;
  NIO_CHANGE_LIMIT: string;
  NIO_CHANGE_ORDER_TYPES: string;
  NIO_CHANGE_IN_PROGRESS_STATUS: string;
  NIO_CHANGE_PAGINATION_METHOD: string;
  NIO_CHANGE_ACCESS_TOKEN: string;
  NIO_CHANGE_COOKIE: string;
  NIO_CHANGE_ACCEPT: string;
  NIO_CHANGE_ACCEPT_ENCODING: string;
  NIO_CHANGE_ACCEPT_LANGUAGE: string;
  NIO_CHANGE_CONTENT_TYPE: string;
  NIO_CHANGE_CONNECTION: string;
  NIO_CHANGE_ORIGIN: string;
  NIO_CHANGE_PRIORITY: string;
  NIO_CHANGE_SEC_FETCH_DEST: string;
  NIO_CHANGE_SEC_FETCH_MODE: string;
  NIO_CHANGE_SEC_FETCH_SITE: string;
  NIO_CHANGE_API_URL: string;
  NIO_CHANGE_POLL_INTERVAL: string;
};

export type GeneralEnv = {
  NIO_POLL_INTERVAL: string;
  WEB_PORT: string;
};

export interface EnvConfigResponse {
  ok: boolean;
  path?: string;
  vehicle: VehicleEnv;
  change: ChangeEnv;
  general: GeneralEnv;
  error?: string;
}

export interface EnvFieldDef {
  key: string;
  label: string;
  type?: "text" | "password" | "textarea";
  hint?: string;
}

/** orderTypes 各取值说明（与 Postman Params 一致） */
export const CHANGE_ORDER_TYPES_HINT = `逗号分隔，不写空格。拉取以下类型的服务订单：
pe_shaman — 充电
pe_shaman_change — 换电
service_pe_discharge — 放电
battery_flexible_upgrade — 灵活升级
nsom_so_maintenance — 一键维保
nsom_so_chauffeur — 驾享服务
chauffeur_vehicle_delivery — 一键送车
so_case_accident — 事故报案`;

export const VEHICLE_FIELDS: EnvFieldDef[] = [
  { key: "NIO_VEHICLE_API_MODE", label: "API 模式" },
  { key: "NIO_VEHICLE_API_METHOD", label: "请求方法" },
  { key: "NIO_VEHICLE_REGION", label: "region" },
  { key: "NIO_VEHICLE_APP_ID", label: "app_id" },
  { key: "NIO_VEHICLE_LANG", label: "lang" },
  { key: "NIO_VEHICLE_ID", label: "vehicle_id" },
  { key: "NIO_VEHICLE_APP_VER", label: "app_ver" },
  { key: "NIO_VEHICLE_DEVICE_ID", label: "device_id" },
  { key: "NIO_VEHICLE_WIDGET_FUNCTIONS", label: "widget_functions", type: "textarea" },
  { key: "NIO_VEHICLE_WIDGET_SIZE", label: "widget_size" },
  { key: "NIO_VEHICLE_API_TIMESTAMP", label: "timestamp" },
  { key: "NIO_VEHICLE_API_SIGN", label: "sign" },
  { key: "NIO_VEHICLE_ACCESS_TOKEN", label: "Authorization Token", type: "password" },
  { key: "NIO_VEHICLE_USER_AGENT", label: "User-Agent", type: "textarea" },
  {
    key: "NIO_VEHICLE_POLL_DRIVING_SEC",
    label: "行驶中拉取间隔（秒，默认 900 = 15 分钟）",
  },
  {
    key: "NIO_VEHICLE_POLL_DAY_SEC",
    label: "白天 09:00–17:00 拉取间隔（秒，默认 1800 = 30 分钟）",
  },
  {
    key: "NIO_VEHICLE_POLL_NIGHT_SEC",
    label: "夜间 17:01–08:59 拉取间隔（秒，默认 3600 = 60 分钟）",
  },
];

export const CHANGE_FIELDS: EnvFieldDef[] = [
  { key: "NIO_CHANGE_API_MODE", label: "API 模式" },
  { key: "NIO_CHANGE_API_METHOD", label: "请求方法 (POST)" },
  { key: "NIO_CHANGE_HASH_TYPE", label: "hash_type" },
  { key: "NIO_CHANGE_LANG", label: "lang" },
  { key: "NIO_CHANGE_REGION", label: "region" },
  { key: "NIO_CHANGE_TZ_OFFSET", label: "tz_offset" },
  { key: "NIO_CHANGE_NIO_APP_VERSION", label: "nioAppVersion" },
  { key: "NIO_CHANGE_APP_VERSION", label: "appVersion" },
  { key: "NIO_CHANGE_ORDER_CONF_VERSION", label: "orderConfVersion" },
  { key: "NIO_CHANGE_APP_VER", label: "app_ver" },
  { key: "NIO_CHANGE_OFFSET", label: "offset" },
  { key: "NIO_CHANGE_LIMIT", label: "limit" },
  {
    key: "NIO_CHANGE_ORDER_TYPES",
    label: "orderTypes（订单类型）",
    type: "textarea",
    hint: CHANGE_ORDER_TYPES_HINT,
  },
  { key: "NIO_CHANGE_IN_PROGRESS_STATUS", label: "inProgressStatus" },
  { key: "NIO_CHANGE_PAGINATION_METHOD", label: "pagination_method" },
  { key: "NIO_CHANGE_ACCESS_TOKEN", label: "Authorization Token", type: "password" },
  { key: "NIO_CHANGE_COOKIE", label: "Cookie", type: "textarea" },
  { key: "NIO_CHANGE_ACCEPT", label: "Accept" },
  { key: "NIO_CHANGE_ACCEPT_ENCODING", label: "Accept-Encoding" },
  { key: "NIO_CHANGE_ACCEPT_LANGUAGE", label: "Accept-Language" },
  { key: "NIO_CHANGE_CONTENT_TYPE", label: "Content-Type" },
  { key: "NIO_CHANGE_CONNECTION", label: "Connection" },
  { key: "NIO_CHANGE_ORIGIN", label: "Origin" },
  { key: "NIO_CHANGE_PRIORITY", label: "Priority" },
  { key: "NIO_CHANGE_SEC_FETCH_DEST", label: "Sec-Fetch-Dest" },
  { key: "NIO_CHANGE_SEC_FETCH_MODE", label: "Sec-Fetch-Mode" },
  { key: "NIO_CHANGE_SEC_FETCH_SITE", label: "Sec-Fetch-Site" },
  { key: "NIO_CHANGE_API_URL", label: "完整 URL（可选，填了可不用 params）", type: "textarea" },
  {
    key: "NIO_CHANGE_POLL_INTERVAL",
    label: "后台定时拉取间隔（秒，默认 3600 = 60 分钟）",
  },
];

export async function fetchEnvConfig(): Promise<EnvConfigResponse> {
  const res = await fetch("/api/config");
  const data = (await res.json()) as EnvConfigResponse;
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `加载配置失败 (${res.status})`);
  }
  return data;
}

export async function saveVehicleEnv(
  vehicle: VehicleEnv & Record<string, string>,
): Promise<void> {
  const res = await fetch("/api/config/vehicle", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vehicle),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `保存车辆配置失败 (${res.status})`);
  }
}

export async function saveChangeEnv(change: ChangeEnv): Promise<void> {
  const res = await fetch("/api/config/change", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(change),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `保存换电配置失败 (${res.status})`);
  }
}
