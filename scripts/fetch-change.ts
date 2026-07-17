import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { assertChangePayload, buildChangeUrl, changeHeadersFromEnv } from "./nio-change.js";
import { fetchWithAsciiHeaders } from "./http-headers.js";
import { getChangeFile, getChangeMetaFile, getDataDir, getProjectRoot } from "./paths.js";
import { syncPublicData } from "./sync-public-data.js";
import { isDirectCliInvocation } from "./cli-main.js";
import { appendFetchLog } from "./fetch-log.js";
import { buildApiRequestDetail, changeErrorDetail, changeSuccessDetail } from "./fetch-log-detail.js";

const ROOT = path.resolve(getProjectRoot());
loadEnv({ path: path.join(ROOT, "deploy", ".env") });
loadEnv({ path: path.join(ROOT, ".env") });

function writeMeta(ok: boolean, error?: string): void {
  fs.mkdirSync(getDataDir(), { recursive: true });
  fs.writeFileSync(
    getChangeMetaFile(),
    JSON.stringify(
      {
        ok,
        at: Date.now(),
        error: error ?? null,
      },
      null,
      2,
    ),
  );
}

function normalizeJson(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("换电接口返回空内容");
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.startsWith("<!DOCTYPE")) {
    throw new Error("换电接口返回 HTML 而非 JSON，请检查 URL / Header / sign");
  }
  return JSON.parse(trimmed) as Record<string, unknown>;
}

function summarizeChangePayload(payload: Record<string, unknown>): string {
  const resultData = payload.resultData as { data?: unknown[]; total?: number | null } | undefined;
  const count = Array.isArray(resultData?.data) ? resultData.data.length : 0;
  const total = resultData?.total;
  if (typeof total === "number" && total !== count) {
    return `订单 ${count} 条 / 共 ${total} 条`;
  }
  return `订单 ${count} 条`;
}

export async function runChangeOnce(): Promise<void> {
  const changeFile = getChangeFile();
  let lastResponseText: string | undefined;
  let apiRequest: ReturnType<typeof buildApiRequestDetail> | null = null;

  try {
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

    const url = buildChangeUrl();
    const method = (process.env.NIO_CHANGE_API_METHOD ?? "POST").toUpperCase();
    const headers = changeHeadersFromEnv();
    const body =
      method === "GET" || method === "HEAD"
        ? undefined
        : process.env.NIO_CHANGE_API_BODY?.trim() ?? "";
    apiRequest = buildApiRequestDetail({ url, method, body });

    console.log(`请求 ${method} ${url.slice(0, 120)}${url.length > 120 ? "…" : ""}`);

    const res = await fetchWithAsciiHeaders(url, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
    });

    const text = await res.text();
    lastResponseText = text;
    if (!res.ok) {
      const err = new Error(`换电 API ${res.status}: ${text.slice(0, 500)}`) as Error & {
        httpStatus?: number;
        rawBody?: string;
      };
      err.httpStatus = res.status;
      err.rawBody = text;
      throw err;
    }

    const payload = normalizeJson(text);
    assertChangePayload(payload);

    fs.mkdirSync(getDataDir(), { recursive: true });
    fs.writeFileSync(changeFile, JSON.stringify(payload, null, 2));
    writeMeta(true);
    syncPublicData();
    appendFetchLog("change", "success", summarizeChangePayload(payload), changeSuccessDetail(payload, apiRequest));
    console.log(`已写入 ${changeFile}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
    writeMeta(false, message);
    throw err;
  }
}

if (isDirectCliInvocation("fetch-change.ts")) {
  void runChangeOnce().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
