import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { applyEnvUpdates, getEnvFilePath, readEnvFileRaw, writeEnvFileRaw } from "./env-file.js";
import { appendFetchLog, setSlotSchedule, setStockWatchRunning } from "./fetch-log.js";
import { getDataDir } from "./paths.js";

export type StockStatus = "in_stock" | "out_of_stock" | "unknown" | "error" | "disabled";

export interface StockWatchTarget {
  id: string;
  name: string;
  url: string;
}

export interface StockWatchItemSnapshot {
  id: string;
  name: string;
  ok: boolean;
  status: StockStatus;
  label: string;
  /** 与网页按钮一致的归一化检测文本 */
  detectedText: string | null;
  /** 本次判断所依据的 API 返回信息，不包含 Cookie */
  evidence: string | null;
  /** 用于比较响应是否变化，只含库存相关字段 */
  responseFingerprint: string | null;
  goodsName: string | null;
  at: number;
  error: string | null;
  url: string;
  alert: boolean;
}

export interface StockWatchState {
  items: StockWatchItemSnapshot[];
  pollSec: number;
  /** 是否已在 config.env 配置 Cookie（不返回 Cookie 内容） */
  cookieConfigured: boolean;
  /** 是否已配置 SZCRtoken（不返回 Token 内容） */
  tokenConfigured: boolean;
}

/** @deprecated 单商品快照，仅用于迁移旧数据 */
export interface StockWatchSnapshot {
  ok: boolean;
  status: StockStatus;
  label: string;
  goodsName: string | null;
  at: number;
  error: string | null;
  url: string;
  alert: boolean;
  pollSec: number;
  cookieConfigured: boolean;
}

const DEFAULT_TARGETS: StockWatchTarget[] = [
  {
    id: "swap",
    name: "换电订单",
    url: "https://vtravel.link2shops.com/yiyuan/#/detail?activityId=7979aea378db4b81ad4e9ab7e7511e67&goodsId=4cfd2723db544cd9b00ad7dd6a1860c1&channelId=73b34182aaed4559b56e5504801f557b&platformTp=T0098",
  },
  {
    id: "drive",
    name: "驾享订单",
    url: "https://vtravel.link2shops.com/yiyuan/#/detail?activityId=5b72b19680554b599eba64602e60fe51&goodsId=e4b87b60ae004fc49dae48046269151a&channelId=73b34182aaed4559b56e5504801f557b&platformTp=T0099",
  },
];

const API_URL =
  "https://vtravel.link2shops.com/vfuliApi/api/client/ypJyActivity/goodsDetail";

export function getStockWatchFile(): string {
  return path.join(getDataDir(), "stock-watch.json");
}

export function getStockWatchTargets(): StockWatchTarget[] {
  const overrideUrl = process.env.NIO_STOCK_WATCH_URL?.trim();
  return DEFAULT_TARGETS.map((target) =>
    target.id === "swap" && overrideUrl ? { ...target, url: overrideUrl } : target,
  );
}

export function normalizeStockWatchPollSec(value: unknown): number {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Math.max(60, Number.isFinite(n) ? n : 300);
}

export function getStockWatchPollSec(): number {
  return normalizeStockWatchPollSec(process.env.NIO_STOCK_WATCH_POLL_SEC || "300");
}

export function saveStockWatchPollSec(pollSec: number): number {
  const envFile = getEnvFilePath();
  const normalized = normalizeStockWatchPollSec(pollSec);
  const next = applyEnvUpdates(readEnvFileRaw(), { NIO_STOCK_WATCH_POLL_SEC: String(normalized) });
  writeEnvFileRaw(next);
  loadEnv({ path: envFile, override: true });
  return normalized;
}

function stockWatchLogDetail(
  state: StockWatchState,
  responses: Record<string, unknown>,
): Record<string, unknown> {
  return {
    kind: "stock_watch",
    result: "success",
    pollSec: state.pollSec,
    cookieConfigured: state.cookieConfigured,
    tokenConfigured: state.tokenConfigured,
    apiRequest: {
      method: "POST",
      url: API_URL,
      body: "各商品使用自身 activityId、goodsId、channelId、platformTp",
    },
    rawResponse: responses,
    items: state.items.map((item) => ({
      id: item.id,
      name: item.name,
      label: item.label,
      status: item.status,
      detectedText: item.detectedText,
      evidence: item.evidence,
      goodsName: item.goodsName,
      at: item.at,
      error: item.error,
    })),
  };
}

