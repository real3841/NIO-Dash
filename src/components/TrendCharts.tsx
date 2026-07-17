import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VehicleSnapshot } from "../lib/vehicle";
import { fmtTime } from "../lib/vehicle";

interface TrendChartsProps {
  history: VehicleSnapshot[];
}

const BATTERY_PRESET_DAYS = [1, 3] as const;
const MILEAGE_PRESET_DAYS = [7, 15] as const;

const CHART_W = 320;
const CHART_H = 120;
const CHART_PAD = 8;
const Y_LABEL_W = 40;
const X_EDGE = 16;
const X_GUTTER = 24;
const SOC_STEP = 10;
const ZOOM_MIN = 1;
const ZOOM_MAX = 8;

interface RangeFilterResult {
  points: VehicleSnapshot[];
  /** 因开始日无数据而实际使用的起始日（YYYY-MM-DD） */
  effectiveStart: string | null;
}

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

function localDayKey(ts = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayBoundsFromKey(key: string): { start: number; end: number } {
  const [y, m, d] = key.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function presetDateRange(days: number): { start: string; end: string } {
  const end = localDayKey();
  const start = localDayKey(startOfLocalDay() - (days - 1) * 24 * 60 * 60 * 1000);
  return { start, end };
}

function filterForDateRange(
  history: VehicleSnapshot[],
  startKey: string,
  endKey: string,
): RangeFilterResult {
  if (!startKey || !endKey) {
    return { points: [], effectiveStart: null };
  }

  let start = startKey;
  let end = endKey;
  if (start > end) [start, end] = [end, start];

  let startMs = dayBoundsFromKey(start).start;
  const endMs = dayBoundsFromKey(end).end;

  if (history.length > 0) {
    const earliest = Math.min(...history.map((p) => p.ts));
    const earliestDayStart = startOfLocalDay(earliest);
    if (startMs < earliestDayStart) {
      startMs = earliestDayStart;
    }
  }

  const points = history
    .filter((p) => p.ts >= startMs && p.ts < endMs)
    .sort((a, b) => a.ts - b.ts);

  const effectiveStart =
    points.length > 0 && localDayKey(points[0].ts) > start ? localDayKey(points[0].ts) : null;

  return { points, effectiveStart };
}

function linePath(
  points: ChartPoint[],
  height: number,
  pad = 8,
  yDomain?: { min: number; max: number },
): string {
  if (points.length === 0) return "";
  const values = points.map((p) => p.value);
  const min = yDomain?.min ?? Math.min(...values);
  const max = yDomain?.max ?? Math.max(...values);
  const span = max - min || 1;
  return points
    .map((p, i) => {
      const y = pad + (1 - (p.value - min) / span) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function buildPoints(
  values: number[],
  timestamps: number[],
  plotW: number,
  height: number,
  pad = 8,
  xOffset = 0,
  yLabelW = 0,
  yDomain?: { min: number; max: number },
): ChartPoint[] {
  if (values.length === 0) return [];
  const min = yDomain?.min ?? Math.min(...values);
  const max = yDomain?.max ?? Math.max(...values);
  const span = max - min || 1;
  const innerW = plotW - yLabelW;
  return values.map((value, i) => ({
    value,
    ts: timestamps[i],
    x: xOffset + yLabelW + pad + (i / Math.max(values.length - 1, 1)) * (innerW - pad * 2),
    y: pad + (1 - (value - min) / span) * (height - pad * 2),
  }));
}

function formatRangeCaption(
  timestamps: number[],
  startDate: string,
  endDate: string,
  effectiveStart: string | null,
): string {
  if (timestamps.length === 0) {
    return `${startDate} — ${endDate} 暂无采样`;
  }
  const count = timestamps.length;
  const rangeNote =
    effectiveStart && effectiveStart !== startDate
      ? `（${startDate} 无采样，自 ${effectiveStart} 起）`
      : "";
  if (count === 1) {
    return `${fmtTime(timestamps[0])} · 1 次采样${rangeNote}`;
  }
  return `${fmtTime(timestamps[0])} — ${fmtTime(timestamps[timestamps.length - 1])} · ${count} 次采样${rangeNote}`;
}

type GridLineMode = "range" | "soc-fixed";

interface GridTick {
  key: string;
  value: number;
  y: number;
  edge?: boolean;
}

interface YDomain {
  min: number;
  max: number;
}

const Y_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

function formatAxisLabel(value: number, unit: string): string {
  const u = unit.trim();
  if (u === "%") return `${Math.round(value)}%`;
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString("zh-CN");
  return String(Math.round(value));
}

function valueToY(value: number, min: number, max: number): number {
  const plotH = CHART_H - CHART_PAD * 2;
  const span = max - min || 1;
  return CHART_PAD + (1 - (value - min) / span) * plotH;
}

function buildSocFixedDomain(values: number[]): YDomain {
  if (values.length === 0) return { min: 0, max: 100 };
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  let min = Math.floor(dataMin / SOC_STEP) * SOC_STEP;
  let max = Math.ceil(dataMax / SOC_STEP) * SOC_STEP;
  min = Math.max(0, min);
  max = Math.min(100, max);
  if (max <= min) max = Math.min(100, min + SOC_STEP * 2);
  if (max - min < SOC_STEP * 2) {
    const mid = Math.round((dataMin + dataMax) / 2 / SOC_STEP) * SOC_STEP;
    min = Math.max(0, mid - SOC_STEP);
    max = Math.min(100, mid + SOC_STEP);
  }
  return { min, max };
}

function buildGridTicks(values: number[], mode: GridLineMode, yDomain?: YDomain): GridTick[] {
  if (values.length === 0) return [];
  const plotH = CHART_H - CHART_PAD * 2;

  if (mode === "soc-fixed" && yDomain) {
    const ticks: GridTick[] = [];
    for (let v = yDomain.max; v >= yDomain.min; v -= SOC_STEP) {
      ticks.push({
        key: String(v),
        value: v,
        y: valueToY(v, yDomain.min, yDomain.max),
        edge: v === yDomain.max || v === yDomain.min,
      });
    }
    return ticks;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (max === min) {
    return [{ key: "single", value: max, y: CHART_PAD + plotH / 2 }];
  }

  const span = max - min;
  return Y_TICKS.map((p) => ({
    key: String(p),
    value: max - p * span,
    y: CHART_PAD + p * plotH,
    edge: p === 0 || p === 1,
  }));
}

function computeDailyMileageDeltas(points: VehicleSnapshot[]): Array<{ day: string; delta: number }> {
  const byDay = new Map<string, VehicleSnapshot[]>();
  for (const p of points) {
    const key = localDayKey(p.ts);
    const list = byDay.get(key) ?? [];
    list.push(p);
    byDay.set(key, list);
  }

  const results: Array<{ day: string; delta: number }> = [];
  for (const [day, samples] of byDay.entries()) {
    samples.sort((a, b) => a.ts - b.ts);
    const delta = Math.round(samples[samples.length - 1]!.mileage - samples[0]!.mileage);
    results.push({ day, delta });
  }
  results.sort((a, b) => a.day.localeCompare(b.day));
  return results;
}

function formatDayZh(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${m}月${d}日`;
}

function dailyDeltaTimestamp(day: string): number {
  const { start } = dayBoundsFromKey(day);
  return start + 12 * 60 * 60 * 1000;
}

function formatDailyChartCaption(dayCount: number, totalDelta: number, startDate: string, endDate: string): string {
  if (dayCount === 0) return `${startDate} — ${endDate} 暂无数据`;
  const sign = totalDelta >= 0 ? "+" : "";
  return `${dayCount} 天 · 累计 ${sign}${totalDelta} km`;
}

function formatWindowLabel(ts: number, dailyMileage: boolean): string {
  if (dailyMileage) return formatDayZh(localDayKey(ts));
  return fmtTime(ts);
}

function formatDeltaValue(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value}km`;
}

function tooltipPosition(
  active: ChartPoint,
  panX: number,
): { left: string; top: string; below: boolean; align: "center" | "left" | "right" } {
  const viewW = CHART_W + X_EDGE * 2;
  const viewH = CHART_H + CHART_PAD * 2;
  const rawLeft = ((active.x - (panX - X_EDGE)) / viewW) * 100;
  const top = ((active.y + CHART_PAD) / viewH) * 100;
  const below = top < 22;
  if (rawLeft > 70) {
    return { left: `${Math.min(99, rawLeft)}%`, top: `${top}%`, below, align: "right" };
  }
  if (rawLeft < 30) {
    return { left: `${Math.max(1, rawLeft)}%`, top: `${top}%`, below, align: "left" };
  }
  return { left: `${rawLeft}%`, top: `${top}%`, below, align: "center" };
}

function visibleWindowLabels(
  points: ChartPoint[],
  panX: number,
  zoom: number,
): { start: number | null; end: number | null } {
  if (points.length === 0) return { start: null, end: null };
  if (zoom <= ZOOM_MIN) {
    return { start: points[0].ts, end: points[points.length - 1].ts };
  }
  const lo = panX;
  const hi = panX + CHART_W;
  const visible = points.filter((p) => p.x >= lo && p.x <= hi);
  if (visible.length === 0) {
    return { start: points[0].ts, end: points[points.length - 1].ts };
  }
  return { start: visible[0].ts, end: visible[visible.length - 1].ts };
}

function MiniChart({
  title,
  unit,
  pickValue,
  gridMode = "range",
  footerCaption,
  dailyMileage = false,
  presetOptions = BATTERY_PRESET_DAYS,
  defaultPreset = presetOptions[0],
  color,
  history,
}: {
  title: string;
  unit: string;
  pickValue?: (p: VehicleSnapshot) => number;
  gridMode?: GridLineMode;
  footerCaption?: (points: VehicleSnapshot[]) => string;
  dailyMileage?: boolean;
  presetOptions?: readonly number[];
  defaultPreset?: number;
  color: string;
  history: VehicleSnapshot[];
}) {
  const today = localDayKey();
  const defaultRange = presetDateRange(defaultPreset);

  const [presetDays, setPresetDays] = useState<number | null>(defaultPreset);
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);

  const minDate = useMemo(() => {
    if (history.length === 0) return today;
    return localDayKey(Math.min(...history.map((p) => p.ts)));
  }, [history, today]);

  const { points: series, effectiveStart } = useMemo(
    () => filterForDateRange(history, startDate, endDate),
    [history, startDate, endDate],
  );

  const { values, timestamps } = useMemo(() => {
    if (dailyMileage) {
      const deltas = computeDailyMileageDeltas(series);
      return {
        values: deltas.map((item) => item.delta),
        timestamps: deltas.map((item) => dailyDeltaTimestamp(item.day)),
      };
    }
    return {
      values: series.map((p) => pickValue!(p)),
      timestamps: series.map((p) => p.ts),
    };
  }, [series, dailyMileage, pickValue]);

  const totalDelta = useMemo(
    () => (dailyMileage ? values.reduce((sum, value) => sum + value, 0) : 0),
    [dailyMileage, values],
  );

  const [hovered, setHovered] = useState<number | null>(null);
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const [panX, setPanX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, startX: 0, startPan: 0 });

  const plotW = CHART_W * zoom;
  const xGutter = zoom > ZOOM_MIN ? X_GUTTER : 0;
  const contentW = plotW + xGutter * 2;
  const minPan = zoom > ZOOM_MIN ? -xGutter : 0;
  const maxPan = Math.max(0, contentW - CHART_W);

  const clampPan = useCallback(
    (value: number) => Math.max(minPan, Math.min(value, maxPan)),
    [minPan, maxPan],
  );

  const viewBox = `${panX - X_EDGE} ${-CHART_PAD} ${CHART_W + X_EDGE * 2} ${CHART_H + CHART_PAD * 2}`;

  useEffect(() => {
    setPanX((prev) => clampPan(prev));
  }, [clampPan]);

  useEffect(() => {
    setZoom(ZOOM_MIN);
    setPanX(0);
    setHovered(null);
  }, [startDate, endDate]);

  useEffect(() => {
    setHovered(null);
  }, [zoom]);

  const yDomain = useMemo((): YDomain | undefined => {
    if (gridMode === "soc-fixed") return buildSocFixedDomain(values);
    return undefined;
  }, [values, gridMode]);

  const points = useMemo(
    () => buildPoints(values, timestamps, plotW, CHART_H, CHART_PAD, xGutter, Y_LABEL_W, yDomain),
    [values, timestamps, plotW, xGutter, yDomain],
  );
  const path = linePath(points, CHART_H, CHART_PAD, yDomain);
  const gridTicks = useMemo(() => buildGridTicks(values, gridMode, yDomain), [values, gridMode, yDomain]);
  const gridX1 = xGutter + Y_LABEL_W;
  const gridX2 = xGutter + plotW - CHART_PAD;
  const last = values[values.length - 1];
  const rangeCaption = dailyMileage
    ? formatDailyChartCaption(values.length, totalDelta, startDate, endDate)
    : formatRangeCaption(timestamps, startDate, endDate, effectiveStart);
  const extraCaption = footerCaption?.(series) ?? "";
  const active = hovered !== null ? points[hovered] : null;
  const canZoom = points.length > 1;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= ZOOM_MIN || !canZoom) return;
    dragRef.current = { active: true, startX: e.clientX, startPan: panX };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setHovered(null);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || !wrapRef.current) return;
    const scale = CHART_W / wrapRef.current.getBoundingClientRect().width;
    const dx = (e.clientX - dragRef.current.startX) * scale;
    setPanX(clampPan(dragRef.current.startPan - dx));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onZoomChange = (value: number) => {
    setHovered(null);
    setZoom(value);
    if (value <= ZOOM_MIN) {
      setPanX(0);
      return;
    }
    setPanX((prev) => clampPan(prev));
  };

  const tooltip = active && !dragging ? tooltipPosition(active, panX) : null;
  const windowLabels = useMemo(
    () => visibleWindowLabels(points, panX, zoom),
    [points, panX, zoom],
  );

  const applyPreset = (days: number) => {
    const range = presetDateRange(days);
    setPresetDays(days);
    setStartDate(range.start);
    setEndDate(range.end);
  };

  const onStartChange = (value: string) => {
    if (!value) return;
    setPresetDays(null);
    setStartDate(value);
    if (value > endDate) setEndDate(value);
  };

  const onEndChange = (value: string) => {
    if (!value) return;
    setPresetDays(null);
    setEndDate(value);
    if (value < startDate) setStartDate(value);
  };

  return (
    <div className="mini-chart">
      <div className="mini-chart-head">
        <span>{title}</span>
        <strong>
          {dailyMileage
            ? values.length > 0
              ? `${totalDelta >= 0 ? "+" : ""}${totalDelta} km`
              : "—"
            : `${last ?? "—"}${unit}`}
        </strong>
      </div>
      <div className="mini-chart-range" role="group" aria-label={`${title}时间范围`}>
        {presetOptions.map((d) => (
          <button
            key={d}
            type="button"
            className={`mini-chart-day-btn${presetDays === d ? " active" : ""}`}
            onClick={() => applyPreset(d)}
          >
            {d}日
          </button>
        ))}
        <input
          type="date"
          className="mini-chart-date-input"
          value={startDate}
          min={minDate}
          max={endDate}
          aria-label={`${title}开始日期`}
          title="开始日期"
          onChange={(e) => onStartChange(e.target.value)}
          onFocus={() => setPresetDays(null)}
        />
        <input
          type="date"
          className="mini-chart-date-input"
          value={endDate}
          min={startDate}
          max={today}
          aria-label={`${title}结束日期`}
          title="结束日期"
          onChange={(e) => onEndChange(e.target.value)}
          onFocus={() => setPresetDays(null)}
        />
      </div>
      <div className="mini-chart-stage">
        <div className="mini-chart-chart-layer">
          <div
            ref={wrapRef}
            className={`mini-chart-svg-wrap${zoom > ZOOM_MIN ? " pannable" : ""}${dragging ? " dragging" : ""}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {points.length === 0 ? (
              <div className="mini-chart-empty">
                {startDate} — {endDate} 暂无数据
              </div>
            ) : (
              <svg
                viewBox={viewBox}
                className="mini-chart-svg"
                role="img"
                aria-label={title}
                preserveAspectRatio="xMinYMid meet"
              >
                {gridTicks.map(({ key, y, edge }) => (
                  <line
                    key={key}
                    x1={gridX1}
                    x2={gridX2}
                    y1={y}
                    y2={y}
                    className={edge ? "mini-chart-grid-edge" : "mini-chart-grid"}
                  />
                ))}
                {gridTicks.map(({ key, value, y }) => (
                  <text
                    key={`label-${key}`}
                    x={panX + 2}
                    y={y}
                    className="mini-chart-y-label"
                    textAnchor="start"
                    dominantBaseline="middle"
                  >
                    {formatAxisLabel(value, unit)}
                  </text>
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
                      onMouseEnter={() => !dragging && setHovered(i)}
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
          </div>
          {tooltip && active && (
            <div className="mini-chart-tooltip-layer">
              <div
                className={`mini-chart-tooltip${tooltip.below ? " below" : ""} align-${tooltip.align}`}
                style={{ left: tooltip.left, top: tooltip.top }}
              >
                {dailyMileage
                  ? `${formatDayZh(localDayKey(active.ts))} · ${formatDeltaValue(active.value)}`
                  : `${fmtTime(active.ts)} · ${active.value}${unit.trim()}`}
              </div>
            </div>
          )}
        </div>
      <div className="mini-chart-labels">
        <span>{windowLabels.start !== null ? formatWindowLabel(windowLabels.start, dailyMileage) : "—"}</span>
        <span>{windowLabels.end !== null ? formatWindowLabel(windowLabels.end, dailyMileage) : ""}</span>
      </div>
      {zoom > ZOOM_MIN && maxPan > minPan && (
        <label className="mini-chart-pan-wrap" title="左右拖动查看">
          <span className="mini-chart-pan-icon" aria-hidden="true">
            ◀
          </span>
          <input
            type="range"
            className="mini-chart-pan"
            min={minPan}
            max={maxPan}
            step={Math.max(1, Math.round((maxPan - minPan) / 200))}
            value={panX}
            onChange={(e) => setPanX(Number(e.target.value))}
            aria-label={`${title}左右位置`}
          />
          <span className="mini-chart-pan-icon" aria-hidden="true">
            ▶
          </span>
        </label>
      )}
      </div>
      <div className="mini-chart-caption">{rangeCaption}</div>
      {(extraCaption || canZoom) && (
        <div className="mini-chart-stats-row">
          {extraCaption && <div className="mini-chart-stats">{extraCaption}</div>}
          {canZoom && (
            <label className="mini-chart-zoom-wrap" title="缩放后可在图表上左右拖动">
              <span className="mini-chart-zoom-icon" aria-hidden="true">
                −
              </span>
              <input
                type="range"
                className="mini-chart-zoom"
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={0.25}
                value={zoom}
                onChange={(e) => onZoomChange(Number(e.target.value))}
                aria-label={`${title}图表缩放`}
              />
              <span className="mini-chart-zoom-icon" aria-hidden="true">
                +
              </span>
            </label>
          )}
        </div>
      )}
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
        gridMode="soc-fixed"
        color="#22c55e"
        history={history}
      />
      <MiniChart
        title="日增里程"
        unit="km"
        dailyMileage
        presetOptions={MILEAGE_PRESET_DAYS}
        defaultPreset={7}
        color="#3b82f6"
        history={history}
      />
      <MiniChart
        title="总里程"
        unit=" km"
        pickValue={(p) => p.mileage}
        presetOptions={MILEAGE_PRESET_DAYS}
        defaultPreset={7}
        color="#8b5cf6"
        history={history}
      />
    </div>
  );
}
