/** GCJ-02（火星坐标）→ WGS-84，供 OpenStreetMap / Nominatim 使用 */

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.006693421622965943;

function transformLat(lng: number, lat: number): number {
  let ret =
    -100.0 +
    2.0 * lng +
    3.0 * lat +
    0.2 * lat * lat +
    0.1 * lng * lat +
    0.2 * Math.sqrt(Math.abs(lng));
  ret += ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(lat * PI) + 40.0 * Math.sin((lat / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((lat / 12.0) * PI) + 320 * Math.sin((lat * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(lng: number, lat: number): number {
  let ret =
    300.0 +
    lng +
    2.0 * lat +
    0.1 * lng * lng +
    0.1 * lng * lat +
    0.1 * Math.sqrt(Math.abs(lng));
  ret += ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(lng * PI) + 40.0 * Math.sin((lng / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((lng / 12.0) * PI) + 300.0 * Math.sin((lng / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

/** 蔚来 API 坐标一般为 GCJ-02；转为 WGS-84 后用于 OSM 地图与逆地理编码 */
export function gcj02ToWgs84(lng: number, lat: number): { lat: number; lng: number } {
  const dLat = transformLat(lng - 105.0, lat - 35.0);
  const dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const adjLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  const adjLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return {
    lat: Math.round((lat - adjLat) * 1e6) / 1e6,
    lng: Math.round((lng - adjLng) * 1e6) / 1e6,
  };
}

/** 在中国境外坐标几乎不变；简单用经纬度范围判断是否转换 */
export function mapCoordsFromGcj02(lat: number, lng: number): { lat: number; lng: number } {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lat, lng };
  if (lng < 72 || lng > 138 || lat < 0.8 || lat > 56) return { lat, lng };
  return gcj02ToWgs84(lng, lat);
}

/** WGS-84 → GCJ-02，供高德底图显示已存 WGS 轨迹时使用 */
export function wgs84ToGcj02(lng: number, lat: number): { lat: number; lng: number } {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lat, lng };
  if (lng < 72 || lng > 138 || lat < 0.8 || lat > 56) return { lat, lng };

  let gLng = lng;
  let gLat = lat;
  for (let i = 0; i < 2; i++) {
    const wgs = gcj02ToWgs84(gLng, gLat);
    gLng = lng + (gLng - wgs.lng);
    gLat = lat + (gLat - wgs.lat);
  }
  return {
    lat: Math.round(gLat * 1e6) / 1e6,
    lng: Math.round(gLng * 1e6) / 1e6,
  };
}

export function mapCoordsForProvider(
  lat: number,
  lng: number,
  provider: "osm" | "amap",
): { lat: number; lng: number } {
  if (provider === "amap") {
    return wgs84ToGcj02(lng, lat);
  }
  return mapCoordsFromGcj02(lat, lng);
}
