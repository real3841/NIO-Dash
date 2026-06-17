/**
 * 从 Postman 导出的 Collection v2.1 JSON 生成 deploy/.env
 *
 * 用法：
 *   1. Postman → 你的 Request → ... → Export → Collection v2.1
 *   2. npm run postman:env -- ./postman/nio.json
 *   3. 或指定请求名：npm run postman:env -- ./postman/nio.json "车辆状态"
 */

import fs from "node:fs";
import path from "node:path";

type PostmanHeader = { key?: string; value?: string; disabled?: boolean };
type PostmanUrl =
  | string
  | {
      raw?: string;
      host?: string[];
      path?: string[];
      protocol?: string;
      query?: Array<{ key?: string; value?: string; disabled?: boolean }>;
    };

type PostmanRequest = {
  method?: string;
  header?: PostmanHeader[];
  body?: { mode?: string; raw?: string };
  url?: PostmanUrl;
};

type PostmanItem = {
  name?: string;
  request?: PostmanRequest;
  item?: PostmanItem[];
};

function flattenItems(items: PostmanItem[] = []): PostmanItem[] {
  const out: PostmanItem[] = [];
  for (const item of items) {
    if (item.request) out.push(item);
    if (item.item) out.push(...flattenItems(item.item));
  }
  return out;
}

function resolveUrl(url: PostmanUrl | undefined): string {
  if (!url) return "";
  if (typeof url === "string") return url.replace(/\{\{[^}]+\}\}/g, "").replace(/\/+$/, "") || url;
  if (url.raw) {
    return url.raw.replace(/\{\{[^}]+\}\}/g, "").trim();
  }
  const protocol = url.protocol ?? "https";
  const host = (url.host ?? []).join(".");
  const pathname = (url.path ?? []).join("/");
  const query = (url.query ?? [])
    .filter((q) => !q.disabled && q.key)
    .map((q) => `${encodeURIComponent(q.key!)}=${encodeURIComponent(q.value ?? "")}`)
    .join("&");
  const base = `${protocol}://${host}/${pathname}`.replace(/([^:]\/)\/+/g, "$1");
  return query ? `${base}?${query}` : base;
}

function headersToJson(headers: PostmanHeader[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) {
    if (!h.key || h.disabled) continue;
    out[h.key] = h.value ?? "";
  }
  return out;
}

function escapeEnvValue(value: string): string {
  if (/[\s#"\\]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

function main(): void {
  const collectionPath = process.argv[2];
  const requestName = process.argv[3];

  if (!collectionPath) {
    console.error("用法: npm run postman:env -- <collection.json> [请求名称]");
    process.exit(1);
  }

  const abs = path.resolve(collectionPath);
  if (!fs.existsSync(abs)) {
    console.error(`文件不存在: ${abs}`);
    process.exit(1);
  }

  const collection = JSON.parse(fs.readFileSync(abs, "utf8")) as { item?: PostmanItem[] };
  const requests = flattenItems(collection.item ?? []);

  if (requests.length === 0) {
    console.error("Collection 里没有找到任何 Request");
    process.exit(1);
  }

  const picked =
    (requestName ? requests.find((r) => r.name?.includes(requestName)) : null) ??
    requests.find((r) => /vehicle|nio|status|车况/i.test(r.name ?? "")) ??
    requests[0];

  const req = picked.request!;
  const url = resolveUrl(req.url);
  const headers = headersToJson(req.header);
  const method = (req.method ?? "GET").toUpperCase();
  const body = req.body?.mode === "raw" ? req.body.raw?.trim() : "";

  if (!url || url.includes("{{")) {
    console.error("URL 含 Postman 变量 {{xxx}}，请先在 Postman 里填好变量值再 Export，或手动改 .env");
    console.error("当前解析 URL:", url);
  }

  const lines = [
    "# 由 Postman Collection 自动生成",
    `# 请求: ${picked.name ?? "unknown"}`,
    "",
    `NIO_API_URL=${escapeEnvValue(url)}`,
    `NIO_API_METHOD=${method}`,
    `NIO_API_HEADERS=${escapeEnvValue(JSON.stringify(headers))}`,
  ];

  if (body) {
    lines.push(`NIO_API_BODY=${escapeEnvValue(body)}`);
  }

  lines.push(
    "",
    "NIO_VEHICLE_POLL_DRIVING_SEC=900",
    "NIO_VEHICLE_POLL_DAY_SEC=1800",
    "NIO_VEHICLE_POLL_NIGHT_SEC=3600",
    "NIO_CHANGE_POLL_INTERVAL=3600",
    "NIO_POLL_INTERVAL=3600",
    "WEB_PORT=8088",
    "",
  );

  const outPath = path.resolve("deploy/.env");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"));

  console.log(`已生成 ${outPath}`);
  console.log(`请求: ${picked.name}`);
  console.log(`${method} ${url}`);
  console.log(`Headers: ${Object.keys(headers).join(", ") || "(无)"}`);
  if (body) console.log("含 POST Body");
}

main();
