import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import {
  buildDailyPaths,
  fmtClock,
  localDayKey,
  type DailyPath,
} from "../lib/path-history";
import {
  loadDrawerOpen,
  PATH_DRAWER_KEY,
  saveDrawerOpen,
} from "../lib/drawer-state";
import { isValidGps, type VehicleSnapshot } from "../lib/vehicle";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface DailyPathMapProps {
  history: VehicleSnapshot[];
  current?: { lat: number; lng: number; ts: number } | null;
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

function createArrowIcon(bearing: number): L.DivIcon {
  return L.divIcon({
    className: "path-arrow-icon",
    html: `<svg class="path-arrow-svg" width="22" height="22" viewBox="0 0 22 22" style="transform: rotate(${bearing}deg)" aria-hidden="true"><path d="M11 3 L18 17 L11 13 L4 17 Z" fill="#1d4ed8" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function PathStats({ path }: { path: DailyPath }) {
  const sampleCount = path.points.length;
  const distance =
    path.distanceKm >= 10
      ? `${path.distanceKm.toFixed(1)} km`
      : path.distanceKm >= 0.1
        ? `${path.distanceKm.toFixed(2)} km`
        : `${Math.round(path.distanceKm * 1000)} m`;

  return (
    <div className="path-stats-wrap">
      <div className="path-direction-bar">
        <span className="path-direction-end path-direction-start">
          <span className="path-direction-dot start" aria-hidden="true" />
          起点 {fmtClock(path.startTime)}
        </span>
        <span className="path-direction-arrow" aria-hidden="true">
          →
        </span>
        <span className="path-direction-end path-direction-endpoint">
          <span className="path-direction-dot end" aria-hidden="true" />
          终点 {fmtClock(path.endTime)}
        </span>
      </div>
      <div className="path-stats">
        <span>{sampleCount} 个路径点</span>
        <span>行驶约 {distance}</span>
      </div>
    </div>
  );
}

function formatDistance(km: number): string {
  if (km >= 0.1) return `${km.toFixed(1)} km`;
  return `${Math.round(km * 1000)} m`;
}

export function DailyPathMap({ history, current }: DailyPathMapProps) {
  const dailyPaths = useMemo(() => buildDailyPaths(history), [history]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [open, setOpen] = useState(() => loadDrawerOpen(PATH_DRAWER_KEY, false));

  const activeDay = selectedDay ?? dailyPaths[0]?.day ?? null;
  const activePath = dailyPaths.find((p) => p.day === activeDay) ?? null;

  const positions = useMemo<[number, number][]>(() => {
    if (!activePath) return [];
    return activePath.points.map((p) => [p.lat, p.lng]);
  }, [activePath]);

  const pathArrows = useMemo(() => buildPathArrows(positions), [positions]);

  useEffect(() => {
    if (dailyPaths.length === 0) return;
    const latest = dailyPaths[0].day;
    setSelectedDay((prev) => {
      if (!prev) return latest;
      if (!dailyPaths.some((p) => p.day === prev)) return latest;
      return prev;
    });
  }, [dailyPaths]);

  const summaryMeta =
    dailyPaths.length === 0
      ? "暂无位置历史"
      : activePath
        ? `${dailyPaths.length} 天 · ${activePath.label} · ${formatDistance(activePath.distanceKm)}`
        : `${dailyPaths.length} 天记录`;

  const mapCenter = positions[0] ?? (current && isValidGps(current.lat, current.lng) ? [current.lat, current.lng] : [39.9, 116.4]);

  const showCurrent =
    current &&
    isValidGps(current.lat, current.lng) &&
    activeDay === localDayKey(current.ts);

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
          开启车辆自动拉取后，系统会记录每次采样的经纬度，并按天汇总成行驶轨迹。
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
                  {path.points.length} 点 · {formatDistance(path.distanceKm)}
                </span>
              </button>
            ))}
          </div>

          {activePath && <PathStats path={activePath} />}

          <div className="map-wrap path-map-wrap">
            <MapContainer
              key={activeDay ?? "map"}
              center={mapCenter as [number, number]}
              zoom={14}
              scrollWheelZoom
              className="map path-map"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
                subdomains={["a", "b", "c"]}
              />
              <MapLayout positions={positions} enabled={open} />
              {activePath && positions.length >= 2 && (
                <Polyline
                  positions={positions}
                  pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.85 }}
                />
              )}
              {pathArrows.map((arrow, i) => (
                <Marker
                  key={`arrow-${i}-${arrow.lat}-${arrow.lng}`}
                  position={[arrow.lat, arrow.lng]}
                  icon={createArrowIcon(arrow.bearing)}
                  interactive={false}
                />
              ))}
              {activePath?.points.map((p, i) => {
                const isStart = i === 0;
                const isEnd = i === activePath.points.length - 1;
                const color = isStart ? "#16a34a" : isEnd ? "#dc2626" : "#2563eb";
                const radius = isStart || isEnd ? 7 : 4;
                return (
                  <CircleMarker
                    key={`${p.ts}-${i}`}
                    center={[p.lat, p.lng]}
                    radius={radius}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: 2 }}
                  >
                    <Tooltip direction="top" offset={[0, -4]}>
                      {isStart ? "起点" : isEnd ? "终点" : "途经"} · {fmtClock(p.ts)}
                      <br />
                      {p.lat.toFixed(5)}°N, {p.lng.toFixed(5)}°E
                    </Tooltip>
                  </CircleMarker>
                );
              })}
              {showCurrent && (
                <CircleMarker
                  center={[current.lat, current.lng]}
                  radius={9}
                  pathOptions={{ color: "#7c3aed", fillColor: "#7c3aed", fillOpacity: 0.35, weight: 3 }}
                >
                  <Tooltip direction="top">当前位置</Tooltip>
                </CircleMarker>
              )}
            </MapContainer>
          </div>

          {activePath && activePath.points.length < 2 && (
            <p className="muted path-hint">当天仅有 1 个位置点（车辆可能未移动或采样较少）</p>
          )}
        </>
      )}
    </details>
  );
}
