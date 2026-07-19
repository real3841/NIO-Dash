export type CardSection = "vehicle" | "orders";

export interface CardDef {
  id: string;
  label: string;
  description?: string;
}

export interface CardLayoutState {
  order: string[];
  hidden: string[];
}

const STORAGE_KEY = "nio_card_layout_v1";
export const CARD_LAYOUT_HYDRATE_EVENT = "nio-card-layout-hydrated";

let memoryCache: Partial<Record<CardSection, CardLayoutState>> | null = null;

export const VEHICLE_CARDS: CardDef[] = [
  { id: "battery", label: "电池", description: "电量、续航、里程" },
  { id: "charging", label: "充电详情", description: "充电功率、电流、电压、限充" },
  { id: "doors_visual", label: "车门", description: "车门示意、上锁状态" },
  { id: "window", label: "车窗", description: "四窗开度、天窗、后视镜" },
  { id: "tyre", label: "轮胎", description: "四轮胎压与胎温" },
  { id: "software_gps", label: "软件版本 / GPS", description: "版本与位置" },
  { id: "modes", label: "特殊模式", description: "宠物/露营/守卫/CPD 等" },
  { id: "vehicle_info", label: "车辆信息", description: "里程、ID、状态" },
  { id: "exterior_detail", label: "行驶 / 泊车", description: "驾驶模式、遥控泊车等" },
  { id: "seat_heat", label: "座椅加热", description: "方向盘/座椅/通风/预热" },
  { id: "connection", label: "连接状态", description: "签到、CDC/ADC、在线状态" },
  { id: "temperature", label: "温度 / 空调", description: "车内/车外温度与空调扩展" },
  { id: "maintain", label: "维保", description: "维保状态与待办" },
  { id: "light", label: "灯光", description: "大灯、示宽灯、日行灯" },
  { id: "key", label: "钥匙", description: "近车解锁、门把手感应" },
  { id: "special", label: "特殊状态", description: "维修等特殊标记" },
  { id: "trip_share", label: "行程分享", description: "行程分享状态" },
  { id: "nearby_car", label: "近车控制", description: "近车授权与登录" },
  { id: "power_swap_order", label: "换电订单", description: "换电订单展示" },
  { id: "lv_batt", label: "低压电瓶", description: "12V 电瓶状态" },
  { id: "device", label: "设备状态", description: "车载设备在线状态" },
  { id: "charge_order", label: "充电订单", description: "当前充电订单" },
  { id: "remote_operate", label: "远程操作", description: "远程操作状态" },
  { id: "offcar_power_swap", label: "离车换电", description: "离车换电状态" },
  { id: "box", label: "储物箱", description: "前后备箱/储物" },
  { id: "frdg", label: "冰箱", description: "车载冰箱" },
];

export const ORDER_CARDS: CardDef[] = [
  { id: "order_overview", label: "订单概览", description: "总数与分类" },
  { id: "swap_stats", label: "换电统计", description: "花费与完成次数" },
  { id: "top_stations", label: "常用换电站", description: "Top 换电站" },
  { id: "order_table", label: "全部订单", description: "订单列表表格" },
];

function defaultLayout(defs: CardDef[]): CardLayoutState {
  return { order: defs.map((d) => d.id), hidden: [] };
}

const REMOVED_CARD_IDS = new Set(["doors_toggle"]);

function normalizeCardId(id: string): string | null {
  if (REMOVED_CARD_IDS.has(id)) return null;
  return id;
}

function mergeLayout(defs: CardDef[], saved: Partial<CardLayoutState> | null): CardLayoutState {
  const defaults = defaultLayout(defs);
  if (!saved) return defaults;

  const validIds = new Set(defs.map((d) => d.id));
  const order: string[] = [];
  for (const id of saved.order ?? []) {
    const norm = normalizeCardId(id);
    if (norm && validIds.has(norm) && !order.includes(norm)) order.push(norm);
  }
  for (const def of defs) {
    if (!order.includes(def.id)) order.push(def.id);
  }

  const hidden = [
    ...new Set(
      (saved.hidden ?? [])
        .map(normalizeCardId)
        .filter((id): id is string => id != null && validIds.has(id) && order.includes(id)),
    ),
  ];
  return { order, hidden };
}

