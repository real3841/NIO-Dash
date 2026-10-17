import { config as loadEnv } from "dotenv";
import { authSlotById, authSlotMatchesUrl } from "../src/lib/auth-slots.js";
import { getEnvFilePath, parseEnvFile, readEnvFileRaw, saveEnvSection } from "./env-file.js";
import { importPowerFromEntries, type CapturedEntry } from "./power-home.js";

export interface QuickAuthResult {
  ok: boolean;
  tokenUpdated: boolean;
  updated: string[];
  power: string | null;
  warnings: string[];
}

interface HarLike {
  log?: {
    entries?: Array<{
      startedDateTime?: string;
      request?: { url?: string; method?: string; headers?: Array<{ name?: string; value?: string }> };
      response?: { status?: number; content?: { text?: string; encoding?: string } };
    }>;
  };
}

interface Candidate {
  url: string;
  startedAt: number;
  responseText: string;
}

const TOKEN_KEYS = ["NIO_VEHICLE_ACCESS_TOKEN", "NIO_CHANGE_ACCESS_TOKEN", "NIO_VEHICLE_EXTRA_TOKEN"] as const;

const URL_TARGETS: Array<{ key: string; label: string; match: (pathname: string) => boolean }> = [
  { key: "NIO_VEHICLE_API_URL", label: "车况 widget", match: (p) => p.endsWith("/icar/v2/widget/info") },
  { key: "NIO_VEHICLE_STATUS_URL", label: "车况整包", match: (p) => /\/rvs\/vehicle\/[^/]+\/status$/.test(p) },
  { key: "NIO_JOURNEY_API_URL", label: "最近行程", match: (p) => p.endsWith("/vehicle/journey_merge/status") },
  { key: "NIO_DAILY_API_URL", label: "当日里程", match: (p) => p.endsWith("/vehicle/journeys/daily_data") },
];

const CHANGE_PAGING_KEYS = ["offset", "limit", "lastCursorCreateTime", "lastCursorId"];

function bareToken(raw: string): string | null {
  const token = raw.trim().replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "");
  return /^[A-Za-z0-9._~+/-]{20,}={0,2}$/.test(token) ? token : null;
}

function tokenFromText(text: string): string | null {
  const header = text.match(/authorization\s*[:\n]\s*(?:Bearer\s+)?([A-Za-z0-9._~+/-]{20,}={0,2})/i);
  if (header) return header[1];
  const bearer = text.match(/Bearer\s+([A-Za-z0-9._~+/-]{20,}={0,2})/);
  if (bearer) return bearer[1];
  const single = text.trim();
  return /\s/.test(single) ? null : bareToken(single);
}

