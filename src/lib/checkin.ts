export interface CheckinData {
  checked_in: boolean;
  continuous_days: number;
  server_time?: number;
  request_id?: string | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function parseCheckedIn(v: unknown): boolean | undefined {
  if (v === true || v === 1 || v === "1" || v === "true") return true;
  if (v === false || v === 0 || v === "0" || v === "false") return false;
  if (typeof v === "boolean") return v;
  return undefined;
}

function parseDays(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** 从签到 API 响应中提取 checked_in / continuous_days（兼容多层嵌套） */
export function extractCheckinFields(raw: unknown): Pick<CheckinData, "checked_in" | "continuous_days"> | null {
  if (!isRecord(raw)) return null;

  let checkedIn: boolean | undefined;
  let days: number | undefined;

  const visit = (obj: unknown, depth = 0) => {
    if (!isRecord(obj) || depth > 8) return;
    if (checkedIn === undefined) {
      const direct = parseCheckedIn(obj.checked_in ?? obj.checkedIn);
      if (direct !== undefined) checkedIn = direct;
      if (isRecord(obj.checked_in)) {
        const legacy = parseCheckedIn(obj.checked_in.checked);
        if (legacy !== undefined) checkedIn = legacy;
        const legacyDays = parseDays(obj.checked_in.days);
        if (legacyDays !== undefined) days = legacyDays;
      }
    }
    if (days === undefined) {
      const d = parseDays(obj.continuous_days ?? obj.continuousDays ?? obj.days);
      if (d !== undefined) days = d;
    }
    if (checkedIn !== undefined && days !== undefined) return;
    for (const value of Object.values(obj)) {
      visit(value, depth + 1);
      if (checkedIn !== undefined && days !== undefined) return;
    }
  };

  visit(raw);
  if (checkedIn === undefined && days === undefined) return null;

  return {
    checked_in: checkedIn ?? false,
    continuous_days: days ?? 0,
  };
}

export function normalizeCheckinData(raw: unknown): CheckinData | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  const extracted =
    record.checked_in !== undefined || record.continuous_days !== undefined
      ? {
          checked_in: parseCheckedIn(record.checked_in) ?? false,
          continuous_days: parseDays(record.continuous_days) ?? 0,
        }
      : extractCheckinFields(raw);

  if (!extracted) return null;

  return {
    checked_in: extracted.checked_in,
    continuous_days: extracted.continuous_days,
    server_time: typeof record.server_time === "number" ? record.server_time : undefined,
    request_id: typeof record.request_id === "string" ? record.request_id : null,
  };
}
