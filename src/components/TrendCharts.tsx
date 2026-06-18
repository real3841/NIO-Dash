import { useMemo, useState } from "react";
import type { VehicleSnapshot } from "../lib/vehicle";
import { fmtTime } from "../lib/vehicle";

interface TrendChartsProps {
  history: VehicleSnapshot[];
}

interface ChartPoint {
  x: number;
  y: number;
  value: number;
  ts: number;
}

function linePath(points: ChartPoint[], width: number, height: number, pad = 8): string {
  if (points.length === 0) return "";
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return points
    .map((p, i) => {
      const x = pad + (i / Math.max(points.length - 1, 1)) * (width - pad * 2);
      const y = pad + (1 - (p.value - min) / span) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function buildPoints(values: number[], timestamps: number[], width: number, height: number, pad = 8): ChartPoint[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((value, i) => ({
    value,
    ts: timestamps[i],
    x: pad + (i / Math.max(values.length - 1, 1)) * (width - pad * 2),
    y: pad + (1 - (value - min) / span) * (height - pad * 2),
  }));
}

function formatRangeCaption(timestamps: number[]): string {
  if (timestamps.length === 0) return "暂无采样数据";
  const first = fmtTime(timestamps[0]);
  const last = fmtTime(timestamps[timestamps.length - 1]);
  const count = timestamps.length;
  if (count === 1) return `${first} · 1 次采样`;
  return `${first} — ${last} · ${count} 次采样`;
}

function MiniChart({
  title,
  unit,
  values,
  timestamps,
  color,
}: {
  title: string;
  unit: string;
  values: number[];
  timestamps: number[];
  color: string;
}) {
  const w = 320;
  const h = 120;
  const [hovered, setHovered] = useState<number | null>(null);
  const points = useMemo(() => buildPoints(values, timestamps, w, h), [values, timestamps]);
  const path = linePath(points, w, h);
  const last = values[values.length - 1];
  const rangeCaption = formatRangeCaption(timestamps);
  const active = hovered !== null ? points[hovered] : null;

  return (
    <div className="mini-chart">
      <div className="mini-chart-head">
        <span>{title}</span>
        <strong>
          {last}
          {unit}
        </strong>
      </div>
      <div className="mini-chart-svg-wrap">
        <svg viewBox={`0 0 ${w} ${h}`} className="mini-chart-svg" role="img" aria-label={title}>
          {[0.25, 0.5, 0.75].map((p) => (
            <line
              key={p}
              x1="8"
              x2={w - 8}
              y1={8 + p * (h - 16)}
              y2={8 + p * (h - 16)}
              stroke="var(--stroke, #e5e7eb)"
              strokeWidth="1"
            />
          ))}
          <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          {points.map((p, i) => (
            <g key={`${p.ts}-${i}`}>
              <circle
                cx={p.x}
                cy={p.y}
                r="10"
                fill="transparent"
                className="mini-chart-hit"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={hovered === i ? 5 : 3}
                fill={color}
                pointerEvents="none"
              />
            </g>
          ))}
        </svg>
        {active && (
          <div
            className="mini-chart-tooltip"
            style={{
              left: `${(active.x / w) * 100}%`,
              top: `${(active.y / h) * 100}%`,
            }}
          >
            {fmtTime(active.ts)} · {active.value}
            {unit.trim()}
          </div>
        )}
      </div>
      <div className="mini-chart-labels">
        <span>{timestamps.length > 0 ? fmtTime(timestamps[0]) : "—"}</span>
        <span>{timestamps.length > 1 ? fmtTime(timestamps[timestamps.length - 1]) : ""}</span>
      </div>
      <div className="mini-chart-caption">{rangeCaption}</div>
    </div>
  );
}

export function TrendCharts({ history }: TrendChartsProps) {
  const timestamps = history.map((p) => p.ts);
  const soc = history.map((p) => p.soc);
  const range = history.map((p) => p.actualRange);
  const mileage = history.map((p) => p.mileage);

  return (
    <div className="trend-grid">
      <MiniChart title="电量" unit="%" values={soc} timestamps={timestamps} color="#22c55e" />
      <MiniChart
        title="实际续航"
        unit=" km"
        values={range}
        timestamps={timestamps}
        color="#3b82f6"
      />
      <MiniChart title="总里程" unit=" km" values={mileage} timestamps={timestamps} color="#8b5cf6" />
    </div>
  );
}
