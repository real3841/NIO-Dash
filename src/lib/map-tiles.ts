export type MapTileProvider = "osm" | "amap";

export interface MapTileConfig {
  provider: MapTileProvider;
  url: string;
  attribution: string;
  subdomains?: string[];
  maxZoom: number;
}

export function mapTileFromEnv(map: {
  NIO_AMAP_JS_KEY?: string;
}): MapTileConfig {
  if (map.NIO_AMAP_JS_KEY?.trim()) {
    return {
      provider: "amap",
      url: "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}",
      attribution: '&copy; <a href="https://www.amap.com/">高德地图</a>',
      subdomains: ["1", "2", "3", "4"],
      maxZoom: 18,
    };
  }

  return {
    provider: "osm",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    subdomains: ["a", "b", "c"],
    maxZoom: 19,
  };
}
