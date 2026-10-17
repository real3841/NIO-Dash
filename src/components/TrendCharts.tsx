import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decimateIndices } from "../lib/chart-utils";
import {
  dayBoundsFromKey,
  dayLabel as formatDayLabel,
  localDayKey,
  startOfLocalDay,
} from "../lib/date-utils";
import type { VehicleSnapshot } from "../lib/vehicle";
import { fmtTime } from "../lib/vehicle";
import type { DailyHistory } from "../lib/trip";
import { formatDurationSec, type PowerFile } from "../lib/power";

interface TrendChartsProps {
  history: VehicleSnapshot[];
  dailyHistory?: DailyHistory;
  power?: PowerFile | null;
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
const MAX_CHART_POINTS = 180;

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

function presetDateRange(days: number): { start: string; end: string } {
  const end = localDayKey();
  const start = localDayKey(startOfLocalDay() - (days - 1) * 24 * 60 * 60 * 1000);
  return { start, end };
}

function monthBounds(key: string): { start: string; end: string } {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${key}-01`, end: `${key}-${String(last).padStart(2, "0")}` };
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
  return formatDayLabel(day);
}

function dailyDeltaTimestamp(day: string): number {
  const { start } = dayBoundsFromKey(day);
  return start + 12 * 60 * 60 * 1000;
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatKm(value: number, signed = false): string {
  const rounded = roundTenth(value);
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  if (!signed || rounded <= 0) return text;
  return `+${text}`;
}

function formatDailyChartCaption(
  dayCount: number,
  totalDelta: number,
  startDate: string,
  endDate: string,
  unit = " km",
  signed = true,
): string {
  if (dayCount === 0) return `${startDate} — ${endDate} 暂无数据`;
  const shown = signed ? formatKm(totalDelta, true) : roundTenth(totalDelta).toFixed(1);
  return `${dayCount} 天 · 累计 ${shown}${unit}`;
}

function formatWindowLabel(ts: number, dailyMileage: boolean): string {
  if (dailyMileage) return formatDayZh(localDayKey(ts));
  return fmtTime(ts);
}

function formatDeltaValue(value: number): string {
  return `${formatKm(value, true)}km`;
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
  dailyOverrides,
  dailyPoints,
  rangeSum = false,
  monthPreset = false,
  monthTotals,
  notes = [],
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
  /** 当日里程接口按天记下的值，有就优先用 */
  dailyOverrides?: DailyHistory;
  /** 按天的独立序列，例如家充每日电量 */
  dailyPoints?: { day: string; value: number; times?: number; seconds?: number; kwh?: number }[];
  /** 标题和说明显示区间累计，而不是最后一个点 */
  rangeSum?: boolean;
  /** 在 7 日 / 15 日右侧增加「月」，按整月查看并可前后翻 */
  monthPreset?: boolean;
  /** YYYY-MM → 该月官方汇总，翻月时标题用这份数 */
  monthTotals?: Record<string, { kwh: number; times: number; seconds: number }>;
  /** 固定显示的统计，不随日期范围变化 */
  notes?: string[];
}) {
  const today = localDayKey();
  const defaultRange = presetDateRange(defaultPreset);

  const [presetDays, setPresetDays] = useState<number | "month" | null>(defaultPreset);
  const [viewMonth, setViewMonth] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const monthKeys = useMemo(() => Object.keys(monthTotals ?? {}).sort(), [monthTotals]);

  const byDay = dailyMileage || rangeSum;

  const minDate = useMemo(() => {
    if (dailyPoints && dailyPoints.length > 0) return dailyPoints.reduce((min, p) => (p.day < min ? p.day : min), dailyPoints[0].day);
    if (history.length === 0) return today;
    return localDayKey(Math.min(...history.map((p) => p.ts)));
  }, [dailyPoints, history, today]);

  const { points: series, effectiveStart } = useMemo(
    () => filterForDateRange(history, startDate, endDate),
    [history, startDate, endDate],
  );

  const { values, timestamps } = useMemo(() => {
    if (dailyPoints) {
      const [lo, hi] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
      const rows = dailyPoints.filter((p) => p.day >= lo && p.day <= hi).sort((a, b) => a.day.localeCompare(b.day));
      return {
        values: rows.map((p) => p.value),
        timestamps: rows.map((p) => dailyDeltaTimestamp(p.day)),
      };
    }
    if (dailyMileage) {
      const byDay = new Map(computeDailyMileageDeltas(series).map((item) => [item.day, item.delta]));
      const [lo, hi] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
      for (const [day, entry] of Object.entries(dailyOverrides ?? {})) {
        if (day >= lo && day <= hi && Number.isFinite(entry.daily_mileage)) {
          byDay.set(day, Math.round(entry.daily_mileage * 10) / 10);
        }
      }
      const deltas = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      return {
        values: deltas.map(([, delta]) => delta),
        timestamps: deltas.map(([day]) => dailyDeltaTimestamp(day)),
      };
    }
    return {
      values: series.map((p) => pickValue!(p)),
      timestamps: series.map((p) => p.ts),
    };
  }, [series, dailyMileage, pickValue, dailyOverrides, dailyPoints, startDate, endDate]);

  const totalDelta = useMemo(() => {
    if (!(dailyMileage || rangeSum)) return 0;
    const sum = values.reduce((total, value) => total + value, 0);
    return dailyMileage ? roundTenth(sum) : sum;
  }, [dailyMileage, rangeSum, values]);

  const rangeDetail = useMemo(() => {
    if (!rangeSum || !dailyPoints) return null;
    if (presetDays === "month" && viewMonth && monthTotals?.[viewMonth]) {
      return monthTotals[viewMonth];
    }
    const [lo, hi] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
    const rows = dailyPoints.filter((p) => p.day >= lo && p.day <= hi);
    return {
      kwh: rows.reduce((sum, row) => sum + (row.kwh ?? row.value), 0),
      times: rows.reduce((sum, row) => sum + (row.times ?? 0), 0),
      seconds: rows.reduce((sum, row) => sum + (row.seconds ?? 0), 0),
    };
  }, [rangeSum, dailyPoints, presetDays, viewMonth, monthTotals, startDate, endDate]);

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

  const displaySeries = useMemo(() => {
    if (values.length <= MAX_CHART_POINTS) {
      return { values, timestamps };
    }
    const indices = decimateIndices(values.length, MAX_CHART_POINTS);
    return {
      values: indices.map((i) => values[i]),
      timestamps: indices.map((i) => timestamps[i]),
    };
  }, [values, timestamps]);

  const points = useMemo(
    () =>
      buildPoints(
        displaySeries.values,
        displaySeries.timestamps,
        plotW,
        CHART_H,
        CHART_PAD,
        xGutter,
        Y_LABEL_W,
        yDomain,
      ),
    [displaySeries, plotW, xGutter, yDomain],
  );
  const path = linePath(points, CHART_H, CHART_PAD, yDomain);
  const gridTicks = useMemo(() => buildGridTicks(values, gridMode, yDomain), [values, gridMode, yDomain]);
  const gridX1 = xGutter + Y_LABEL_W;
  const gridX2 = xGutter + plotW - CHART_PAD;
  const last = values[values.length - 1];
  const rangeCaption = dailyMileage
    ? formatDailyChartCaption(values.length, totalDelta, startDate, endDate)
    : rangeSum
      ? formatDailyChartCaption(values.length, totalDelta, startDate, endDate, unit, false)
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

  const showMonth = (key: string) => {
    const range = monthBounds(key);
    setPresetDays("month");
    setViewMonth(key);
    setStartDate(range.start);
    setEndDate(range.end);
  };

  const applyMonth = () => {
    const current = today.slice(0, 7);
    const key = monthKeys.includes(current) ? current : monthKeys[monthKeys.length - 1];
    if (key) showMonth(key);
  };

  const stepMonth = (delta: number) => {
    if (!viewMonth) return;
    const index = monthKeys.indexOf(viewMonth);
    const next = monthKeys[index + delta];
    if (next) showMonth(next);
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
      <div className={`mini-chart-head${rangeDetail ? " wrap" : ""}`}>
        <span>{title}</span>
        <strong>
          {rangeDetail
            ? `${formatDurationSec(rangeDetail.seconds)} / ${rangeDetail.times} 次 / ${rangeDetail.kwh.toFixed(1)} kWh`
            : rangeSum
              ? values.length > 0
                ? `${totalDelta.toFixed(1)}${unit}`
                : "—"
              : dailyMileage
                ? values.length > 0
                  ? `${formatKm(totalDelta, true)} km`
                  : "—"
                : `${last ?? "—"}${unit}`}
        </strong>
      </div>
      {notes.length > 0 && (
        <p className="muted mini-chart-note">
          {notes.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>
      )}
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
        {monthPreset && presetDays === "month" && (
          <button
            type="button"
            className="mini-chart-day-btn"
            onClick={() => stepMonth(-1)}
            disabled={monthKeys.indexOf(viewMonth ?? "") <= 0}
            aria-label="上个月"
          >
            ‹
          </button>
        )}
        {monthPreset && (
          <button
            type="button"
            className={`mini-chart-day-btn${presetDays === "month" ? " active" : ""}`}
            onClick={applyMonth}
          >
            月
          </button>
        )}
        {monthPreset && presetDays === "month" && (
          <button
            type="button"
            className="mini-chart-day-btn"
            onClick={() => stepMonth(1)}
            disabled={monthKeys.indexOf(viewMonth ?? "") < 0 || monthKeys.indexOf(viewMonth ?? "") >= monthKeys.length - 1}
            aria-label="下个月"
          >
            ›
          </button>
        )}
        <input
          type="date"
          className="mini-chart-date-input"
          value={startDate}
          min={startDate < minDate ? startDate : minDate}
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
          max={endDate > today ? endDate : today}
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
                {byDay
                  ? rangeSum
                    ? `${formatDayZh(localDayKey(active.ts))} · ${active.value.toFixed(1)}${unit}`
                    : `${formatDayZh(localDayKey(active.ts))} · ${formatDeltaValue(active.value)}`
                  : `${fmtTime(active.ts)} · ${active.value}${unit.trim()}`}
              </div>
            </div>
          )}
        </div>
      <div className="mini-chart-labels">
        <span>
          {presetDays === "month"
            ? formatDayZh(startDate)
            : windowLabels.start !== null
              ? formatWindowLabel(windowLabels.start, byDay)
              : "—"}
        </span>
        <span>
          {presetDays === "month"
            ? formatDayZh(endDate)
            : windowLabels.end !== null
              ? formatWindowLabel(windowLabels.end, byDay)
              : ""}
        </span>
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

export function TrendCharts({ history, dailyHistory, power }: TrendChartsProps) {
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
        dailyOverrides={dailyHistory}
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
      <MiniChart
        title="家充"
        unit=" kWh"
        rangeSum
        presetOptions={MILEAGE_PRESET_DAYS}
        defaultPreset={15}
        monthPreset
        monthTotals={powerMonthTotals(power)}
        notes={powerNotes(power)}
        color="#f59e0b"
        history={[]}
        dailyPoints={powerDailyPoints(power)}
      />
    </div>
  );
}

function powerNotes(power?: PowerFile | null): string[] {
  const months = Object.values(power?.months ?? {});
  if (months.length === 0) return [];
  let times = 0;
  let kwh = 0;
  let sec = 0;
  for (const month of months) {
    times += month.total_charging_times;
    kwh += month.total_real_charge_kwh;
    sec += month.total_charging_duration;
  }
  return [`累计 ${formatDurationSec(sec)} / ${times} 次 / ${kwh.toFixed(1)} kWh`];
}

function powerMonthTotals(power?: PowerFile | null): Record<string, { kwh: number; times: number; seconds: number }> {
  const totals: Record<string, { kwh: number; times: number; seconds: number }> = {};
  for (const [key, month] of Object.entries(power?.months ?? {})) {
    if (month.total_charging_times <= 0 && month.total_real_charge_kwh <= 0) continue;
    totals[key] = {
      kwh: month.total_real_charge_kwh,
      times: month.total_charging_times,
      seconds: month.total_charging_duration,
    };
  }
  return totals;
}

function powerDailyPoints(power?: PowerFile | null): { day: string; value: number; times: number; seconds: number; kwh: number }[] {
  const rows: { day: string; value: number; times: number; seconds: number; kwh: number }[] = [];
  for (const month of Object.values(power?.months ?? {})) {
    for (const report of month.reports) {
      if (!report.date) continue;
      rows.push({
        day: report.date,
        value: Math.round(report.real_charge_kwh * 10) / 10,
        times: report.charging_times,
        seconds: report.charging_duration,
        kwh: report.real_charge_kwh,
      });
    }
  }
  rows.sort((a, b) => a.day.localeCompare(b.day));
  return rows;
}
