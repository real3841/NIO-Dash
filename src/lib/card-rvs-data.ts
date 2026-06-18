import type { VehicleResponse } from "./vehicle";
import type { CheckinData } from "./checkin";

/** 每张卡片对应的 RVS status 字段（及 data 顶层块） */
const CARD_RVS_KEYS: Record<string, string[]> = {
  battery: ["soc_status", "exterior_status"],
  charging: ["soc_status"],
  doors_visual: ["door_status"],
  window: ["window_status"],
  tyre: ["tyre_status"],
  software_gps: ["fota_status", "position_status"],
  modes: ["offcar_mode_status"],
  vehicle_info: ["exterior_status"],
  exterior_detail: ["exterior_status"],
  seat_heat: ["heating_status"],
  connection: ["connection_status"],
  temperature: ["hvac_status"],
  maintain: ["maintain_status"],
  light: ["light_status"],
  key: ["key_status"],
  special: ["special_status"],
  trip_share: ["trip_share_status"],
  nearby_car: ["nearby_car_ctrl"],
  power_swap_order: ["power_swap_order"],
  lv_batt: ["lv_batt_status"],
  device: ["device_status"],
  charge_order: ["charge_status_order"],
  remote_operate: ["remote_operate_status"],
  offcar_power_swap: ["offcar_power_swap_status"],
  box: ["box_status"],
  frdg: ["frdg_status"],
};

const CARD_EXTRA_KEYS: Record<string, string[]> = {
  vehicle_info: ["vehicle_id"],
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export function getCardRvsPayload(
  data: VehicleResponse,
  cardId: string,
  checkin?: CheckinData | null,
): Record<string, unknown> {
  const raw = data.data as Record<string, unknown>;
  const status = isRecord(raw.status) ? raw.status : {};
  const payload: Record<string, unknown> = {};

  for (const key of CARD_RVS_KEYS[cardId] ?? []) {
    if (key in status) {
      payload[key] = status[key];
    } else if (key in raw) {
      payload[key] = raw[key];
    } else {
      payload[key] = null;
    }
  }

  for (const key of CARD_EXTRA_KEYS[cardId] ?? []) {
    if (key in raw) payload[key] = raw[key];
    else if (key in status) payload[key] = status[key];
  }

  if (cardId === "vehicle_info" && status.vehicle_id) {
    payload.vehicle_id = status.vehicle_id;
  }

  if (cardId === "connection" && checkin) {
    payload.checkin_api = checkin;
  }

  return payload;
}
