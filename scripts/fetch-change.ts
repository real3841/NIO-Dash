import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { ChangeResponse } from "../src/lib/change.js";
import { extractErrorKind, classifyChangeApiFailure } from "../src/lib/nio-api-errors.js";
import { recordAuthSlot } from "./auth-slots.js";
import type { NioErrorKind } from "../src/lib/nio-api-errors.js";
import {
  BACKFILL_PAGE_GAP_MS,
  defaultLedgerState,
  ledgerFromChangeResponse,
  ledgerSyncLabel,
  ledgerToChangeResponse,
  mergeOrdersIntoLedger,
  ORDERS_PAGE_SIZE,
  ORDERS_RECENT_LIMIT,
  type OrderLedger,
  type OrderLedgerState,
} from "../src/lib/orders-ledger.js";
import {
  assertChangePayload,
  buildChangeUrl,
  buildChangeUrlWithPaging,
  buildCursorPageUrl,
  changeAuthTokensFromEnv,
  changeHeadersFromEnv,
  CURSOR_MAX_PAGES,
  extractOrdersFromPayload,
  usesCursorSync,
  usesLedgerBackfill,
} from "./nio-change.js";
import { fetchWithAsciiHeaders } from "./http-headers.js";
import {
  getChangeFile,
  getChangeLedgerFile,
  getChangeLedgerStateFile,
  getChangeMetaFile,
  getDataDir,
  getProjectRoot,
} from "./paths.js";
import { syncPublicData } from "./sync-public-data.js";
import { isDirectCliInvocation } from "./cli-main.js";
import { appendFetchLog } from "./fetch-log.js";
import { writeJsonAtomic } from "./atomic-write.js";
import { buildApiRequestDetail, changeErrorDetail, changeSuccessDetail } from "./fetch-log-detail.js";

const ROOT = path.resolve(getProjectRoot());
loadEnv({ path: path.join(ROOT, "deploy", ".env") });
loadEnv({ path: path.join(ROOT, ".env") });

function writeMeta(ok: boolean, error?: string, errorKind?: NioErrorKind | null): void {
  fs.mkdirSync(getDataDir(), { recursive: true });
  writeJsonAtomic(getChangeMetaFile(), {
    ok,
    at: Date.now(),
    error: error ?? null,
    errorKind: errorKind ?? null,
  });
}

function readJsonFile<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function loadLedgerAndState(): { ledger: OrderLedger; state: OrderLedgerState } {
  const changeFile = getChangeFile();
  let ledger = readJsonFile<OrderLedger>(getChangeLedgerFile(), {});
  let state = readJsonFile<OrderLedgerState>(getChangeLedgerStateFile(), defaultLedgerState());

  if (Object.keys(ledger).length === 0 && fs.existsSync(changeFile)) {
    const existing = readJsonFile<ChangeResponse | null>(changeFile, null);
    if (existing?.resultData?.data) {
      ledger = ledgerFromChangeResponse(existing);
      if (existing.resultData.hasMore) {
        state = {
          backfillComplete: false,
          backfillOffset: existing.resultData.data.length,
          lastBackfillAt: null,
        };
      } else if (Object.keys(ledger).length > 0) {
        state = { ...state, backfillComplete: true };
      }
    }
  }

  return { ledger, state };
}

function persistLedger(ledger: OrderLedger, state: OrderLedgerState, changeFile: string): void {
  fs.mkdirSync(getDataDir(), { recursive: true });
  writeJsonAtomic(getChangeLedgerFile(), ledger);
  writeJsonAtomic(getChangeLedgerStateFile(), state);
  writeJsonAtomic(changeFile, ledgerToChangeResponse(ledger));
}

function normalizeJson(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("换电接口返回空内容");
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.startsWith("<!DOCTYPE")) {
    throw new Error("换电接口返回 HTML 而非 JSON，请检查 URL / Header / sign");
  }
  return JSON.parse(trimmed) as Record<string, unknown>;
}

function summarizeLedger(ledger: OrderLedger, state: OrderLedgerState, pageCount: number): string {
  const base = ledgerSyncLabel(state, Object.keys(ledger).length);
  if (pageCount > 0) return `${base} · 本页 ${pageCount} 条`;
  return base;
}

