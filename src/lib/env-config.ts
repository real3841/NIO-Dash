export type VehicleEnv = {
  NIO_VEHICLE_API_URL: string;
  NIO_VEHICLE_ACCESS_TOKEN: string;
  NIO_VEHICLE_USER_AGENT: string;
  NIO_VEHICLE_API_METHOD: string;
  NIO_VEHICLE_POLL_DRIVING_SEC: string;
  NIO_VEHICLE_POLL_DAY_SEC: string;
  NIO_VEHICLE_POLL_NIGHT_SEC: string;
  NIO_CHECKIN_API_URL: string;
  NIO_CHECKIN_ACCESS_TOKEN: string;
  NIO_VEHICLE_STATUS_URL: string;
  NIO_JOURNEY_API_URL: string;
  NIO_DAILY_API_URL: string;
  NIO_VEHICLE_EXTRA_TOKEN: string;
};

export type ChangeEnv = {
  NIO_CHANGE_API_URL: string;
  NIO_CHANGE_ACCESS_TOKEN: string;
  NIO_CHANGE_USER_AGENT: string;
  NIO_CHANGE_MOBILEINFO: string;
  NIO_CHANGE_API_METHOD: string;
  NIO_CHANGE_API_BODY: string;
  NIO_CHANGE_API_MODE: string;
  NIO_CHANGE_POLL_INTERVAL: string;
};

export type GeneralEnv = {
  NIO_POLL_INTERVAL: string;
  WEB_PORT: string;
  NIO_TRAY_DISPLAY: string;
};

export type MapEnv = {
  NIO_AMAP_WEB_SERVICE_KEY: string;
  NIO_AMAP_JS_KEY: string;
  NIO_AMAP_JS_SECURITY_CODE: string;
};

export interface EnvConfigResponse {
  ok: boolean;
  path?: string;
  vehicle: VehicleEnv;
  change: ChangeEnv;
  general: GeneralEnv;
  map: MapEnv;
  error?: string;
}

export interface EnvFieldDef {
  key: string;
  label: string;
  type?: "text" | "password" | "textarea";
  hint?: string;
}

export const CHANGE_API_FIELDS: EnvFieldDef[] = [
  {
    key: "NIO_CHANGE_API_URL",
    label: "订单列表 URL（可留空）",
    type: "textarea",
    hint: "留空即用 App「换电订单」列表 serviceOrder/getTabOrder；分页参数 offset / limit / 游标由程序自己填",
  },
  { key: "NIO_CHANGE_ACCESS_TOKEN", label: "Authorization Token（可留空）", type: "password", hint: "可与车辆 Token 相同；留空则自动沿用车辆 Token。若报「用户名不能为空」通常是此 Token 过期" },
  {
    key: "NIO_CHANGE_USER_AGENT",
    label: "User-Agent（可选，默认 NextevCar App）",
    hint: "缺省时会用内置蔚来 App UA；若仍报「用户名不能为空」，请从 Postman 复制完整 User-Agent",
  },
];

export const CHANGE_POLL_FIELDS: EnvFieldDef[] = [
  {
    key: "NIO_CHANGE_POLL_INTERVAL",
    label: "后台定时拉取间隔（秒，默认 86400 = 1 天）",
  },
];

/** @deprecated use CHANGE_API_FIELDS + CHANGE_POLL_FIELDS */
export const CHANGE_FIELDS: EnvFieldDef[] = [...CHANGE_API_FIELDS, ...CHANGE_POLL_FIELDS];

export const VEHICLE_API_FIELDS: EnvFieldDef[] = [
  {
    key: "NIO_VEHICLE_API_URL",
    label: "完整请求 URL（从 Postman 复制，含 sign / timestamp）",
    type: "textarea",
    hint: "RVS: GET https://icar.nio.com/api/2/rvs/vehicle/.../status?field=...&sign=...\nWidget: GET https://app.nio.com/app/api/icar/v2/widget/info?widget_functions=...&sign=...",
  },
  { key: "NIO_VEHICLE_ACCESS_TOKEN", label: "Authorization Token", type: "password" },
];

export const VEHICLE_POLL_FIELDS: EnvFieldDef[] = [
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

export const CHECKIN_API_FIELDS: EnvFieldDef[] = [
  {
    key: "NIO_CHECKIN_API_URL",
    label: "签到 API URL（GET）",
    type: "textarea",
    hint: "GET https://gateway-front-external.nio.com/moat/10086//n/c/award/square?event=checkin&collection_id=...\n也可留空使用内置默认 URL；Widget 车辆接口已含签到时可不配",
  },
  {
    key: "NIO_CHECKIN_ACCESS_TOKEN",
    label: "签到 Authorization Token（可留空，沿用车辆 Token）",
    type: "password",
  },
];

export const MAP_API_FIELDS: EnvFieldDef[] = [
  {
    key: "NIO_AMAP_WEB_SERVICE_KEY",
    label: "高德 Web 服务 Key（逆地理编码）",
    type: "password",
    hint: "在高德开放平台申请「Web 服务」类型 Key，用于解析当前位置地址",
  },
  {
    key: "NIO_AMAP_JS_KEY",
    label: "高德 Web 端 Key（地图底图，可选）",
    type: "password",
    hint: "申请「Web 端 JS API」Key 后，每日行驶路径将使用高德底图；留空则继续 OpenStreetMap",
  },
  {
    key: "NIO_AMAP_JS_SECURITY_CODE",
    label: "安全密钥 jscode（与 Web 端 Key 配套，可选）",
    type: "password",
    hint: "2021 年后新建的 JS API Key 需填写；仅配置 Web 服务 Key 时可留空",
  },
];

/** @deprecated use VEHICLE_API_FIELDS + VEHICLE_POLL_FIELDS */
export const VEHICLE_FIELDS: EnvFieldDef[] = [...VEHICLE_API_FIELDS, ...VEHICLE_POLL_FIELDS];

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

export async function saveTrayEnv(display: string): Promise<void> {
  const res = await fetch("/api/config/tray", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ NIO_TRAY_DISPLAY: display }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `保存菜单栏配置失败 (${res.status})`);
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

export async function saveMapEnv(map: MapEnv): Promise<void> {
  const res = await fetch("/api/config/map", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(map),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `保存地图配置失败 (${res.status})`);
  }
}
