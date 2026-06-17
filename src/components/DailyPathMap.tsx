import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import {
  buildDailyPaths,
  fmtClock,
  type DailyPath,
} from "../lib/path-history";
import type { VehicleSnapshot } from "../lib/vehicle";

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

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 15);
      return;
    }
    const bounds = L.latLngBounds(positions);
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
  }, [map, positions]);

  return null;
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
    <div className="path-stats">
      <span>{sampleCount} 个路径点</span>
      <span>行驶约 {distance}</span>
      <span>
        {fmtClock(path.startTime)} – {fmtClock(path.endTime)}
      </span>
    </div>
  );
}

export function DailyPathMap({ history, current }: DailyPathMapProps) {
  const dailyPaths = useMemo(() => buildDailyPaths(history), [history]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const activeDay = selectedDay ?? dailyPaths[0]?.day ?? null;
  const activePath = dailyPaths.find((p) => p.day === activeDay) ?? null;

  const positions = useMemo<[number, number][]>(() => {
    if (!activePath) return [];
    return activePath.points.map((p) => [p.lat, p.lng]);
  }, [activePath]);

  useEffect(() => {
    if (!selectedDay && dailyPaths[0]) {
      setSelectedDay(dailyPaths[0].day);
    }
  }, [dailyPaths, selectedDay]);

  if (dailyPaths.length === 0) {
    return (
      <section className="panel path-panel">
        <div className="panel-head">
          <h2>每日行驶路径</h2>
          <span className="muted">暂无位置历史</span>
        </div>
        <p className="muted path-empty">
          开启车辆自动拉取后，系统会记录每次采样的经纬度，并按天汇总成行驶轨迹。
        </p>
      </section>
    );
  }

  const mapCenter = positions[0] ?? (current ? [current.lat, current.lng] : [39.9, 116.4]);

  return (
    <section className="panel path-panel">
      <div className="panel-head">
        <h2>每日行驶路径</h2>
        <span className="muted">按天汇总 GPS 采样</span>
      </div>

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
              {path.points.length} 点 ·{" "}
              {path.distanceKm >= 0.1
                ? `${path.distanceKm.toFixed(1)} km`
                : `${Math.round(path.distanceKm * 1000)} m`}
            </span>
          </button>
        ))}
      </div>

      {activePath && <PathStats path={activePath} />}

      <div className="map-wrap path-map-wrap">
        <MapContainer
          center={mapCenter as [number, number]}
          zoom={14}
          scrollWheelZoom
          className="map path-map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {positions.length > 0 && <FitBounds positions={positions} />}
          {activePath && positions.length >= 2 && (
            <Polyline positions={positions} pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.85 }} />
          )}
          {activePath?.points.map((p, i) => {
            const isStart = i === 0;
            const isEnd = i === activePath.points.length - 1;
            const color = isStart ? "#16a34a" : isEnd ? "#dc2626" : "#2563eb";
            const radius = isStart || isEnd ? 7 : 4;
            return (
              <CircleMarker
                key={p.ts}
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
          {current && activeDay === dayKey(current.ts) && (
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
    </section>
  );
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
