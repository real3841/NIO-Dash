import { useMemo, useState } from "react";
import type { VehicleSnapshot } from "../lib/vehicle";
import { fmtTime } from "../lib/vehicle";

interface TrendChartsProps {
  history: VehicleSnapshot[];
}

const DAY_OPTIONS = [1, 3, 5, 7] as const;
type DayRange = (typeof DAY_OPTIONS)[number];

interface ChartPoint {
  x: number;
  y: number;
  value: number;
  ts: number;
}

function startOfLocalDay(ts = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 最近 N 个自然日（含今天）内的全部采样 */
function filterForDayRange(history: VehicleSnapshot[], days: DayRange): VehicleSnapshot[] {
  const start = startOfLocalDay() - (days - 1) * 24 * 60 * 60 * 1000;
  return history.filter((p) => p.ts >= start).sort((a, b) => a.ts - b.ts);
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

function formatRangeCaption(timestamps: number[], days: DayRange): string {
  if (timestamps.length === 0) return `近 ${days} 日暂无采样`;
  const count = timestamps.length;
  if (count === 1) return `${fmtTime(timestamps[0])} · 1 次采样`;
  return `${fmtTime(timestamps[0])} — ${fmtTime(timestamps[timestamps.length - 1])} · ${count} 次采样`;
}

function formatValueStats(values: number[], unit: string): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  return `最低 ${min}${unit} · 最高 ${max}${unit} · 平均 ${avg}${unit}`;
}

function formatMileageStats(points: VehicleSnapshot[]): string {
  if (points.length === 0) return "";
  const mileage = points.map((p) => p.mileage);
  const driven = Math.round(mileage[mileage.length - 1] - mileage[0]);
  const base = formatValueStats(mileage, " km");
  return driven >= 0 ? `${base} · 累计 +${driven} km` : base;
}

function MiniChart({
  title,
  unit,
  pickValue,
  formatStats,
  color,
  history,
}: {
  title: string;
  unit: string;
  pickValue: (p: VehicleSnapshot) => number;
  formatStats: (points: VehicleSnapshot[], values: number[]) => string;
  color: string;
  history: VehicleSnapshot[];
}) {
  const [days, setDays] = useState<DayRange>(7);

  const series = useMemo(() => filterForDayRange(history, days), [history, days]);
  const values = useMemo(() => series.map(pickValue), [series, pickValue]);
  const timestamps = useMemo(() => series.map((p) => p.ts), [series]);

  const w = 320;
  const h = 120;
  const [hovered, setHovered] = useState<number | null>(null);
  const points = useMemo(() => buildPoints(values, timestamps, w, h), [values, timestamps]);
  const path = linePath(points, w, h);
  const last = values[values.length - 1];
  const rangeCaption = formatRangeCaption(timestamps, days);
  const statsCaption = formatStats(series, values);
  const active = hovered !== null ? points[hovered] : null;

  return (
    <div className="mini-chart">
      <div className="mini-chart-head">
        <span>{title}</span>
        <strong>
          {last ?? "—"}
          {unit}
        </strong>
      </div>
      <div className="mini-chart-days" role="group" aria-label={`${title}时间范围`}>
        {DAY_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            className={`mini-chart-day-btn${days === d ? " active" : ""}`}
            onClick={() => setDays(d)}
          >
            {d}日
          </button>
        ))}
      </div>
      <div className="mini-chart-svg-wrap">
        {points.length === 0 ? (
          <div className="mini-chart-empty">近 {days} 日暂无数据</div>
        ) : (
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
        )}
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
      {statsCaption && <div className="mini-chart-stats">{statsCaption}</div>}
    </div>
  );
}

export function TrendCharts({ history }: TrendChartsProps) {
  return (
    <div className="trend-grid">
      <MiniChart
        title="电量"
        unit="%"
        pickValue={(p) => p.soc}
        formatStats={(_points, values) => formatValueStats(values, "%")}
        color="#22c55e"
        history={history}
      />
      <MiniChart
        title="实际续航"
        unit=" km"
        pickValue={(p) => p.actualRange}
        formatStats={(_points, values) => formatValueStats(values, " km")}
        color="#3b82f6"
        history={history}
      />
      <MiniChart
        title="总里程"
        unit=" km"
        pickValue={(p) => p.mileage}
        formatStats={(points) => formatMileageStats(points)}
        color="#8b5cf6"
        history={history}
      />
    </div>
  );
}
