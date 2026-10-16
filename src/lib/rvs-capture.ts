/** 抓包 URL 解析与 field 完整性检查（移植自 ha-nio capture.py） */

const VEHICLE_ID_RE = /\/vehicle\/([^/?#]+)\/status/;
const WIDGET_URL_RE = /\/widget\/info/i;
const APP_VER_RE = /(?:^|&)app_ver=([^&]+)/;
const FIELD_RE = /(?:^|&)field=([^&]+)/g;

/** status 查询应包含的 field= 段；缺失会导致对应卡片无数据（仅 RVS status 接口） */
export const CRITICAL_RVS_FIELDS = [
  { field: "exterior", label: "行驶/泊车" },
  { field: "soc", label: "电池" },
  { field: "door", label: "车门" },
  { field: "window", label: "车窗" },
  { field: "hvac", label: "温度/空调" },
  { field: "fota", label: "软件版本" },
  { field: "position", label: "GPS 位置" },
] as const;

export function isWidgetVehicleUrl(raw: string): boolean {
  const text = (raw || "").trim();
  return WIDGET_URL_RE.test(text) || /(?:^|[?&])widget_functions=/.test(text);
}

export function queryStringFromCapture(raw: string): string {
  const text = (raw || "").trim();
  const qIndex = text.indexOf("?");
  if (qIndex < 0) return "";
  return text.slice(qIndex + 1).split(/[\s#]/, 1)[0]?.trim() ?? "";
}

export function widgetFunctionsFromCapture(raw: string): string[] {
  const query = queryStringFromCapture(raw);
  if (!query) return [];
  const params = new URLSearchParams(query);
  const wf = params.get("widget_functions");
  if (!wf) return [];
  return wf
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface ParsedCapture {
  vehicleId: string;
  query: string;
}

export function parseStatusCapture(raw: string): ParsedCapture {
  const text = (raw || "").trim().replace(/^["']|["']$/g, "");
  if (!text) throw new Error("抓包内容为空");

  const vidMatch = VEHICLE_ID_RE.exec(text);
  if (!vidMatch) throw new Error("未找到 /vehicle/<id>/status 路径");

  const qIndex = text.indexOf("?");
  if (qIndex < 0) throw new Error("URL 缺少 query（? 之后的内容）");

  let query = text.slice(qIndex + 1);
  query = query.split(/[\s#]/, 1)[0]?.trim() ?? "";
  if (!query) throw new Error("query 为空");
  if (!query.includes("sign=") || !query.includes("timestamp=")) {
    throw new Error("query 缺少 sign 或 timestamp，不是有效的 signed 请求");
  }

  return { vehicleId: vidMatch[1], query };
}

export function queryFieldsFromCapture(raw: string): Set<string> {
  const fields = new Set<string>();
  let text = raw;
  try {
    text = parseStatusCapture(raw).query;
  } catch {
    const qIndex = raw.indexOf("?");
    text = qIndex >= 0 ? raw.slice(qIndex + 1) : raw;
  }
  for (const m of text.matchAll(FIELD_RE)) {
    if (m[1]) fields.add(m[1]);
  }
  return fields;
}

export function missingCriticalFields(raw: string): string[] {
  if (isWidgetVehicleUrl(raw)) return [];
  const present = queryFieldsFromCapture(raw);
  return CRITICAL_RVS_FIELDS.filter(({ field }) => !present.has(field)).map(({ label }) => label);
}

export function captureFieldSummary(raw: string): string {
  if (isWidgetVehicleUrl(raw)) {
    const fns = widgetFunctionsFromCapture(raw);
    return fns.length > 0 ? `widget_functions: ${fns.join(", ")}` : "（Widget 接口）";
  }
  const fields = [...queryFieldsFromCapture(raw)].sort();
  return fields.length > 0 ? fields.join(", ") : "（未解析到 field=）";
}

export function appVerFromQuery(raw: string): string | null {
  let query = raw;
  try {
    query = parseStatusCapture(raw).query;
  } catch {
    const qIndex = raw.indexOf("?");
    query = qIndex >= 0 ? raw.slice(qIndex + 1) : raw;
  }
  const m = APP_VER_RE.exec(query);
  return m?.[1] ?? null;
}
