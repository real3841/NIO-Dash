import type { VehicleResponse } from "./vehicle";

export type StatusBlock = Record<string, unknown>;

export function statusBlock(
  status: VehicleResponse["data"]["status"],
  key: string,
): StatusBlock | null {
  const v = (status as Record<string, unknown>)[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as StatusBlock) : null;
}

export function num(block: StatusBlock | null, key: string, fallback = 0): number {
  const v = block?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function boolish(block: StatusBlock | null, key: string): boolean {
  const v = block?.[key];
  return v === true || v === 1;
}

export function str(block: StatusBlock | null, key: string, fallback = "—"): string {
  const v = block?.[key];
  if (v == null || v === "") return fallback;
  if (typeof v === "boolean") return v ? "是" : "否";
  if (typeof v === "number") return String(v);
  return String(v);
}

export function onOff(v: number | boolean | undefined, activeAt = 1): string {
  if (typeof v === "boolean") return v ? "开启" : "关闭";
  if (v == null) return "—";
  return v >= activeAt ? "开启" : "关闭";
}

export function windowPosLabel(pos: number): string {
  if (pos <= 0) return "关闭";
  return `${Math.round(pos)}%`;
}

export function chargerTypeLabel(t: number): string {
  return (
    {
      0: "无",
      1: "交流慢充",
      2: "直流快充",
      3: "换电",
    }[t] ?? `类型 ${t}`
  );
}

/** 蔚来 API charging_power 单位为 W，展示为 kW */
export function formatChargingPowerKw(watts: number | undefined | null): string {
  if (watts == null || !Number.isFinite(watts)) return "—";
  const kw = watts / 1000;
  if (kw === 0) return "0 kW";
  const rounded = Math.round(kw * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded} kW`;
}

export function vehlModeLabel(m: number): string {
  return (
    {
      0: "未知",
      1: "舒适",
      2: "节能",
      3: "运动",
      4: "舒适+",
    }[m] ?? `模式 ${m}`
  );
}

export function maintainStatusLabel(s: number): string {
  return s >= 1 ? "有待办" : "正常";
}

export function tripShareLabel(s: number): string {
  return ({ 0: "关闭", 1: "开启", 2: "进行中" })[s] ?? `状态 ${s}`;
}

export function tyreRows(block: StatusBlock | null): Array<{ label: string; press: string; temp: string }> {
  if (!block) return [];
  return [
    { label: "左前", press: `${num(block, "front_left_wheel_press_bar").toFixed(1)} bar`, temp: `${num(block, "front_left_wheel_temp")}°C` },
    { label: "右前", press: `${num(block, "front_right_wheel_press_bar").toFixed(1)} bar`, temp: `${num(block, "front_right_wheel_temp")}°C` },
    { label: "左后", press: `${num(block, "rear_left_wheel_press_bar").toFixed(1)} bar`, temp: `${num(block, "rear_left_wheel_temp")}°C` },
    { label: "右后", press: `${num(block, "rear_right_wheel_press_bar").toFixed(1)} bar`, temp: `${num(block, "rear_right_wheel_temp")}°C` },
  ];
}

export function rowsFromBlock(
  block: StatusBlock | null,
  labels: Record<string, string>,
  format?: (key: string, value: unknown) => string | null,
): Array<{ label: string; value: string }> {
  if (!block) return [];
  return Object.entries(labels)
    .map(([key, label]) => {
      const raw = block[key];
      if (raw === undefined || raw === null) return null;
      const formatted = format?.(key, raw);
      const value = formatted ?? (typeof raw === "boolean" ? (raw ? "是" : "否") : String(raw));
      return { label, value };
    })
    .filter((x): x is { label: string; value: string } => x != null);
}

export function autoRows(block: StatusBlock | null, skipKeys = new Set(["sample_time"])): Array<{ label: string; value: string }> {
  if (!block) return [];
  return Object.entries(block)
    .filter(([key]) => !skipKeys.has(key))
    .map(([key, value]) => ({
      label: key,
      value: typeof value === "boolean" ? (value ? "是" : "否") : String(value),
    }));
}