function readFromLocalStorage(): Partial<Record<CardSection, CardLayoutState>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<CardSection, CardLayoutState>>) : {};
  } catch {
    return {};
  }
}

function readAll(): Partial<Record<CardSection, CardLayoutState>> {
  if (memoryCache) return memoryCache;
  return readFromLocalStorage();
}

let lastLocalSaveAt = 0;

async function persistCardLayout(data: Record<CardSection, CardLayoutState>): Promise<void> {
  lastLocalSaveAt = Date.now();
  memoryCache = data;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / private mode */
  }
  try {
    const res = await fetch("/api/card-layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      console.warn("[card-layout] 服务端保存失败", res.status);
    }
  } catch (err) {
    console.warn("[card-layout] 服务端不可用，已写入 localStorage", err);
  }
}

function writeAll(data: Record<CardSection, CardLayoutState>): void {
  void persistCardLayout(data);
}

/** 从服务端文件加载布局（Electron 每次端口不同，localStorage 会丢） */
export async function hydrateCardLayout(): Promise<void> {
  const hydrateStartedAt = Date.now();
  try {
    const res = await fetch(`/api/card-layout?_=${Date.now()}`);
    if (res.ok) {
      const data = (await res.json()) as Partial<Record<CardSection, CardLayoutState>>;
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const hasContent = Boolean(data.vehicle || data.orders);
        if (hasContent && lastLocalSaveAt < hydrateStartedAt) {
          memoryCache = data;
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
          } catch {
            /* ignore */
          }
        }
      }
    }
  } catch {
    /* 纯 Web 开发无 API 时回退 localStorage */
  }

  if (!memoryCache) {
    memoryCache = readFromLocalStorage();
  }

  window.dispatchEvent(new CustomEvent(CARD_LAYOUT_HYDRATE_EVENT));
}

export function loadCardLayout(section: CardSection, defs: CardDef[]): CardLayoutState {
  const all = readAll();
  return mergeLayout(defs, all[section] ?? null);
}

export function saveCardLayout(section: CardSection, layout: CardLayoutState, defs: CardDef[]): CardLayoutState {
  const merged = mergeLayout(defs, layout);
  const all = readAll();
  all[section] = merged;
  writeAll({
    vehicle: mergeLayout(VEHICLE_CARDS, all.vehicle ?? null),
    orders: mergeLayout(ORDER_CARDS, all.orders ?? null),
  });
  return merged;
}

export function resetCardLayout(section: CardSection): CardLayoutState {
  const layout = defaultLayout(section === "vehicle" ? VEHICLE_CARDS : ORDER_CARDS);
  saveCardLayout(section, layout, section === "vehicle" ? VEHICLE_CARDS : ORDER_CARDS);
  return layout;
}

export function visibleCardIds(layout: CardLayoutState): string[] {
  const hidden = new Set(layout.hidden);
  return layout.order.filter((id) => !hidden.has(id));
}

export function isCardVisible(layout: CardLayoutState, id: string): boolean {
  return layout.order.includes(id) && !layout.hidden.includes(id);
}

export function toggleCardVisibility(layout: CardLayoutState, id: string): CardLayoutState {
  const hidden = new Set(layout.hidden);
  if (hidden.has(id)) {
    hidden.delete(id);
  } else {
    const visibleCount = layout.order.filter((x) => !hidden.has(x)).length;
    if (visibleCount <= 1) return layout;
    hidden.add(id);
  }
  return { ...layout, hidden: [...hidden] };
}

export function reorderCards(layout: CardLayoutState, activeId: string, overId: string): CardLayoutState {
  if (activeId === overId) return layout;
  const order = [...layout.order];
  const from = order.indexOf(activeId);
  const to = order.indexOf(overId);
  if (from < 0 || to < 0) return layout;
  order.splice(from, 1);
  order.splice(to, 0, activeId);
  return { ...layout, order };
}

export function cardLabel(defs: CardDef[], id: string): string {
  return defs.find((d) => d.id === id)?.label ?? id;
}
