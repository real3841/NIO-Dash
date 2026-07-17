import { normalizeRvsVehiclePayload } from "./rvs-normalize";

export interface VehicleSnapshot {
  ts: number;
  soc: number;
  range: number;
  actualRange: number;
  mileage: number;
  lat: number;
  lng: number;
  insideTemp: number;
  outsideTemp: number;
}

export interface VehicleResponse {
  request_id: string;
  result_code: string;
  server_time: number;
  data: {
    checked_in?: { checked: boolean; days: number };
    alarm: unknown[];
    status: {
      hvac_status: {
        temperature: number;
        outside_temperature: number;
        air_conditioner_on: boolean;
        sample_time: number;
      };
      heating_status: Record<string, number>;
      position_status: {
        longitude: number;
        latitude: number;
        sample_time: number;
      };
      connection_status: {
        connected: boolean;
        cdc_connected: boolean;
        adc_connected: boolean;
        update_time: number;
      };
      offcar_mode_status: Record<string, number>;
      maintain_status: {
        maintain_status: number;
        current_maintenance_list: Array<{
          name: string;
          code: string;
          is_health_check: boolean;
        }>;
        sample_time: number;
      };
      window_status: Record<string, number>;
      exterior_status: {
        vehicle_state: number;
        mileage: number;
        sample_time: number;
        vehl_mode: number;
      };
      fota_status: {
        last_part_no: string;
        last_version: string;
        current_part_no: string;
        current_version: string;
        fota_status: number;
        sample_time: number;
      };
      soc_status: {
        soc: number;
        charge_state: number;
        max_soc: number;
        remaining_range: number;
        remaining_actual_range: number;
        sample_time: number;
        lock_soc: number;
        /** 充电功率，单位 W（如 7000 表示 7 kW） */
        charging_power: number;
        charger_type: number;
      };
      vehicle_id: string;
      door_status: Record<string, number>;
      tyre_status?: Record<string, number>;
      light_status?: Record<string, number>;
      key_status?: Record<string, number>;
      special_status?: Record<string, unknown>;
      trip_share_status?: Record<string, number>;
      nearby_car_ctrl?: Record<string, boolean>;
      power_swap_order?: Record<string, boolean>;
      lv_batt_status?: Record<string, unknown>;
      device_status?: Record<string, unknown>;
      charge_status_order?: Record<string, unknown>;
      remote_operate_status?: Record<string, unknown>;
      offcar_power_swap_status?: Record<string, unknown>;
      box_status?: Record<string, unknown>;
      frdg_status?: Record<string, unknown>;
    };
  };
}

export type AlertTone = "danger" | "warning" | "info" | "success";