function stockWatchSummaryMessage(state: StockWatchState): string {
  return state.items
    .map((item) =>
      item.status === "error" && item.error
        ? `${item.name} 检查失败：${item.error}`
        : `${item.name} ${item.label}`,
    )
    .join(" · ");
}

let stockAlertHandler: ((items: StockWatchItemSnapshot[]) => void) | null = null;

export function setStockWatchAlertHandler(
  handler: ((items: StockWatchItemSnapshot[]) => void) | null,
): void {
  stockAlertHandler = handler;
}

function deliverStockAlerts(state: StockWatchState): StockWatchState {
  const pending = state.items.filter((item) => item.alert && item.status === "in_stock");
  if (!pending.length || !stockAlertHandler) return state;
  try {
    stockAlertHandler(pending);
  } catch (err) {
    console.warn("[stock-watch] 有货通知失败", err instanceof Error ? err.message : err);
    return state;
  }
  const ids = new Set(pending.map((item) => item.id));
  return writeState(
    state.items.map((item) => (ids.has(item.id) ? { ...item, alert: false } : item)),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reloadStockWatchEnv(): void {
  const envFile = process.env.NIO_ENV_FILE?.trim();
  if (envFile && fs.existsSync(envFile)) {
    loadEnv({ path: envFile, override: true });
  }
}

export function getStockWatchCookie(): string {
  return process.env.NIO_STOCK_WATCH_COOKIE?.trim() ?? "";
}

export function getStockWatchToken(): string {
  return process.env.NIO_STOCK_WATCH_TOKEN?.trim() ?? "";
}

export function saveStockWatchAuth(input: { cookie?: string; token?: string }): void {
  const updates: Record<string, string> = {};
  if (typeof input.cookie === "string") updates.NIO_STOCK_WATCH_COOKIE = input.cookie.trim();
  if (typeof input.token === "string") updates.NIO_STOCK_WATCH_TOKEN = input.token.trim();
  if (Object.keys(updates).length === 0) return;
  const envFile = getEnvFilePath();
  writeEnvFileRaw(applyEnvUpdates(readEnvFileRaw(), updates));
  loadEnv({ path: envFile, override: true });
}

function buildStockCookie(): string {
  const token = getStockWatchToken();
  const parts = getStockWatchCookie()
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !part.toLowerCase().startsWith("szcrtoken="));
  if (token) parts.push(`SZCRtoken=${token}`);
  return parts.join("; ");
}

function hasStockWatchAuth(): boolean {
  return Boolean(buildStockCookie());
}

function stockWatchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Referer: "https://vtravel.link2shops.com/yiyuan/",
    Origin: "https://vtravel.link2shops.com",
  };
  const cookie = buildStockCookie();
  if (cookie) headers.Cookie = cookie;
  const token = getStockWatchToken();
  if (token) headers.token = token;
  return headers;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function readRawState(): unknown {
  const file = getStockWatchFile();
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function normalizeItemSnapshot(raw: unknown, target: StockWatchTarget): StockWatchItemSnapshot | null {
  if (!isRecord(raw)) return null;
  const status = raw.status;
  if (
    status !== "in_stock" &&
    status !== "out_of_stock" &&
    status !== "unknown" &&
    status !== "error" &&
    status !== "disabled"
  ) {
    return null;
  }
  return {
    id: target.id,
    name: target.name,
    ok: Boolean(raw.ok),
    status,
    label: String(raw.label ?? "尚未检查"),
    detectedText: raw.detectedText != null ? String(raw.detectedText) : null,
    evidence: raw.evidence != null ? String(raw.evidence) : null,
    responseFingerprint:
      raw.responseFingerprint != null ? String(raw.responseFingerprint) : null,
    goodsName: raw.goodsName != null ? String(raw.goodsName) : null,
    at: Number(raw.at) || 0,
    error: raw.error != null ? String(raw.error) : null,
    url: String(raw.url ?? target.url),
    alert: Boolean(raw.alert),
  };
}

function readSavedItems(): Map<string, StockWatchItemSnapshot> {
  const raw = readRawState();
  const map = new Map<string, StockWatchItemSnapshot>();
  if (!raw) return map;

  if (isRecord(raw) && Array.isArray(raw.items)) {
    for (const item of raw.items) {
      if (!isRecord(item) || typeof item.id !== "string") continue;
      const target = getStockWatchTargets().find((t) => t.id === item.id);
      if (!target) continue;
      const normalized = normalizeItemSnapshot(item, target);
      if (normalized) map.set(normalized.id, normalized);
    }
    return map;
  }

  // 迁移旧版单商品格式
  if (isRecord(raw) && typeof raw.url === "string") {
    const target = getStockWatchTargets().find((t) => t.id === "swap") ?? DEFAULT_TARGETS[0];
    const normalized = normalizeItemSnapshot(raw, target);
    if (normalized) map.set(normalized.id, normalized);
  }

  return map;
}

function writeState(items: StockWatchItemSnapshot[]): StockWatchState {
  const state: StockWatchState = {
    items,
    pollSec: getStockWatchPollSec(),
    cookieConfigured: Boolean(getStockWatchCookie()),
    tokenConfigured: Boolean(getStockWatchToken()),
  };
  const file = getStockWatchFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
  return state;
}

export function parseYiyuanUrl(url: string): {
  activityId: string;
  goodsId: string;
  channelId: string;
  platformTp: string;
} | null {
  try {
    const u = new URL(url);
    const query = u.hash.includes("?") ? u.hash.split("?")[1] : u.search.slice(1);
    const params = new URLSearchParams(query);
    const activityId = params.get("activityId");
    const goodsId = params.get("goodsId");
    const channelId = params.get("channelId");
    const platformTp = params.get("platformTp");
    if (!activityId || !goodsId || !channelId || !platformTp) return null;
    return { activityId, goodsId, channelId, platformTp };
  } catch {
    return null;
  }
}

function itemGoodsId(item: Record<string, unknown>): string {
  return String(item.goodsId ?? item.id ?? "");
}

function itemGoodsName(item: Record<string, unknown>): string | null {
  const name = item.goodsName ?? item.name ?? item.title;
  return name != null && String(name).trim() ? String(name) : null;
}

function isInStock(item: Record<string, unknown>): boolean {
  const stock = Number(item.stock);
  const stockStatus = Number(item.stockStatus);
  if (Number.isFinite(stock) && stock > 0) return true;
  if (stockStatus === 1) return true;
  return false;
}

function findGoodsMap(raw: Record<string, unknown>, goodsId: string): Record<string, unknown> | null {
  if (isRecord(raw.goodsMap)) return raw.goodsMap;
  const records = walkRecords(raw);
  return (
    records.find((item) => itemGoodsId(item) === goodsId && ("stock" in item || "stockStatus" in item)) ??
    records.find((item) => "stock" in item && "stockStatus" in item) ??
    null
  );
}

function stockFingerprint(goods: Record<string, unknown> | null): string | null {
  if (!goods) return null;
  return JSON.stringify({
    id: goods.id ?? null,
    name: goods.name ?? null,
    stock: goods.stock ?? null,
    stockStatus: goods.stockStatus ?? null,
    btnName: goods.btnName ?? null,
    jumpBtnName: goods.jumpBtnName ?? null,
    soldOutPrompt: goods.soldOutPrompt ?? null,
  });
}

function redactStockResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactStockResponse(item));
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (/mobile|phone|token|cookie|authorization|secret/i.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (key === "goodsIntroduction" || key === "appGoodsIntroduction") {
      const text = typeof child === "string" ? child : JSON.stringify(child ?? "");
      out[key] = `[已省略 ${text.length} 字符]`;
      continue;
    }
    out[key] = redactStockResponse(child);
  }
  return out;
}

