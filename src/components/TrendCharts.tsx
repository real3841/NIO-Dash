import type { VehicleSnapshot } from "../lib/vehicle";
import { fmtDay } from "../lib/vehicle";

interface TrendChartsProps {
  history: VehicleSnapshot[];
}

function linePath(values: number[], width: number, height: number, pad = 8): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = pad + (i / Math.max(values.length - 1, 1)) * (width - pad * 2);
      const y = pad + (1 - (v - min) / span) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function MiniChart({
  title,
  unit,
  values,
  labels,
  color,
}: {
  title: string;
  unit: string;
  values: number[];
  labels: string[];
  color: string;
}) {
  const w = 320;
  const h = 120;
  const path = linePath(values, w, h);
  const last = values[values.length - 1];

  return (
    <div className="mini-chart">
      <div className="mini-chart-head">
        <span>{title}</span>
        <strong>
          {last}
          {unit}
        </strong>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mini-chart-svg" role="img" aria-label={title}>
        <rect x="0" y="0" width={w} height={h} fill="transparent" />
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
        {values.map((v, i) => {
          const min = Math.min(...values);
          const max = Math.max(...values);
          const span = max - min || 1;
          const x = 8 + (i / Math.max(values.length - 1, 1)) * (w - 16);
          const y = 8 + (1 - (v - min) / span) * (h - 16);
          return <circle key={i} cx={x} cy={y} r="3" fill={color} />;
        })}
      </svg>
      <div className="mini-chart-labels">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
      <div className="mini-chart-caption">单位 {unit} · 近 {labels.length} 个采样点</div>
    </div>
  );
}

export function TrendCharts({ history }: TrendChartsProps) {
  const labels = history.map((p) => fmtDay(p.ts));
  const soc = history.map((p) => p.soc);
  const range = history.map((p) => p.actualRange);
  const mileage = history.map((p) => p.mileage);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>历史趋势</h2>
        <span className="muted">电量 / 实际续航 / 总里程</span>
      </div>
      <div className="trend-grid">
        <MiniChart title="电量" unit="%" values={soc} labels={labels} color="#22c55e" />
        <MiniChart title="实际续航" unit=" km" values={range} labels={labels} color="#3b82f6" />
        <MiniChart title="总里程" unit=" km" values={mileage} labels={labels} color="#8b5cf6" />
      </div>
    </section>
  );
}
