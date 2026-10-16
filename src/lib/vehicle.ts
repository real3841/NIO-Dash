import { mapCoordsFromGcj02 } from "./gcj02";
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
  /** 蔚来 exterior_status.vehicle_state；1 = 行驶中 */
  vehicleState?: number;
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
        download_percent?: number;
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


export const HISTORY_MAX_POINTS = 2000;

export function snapshotHistoryKey(s: VehicleSnapshot): string {
  return `${s.ts}:${Math.round(s.lat * 1e4)}:${Math.round(s.lng * 1e4)}`;
}

export function isValidSnapshot(s: unknown): s is VehicleSnapshot {
  if (!s || typeof s !== "object") return false;
  const o = s as VehicleSnapshot;
  return (
    Number.isFinite(o.ts) &&
    Number.isFinite(o.lat) &&
    Number.isFinite(o.lng) &&
    isValidGps(o.lat, o.lng)
  );
}

/** 解析 history.json；非数组或全无效时返回 null */
export function parseSnapshotHistory(raw: unknown): VehicleSnapshot[] | null {
  if (!Array.isArray(raw)) return null;
  const filtered = raw.filter(isValidSnapshot);
  return filtered.length > 0 ? filtered : raw.length === 0 ? [] : null;
}

export function mergeSnapshotHistories(
  a: VehicleSnapshot[],
  b: VehicleSnapshot[],
  maxPoints = HISTORY_MAX_POINTS,
): VehicleSnapshot[] {
  const byKey = new Map<string, VehicleSnapshot>();
  for (const s of [...a, ...b]) {
    byKey.set(snapshotHistoryKey(s), s);
  }
  return [...byKey.values()].sort((x, y) => x.ts - y.ts).slice(-maxPoints);
}

export function appendSnapshotHistory(
  stored: VehicleSnapshot[],
  current: VehicleSnapshot,
  maxPoints = HISTORY_MAX_POINTS,
): VehicleSnapshot[] {
  const key = snapshotHistoryKey(current);
  if (stored.some((p) => snapshotHistoryKey(p) === key)) {
    return stored.slice(-maxPoints);
  }
  return [...stored, current].sort((a, b) => a.ts - b.ts).slice(-maxPoints);
}

/** serverHistory 为 null 表示无 history.json；[] 表示服务端尚无记录 */
export function resolveVehicleHistory(
  serverHistory: VehicleSnapshot[] | null,
  localHistory: VehicleSnapshot[],
  current: VehicleSnapshot,
): { history: VehicleSnapshot[]; persistLocal: boolean } {
  if (serverHistory !== null) {
    const base =
      serverHistory.length > 0 || localHistory.length === 0
        ? serverHistory
        : mergeSnapshotHistories(serverHistory, localHistory);
    return { history: appendSnapshotHistory(base, current), persistLocal: false };
  }
  if (localHistory.length > 0) {
    return { history: appendSnapshotHistory(localHistory, current), persistLocal: true };
  }
  return { history: [current], persistLocal: true };
}

