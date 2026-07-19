import { dayLabel, fmtClock, localDayKey } from "./date-utils";
import { isValidGps, type VehicleSnapshot } from "./vehicle";

export { fmtClock };

export interface DailyPath {
  day: string;
  label: string;
  points: VehicleSnapshot[];
  distanceKm: number;
  startTime: number;
  endTime: number;
}

const MIN_MOVE_METERS = 25;
const MIN_TIME_GAP_MS = 30 * 60 * 1000;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 去掉连续重复/微动点，保留有实际位移或长时间停放的采样 */
export function simplifyPathPoints(points: VehicleSnapshot[]): VehicleSnapshot[] {
  if (points.length <= 1) return points;

  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  const out: VehicleSnapshot[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i];
    const last = out[out.length - 1];
    const moved = haversineMeters(last.lat, last.lng, p.lat, p.lng);
    const elapsed = p.ts - last.ts;
    if (moved >= MIN_MOVE_METERS || elapsed >= MIN_TIME_GAP_MS) {
      out.push(p);
    }
  }

  return out;
}

export function pathDistanceKm(points: VehicleSnapshot[]): number {
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    meters += haversineMeters(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng,
    );
  }
  return meters / 1000;
}

export function buildDailyPaths(history: VehicleSnapshot[]): DailyPath[] {
  const byDay = new Map<string, VehicleSnapshot[]>();

  for (const point of history) {
    if (!isValidGps(point.lat, point.lng)) continue;
    const key = localDayKey(point.ts);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(point);
    else byDay.set(key, [point]);
  }

  const paths: DailyPath[] = [];

  for (const [day, rawPoints] of byDay) {
    const sorted = [...rawPoints].sort((a, b) => a.ts - b.ts);
    const points = simplifyPathPoints(sorted);
    paths.push({
      day,
      label: dayLabel(day),
      points,
      distanceKm: pathDistanceKm(points),
      startTime: sorted[0].ts,
      endTime: sorted[sorted.length - 1].ts,
    });
  }

  return paths.sort((a, b) => b.day.localeCompare(a.day));
}

export { localDayKey };
