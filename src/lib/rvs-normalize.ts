/**
 * 将 icar.nio.com RVS status 接口响应归一化为看板使用的 data.status 结构
 */
const FIELD_MAP: Record<string, string> = {
  soc: "soc_status",
  position: "position_status",
  exterior: "exterior_status",
  hvac: "hvac_status",
  door: "door_status",
  window: "window_status",
  connection: "connection_status",
  heating: "heating_status",
  maintain: "maintain_status",
  fota: "fota_status",
  offcar_mode_status: "offcar_mode_status",
  tyre: "tyre_status",
  lv_batt: "lv_batt_status",
  device_status: "device_status",
  charge_status_order: "charge_status_order",
  light: "light_status",
  key: "key_status",
  special: "special_status",
  trip_share: "trip_share_status",
  remote_operate: "remote_operate_status",
  offcar_power_swap: "offcar_power_swap_status",
  box: "box_status",
  frdg: "frdg_status",
};

/** data 顶层与 status 同名的块 */
const DIRECT_STATUS_KEYS = [
  "light_status",
  "key_status",
  "special_status",
  "trip_share_status",
  "nearby_car_ctrl",
  "power_swap_order",
  "remote_operate_status",
  "offcar_power_swap_status",
  "box_status",
  "frdg_status",
  "mix_auth_status",
  "tyre_status",
  "window_status",
  "maintain_status",
  "lv_batt_status",
  "device_status",
  "charge_status_order",
] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function mergeStatusFromData(
  data: Record<string, unknown>,
  base: Record<string, unknown>,
): Record<string, unknown> {
  const status = { ...base };

  for (const [from, to] of Object.entries(FIELD_MAP)) {
    if (isRecord(data[from]) && !isRecord(status[to])) {
      status[to] = data[from];
    }
    if (isRecord(data[to]) && !isRecord(status[to])) {
      status[to] = data[to];
    }
  }

  for (const key of DIRECT_STATUS_KEYS) {
    if (isRecord(data[key]) && !isRecord(status[key])) {
      status[key] = data[key];
    }
  }

  const vehicleId = data.vehicle_id ?? status.vehicle_id;
  if (typeof vehicleId === "string" && vehicleId && !status.vehicle_id) {
    status.vehicle_id = vehicleId;
  }

  return status;
}

export function normalizeRvsVehiclePayload(raw: Record<string, unknown>): Record<string, unknown> {
  const data = raw.data;
  if (!isRecord(data)) return raw;

  const existingStatus = isRecord(data.status) ? { ...data.status } : {};
  const status = mergeStatusFromData(data, existingStatus);

  if (Object.keys(status).length === 0 && !status.vehicle_id) return raw;

  return {
    ...raw,
    data: {
      ...data,
      status,
    },
  };
}
