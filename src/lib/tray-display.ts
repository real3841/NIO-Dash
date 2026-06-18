export type TrayDisplayField =
  | "soc"
  | "range"
  | "actual_range"
  | "vehicle_state"
  | "mileage"
  | "orders";

export const TRAY_DISPLAY_OPTIONS: { id: TrayDisplayField; label: string; example: string }[] = [
  { id: "soc", label: "电量", example: "85%" },
  { id: "range", label: "标准续航", example: "420km" },
  { id: "actual_range", label: "实际续航", example: "315km" },
  { id: "vehicle_state", label: "车辆状态", example: "已驻车" },
  { id: "mileage", label: "总里程", example: "15871km" },
  { id: "orders", label: "订单数", example: "12单" },
];

const DEFAULT_FIELDS: TrayDisplayField[] = ["soc", "range"];

const VALID = new Set<TrayDisplayField>(TRAY_DISPLAY_OPTIONS.map((o) => o.id));

export function parseTrayDisplay(raw: string | undefined): TrayDisplayField[] {
  if (!raw?.trim()) return [...DEFAULT_FIELDS];
  const fields = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is TrayDisplayField => VALID.has(s as TrayDisplayField));
  return fields.length > 0 ? fields : [...DEFAULT_FIELDS];
}

export function serializeTrayDisplay(fields: TrayDisplayField[]): string {
  return fields.join(",");
}

function vehicleStateLabel(state: number): string {
  return ({ 0: "未知", 1: "行驶中", 2: "已驻车", 3: "充电中", 4: "换电中" })[state] ?? `状态${state}`;
}

export interface TrayVehicleData {
  soc?: number;
  range?: number;
  actualRange?: number;
  vehicleState?: number;
  mileage?: number;
  orderCount?: number | null;
}

export function buildTrayTitle(fields: TrayDisplayField[], data: TrayVehicleData): string {
  const parts: string[] = [];

  for (const field of fields) {
    switch (field) {
      case "soc":
        if (typeof data.soc === "number") {
          parts.push(Number.isInteger(data.soc) ? `${data.soc}%` : `${data.soc.toFixed(1)}%`);
        }
        break;
      case "range":
        if (typeof data.range === "number") parts.push(`${data.range}km`);
        break;
      case "actual_range":
        if (typeof data.actualRange === "number") parts.push(`${data.actualRange}km`);
        break;
      case "vehicle_state":
        if (typeof data.vehicleState === "number") parts.push(vehicleStateLabel(data.vehicleState));
        break;
      case "mileage":
        if (typeof data.mileage === "number") parts.push(`${data.mileage}km`);
        break;
      case "orders":
        if (typeof data.orderCount === "number") parts.push(`${data.orderCount}单`);
        break;
    }
  }

  return parts.length > 0 ? parts.join(" · ") : "蔚来";
}

export function previewTrayTitle(fields: TrayDisplayField[]): string {
  return buildTrayTitle(fields, {
    soc: 85,
    range: 420,
    actualRange: 315,
    vehicleState: 2,
    mileage: 15871,
    orderCount: 12,
  });
}