function walkRecords(value: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const item of value) walkRecords(item, out);
    return out;
  }
  if (!isRecord(value)) return out;
  out.push(value);
  for (const child of Object.values(value)) walkRecords(child, out);
  return out;
}

function emptyItemSnapshot(
  target: StockWatchTarget,
  status: StockStatus,
  label: string,
  error: string | null,
  prev: StockWatchItemSnapshot | null,
): StockWatchItemSnapshot {
  return {
    id: target.id,
    name: target.name,
    ok: status !== "error" && status !== "disabled",
    status,
    label,
    detectedText: null,
    evidence: error,
    responseFingerprint: null,
    goodsName: null,
    at: Date.now(),
    error,
    url: target.url,
    alert: status === "in_stock" && prev?.status !== "in_stock",
  };
}

function placeholderItem(target: StockWatchTarget): StockWatchItemSnapshot {
  return {
    id: target.id,
    name: target.name,
    ok: false,
    status: "unknown",
    label: "尚未检查",
    detectedText: null,
    evidence: null,
    responseFingerprint: null,
    goodsName: null,
    at: 0,
    error: null,
    url: target.url,
    alert: false,
  };
}

async function checkStockWatchTarget(
  target: StockWatchTarget,
  prev: StockWatchItemSnapshot | null,
): Promise<{ item: StockWatchItemSnapshot; rawResponse: unknown }> {
  const params = parseYiyuanUrl(target.url);
  if (!params) {
    return {
      item: emptyItemSnapshot(target, "error", "链接无效", "无法解析商品链接参数", prev),
      rawResponse: null,
    };
  }

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: stockWatchHeaders(),
      body: JSON.stringify(params),
    });

    const raw: unknown = await res.json();
    if (!isRecord(raw)) {
      throw new Error("接口返回格式异常");
    }

    const code = Number(raw.code);
    if (code !== 0) {
      throw new Error(String(raw.msg ?? `接口错误 (${code})`));
    }

    const goods = findGoodsMap(raw, params.goodsId);
    const loggedIn = hasStockWatchAuth();
    const fingerprint = stockFingerprint(goods);
    const responseChanged = Boolean(
      fingerprint && prev?.responseFingerprint && fingerprint !== prev.responseFingerprint,
    );
    const stock = goods ? Number(goods.stock) : Number.NaN;
    const stockStatus = goods ? Number(goods.stockStatus) : Number.NaN;
    const stockReady = Number.isFinite(stock) && stock > 0;
    const statusReady = stockStatus === 1;
    let status: StockStatus = "out_of_stock";
    let label = "商品库存不足";
    let detectedText: string | null = "商品库存不足";
    let goodsName: string | null = goods ? itemGoodsName(goods) : null;

    if (goods && isInStock(goods)) {
      status = "in_stock";
      label = "有货";
      detectedText = stockReady ? `stock=${stock}` : `stockStatus=${goods.stockStatus}`;
    } else if (!goods && !loggedIn) {
      status = "unknown";
      label = "无法确认（未登录）";
      detectedText = null;
    } else if (!goods) {
      status = "unknown";
      label = "无法确认";
      detectedText = null;
    }

    const evidence = [
      `stock=${goods ? String(goods.stock ?? "无字段") : "无 goodsMap"}`,
      `stockStatus=${goods ? String(goods.stockStatus ?? "无字段") : "无 goodsMap"}`,
      `有货条件：stock>0 ${stockReady ? "满足" : "不满足"}，stockStatus=1 ${statusReady ? "满足" : "不满足"}`,
      responseChanged ? "响应有变化" : prev?.responseFingerprint ? "响应无变化" : "首次记录响应",
    ].join("；");

    return {
      item: {
        id: target.id,
        name: target.name,
        ok: true,
        status,
        label,
        detectedText,
        evidence,
        responseFingerprint: fingerprint,
        goodsName,
        at: Date.now(),
        error: null,
        url: target.url,
        alert:
          (status === "in_stock" && prev?.status !== "in_stock") || responseChanged,
      },
      rawResponse: redactStockResponse(raw),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      item: emptyItemSnapshot(target, "error", "检查失败", message, prev),
      rawResponse: null,
    };
  }
}

