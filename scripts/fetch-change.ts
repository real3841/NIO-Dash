import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { assertChangePayload, buildChangeUrl, changeHeadersFromEnv } from "./nio-change.js";
import { fetchWithAsciiHeaders } from "./http-headers.js";
import { getChangeFile, getChangeMetaFile, getDataDir, getProjectRoot } from "./paths.js";
import { syncPublicData } from "./sync-public-data.js";

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

export async function runChangeOnce(): Promise<void> {
  const changeFile = getChangeFile();

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

    console.log(`请求 ${method} ${url.slice(0, 120)}${url.length > 120 ? "…" : ""}`);

    const res = await fetchWithAsciiHeaders(url, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`换电 API ${res.status}: ${text.slice(0, 500)}`);
    }

    const payload = normalizeJson(text);
    assertChangePayload(payload);

    fs.mkdirSync(getDataDir(), { recursive: true });
    fs.writeFileSync(changeFile, JSON.stringify(payload, null, 2));
    writeMeta(true);
    syncPublicData();
    console.log(`已写入 ${changeFile}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeMeta(false, message);
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runChangeOnce().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
