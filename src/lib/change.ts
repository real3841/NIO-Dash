export interface PaymentInfoItem {
  amount: number;
  name: string;
  type?: number;
}

export interface ServiceOrder {
  orderType: string;
  orderName: string;
  createTime: number;
  orderStatus: string;
  orderStatusName: string;
  orderNo: string;
  vinCode?: string;
  vehicleId?: string;
  url?: string;
  paymentStatus?: string;
  oipStatus?: number;
  priceCash?: string;
  payDesc?: string;
  isRight?: boolean;
  resourceAddress?: string;
  pickUpName?: string;
  returnName?: string;
  address?: string;
  cashChooseType?: string;
  extendInfo?: Record<string, unknown>;
}

export interface ChangeResponse {
  resultCode: string;
  resultDesc: string;
  resultData: {
    data: ServiceOrder[];
    total: number | null;
    hasMore: boolean;
    lastCursorCreateTime?: number;
    lastCursorId?: number;
  };
  serviceTime?: number;
}

export const ORDER_TYPE_LABELS: Record<string, string> = {
  pe_shaman_change: "换电",
  pe_shaman: "充电",
  service_pe_discharge: "放电",
  battery_flexible_upgrade: "灵活升级",
  nsom_so_maintenance: "一键维保",
  nsom_so_chauffeur: "驾享服务",
  so_case_accident: "事故报案",
  chauffeur_vehicle_delivery: "一键送车",
};

export interface TypeStat {
  type: string;
  label: string;
  count: number;
  spent: number;
}

export interface StationStat {
  name: string;
  count: number;
  spent: number;
}

export interface ServiceSummary {
  total: number;
  byType: TypeStat[];
  swapCompleted: number;
  swapCancelled: number;
  swapSpent: number;
  swapAvgSpent: number;
  upgradeCount: number;
  upgradeCompleted: number;
  upgradeCancelled: number;
  upgradeSpent: number;
  upgradeAvgSpent: number;
  upgradeDayCount: number;
  upgradeMonthCount: number;
  lastOrderTime: number | null;
  topSwapStations: StationStat[];
  orders: ServiceOrder[];
}

export function shortStationName(address: string): string {
  return address.replace(/\s*蔚来换电站$/, "").trim();
}

export function orderTypeLabel(order: ServiceOrder): string {
  return order.orderName || ORDER_TYPE_LABELS[order.orderType] || order.orderType;
}

export function orderStatusTone(
  order: ServiceOrder,
): "success" | "warning" | "danger" | "neutral" {
  const name = order.orderStatusName ?? "";
  const code = order.orderStatus;
  if (code === "100" || code === "1000" || name.includes("完成") || name.includes("已支付")) {
    return "success";
  }
  if (code === "255" || code === "900" || name.includes("取消") || name.includes("终止")) {
    return "danger";
  }
  if (name.includes("进行") || name.includes("等待") || code === "30") {
    return "warning";
  }
  return "neutral";
}

