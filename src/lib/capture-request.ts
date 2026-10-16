export type CaptureMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export interface ParsedCapture {
  url: string;
  method: CaptureMethod;
  token: string;
  headerToken: string;
  cookie: string;
  userAgent: string;
  mobileinfo: string;
  body: string;
}

const METHOD_RE = /^(GET|POST|PUT|PATCH|DELETE|HEAD)\s+(\S+)/i;

function headerValue(headers: Map<string, string>, name: string): string {
  return headers.get(name.toLowerCase()) ?? "";
}

function isHeaderName(line: string): boolean {
  return /^[A-Za-z][A-Za-z0-9-]*$/.test(line) && line.length <= 40;
}

/** 同时接受 `Name: value`，以及 Chrome 里名称、内容各占一行的复制结果。地址和请求头之间的空行会忽略。 */
function parseHeaderLines(lines: string[]): { headers: Map<string, string>; body: string } {
  const headers = new Map<string, string>();
  const pending = lines.map((line) => line.trim()).filter(Boolean);
  let body = "";

  for (let i = 0; i < pending.length; i += 1) {
    const line = pending[i];
    if (line.startsWith("{") || line.startsWith("[")) {
      body = pending.slice(i).join("\n");
      break;
    }

    const colon = line.indexOf(":");
    const keyPart = colon > 0 ? line.slice(0, colon).trim() : "";
    if (colon > 0 && isHeaderName(keyPart)) {
      headers.set(keyPart.toLowerCase(), line.slice(colon + 1).trim());
      continue;
    }

    const next = pending[i + 1];
    if (isHeaderName(line) && next && !isHeaderName(next)) {
      headers.set(line.toLowerCase(), next);
      i += 1;
    }
  }

  return { headers, body };
}

/** 从抓包原文拆出 URL、方法和会用到的请求头。不保留 Host、Content-Length 这类传输头。 */
export function parseCapture(text: string): ParsedCapture {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let url = "";
  let method: CaptureMethod | "" = "";
  const rest: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!url) {
      if (!line) continue;
      const methodMatch = line.match(METHOD_RE);
      if (methodMatch) {
        method = methodMatch[1].toUpperCase() as CaptureMethod;
        url = methodMatch[2];
        continue;
      }
      if (/^https?:\/\//i.test(line)) {
        url = line;
        continue;
      }
      continue;
    }
    rest.push(rawLine);
  }

  const { headers, body: rawBody } = parseHeaderLines(rest);

  if (!url) {
    throw new Error("没有找到 http 开头的请求地址");
  }

  const authorization = headerValue(headers, "authorization");
  let token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    const fallback = text.match(/authorization\s*:\s*bearer\s+(\S+)/i);
    if (fallback) token = fallback[1];
  }
  const cookie = headerValue(headers, "cookie");
  let headerToken = headerValue(headers, "token");
  if (!headerToken && cookie) {
    const fromCookie = cookie.match(/(?:^|;\s*)SZCRtoken=([^;]+)/i);
    if (fromCookie) headerToken = fromCookie[1];
  }
  const userAgent = headerValue(headers, "user-agent");
  const mobileinfo = headerValue(headers, "mobileinfo");
  const contentType = headerValue(headers, "content-type");
  const contentLength = headerValue(headers, "content-length");
  let body = rawBody.trim();

  if (!method) {
    const hasBodyHint = Boolean(body) || (contentLength !== "" && contentLength !== "0") || /json/i.test(contentType);
    method = hasBodyHint ? "POST" : "GET";
  }
  if (method === "GET" || method === "HEAD") {
    body = "";
  } else if (!body) {
    body = "{}";
  }

  return { url, method, token, headerToken, cookie, userAgent, mobileinfo, body };
}

export function captureKind(url: string): "vehicle" | "change" | "stock" | "unknown" {
  if (/vtravel\.link2shops\.com|ypJyActivity|goodsDetail/i.test(url)) return "stock";
  if (/widget\/info|\/rvs\/vehicle|icar\.nio\.com|app\.nio\.com/i.test(url)) return "vehicle";
  if (/gateway-front-external\.nio\.com|serviceOrder|aggr\/orders|\/otd\/car\//i.test(url)) return "change";
  return "unknown";
}

export function captureSummary(parsed: ParsedCapture): string {
  let path = parsed.url;
  try {
    const url = new URL(parsed.url);
    path = `${url.host}${url.pathname}`;
  } catch {
    path = parsed.url.split("?")[0] ?? parsed.url;
  }
  const parts = [`${parsed.method} ${path}`];
  if (parsed.token || parsed.headerToken) parts.push("已读取 Token");
  if (parsed.cookie) parts.push("已读取 Cookie");
  if (parsed.userAgent) parts.push("已读取 User-Agent");
  if (parsed.mobileinfo) parts.push("已读取 mobileinfo");
  if (parsed.method !== "GET" && parsed.method !== "HEAD") {
    parts.push(parsed.body === "{}" ? "正文 {}" : "已读取正文");
  }
  return parts.join(" · ");
}
