export type VehicleEnv = {
  NIO_VEHICLE_API_URL: string;
  NIO_VEHICLE_ACCESS_TOKEN: string;
  NIO_VEHICLE_POLL_DRIVING_SEC: string;
  NIO_VEHICLE_POLL_DAY_SEC: string;
  NIO_VEHICLE_POLL_NIGHT_SEC: string;
  NIO_CHECKIN_API_URL: string;
  NIO_CHECKIN_ACCESS_TOKEN: string;
};

export type ChangeEnv = {
  NIO_CHANGE_API_URL: string;
  NIO_CHANGE_ACCESS_TOKEN: string;
  NIO_CHANGE_POLL_INTERVAL: string;
};

export type GeneralEnv = {
  NIO_POLL_INTERVAL: string;
  WEB_PORT: string;
  NIO_TRAY_DISPLAY: string;
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

export const CHANGE_API_FIELDS: EnvFieldDef[] = [
  {
    key: "NIO_CHANGE_API_URL",
    label: "完整请求 URL（从 Postman 复制 Query Params）",
    type: "textarea",
    hint: "POST https://gateway-front-external.nio.com/moat/1100367/api/v1/otd/car/ext/general/serviceOrder/getTabOrder?offset=0&limit=2000&orderTypes=...",
  },
  { key: "NIO_CHANGE_ACCESS_TOKEN", label: "Authorization Token", type: "password" },
];

export const CHANGE_POLL_FIELDS: EnvFieldDef[] = [
  {
    key: "NIO_CHANGE_POLL_INTERVAL",
    label: "后台定时拉取间隔（秒，默认 3600 = 60 分钟）",
  },
];

/** @deprecated use CHANGE_API_FIELDS + CHANGE_POLL_FIELDS */
export const CHANGE_FIELDS: EnvFieldDef[] = [...CHANGE_API_FIELDS, ...CHANGE_POLL_FIELDS];

export const VEHICLE_API_FIELDS: EnvFieldDef[] = [
  {
    key: "NIO_VEHICLE_API_URL",
    label: "完整请求 URL（从 Postman 复制，含 sign / timestamp）",
    type: "textarea",
    hint: "GET https://icar.nio.com/api/2/rvs/vehicle/.../status?field=...&sign=...",
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
    hint: "GET https://gateway-front-external.nio.com/moat/10086//n/c/award/square?event=checkin&collection_id=...",
  },
  {
    key: "NIO_CHECKIN_ACCESS_TOKEN",
    label: "签到 Authorization Token（可留空，沿用车辆 Token）",
    type: "password",
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
