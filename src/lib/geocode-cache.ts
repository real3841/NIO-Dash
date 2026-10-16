import { mapCoordsFromGcj02 } from "./gcj02";

const CACHE_KEY = "nio_geocode_cache_v1";
const MAX_ENTRIES = 200;
/** 约 100m 网格，减少重复请求 */
const GRID_SCALE = 1000;

interface CacheEntry {
  address: string;
  at: number;
}

function gridKey(lat: number, lng: number): string {
  return `${Math.round(lat * GRID_SCALE)}:${Math.round(lng * GRID_SCALE)}`;
}

function readCache(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, CacheEntry>) : {};
  } catch {
    return {};
  }
}

function writeCache(data: Record<string, CacheEntry>): void {
  const keys = Object.keys(data);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => data[a].at - data[b].at)
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete data[k]);
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

export function getCachedGeocode(lat: number, lng: number): string | null {
  const key = gridKey(lat, lng);
  return readCache()[key]?.address ?? null;
}

export function setCachedGeocode(lat: number, lng: number, address: string): void {
  const cache = readCache();
  cache[gridKey(lat, lng)] = { address, at: Date.now() };
  writeCache(cache);
}

async function reverseViaServer(lat: number, lng: number): Promise<string | null> {
  const res = await fetch(
    `/api/geocode/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { ok?: boolean; address?: string };
  if (!json.ok || !json.address) return null;
  return json.address;
}

async function reverseViaNominatim(lat: number, lng: number): Promise<string | null> {
  const wgs = mapCoordsFromGcj02(lat, lng);
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${wgs.lat}&lon=${wgs.lng}&accept-language=zh`,
    { headers: { "User-Agent": "NioVehicleDashboard/1.7" } },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { display_name?: string };
  return json.display_name?.split(",").slice(0, 2).join("，") ?? null;
}

/** lat/lng 为蔚来 API 原始 GCJ-02 坐标 */
export async function reverseGeocodeCached(lat: number, lng: number): Promise<string | null> {
  const cached = getCachedGeocode(lat, lng);
  if (cached) return cached;

  try {
    const fromServer = await reverseViaServer(lat, lng);
    if (fromServer) {
      setCachedGeocode(lat, lng, fromServer);
      return fromServer;
    }
  } catch {
    /* 无本地 API 服务时回退 OSM */
  }

  try {
    const address = await reverseViaNominatim(lat, lng);
    if (address) setCachedGeocode(lat, lng, address);
    return address;
  } catch {
    return null;
  }
}
