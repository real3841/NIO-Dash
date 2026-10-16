import { Fragment, useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import {
  buildDailyPaths,
  fmtClock,
  formatCoordLabel,
  journeySnapshots,
  localDayKey,
  type DrivingTrip,
} from "../lib/path-history";
import type { JourneyHistoryItem } from "../lib/trip";
import { PATH_DRAWER_KEY, saveDrawerOpen } from "../lib/drawer-state";
import { fetchEnvConfig } from "../lib/env-config";
import { wgs84ToGcj02 } from "../lib/gcj02";
import { mapTileFromEnv, type MapTileConfig } from "../lib/map-tiles";
import { isValidGps, type VehicleSnapshot } from "../lib/vehicle";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const TRIP_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];

interface PathMapLeafletProps {
  activeDay: string | null;
  tileConfig: MapTileConfig;
  mapCenter: [number, number];
  focusPositions: [number, number][];
  allTrips: DrivingTrip[];
  highlightedTripIndex: number | null;
  showCurrent: boolean;
  current?: { lat: number; lng: number; ts: number } | null;
  open: boolean;
}

function MapLayout({ positions, enabled }: { positions: [number, number][]; enabled: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;

    const layout = () => {
      map.invalidateSize({ animate: false });
      if (positions.length === 0) return;
      if (positions.length === 1) {
        map.setView(positions[0], 15);
        return;
      }
      map.fitBounds(L.latLngBounds(positions), { padding: [28, 28], maxZoom: 16 });
    };

    layout();
    const raf = requestAnimationFrame(layout);
    const t1 = window.setTimeout(layout, 120);
    const t2 = window.setTimeout(layout, 400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [map, enabled, positions]);

  return null;
}

function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function segmentMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

interface PathArrow {
  lat: number;
  lng: number;
  bearing: number;
}

function buildPathArrows(positions: [number, number][], maxArrows = 12): PathArrow[] {
  if (positions.length < 2) return [];

  const segmentCount = positions.length - 1;
  const step = Math.max(1, Math.ceil(segmentCount / maxArrows));
  const arrows: PathArrow[] = [];

  for (let i = 0; i < segmentCount; i += step) {
    const [lat1, lng1] = positions[i];
    const [lat2, lng2] = positions[i + 1];
    if (segmentMeters(lat1, lng1, lat2, lng2) < 8) continue;
    arrows.push({
      lat: (lat1 + lat2) / 2,
      lng: (lng1 + lng2) / 2,
      bearing: bearingDeg(lat1, lng1, lat2, lng2),
    });
  }

  if (arrows.length === 0 && segmentCount > 0) {
    const [lat1, lng1] = positions[0];
    const [lat2, lng2] = positions[1];
    arrows.push({
      lat: (lat1 + lat2) / 2,
      lng: (lng1 + lng2) / 2,
      bearing: bearingDeg(lat1, lng1, lat2, lng2),
    });
  }

  return arrows;
}

function createArrowIcon(bearing: number, color: string): L.DivIcon {
  return L.divIcon({
    className: "path-arrow-icon",
    html: `<svg class="path-arrow-svg" width="22" height="22" viewBox="0 0 22 22" style="transform: rotate(${bearing}deg)" aria-hidden="true"><path d="M11 3 L18 17 L11 13 L4 17 Z" fill="${color}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function PathMapLeaflet({
  activeDay,
  tileConfig,
  mapCenter,
  focusPositions,
  allTrips,
  highlightedTripIndex,
  showCurrent,
  current,
  open,
}: PathMapLeafletProps) {
  return (
    <div className="map-wrap path-map-wrap">
      <MapContainer
        key={`${activeDay ?? "map"}-${tileConfig.provider}`}
        center={mapCenter}
        zoom={14}
        scrollWheelZoom
        className="map path-map"
      >
        <TileLayer
          attribution={tileConfig.attribution}
          url={tileConfig.url}
          maxZoom={tileConfig.maxZoom}
          subdomains={tileConfig.subdomains}
        />
        <MapLayout positions={focusPositions} enabled={open} />
        {allTrips.map((trip, tripIdx) => {
          const color = TRIP_COLORS[tripIdx % TRIP_COLORS.length];
          const highlighted = trip.index === highlightedTripIndex;
          const positions = tripPositions(trip, tileConfig.provider);
          const arrows = highlighted ? buildPathArrows(positions) : [];
          return (
            <Fragment key={`trip-layer-${trip.index}`}>
              {positions.length >= 2 && (
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color,
                    weight: highlighted ? 6 : 3,
                    opacity: highlighted ? 0.95 : 0.28,
                  }}
                />
              )}
              {arrows.map((arrow, i) => (
                <Marker
                  key={`arrow-${trip.index}-${i}`}
                  position={[arrow.lat, arrow.lng]}
                  icon={createArrowIcon(arrow.bearing, color)}
                  interactive={false}
                />
              ))}
              {highlighted &&
                trip.points.map((p, i) => {
                  const [lat, lng] = toMapCoords(p.lat, p.lng, tileConfig.provider);
                  const isStart = i === 0;
                  const isEnd = i === trip.points.length - 1;
                  const markerColor = isStart ? "#16a34a" : isEnd ? "#dc2626" : color;
                  const radius = isStart || isEnd ? 7 : 4;
                  return (
                    <CircleMarker
                      key={`${trip.index}-${p.ts}-${i}`}
                      center={[lat, lng]}
                      radius={radius}
                      pathOptions={{
                        color: markerColor,
                        fillColor: markerColor,
                        fillOpacity: 0.9,
                        weight: 2,
                      }}
                    >
                      <Tooltip direction="top" offset={[0, -4]}>
                        第 {trip.index} 段 · {isStart ? "起点" : isEnd ? "终点" : "途经"} · {fmtClock(p.ts)}
                      </Tooltip>
                    </CircleMarker>
                  );
                })}
            </Fragment>
          );
        })}
        {showCurrent && current && (
          <CircleMarker
            center={toMapCoords(current.lat, current.lng, tileConfig.provider)}
            radius={9}
            pathOptions={{ color: "#7c3aed", fillColor: "#7c3aed", fillOpacity: 0.35, weight: 3 }}
          >
            <Tooltip direction="top">当前位置</Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}

interface DailyPathMapProps {
  history: VehicleSnapshot[];
  journeys?: JourneyHistoryItem[];
  current?: { lat: number; lng: number; ts: number } | null;
}

function formatDistance(km: number): string {
  if (km >= 10) return `${km.toFixed(1)} km`;
  if (km >= 0.1) return `${km.toFixed(2)} km`;
  return `${Math.round(km * 1000)} m`;
}

function toMapCoords(
  lat: number,
  lng: number,
  provider: MapTileConfig["provider"],
): [number, number] {
  if (provider === "amap") {
    const gcj = wgs84ToGcj02(lng, lat);
    return [gcj.lat, gcj.lng];
  }
  return [lat, lng];
}

function tripPositions(trip: DrivingTrip, provider: MapTileConfig["provider"]): [number, number][] {
  return trip.points.map((p) => toMapCoords(p.lat, p.lng, provider));
}

function TripSummary({ trip }: { trip: DrivingTrip }) {
  return (
    <p className="path-trip-detail-inline muted">
      第 {trip.index} 段 · {fmtClock(trip.startTime)} → {fmtClock(trip.endTime)} · {formatDistance(trip.distanceKm)}
      {" · "}
      {formatCoordLabel(trip.startLat, trip.startLng)} → {formatCoordLabel(trip.endLat, trip.endLng)}
    </p>
  );
}

export function DailyPathMap({ history, journeys, current }: DailyPathMapProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedTripIndex, setSelectedTripIndex] = useState<number | null>(null);
  const [hoverTripIndex, setHoverTripIndex] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [tileConfig, setTileConfig] = useState<MapTileConfig>(() => mapTileFromEnv({}));

  const dailyPaths = useMemo(() => {
    if (!open) return [];
    return buildDailyPaths(journeys?.length ? [...history, ...journeySnapshots(journeys)] : history);
  }, [history, journeys, open]);

  useEffect(() => {
    if (!open) return;
    const loadMapConfig = () => {
      void fetchEnvConfig()
        .then((cfg) => setTileConfig(mapTileFromEnv(cfg.map)))
        .catch(() => setTileConfig(mapTileFromEnv({})));
    };
    loadMapConfig();
    window.addEventListener("nio-map-config-updated", loadMapConfig);
    return () => window.removeEventListener("nio-map-config-updated", loadMapConfig);
  }, [open]);

  const activeDay = selectedDay ?? dailyPaths[0]?.day ?? null;
  const activePath = dailyPaths.find((p) => p.day === activeDay) ?? null;
  const activeTrip =
    activePath && selectedTripIndex !== null
      ? activePath.trips.find((t) => t.index === selectedTripIndex) ?? null
      : null;

  const highlightedTripIndex = hoverTripIndex ?? selectedTripIndex;

  const allTrips = activePath?.trips ?? [];
  const mapPositions = useMemo<[number, number][]>(() => {
    if (allTrips.length === 0) return [];
    return allTrips.flatMap((trip) => tripPositions(trip, tileConfig.provider));
  }, [allTrips, tileConfig.provider]);

  const focusPositions = useMemo<[number, number][]>(() => {
    if (highlightedTripIndex === null) return mapPositions;
    const trip = allTrips.find((t) => t.index === highlightedTripIndex);
    if (!trip) return mapPositions;
    return tripPositions(trip, tileConfig.provider);
  }, [allTrips, highlightedTripIndex, mapPositions, tileConfig.provider]);

  useEffect(() => {
    if (dailyPaths.length === 0) return;
    const latest = dailyPaths[0].day;
    setSelectedDay((prev) => {
      if (!prev) return latest;
      if (!dailyPaths.some((p) => p.day === prev)) return latest;
      return prev;
    });
  }, [dailyPaths]);

  useEffect(() => {
    if (!activePath) {
      setSelectedTripIndex(null);
      setHoverTripIndex(null);
      return;
    }
    setSelectedTripIndex((prev) => {
      if (prev !== null && activePath.trips.some((t) => t.index === prev)) return prev;
      return activePath.trips[0]?.index ?? null;
    });
  }, [activePath]);

  const summaryMeta =
    dailyPaths.length === 0
      ? "暂无位置历史"
      : activePath
        ? `${dailyPaths.length} 天 · ${activePath.label} · ${activePath.trips.length} 段 · ${formatDistance(activePath.distanceKm)}`
        : `${dailyPaths.length} 天记录`;

  const mapCenter =
    mapPositions[0] ??
    (current && isValidGps(current.lat, current.lng)
      ? toMapCoords(current.lat, current.lng, tileConfig.provider)
      : [39.9, 116.4]);

  const showCurrent =
    current &&
    isValidGps(current.lat, current.lng) &&
    activeDay === localDayKey(current.ts);

  const showLeaflet = open && activePath !== null && activePath.trips.length > 0;

  return (
    <details
      className="trend-drawer path-drawer"
      open={open}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(next);
        saveDrawerOpen(PATH_DRAWER_KEY, next);
      }}
    >
      <summary>
        <span>每日行驶路径</span>
        <span className="drawer-summary-meta">{summaryMeta}</span>
      </summary>

      {open && dailyPaths.length === 0 && (
        <p className="muted path-empty">
          开启车辆自动拉取后，系统会记录每次采样的经纬度；行驶中（vehicle_state=1）的连续采样会合并为一段行程。
        </p>
      )}

      {open && dailyPaths.length > 0 && (
        <>
          <div className="path-day-tabs" role="tablist" aria-label="选择日期">
            {dailyPaths.map((path) => (
              <button
                key={path.day}
                type="button"
                role="tab"
                aria-selected={path.day === activeDay}
                className={`path-day-tab${path.day === activeDay ? " active" : ""}`}
                onClick={() => setSelectedDay(path.day)}
              >
                <span className="path-day-tab-label">{path.label}</span>
                <span className="path-day-tab-meta">
                  {path.trips.length} 段 · {formatDistance(path.distanceKm)}
                </span>
              </button>
            ))}
          </div>

          {activePath && activePath.trips.length === 0 && (
            <p className="muted path-hint">当天没有识别到行驶段（需 vehicle_state=1 的连续采样，或明显位移）</p>
          )}

          {activePath && activePath.trips.length > 0 && (
            <>
              <div className="path-trip-tabs" role="tablist" aria-label="选择行程段">
                {activePath.trips.map((trip, i) => {
                  const color = TRIP_COLORS[i % TRIP_COLORS.length];
                  const selected = trip.index === selectedTripIndex;
                  const highlighted = trip.index === highlightedTripIndex;
                  return (
                    <button
                      key={trip.index}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      className={`path-trip-tab${selected ? " active" : ""}${highlighted ? " highlighted" : ""}`}
                      style={{ "--trip-color": color } as React.CSSProperties}
                      onClick={() => setSelectedTripIndex(trip.index)}
                      onMouseEnter={() => setHoverTripIndex(trip.index)}
                      onMouseLeave={() => setHoverTripIndex(null)}
                    >
                      <span className="path-trip-tab-dot" aria-hidden="true" />
                      <span className="path-trip-tab-title">第{trip.index}段</span>
                      <span className="path-trip-tab-meta">{formatDistance(trip.distanceKm)}</span>
                    </button>
                  );
                })}
              </div>

              {activeTrip && <TripSummary trip={activeTrip} />}

              {showLeaflet && (
                <PathMapLeaflet
                    activeDay={activeDay}
                    tileConfig={tileConfig}
                    mapCenter={mapCenter as [number, number]}
                    focusPositions={focusPositions}
                    allTrips={allTrips}
                    highlightedTripIndex={highlightedTripIndex}
                    showCurrent={Boolean(showCurrent)}
                    current={current}
                    open={open}
                  />
              )}
            </>
          )}
        </>
      )}
    </details>
  );
}
