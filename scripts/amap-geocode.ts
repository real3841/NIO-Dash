/** 高德 Web 服务 · 逆地理编码 */

export async function amapReverseGeocode(
  lng: number,
  lat: number,
  key: string,
): Promise<string | null> {
  const url = new URL("https://restapi.amap.com/v3/geocode/regeo");
  url.searchParams.set("key", key);
  url.searchParams.set("location", `${lng.toFixed(6)},${lat.toFixed(6)}`);
  url.searchParams.set("extensions", "base");
  url.searchParams.set("output", "json");

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const json = (await res.json()) as {
    status?: string;
    regeocode?: { formatted_address?: string };
  };

  if (json.status !== "1") return null;
  const address = json.regeocode?.formatted_address?.trim();
  return address || null;
}

export function isAmapGeocodeConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.NIO_AMAP_WEB_SERVICE_KEY?.trim());
}

export function isAmapMapConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.NIO_AMAP_JS_KEY?.trim());
}
