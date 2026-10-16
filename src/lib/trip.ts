export interface TripLocation {
  poi?: string;
  city?: string;
  district?: string;
  road_name?: string;
}

export interface RecentJourney {
  start_time?: number;
  end_time?: number;
  avg_speed?: number;
  max_speed?: number;
  trip_odometer?: number;
  journey_duration_by_minutes?: number;
  rapid_acceleration?: number;
  rapid_deceleration?: number;
  rapid_swerve?: number;
  start_location?: TripLocation;
  end_location?: TripLocation;
}

export interface JourneyFile {
  ok: boolean;
  at: number;
  error: string | null;
  month?: string;
  journey?: RecentJourney | null;
}

export interface DailyFile {
  ok: boolean;
  at: number;
  error: string | null;
  daily_mileage?: number;
  mileage?: number;
  activate_days?: number;
}

export interface JourneyHistoryItem {
  trip_id: string;
  /** 毫秒 */
  start_time: number;
  end_time: number;
  trip_odometer?: number;
  /** 行程接口的 POI 坐标，GCJ-02 */
  start: { lat: number; lng: number; label?: string };
  end: { lat: number; lng: number; label?: string };
}

/** YYYY-MM-DD → 当天最后一次 daily_data */
export type DailyHistory = Record<string, { daily_mileage: number; mileage?: number; at: number }>;

export function isJourneyFile(raw: unknown): raw is JourneyFile {
  return Boolean(raw) && typeof raw === "object" && typeof (raw as JourneyFile).at === "number";
}

export function isDailyFile(raw: unknown): raw is DailyFile {
  return Boolean(raw) && typeof raw === "object" && typeof (raw as DailyFile).at === "number";
}

/** 行程接口的时间是秒，车况采样是毫秒。 */
export function tripTimeMs(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value < 10_000_000_000 ? value * 1000 : value;
}

export function placeLabel(loc: TripLocation | undefined): string {
  if (!loc) return "—";
  const parts = [loc.poi, loc.district, loc.road_name].filter((part) => Boolean(part));
  return parts.join(" · ") || loc.city || "—";
}