export async function checkStockWatch(
  targetId?: string,
  options?: { log?: boolean; runningFlag?: boolean },
): Promise<StockWatchState> {
  reloadStockWatchEnv();
  const shouldLog = options?.log ?? false;
  const useRunningFlag = options?.runningFlag ?? false;

  if (shouldLog) {
    appendFetchLog("stock_watch", "info", "库存 · 开始检查…");
  }
  if (useRunningFlag) {
    setStockWatchRunning(true);
  }

  try {
    const targets = getStockWatchTargets().filter((target) => !targetId || target.id === targetId);
    const saved = readSavedItems();
    const items: StockWatchItemSnapshot[] = [];
    const responses: Record<string, unknown> = {};

    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      if (index > 0) await sleep(2000);
      const prev = saved.get(target.id) ?? null;
      let checked = await checkStockWatchTarget(target, prev);
      if (checked.item.error?.includes("频繁")) {
        await sleep(3000);
        checked = await checkStockWatchTarget(target, prev);
      }
      items.push(checked.item);
      responses[target.name] = checked.rawResponse;
    }

    if (targetId) {
      const existing = readSavedItems();
      for (const target of getStockWatchTargets()) {
        if (target.id === targetId) continue;
        items.push(existing.get(target.id) ?? placeholderItem(target));
      }
      items.sort(
        (a, b) =>
          getStockWatchTargets().findIndex((t) => t.id === a.id) -
          getStockWatchTargets().findIndex((t) => t.id === b.id),
      );
    }

    const state = deliverStockAlerts(writeState(items));
    if (shouldLog) {
      appendFetchLog(
        "stock_watch",
        "success",
        `库存 · ${stockWatchSummaryMessage(state)}`,
        stockWatchLogDetail(state, responses),
      );
    }
    return state;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (shouldLog) {
      appendFetchLog("stock_watch", "error", `库存 · 检查失败：${message}`, {
        kind: "stock_watch",
        result: "error",
        reason: message,
      });
    }
    throw err;
  } finally {
    if (useRunningFlag) {
      setStockWatchRunning(false);
    }
  }
}