/** @deprecated 仅保留兼容；不再生成模拟历史 */
export function mergeHistory(
  stored: VehicleSnapshot[],
  current: VehicleSnapshot,
  _seedIfEmpty = false,
  maxPoints = HISTORY_MAX_POINTS,
): VehicleSnapshot[] {
  return appendSnapshotHistory(stored, current, maxPoints);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function hasMinimalStatus(status: Record<string, unknown>): boolean {
  return isRecord(status.soc_status);
}

const EMPTY_DOOR: VehicleResponse["data"]["status"]["door_status"] = {
  vehicle_lock_status: 0,
  door_ajar_front_left_status: 1,
  door_ajar_front_right_status: 1,
  door_ajar_rear_left_status: 1,
  door_ajar_rear_right_status: 1,
  engine_hood_ajar_status: 1,
  tailgate_ajar_status: 1,
  second_charge_port_ajar_status: 1,
};

const EMPTY_EXTERIOR: VehicleResponse["data"]["status"]["exterior_status"] = {
  vehicle_state: 0,
  mileage: 0,
  sample_time: 0,
  vehl_mode: 0,
};

const EMPTY_HVAC: VehicleResponse["data"]["status"]["hvac_status"] = {
  temperature: 0,
  outside_temperature: 0,
  air_conditioner_on: false,
  sample_time: 0,
};

const EMPTY_CONNECTION: VehicleResponse["data"]["status"]["connection_status"] = {
  connected: false,
  cdc_connected: false,
  adc_connected: false,
  update_time: 0,
};

const EMPTY_SOC: VehicleResponse["data"]["status"]["soc_status"] = {
  soc: 0,
  charge_state: 0,
  max_soc: 100,
  charger_type: 0,
  remaining_range: 0,
  remaining_actual_range: 0,
  sample_time: 0,
};

const EMPTY_POSITION: VehicleResponse["data"]["status"]["position_status"] = {
  longitude: 0,
  latitude: 0,
  sample_time: 0,
};

const EMPTY_OFFCAR: VehicleResponse["data"]["status"]["offcar_mode_status"] = {
  pet_mode: 0,
  power_hold_mode: 0,
  camping_mode: 0,
  defender_mode: 0,
  defender_mode_warn_count: 0,
  remote_video: 0,
  cpd_mode: 0,
};

const EMPTY_HEATING: VehicleResponse["data"]["status"]["heating_status"] = {
  steer_wheel_heat_sts: 0,
  seat_heat_frnt_le_sts: 0,
  seat_heat_frnt_ri_sts: 0,
  seat_heat_re_le_sts: 0,
  seat_heat_re_ri_sts: 0,
  seat_vent_frnt_le_sts: 0,
  seat_vent_frnt_ri_sts: 0,
  seat_vent_re_le_sts: 0,
  seat_vent_re_ri_sts: 0,
};

/** Widget 等接口可能缺少部分 status 块；补齐默认值避免界面崩溃 */
export function coerceVehicleStatus(
  status: VehicleResponse["data"]["status"],
): VehicleResponse["data"]["status"] {
  return {
    ...status,
    soc_status: isRecord(status.soc_status)
      ? ({ ...EMPTY_SOC, ...status.soc_status } as VehicleResponse["data"]["status"]["soc_status"])
      : EMPTY_SOC,
    position_status: isRecord(status.position_status)
      ? ({
          ...EMPTY_POSITION,
          ...status.position_status,
        } as VehicleResponse["data"]["status"]["position_status"])
      : EMPTY_POSITION,
    offcar_mode_status: isRecord(status.offcar_mode_status)
      ? ({
          ...EMPTY_OFFCAR,
          ...status.offcar_mode_status,
        } as VehicleResponse["data"]["status"]["offcar_mode_status"])
      : EMPTY_OFFCAR,
    door_status: isRecord(status.door_status)
      ? ({ ...EMPTY_DOOR, ...status.door_status } as VehicleResponse["data"]["status"]["door_status"])
      : EMPTY_DOOR,
    exterior_status: isRecord(status.exterior_status)
      ? ({ ...EMPTY_EXTERIOR, ...status.exterior_status } as VehicleResponse["data"]["status"]["exterior_status"])
      : EMPTY_EXTERIOR,
    hvac_status: isRecord(status.hvac_status)
      ? ({ ...EMPTY_HVAC, ...status.hvac_status } as VehicleResponse["data"]["status"]["hvac_status"])
      : EMPTY_HVAC,
    connection_status: isRecord(status.connection_status)
      ? ({
          ...EMPTY_CONNECTION,
          ...status.connection_status,
        } as VehicleResponse["data"]["status"]["connection_status"])
      : EMPTY_CONNECTION,
    heating_status: isRecord(status.heating_status)
      ? ({
          ...EMPTY_HEATING,
          ...status.heating_status,
        } as VehicleResponse["data"]["status"]["heating_status"])
      : EMPTY_HEATING,
    fota_status: isRecord(status.fota_status)
      ? (status.fota_status as VehicleResponse["data"]["status"]["fota_status"])
      : ({
          last_part_no: "",
          last_version: "",
          current_part_no: "",
          current_version: "",
          fota_status: 0,
          sample_time: 0,
        } as VehicleResponse["data"]["status"]["fota_status"]),
    maintain_status: isRecord(status.maintain_status)
      ? (status.maintain_status as VehicleResponse["data"]["status"]["maintain_status"])
      : ({
          maintain_status: 0,
          current_maintenance_list: [],
          sample_time: 0,
        } as VehicleResponse["data"]["status"]["maintain_status"]),
    window_status: isRecord(status.window_status)
      ? (status.window_status as VehicleResponse["data"]["status"]["window_status"])
      : ({} as VehicleResponse["data"]["status"]["window_status"]),
  };
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

  return coerceVehicleStatus(status as VehicleResponse["data"]["status"]);
}

export function isUsableVehicleResponse(data: unknown): data is VehicleResponse {
  return extractVehicleStatus(data) !== null;
}

export function isValidGps(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return false;
  return true;
}

export function snapshotFromResponse(data: VehicleResponse): VehicleSnapshot {
  const s = extractVehicleStatus(data);
  if (!s) {
    throw new Error("车辆数据缺少 soc_status，无法显示电量");
  }
  const lat = s.position_status.latitude;
  const lng = s.position_status.longitude;
  const wgs = mapCoordsFromGcj02(lat, lng);
  const posTs = s.position_status.sample_time;
  const socTs = s.soc_status.sample_time;
  const hasPos = isValidGps(wgs.lat, wgs.lng);
  return {
    ts: hasPos && posTs ? posTs : socTs,
    soc: s.soc_status.soc,
    range: s.soc_status.remaining_range,
    actualRange: s.soc_status.remaining_actual_range,
    mileage: s.exterior_status.mileage,
    lat: wgs.lat,
    lng: wgs.lng,
    insideTemp: s.hvac_status.temperature,
    outsideTemp: s.hvac_status.outside_temperature,
    vehicleState: s.exterior_status.vehicle_state,
  };
}

export function formatVehicleId(id: string | undefined): string {
  if (!id) return "—";
  if (id.length <= 9) return id;
  return `${id.slice(0, 4)}…${id.slice(-5)}`;
}

/** 状态不是 0 表示正在 FOTA（下载或安装）。回到 0 后视为更新结束。 */
export function isFotaUpdating(fota: { fota_status?: number } | null | undefined): boolean {
  return typeof fota?.fota_status === "number" && fota.fota_status !== 0;
}

export function fotaDownloadPercent(
  fota: { download_percent?: number } | null | undefined,
): number | null {
  const value = fota?.download_percent;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export function fmtLogTime(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
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
  const wgs = mapCoordsFromGcj02(lat, lng);
  return `https://www.openstreetmap.org/?mlat=${wgs.lat}&mlon=${wgs.lng}#map=16/${wgs.lat}/${wgs.lng}`;
}
