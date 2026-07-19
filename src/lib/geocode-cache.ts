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

export async function reverseGeocodeCached(lat: number, lng: number): Promise<string | null> {
  const cached = getCachedGeocode(lat, lng);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=zh`,
      { headers: { "User-Agent": "NioVehicleDashboard/1.4" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { display_name?: string };
    const address = json.display_name?.split(",").slice(0, 2).join("，") ?? null;
    if (address) setCachedGeocode(lat, lng, address);
    return address;
  } catch {
    return null;
  }
}