export function loadStockWatchState(): StockWatchState {
  reloadStockWatchEnv();
  const saved = readSavedItems();
  const items = getStockWatchTargets().map(
    (target) => saved.get(target.id) ?? placeholderItem(target),
  );
  return {
    items,
    pollSec: getStockWatchPollSec(),
    cookieConfigured: Boolean(getStockWatchCookie()),
    tokenConfigured: Boolean(getStockWatchToken()),
  };
}

export function ackStockAlert(targetId?: string): StockWatchState {
  const state = loadStockWatchState();
  const items = state.items.map((item) =>
    !targetId || item.id === targetId ? { ...item, alert: false } : item,
  );
  return writeState(items);
}

export function startStockWatchScheduler(options?: {
  onComplete?: () => void;
}): { stop: () => void; reschedule: (immediate?: boolean) => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let running = false;

  const scheduleNext = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    const pollSec = getStockWatchPollSec();
    const nextAt = Date.now() + pollSec * 1000;
    setSlotSchedule("stock_watch", {
      nextAt,
      intervalSec: pollSec,
      detail: "换电订单 + 驾享订单",
    });
    timer = setTimeout(() => void tick(), pollSec * 1000);
  };

  const tick = async () => {
    if (stopped) return;
    if (running) {
      scheduleNext();
      return;
    }
    running = true;
    try {
      await checkStockWatch(undefined, { log: true, runningFlag: true });
      options?.onComplete?.();
    } catch (err) {
      console.warn("[stock-watch]", err instanceof Error ? err.message : err);
    } finally {
      running = false;
      scheduleNext();
    }
  };

  const reschedule = (immediate = false) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = null;
    if (immediate) {
      void tick();
      return;
    }
    scheduleNext();
  };

  void tick();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      setStockWatchRunning(false);
      setSlotSchedule("stock_watch", { nextAt: null, intervalSec: null, detail: null });
    },
    reschedule,
  };
}