function shouldRetryChangeAuth(message: string): boolean {
  return /用户名不能为空|token|auth|登录|鉴权|0002/i.test(message);
}

async function postChangeRequest(
  url: string,
  method: string,
  body: string | undefined,
): Promise<{ payload: Record<string, unknown>; httpStatus: number; text: string; apiRequest: ReturnType<typeof buildApiRequestDetail> }> {
  const tokens = changeAuthTokensFromEnv();
  if (tokens.length === 0) {
    throw new Error("未配置换电 Token（NIO_CHANGE_ACCESS_TOKEN 或 NIO_VEHICLE_ACCESS_TOKEN）");
  }

  let lastError: unknown = null;
  for (let i = 0; i < tokens.length; i++) {
    const headers = changeHeadersFromEnv(tokens[i]);
    const apiRequest = buildApiRequestDetail({ url, method, body });
    if (i > 0) {
      console.log("换电 Token 无效，尝试备用 Token…");
    }

    const res = await fetchWithAsciiHeaders(url, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
    });

    const text = await res.text();
    let payload: Record<string, unknown>;
    try {
      payload = normalizeJson(text);
    } catch (err) {
      if (!res.ok) {
        throw classifyChangeApiFailure(null, res.status);
      }
      throw err;
    }

    try {
      if (!res.ok) {
        assertChangePayload(payload, res.status);
      }
      assertChangePayload(payload, res.status);
      return { payload, httpStatus: res.status, text, apiRequest };
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (i < tokens.length - 1 && shouldRetryChangeAuth(message)) {
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const CURSOR_PAGE_GAP_MS = 800;

/** 像 App 一样一直下滑到 hasMore=false；中途失败时把已拿到的页先写进账本再报错 */
async function runCursorSync(changeFile: string): Promise<void> {
  let { ledger, state } = loadLedgerAndState();
  const body = process.env.NIO_CHANGE_API_BODY?.trim() || "{}";
  let offset = 0;
  let cursorTime: string | undefined;
  let cursorId: string | undefined;
  let fetched = 0;
  let pages = 0;
  let reachedEnd = false;
  let lastRequest: ReturnType<typeof buildApiRequestDetail> | null = null;

  try {
    for (; pages < CURSOR_MAX_PAGES; ) {
      const url = buildCursorPageUrl({ offset, cursorTime, cursorId });
      const { payload, apiRequest } = await postChangeRequest(url, "POST", body);
      lastRequest = apiRequest;
      pages += 1;
      const page = extractOrdersFromPayload(payload);
      fetched += page.orders.length;
      ledger = mergeOrdersIntoLedger(ledger, page.orders).ledger;
      if (!page.hasMore || page.orders.length === 0 || !page.cursorTime || !page.cursorId) {
        reachedEnd = true;
        break;
      }
      offset += page.orders.length;
      cursorTime = page.cursorTime;
      cursorId = page.cursorId;
      await new Promise((resolve) => setTimeout(resolve, CURSOR_PAGE_GAP_MS));
    }
  } catch (err) {
    if (fetched > 0) persistLedger(ledger, state, changeFile);
    const prefix = `第 ${pages + 1} 页失败（已拿到 ${fetched} 条）：`;
    if (err instanceof Error) {
      err.message = `${prefix}${err.message}`;
      throw err;
    }
    throw new Error(`${prefix}${String(err)}`);
  }

  state = { ...state, backfillComplete: reachedEnd, backfillOffset: 0, lastBackfillAt: Date.now() };
  persistLedger(ledger, state, changeFile);
  recordAuthSlot("change", true);
  writeMeta(true);
  syncPublicData();
  const total = Object.keys(ledger).length;
  appendFetchLog(
    "change",
    "success",
    `翻到底 ${pages} 页 · 本次 ${fetched} 条 · 账本 ${total} 条${reachedEnd ? "" : ` · 已到 ${CURSOR_MAX_PAGES} 页上限`}`,
    changeSuccessDetail(ledgerToChangeResponse(ledger) as unknown as Record<string, unknown>, lastRequest),
  );
  console.log(`已写入 ${changeFile} · ${pages} 页 · 账本 ${total} 条`);
}

export async function runChangeOnce(): Promise<void> {
  const changeFile = getChangeFile();
  let lastResponseText: string | undefined;
  let apiRequest: ReturnType<typeof buildApiRequestDetail> | null = null;

  try {
    if (usesCursorSync()) {
      await runCursorSync(changeFile);
      return;
    }

    const hasConfig =
      process.env.NIO_CHANGE_API_URL?.trim() ||
      process.env.NIO_CHANGE_API_MODE === "params" ||
      process.env.NIO_CHANGE_HASH_TYPE?.trim();

    if (!hasConfig) {
      if (!fs.existsSync(changeFile)) {
        throw new Error("未配置换电 API，且 data/change.json 不存在");
      }
      console.log("未配置换电 API，保留当前 change.json");
      appendFetchLog("change", "info", "未配置换电 API，保留当前 change.json");
      writeMeta(true);
      return;
    }

    let { ledger, state } = loadLedgerAndState();
    const useBackfill = usesLedgerBackfill();
    const now = Date.now();
    let url: string;

    if (useBackfill && !state.backfillComplete) {
      if (state.lastBackfillAt && now - state.lastBackfillAt < BACKFILL_PAGE_GAP_MS) {
        const waitSec = Math.ceil((BACKFILL_PAGE_GAP_MS - (now - state.lastBackfillAt)) / 1000);
        console.log(`订单历史回填节流中，${waitSec}s 后再拉下一页；先写入账本 ${Object.keys(ledger).length} 条`);
        persistLedger(ledger, state, changeFile);
        writeMeta(true);
        syncPublicData();
        appendFetchLog(
          "change",
          "info",
          summarizeLedger(ledger, state, 0),
          { kind: "change", result: "throttled", ledgerSize: Object.keys(ledger).length },
        );
        return;
      }
      url = buildChangeUrlWithPaging(state.backfillOffset, ORDERS_PAGE_SIZE);
    } else if (useBackfill) {
      url = buildChangeUrlWithPaging(0, ORDERS_RECENT_LIMIT);
    } else {
      url = buildChangeUrl();
    }

    const method = (process.env.NIO_CHANGE_API_METHOD ?? "POST").toUpperCase();
    const body =
      method === "GET" || method === "HEAD"
        ? undefined
        : process.env.NIO_CHANGE_API_BODY?.trim() || "{}";

    console.log(`请求 ${method} ${url.slice(0, 120)}${url.length > 120 ? "…" : ""}`);

    const { payload, text, apiRequest: reqDetail } = await postChangeRequest(url, method, body);
    apiRequest = reqDetail;
    lastResponseText = text;

    const { orders, hasMore } = extractOrdersFromPayload(payload);
    const merged = mergeOrdersIntoLedger(ledger, orders);
    ledger = merged.ledger;

    if (useBackfill && !state.backfillComplete) {
      state = {
        ...state,
        backfillOffset: state.backfillOffset + orders.length,
        lastBackfillAt: now,
        backfillComplete: !hasMore || orders.length === 0,
      };
    } else if (!useBackfill && !hasMore) {
      state = { ...state, backfillComplete: true };
    }

    persistLedger(ledger, state, changeFile);
    recordAuthSlot("change", true);
    writeMeta(true);
    syncPublicData();
    appendFetchLog(
      "change",
      "success",
      summarizeLedger(ledger, state, orders.length),
      changeSuccessDetail(
        ledgerToChangeResponse(ledger) as unknown as Record<string, unknown>,
        apiRequest,
      ),
    );
    console.log(`已写入 ${changeFile} · ${ledgerSyncLabel(state, Object.keys(ledger).length)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errorKind = extractErrorKind(err);
    const httpStatus =
      err && typeof err === "object" && "httpStatus" in err
        ? (err as { httpStatus?: number }).httpStatus
        : undefined;
    const rawBody =
      err && typeof err === "object" && "rawBody" in err
        ? (err as { rawBody?: string }).rawBody
        : lastResponseText;
    appendFetchLog(
      "change",
      "error",
      `拉取失败：${message}`,
      changeErrorDetail(message, httpStatus, rawBody, apiRequest),
    );
    recordAuthSlot("change", false, err);
    writeMeta(false, message, errorKind);
    throw err;
  }
}

if (isDirectCliInvocation("fetch-change.ts")) {
  void runChangeOnce().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
