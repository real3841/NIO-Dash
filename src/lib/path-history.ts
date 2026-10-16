import { dayLabel, fmtClock, localDayKey } from "./date-utils";
import { mapCoordsFromGcj02 } from "./gcj02";
import { isDrivingVehicleState } from "./poll-schedule";
import type { JourneyHistoryItem } from "./trip";
import { isValidGps, type VehicleSnapshot } from "./vehicle";

export { fmtClock };

/** 行程接口的起终点转成路径采样点：前后各加一个驻车点，让每段行程单独成段 */
export function journeySnapshots(journeys: JourneyHistoryItem[]): VehicleSnapshot[] {
  const base = { soc: 0, range: 0, actualRange: 0, mileage: 0, insideTemp: 0, outsideTemp: 0 };
  const out: VehicleSnapshot[] = [];
  for (const j of journeys) {
    const start = mapCoordsFromGcj02(j.start.lat, j.start.lng);
    const end = mapCoordsFromGcj02(j.end.lat, j.end.lng);
    out.push(
      { ...base, ts: j.start_time - 1, lat: start.lat, lng: start.lng, vehicleState: 2 },
      { ...base, ts: j.start_time, lat: start.lat, lng: start.lng, vehicleState: 1 },
      { ...base, ts: j.end_time, lat: end.lat, lng: end.lng, vehicleState: 1 },
      { ...base, ts: j.end_time + 1, lat: end.lat, lng: end.lng, vehicleState: 2 },
    );
  }
  return out;
}

export interface DrivingTrip {
  /** 1-based：第一段、第二段… */
  index: number;
  points: VehicleSnapshot[];
  startTime: number;
  endTime: number;
  distanceKm: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  /** 是否由 vehicle_state 分段（否则为位移推断） */
  fromVehicleState: boolean;
}

export interface DailyPath {
  day: string;
  label: string;
  points: VehicleSnapshot[];
  trips: DrivingTrip[];
  distanceKm: number;
  startTime: number;
  endTime: number;
}

const MIN_MOVE_METERS = 25;
const MIN_TIME_GAP_MS = 30 * 60 * 1000;
const MIN_TRIP_DISTANCE_KM = 0.08;
const LEGACY_CLUSTER_MOVE_M = 80;

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

export function formatCoordLabel(lat: number, lng: number): string {
  return `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`;
}

function finalizeTrip(
  rawPoints: VehicleSnapshot[],
  index: number,
  fromVehicleState: boolean,
): DrivingTrip | null {
  const points = simplifyPathPoints(rawPoints.filter((p) => isValidGps(p.lat, p.lng)));
  if (points.length === 0) return null;
  const distanceKm = pathDistanceKm(points);
  if (distanceKm < MIN_TRIP_DISTANCE_KM && points.length < 2) return null;

  const first = points[0];
  const last = points[points.length - 1];
  return {
    index,
    points,
    startTime: first.ts,
    endTime: last.ts,
    distanceKm,
    startLat: first.lat,
    startLng: first.lng,
    endLat: last.lat,
    endLng: last.lng,
    fromVehicleState,
  };
}

/** 旧历史无 vehicle_state：按连续位移聚类为行程 */
function buildTripsFromMovement(sorted: VehicleSnapshot[]): DrivingTrip[] {
  const valid = sorted.filter((p) => isValidGps(p.lat, p.lng));
  const clusters: VehicleSnapshot[][] = [];
  let current: VehicleSnapshot[] = [];

  for (let i = 0; i < valid.length; i++) {
    const p = valid[i];
    if (current.length === 0) {
      current.push(p);
      continue;
    }
    const last = current[current.length - 1];
    const moved = haversineMeters(last.lat, last.lng, p.lat, p.lng);
    const elapsed = p.ts - last.ts;

    if (moved >= LEGACY_CLUSTER_MOVE_M && elapsed < MIN_TIME_GAP_MS) {
      current.push(p);
      continue;
    }

    if (current.length >= 2 && pathDistanceKm(current) >= MIN_TRIP_DISTANCE_KM) {
      clusters.push(current);
    }
    current = moved >= MIN_MOVE_METERS ? [p] : [];
  }

  if (current.length >= 2 && pathDistanceKm(current) >= MIN_TRIP_DISTANCE_KM) {
    clusters.push(current);
  }

  return clusters
    .map((points, i) => finalizeTrip(points, i + 1, false))
    .filter((trip): trip is DrivingTrip => trip !== null);
}

/** 按 vehicle_state===1 连续区间切分行程 */
export function buildDrivingTrips(sorted: VehicleSnapshot[]): DrivingTrip[] {
  const valid = sorted.filter((p) => isValidGps(p.lat, p.lng));
  const hasVehicleState = valid.some((p) => p.vehicleState !== undefined);
  if (!hasVehicleState) {
    return buildTripsFromMovement(valid);
  }

  const chunks: VehicleSnapshot[][] = [];
  let current: VehicleSnapshot[] = [];

  for (const p of valid) {
    const driving =
      p.vehicleState !== undefined
        ? isDrivingVehicleState(p.vehicleState)
        : false;

    if (driving) {
      current.push(p);
      continue;
    }

    if (current.length > 0) {
      chunks.push(current);
      current = [];
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks
    .map((points, i) => finalizeTrip(points, i + 1, true))
    .filter((trip): trip is DrivingTrip => trip !== null);
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
    const trips = buildDrivingTrips(sorted);
    const points = trips.flatMap((trip) => trip.points);
    const distanceKm = trips.reduce((sum, trip) => sum + trip.distanceKm, 0);
    paths.push({
      day,
      label: dayLabel(day),
      points,
      trips,
      distanceKm,
      startTime: sorted[0]?.ts ?? 0,
      endTime: sorted[sorted.length - 1]?.ts ?? 0,
    });
  }

  return paths.sort((a, b) => b.day.localeCompare(a.day));
}

export { localDayKey };
