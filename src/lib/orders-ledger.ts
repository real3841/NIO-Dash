import type { ChangeResponse, ServiceOrder } from "./change";

export const ALL_ORDER_TYPES = [
  "pe_shaman",
  "pe_shaman_change",
  "service_pe_discharge",
  "battery_flexible_upgrade",
  "nsom_so_maintenance",
  "nsom_so_chauffeur",
  "chauffeur_vehicle_delivery",
  "so_case_accident",
] as const;

export const ORDERS_PAGE_SIZE = 50;
export const ORDERS_RECENT_LIMIT = 10;
export const BACKFILL_PAGE_GAP_MS = 600_000;

export type OrderLedger = Record<string, ServiceOrder>;

export interface OrderLedgerState {
  backfillComplete: boolean;
  backfillOffset: number;
  lastBackfillAt: number | null;
}

export function defaultLedgerState(): OrderLedgerState {
  return { backfillComplete: false, backfillOffset: 0, lastBackfillAt: null };
}

function orderSignature(order: ServiceOrder): string {
  return JSON.stringify({
    orderStatus: order.orderStatus,
    orderStatusName: order.orderStatusName,
    paymentStatus: order.paymentStatus,
    priceCash: order.priceCash,
    payDesc: order.payDesc,
    resourceAddress: order.resourceAddress,
  });
}

/** 按 orderNo upsert；状态/金额变化会覆盖旧记录 */
export function mergeOrdersIntoLedger(
  ledger: OrderLedger,
  fetched: ServiceOrder[],
): { ledger: OrderLedger; changed: boolean } {
  const next: OrderLedger = { ...ledger };
  let changed = false;
  for (const raw of fetched) {
    const orderNo = raw.orderNo?.trim();
    if (!orderNo) continue;
    const prev = next[orderNo];
    if (!prev || orderSignature(prev) !== orderSignature(raw)) {
      next[orderNo] = raw;
      changed = true;
    }
  }
  return { ledger: next, changed };
}

export function ledgerFromChangeResponse(payload: ChangeResponse | null | undefined): OrderLedger {
  const ledger: OrderLedger = {};
  if (!payload?.resultData?.data) return ledger;
  for (const order of payload.resultData.data) {
    if (order.orderNo) ledger[order.orderNo] = order;
  }
  return ledger;
}

export function ledgerToChangeResponse(ledger: OrderLedger): ChangeResponse {
  const orders = Object.values(ledger).sort((a, b) => b.createTime - a.createTime);
  return {
    resultCode: "0000",
    resultDesc: "success",
    resultData: {
      data: orders,
      total: orders.length,
      hasMore: false,
    },
    serviceTime: Date.now(),
  };
}

export function ledgerSyncLabel(state: OrderLedgerState, ledgerSize: number): string {
  if (!state.backfillComplete) {
    return `历史回填中 · 已 ${ledgerSize} 条 · offset ${state.backfillOffset}`;
  }
  return `账本 ${ledgerSize} 条 · 已同步全量`;
}