export function fmtMoney(value: number): string {
  return `¥ ${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtSwapDate(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parsePaymentInfo(order: ServiceOrder): PaymentInfoItem[] {
  const raw = order.extendInfo?.paymentInfo;
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is PaymentInfoItem => typeof p === "object" && p !== null && "amount" in p);
}

export function orderLocation(order: ServiceOrder): string {
  if (order.resourceAddress) return shortStationName(order.resourceAddress);
  if (order.pickUpName && order.returnName) {
    return `${shortStationName(order.pickUpName)} → ${shortStationName(order.returnName)}`;
  }
  if (order.pickUpName) return shortStationName(order.pickUpName);
  if (order.returnName) return shortStationName(order.returnName);
  if (order.address) return order.address;

  const ext = order.extendInfo;
  if (ext && typeof ext === "object") {
    const dealer = ext.dealer_info as { dealer_name?: string } | undefined;
    if (dealer?.dealer_name) return dealer.dealer_name;
    const loc = ext.expected_service_location as { poi_name?: string; poi_address?: string } | undefined;
    if (loc?.poi_name) return loc.poi_name;
    if (loc?.poi_address) return loc.poi_address;
  }
  return "—";
}

export function orderSpentAmount(order: ServiceOrder): number {
  const cash = parseFloat(order.priceCash ?? "0");
  if (cash > 0) return cash;
  return parsePaymentInfo(order).reduce((s, p) => s + (p.amount ?? 0), 0);
}

export function orderAmount(order: ServiceOrder): string {
  if (order.payDesc) return order.payDesc;
  const spent = orderSpentAmount(order);
  if (spent > 0) return fmtMoney(spent);

  const items = parsePaymentInfo(order);
  if (items.length > 0) {
    return items.map((p) => `${p.name} ¥${p.amount}`).join("；");
  }
  return "—";
}

function isCompletedOrder(order: ServiceOrder): boolean {
  const name = order.orderStatusName ?? "";
  return (
    order.orderStatus === "100" ||
    order.orderStatus === "1000" ||
    name.includes("完成") ||
    name.includes("已支付")
  );
}

/** 灵活升级：0–399 日租，>400 月租 */
export function classifyUpgradeRent(amount: number): "day" | "month" {
  return amount >= 0 && amount <= 399 ? "day" : "month";
}

function isCancelledOrder(order: ServiceOrder): boolean {
  const name = order.orderStatusName ?? "";
  return order.orderStatus === "255" || order.orderStatus === "900" || name.includes("取消");
}

export function orderDetailLines(order: ServiceOrder): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];

  if (order.orderNo) lines.push({ label: "订单号", value: order.orderNo });
  if (order.vinCode) lines.push({ label: "VIN", value: order.vinCode });

  const items = parsePaymentInfo(order);
  for (const p of items) {
    lines.push({ label: "费用明细", value: `${p.name} · ¥${p.amount}` });
  }

  const ext = order.extendInfo;
  if (ext && typeof ext === "object") {
    if (ext.batteryCapLevel != null && ext.targetBatteryCapLevel != null) {
      lines.push({
        label: "电池规格",
        value: `${ext.batteryCapLevel} → ${ext.targetBatteryCapLevel}`,
      });
    }
    const dealer = ext.dealer_info as { dealer_name?: string; dealer_address?: string } | undefined;
    if (dealer?.dealer_address) {
      lines.push({ label: "服务中心", value: `${dealer.dealer_name ?? ""} ${dealer.dealer_address}`.trim() });
    }
    const finish = ext.order_finish_info as { finish_time?: number } | undefined;
    if (finish?.finish_time) {
      lines.push({ label: "完成时间", value: fmtSwapDate(finish.finish_time * 1000) });
    }
    if (typeof ext.welcome_message === "string") {
      lines.push({ label: "提示", value: ext.welcome_message });
    }
  }

  return lines;
}

export function analyzeServiceOrders(response: ChangeResponse): ServiceSummary {
  const orders = [...response.resultData.data].sort((a, b) => b.createTime - a.createTime);

  const typeMap = new Map<string, TypeStat>();
  for (const order of orders) {
    const label = orderTypeLabel(order);
    const prev = typeMap.get(order.orderType) ?? { type: order.orderType, label, count: 0, spent: 0 };
    prev.count += 1;
    const amt = parseFloat(order.priceCash ?? "0");
    if (amt > 0) prev.spent += amt;
    else {
      const items = parsePaymentInfo(order);
      prev.spent += items.reduce((s, p) => s + (p.amount ?? 0), 0);
    }
    typeMap.set(order.orderType, prev);
  }

  const byType = [...typeMap.values()].sort((a, b) => b.count - a.count);

  const swapOrders = orders.filter((o) => o.orderType === "pe_shaman_change");
  const swapCompleted = swapOrders.filter((o) => o.orderStatus === "100");
  const swapCancelled = swapOrders.filter((o) => isCancelledOrder(o));
  const swapSpent = swapCompleted.reduce((s, o) => s + parseFloat(o.priceCash || "0"), 0);

  const upgradeOrders = orders.filter((o) => o.orderType === "battery_flexible_upgrade");
  const upgradeCompleted = upgradeOrders.filter((o) => isCompletedOrder(o));
  const upgradeCancelled = upgradeOrders.filter((o) => isCancelledOrder(o));
  const upgradeSpent = upgradeCompleted.reduce((s, o) => s + orderSpentAmount(o), 0);
  let upgradeDayCount = 0;
  let upgradeMonthCount = 0;
  for (const order of upgradeCompleted) {
    const kind = classifyUpgradeRent(orderSpentAmount(order));
    if (kind === "day") upgradeDayCount += 1;
    else upgradeMonthCount += 1;
  }

  const stationMap = new Map<string, StationStat>();
  for (const order of swapCompleted) {
    if (!order.resourceAddress) continue;
    const name = shortStationName(order.resourceAddress);
    const prev = stationMap.get(name) ?? { name, count: 0, spent: 0 };
    prev.count += 1;
    prev.spent += parseFloat(order.priceCash || "0");
    stationMap.set(name, prev);
  }

  return {
    total: orders.length,
    byType,
    swapCompleted: swapCompleted.length,
    swapCancelled: swapCancelled.length,
    swapSpent,
    swapAvgSpent: swapCompleted.length ? swapSpent / swapCompleted.length : 0,
    upgradeCount: upgradeOrders.length,
    upgradeCompleted: upgradeCompleted.length,
    upgradeCancelled: upgradeCancelled.length,
    upgradeSpent,
    upgradeAvgSpent: upgradeCompleted.length ? upgradeSpent / upgradeCompleted.length : 0,
    upgradeDayCount,
    upgradeMonthCount,
    lastOrderTime: orders[0]?.createTime ?? null,
    topSwapStations: [...stationMap.values()]
      .sort((a, b) => b.count - a.count || b.spent - a.spent)
      .slice(0, 5),
    orders,
  };
}

/** @deprecated use analyzeServiceOrders */
export const analyzeSwapOrders = analyzeServiceOrders;
export type SwapOrder = ServiceOrder;
export type SwapSummary = ServiceSummary;