function urlTimestamp(url: string | undefined): number {
  if (!url) return 0;
  try {
    const raw = Number(new URL(url).searchParams.get("timestamp"));
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return raw < 10_000_000_000 ? raw * 1000 : raw;
  } catch {
    return 0;
  }
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function decodeHarText(content: { text?: string; encoding?: string } | undefined): string {
  if (!content?.text) return "";
  if (content.encoding === "base64") {
    try {
      return Buffer.from(content.text, "base64").toString("utf8");
    } catch {
      return "";
    }
  }
  return content.text;
}

/** 同一路径抓到多条时：车况整包优先要带轮胎的完整响应，其余取最新 */
function pickCandidate(key: string, list: Candidate[]): Candidate | undefined {
  if (list.length === 0) return undefined;
  if (key === "NIO_VEHICLE_STATUS_URL") {
    const withTyre = list.filter((c) => c.responseText.includes("tyre_status"));
    const pool = withTyre.length > 0 ? withTyre : list;
    return [...pool].sort((a, b) => b.responseText.length - a.responseText.length || b.startedAt - a.startedAt)[0];
  }
  return [...list].sort((a, b) => b.startedAt - a.startedAt)[0];
}

function changeBaseUrl(url: string): string {
  const u = new URL(url);
  for (const key of CHANGE_PAGING_KEYS) u.searchParams.delete(key);
  return u.toString();
}

/**
 * 粘贴 Bearer Token / 任意一条抓包原文 / ProxyPin 导出的整个 HAR。
 * Token 同时写给车况、换电、补充接口；HAR 里带 sign 的地址比现有的新时才替换。
 */
export function applyQuickAuth(input: string): QuickAuthResult {
  const text = input.trim();
  const warnings: string[] = [];
  const updated: string[] = [];
  const updates: Record<string, string> = {};
  const current = parseEnvFile(readEnvFileRaw());

  let token: string | null = null;
  const candidates = new Map<string, Candidate[]>();
  let changeUrl: string | null = null;
  const entries: CapturedEntry[] = [];

  let har: HarLike | null = null;
  if (text.startsWith("{")) {
    try {
      har = JSON.parse(text) as HarLike;
    } catch {
      har = null;
    }
  }

  if (har?.log?.entries) {
    const tokenTimes = new Map<string, number>();
    for (const e of har.log.entries) {
      const url = e.request?.url ?? "";
      if (!/^https:\/\/[^/]*nio\.com\//.test(url)) continue;
      const startedAt = Date.parse(e.startedDateTime ?? "") || 0;
      const auth = e.request?.headers?.find((h) => h.name?.toLowerCase() === "authorization")?.value;
      const t = auth ? bareToken(auth) : null;
      if (t) tokenTimes.set(t, Math.max(tokenTimes.get(t) ?? 0, startedAt));
      const responseText = decodeHarText(e.response?.content);
      entries.push({
        url,
        method: e.request?.method ?? "GET",
        status: e.response?.status ?? 0,
        startedAt,
        responseText,
      });
      const pathname = pathnameOf(url);
      for (const target of URL_TARGETS) {
        if (e.request?.method === "GET" && e.response?.status === 200 && target.match(pathname)) {
          const list = candidates.get(target.key) ?? [];
          list.push({ url, startedAt, responseText });
          candidates.set(target.key, list);
        }
      }
      if (pathname.endsWith("/serviceOrder/getTabOrder") && e.request?.method === "POST") changeUrl = url;
    }
    token = [...tokenTimes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  } else {
    token = tokenFromText(text);
    for (const match of text.matchAll(/https:\/\/[^\s"'<>]+/g)) {
      const url = match[0];
      const pathname = pathnameOf(url);
      for (const target of URL_TARGETS) {
        if (target.match(pathname)) {
          candidates.set(target.key, [{ url, startedAt: urlTimestamp(url), responseText: "" }]);
        }
      }
      if (pathname.endsWith("/serviceOrder/getTabOrder")) changeUrl = url;
    }
  }

  if (token) {
    for (const key of TOKEN_KEYS) updates[key] = token;
    if (current.NIO_CHECKIN_ACCESS_TOKEN?.trim()) updates.NIO_CHECKIN_ACCESS_TOKEN = token;
  } else {
    warnings.push("没有找到 Bearer Token，Token 未更新");
  }

  for (const target of URL_TARGETS) {
    const picked = pickCandidate(target.key, candidates.get(target.key) ?? []);
    if (!picked) continue;
    if (urlTimestamp(picked.url) < urlTimestamp(current[target.key])) {
      warnings.push(`${target.label}：抓包比现有地址旧，保留现有地址`);
      continue;
    }
    updates[target.key] = picked.url;
    updated.push(target.label);
  }

  if (changeUrl) {
    updates.NIO_CHANGE_API_URL = changeBaseUrl(changeUrl);
    updates.NIO_CHANGE_API_MODE = "cursor";
    updated.push("换电订单列表");
  } else if (current.NIO_CHANGE_API_MODE === "raw" && current.NIO_CHANGE_API_URL?.includes("/aggr/orders")) {
    updates.NIO_CHANGE_API_URL = "";
    updates.NIO_CHANGE_API_MODE = "cursor";
    updated.push("换电订单改为翻到底");
  }

  if (Object.keys(updates).length > 0) {
    saveEnvSection(updates);
    loadEnv({ path: getEnvFilePath(), override: true });
  }

  const power = entries.length > 0 ? importPowerFromEntries(entries) : null;

  if (/\btimestamp\b/i.test(text) && !har && candidates.size === 0 && !changeUrl) {
    warnings.push("单独的时间戳用不上：sign 按每条接口单独计算，需要整条 URL；Token 已足够刷新车况和换电");
  }

  return {
    ok: Boolean(token) || updated.length > 0 || Boolean(power),
    tokenUpdated: Boolean(token),
    updated,
    power,
    warnings,
  };
}

function firstUrl(text: string): string {
  return text.match(/https:\/\/[^\s"'<>]+/)?.[0] ?? "";
}

/** 选中一条接口后，上面贴它的完整地址，下面贴 Bearer。Token 仍写入车况、换电和补充接口。 */
export function applySlotAuth(input: { slot?: string; url?: string; token?: string }): QuickAuthResult {
  const slot = authSlotById(input.slot);
  const warnings: string[] = [];
  if (!slot) {
    return { ok: false, tokenUpdated: false, updated: [], power: null, warnings: ["请先选中要更新的接口"] };
  }

  const urlText = input.url?.trim() ?? "";
  const tokenText = input.token?.trim() ?? "";
  const token = tokenFromText(tokenText) || tokenFromText(urlText);
  const url = firstUrl(urlText);
  const updates: Record<string, string> = {};
  const updated: string[] = [];

  if (token) {
    const current = parseEnvFile(readEnvFileRaw());
    for (const key of TOKEN_KEYS) updates[key] = token;
    if (current.NIO_CHECKIN_ACCESS_TOKEN?.trim()) updates.NIO_CHECKIN_ACCESS_TOKEN = token;
  }

  if (url) {
    if (!authSlotMatchesUrl(slot, url)) {
      warnings.push(`这不是${slot.label}的地址。上面要找的是 ${slot.method} ${slot.address}`);
    } else {
      updates[slot.envKey] = slot.id === "change" ? changeBaseUrl(url) : url;
      if (slot.id === "change") updates.NIO_CHANGE_API_MODE = "cursor";
      updated.push(slot.label);
    }
  }

  if (!token && updated.length === 0) {
    warnings.push(
      slot.needsUrl
        ? "完整地址贴在上面，Bearer Token 贴在下面"
        : "这条只需要把 Bearer Token 贴在下面",
    );
    return { ok: false, tokenUpdated: false, updated: [], power: null, warnings };
  }

  if (slot.needsUrl && !url && token) {
    warnings.push(`${slot.label}如果是签名失效，还要把这条的完整地址贴在上面`);
  }

  if (Object.keys(updates).length > 0) {
    saveEnvSection(updates);
    loadEnv({ path: getEnvFilePath(), override: true });
  }

  return { ok: true, tokenUpdated: Boolean(token), updated, power: null, warnings };
}