export interface VehicleAlert {
  id: string;
  tone: AlertTone;
  title: string;
  detail: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function hasMinimalStatus(status: Record<string, unknown>): boolean {
  return isRecord(status.soc_status) && isRecord(status.position_status);
}

/** 兼容 RVS 接口：vehicle_id 在 data 顶层、字段平铺在 data.*_status */
export function normalizeVehicleResponse(data: VehicleResponse): VehicleResponse {
  return normalizeRvsVehiclePayload(data as unknown as Record<string, unknown>) as VehicleResponse;
}

/** 从任意车辆 JSON 中提取可用的 data.status（含 RVS 平铺格式） */
export function extractVehicleStatus(data: unknown): VehicleResponse["data"]["status"] | null {
  if (!isRecord(data)) return null;

  const normalized = normalizeVehicleResponse(data as VehicleResponse);
  const inner = normalized.data;
  if (!isRecord(inner)) return null;

  const status = inner.status;
  if (!isRecord(status) || !hasMinimalStatus(status)) return null;

  return status as VehicleResponse["data"]["status"];
}

export function isUsableVehicleResponse(data: unknown): data is VehicleResponse {
  return extractVehicleStatus(data) !== null;
}

export function snapshotFromResponse(data: VehicleResponse): VehicleSnapshot {
  const s = extractVehicleStatus(data);
  if (!s) {
    throw new Error("车辆数据缺少 data.status");
  }
  return {
    ts: s.soc_status.sample_time,
    soc: s.soc_status.soc,
    range: s.soc_status.remaining_range,
    actualRange: s.soc_status.remaining_actual_range,
    mileage: s.exterior_status.mileage,
    lat: s.position_status.latitude,
    lng: s.position_status.longitude,
    insideTemp: s.hvac_status.temperature,
    outsideTemp: s.hvac_status.outside_temperature,
  };
}

export function formatVehicleId(id: string | undefined): string {
  if (!id) return "—";
  if (id.length <= 9) return id;
  return `${id.slice(0, 4)}…${id.slice(-5)}`;
}

export function buildSeedHistory(current: VehicleSnapshot): VehicleSnapshot[] {
  const points: VehicleSnapshot[] = [];
  const dayMs = 24 * 60 * 60 * 1000;

  for (let i = 6; i >= 0; i--) {
    const drift = i / 6;
    points.push({
      ts: current.ts - i * dayMs,
      soc: Math.min(100, Math.max(0, current.soc - drift * 18 + (i % 2) * 3)),
      range: Math.round(current.range - drift * 90),
      actualRange: Math.round(current.actualRange - drift * 70),
      mileage: Math.round(current.mileage - drift * 42),
      lat: current.lat + (i - 3) * 0.0012,
      lng: current.lng + (i - 3) * 0.0015,
      insideTemp: current.insideTemp,
      outsideTemp: current.outsideTemp + (i - 3) * 0.4,
    });
  }

  return points;
}

export const HISTORY_MAX_POINTS = 2000;

export function mergeHistory(
  stored: VehicleSnapshot[],
  current: VehicleSnapshot,
  seedIfEmpty = true,
  maxPoints = HISTORY_MAX_POINTS,
): VehicleSnapshot[] {
  const base = stored.length > 0 ? stored : seedIfEmpty ? buildSeedHistory(current) : [];
  const exists = base.some((p) => p.ts === current.ts);
  const next = exists ? base : [...base, current];
  return next
    .sort((a, b) => a.ts - b.ts)
    .slice(-maxPoints);
}

export function computeAlerts(data: VehicleResponse): VehicleAlert[] {
  const alerts: VehicleAlert[] = [];
  const s = extractVehicleStatus(data);
  if (!s) return alerts;
  const doors: Array<[string, number]> = [
    ["左前车门", s.door_status.door_ajar_front_left_status],
    ["右前车门", s.door_status.door_ajar_front_right_status],
    ["左后车门", s.door_status.door_ajar_rear_left_status],
    ["右后车门", s.door_status.door_ajar_rear_right_status],
    ["尾门", s.door_status.tailgate_ajar_status],
    ["前备箱", s.door_status.engine_hood_ajar_status],
    ["充电口", s.door_status.second_charge_port_ajar_status],
  ];

  for (const [name, status] of doors) {
    if (status !== 1) {
      alerts.push({
        id: `door-${name}`,
        tone: "danger",
        title: `${name}未关闭`,
        detail: "请确认车辆安全后再离开。",
      });
    }
  }

  if (s.door_status.vehicle_lock_status !== 1) {
    alerts.push({
      id: "unlock",
      tone: "warning",
      title: "车辆未上锁",
      detail: "建议远程锁车或检查钥匙距离。",
    });
  }

  if (s.soc_status.soc < 10) {
    alerts.push({
      id: "soc-critical",
      tone: "danger",
      title: "电量极低",
      detail: `剩余 ${s.soc_status.soc}%，请尽快充电。`,
    });
  } else if (s.soc_status.soc < 20) {
    alerts.push({
      id: "soc-low",
      tone: "warning",
      title: "电量偏低",
      detail: `剩余 ${s.soc_status.soc}%，建议提前规划补能。`,
    });
  }

  if (!s.connection_status.connected) {
    alerts.push({
      id: "offline",
      tone: "danger",
      title: "车辆离线",
      detail: "远程连接不可用，数据可能已过期。",
    });
  }

  if (!s.connection_status.adc_connected) {
    alerts.push({
      id: "adc-offline",
      tone: "info",
      title: "ADC 智驾离线",
      detail: "智驾域控制器未连接，不影响基础远程车况。",
    });
  }

  if (s.maintain_status.maintain_status >= 1 && s.maintain_status.current_maintenance_list.length > 0) {
    const item = s.maintain_status.current_maintenance_list[0];
    alerts.push({
      id: "maintain",
      tone: "info",
      title: "维保提醒",
      detail: `${item.name}（${item.code}）`,
    });
  }

  const windows: Array<[string, number]> = [
    ["左前窗", s.window_status.win_front_left_posn],
    ["右前窗", s.window_status.win_front_right_posn],
    ["左后窗", s.window_status.win_rear_left_posn],
    ["右后窗", s.window_status.win_rear_right_posn],
    ["天窗", s.window_status.sun_roof_posn],
  ];

  for (const [name, pos] of windows) {
    if (pos > 0) {
      alerts.push({
        id: `window-${name}`,
        tone: "warning",
        title: `${name}未完全关闭`,
        detail: `当前开度 ${Math.round(pos)}%。`,
      });
    }
  }

  if (s.offcar_mode_status.defender_mode >= 2) {
    alerts.push({
      id: "defender",
      tone: "info",
      title: "守卫模式运行中",
      detail: "车辆处于守卫监控状态。",
    });
  }

  if ((data.data.alarm ?? []).length > 0) {
    alerts.push({
      id: "server-alarm",
      tone: "danger",
      title: "服务端告警",
      detail: `收到 ${data.data.alarm.length} 条告警，请查看 App。`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "all-clear",
      tone: "success",
      title: "状态正常",
      detail: "车况正常，无异常告警。",
    });
  }

  return alerts;
}

export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDay(ms: number): string {
  return new Date(ms).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

/** 满电续航（km）= 标准续航 / 电量百分比 × 100 */
export function fullChargeRangeKm(remainingRange: number, soc: number): number | null {
  if (soc <= 0) return null;
  return Math.round((remainingRange / soc) * 100);
}

export function batteryPackLabel(fullRangeKm: number): string {
  if (fullRangeKm < 549) return "（75度电池）";
  if (fullRangeKm > 550) return "（100度电池）";
  return "";
}

export function chargeStateLabel(state: number): string {
  return ({ 0: "未充电", 1: "充电中", 2: "充电完成", 3: "充电故障" })[state] ?? `状态 ${state}`;
}

export function vehicleStateLabel(state: number): string {
  return ({ 0: "未知", 1: "行驶中", 2: "已驻车", 3: "充电中", 4: "换电中" })[state] ?? `状态 ${state}`;
}

export function doorLabel(closed: number): string {
  return closed === 1 ? "关闭" : "开启";
}

export function modeActive(value: number, activeValue = 1): boolean {
  return value >= activeValue;
}

export function heatLevelLabel(sts: number): string {
  if (sts <= 0) return "关闭";
  if (sts === 1) return "低";
  if (sts === 2) return "中";
  return "高";
}

export function mapsUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}
