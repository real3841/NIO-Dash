import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  entryHasDetail,
  extractRawResponse,
  fetchRuntimeLog,
  formatApiRequest,
  formatLogDetailRows,
  formatRawJson,
  resolveEntryDetail,
  SLOT_LABELS,
  type FetchLogEntry,
  type FetchLogSnapshot,
  type FetchLogSlot,
} from "../lib/fetch-log";
import { fmtTime } from "../lib/vehicle";

interface Props {
  onClose: () => void;
}

function fmtNext(at: number | null): string {
  if (!at) return "—";
  return fmtTime(at);
}

function scheduleLine(
  label: string,
  slot: FetchLogSnapshot["schedule"]["vehicle"],
  running: boolean,
): string {
  const parts = [`${label}：下次 ${fmtNext(slot.nextAt)}`];
  if (slot.intervalSec) parts.push(`间隔 ${slot.intervalSec}s`);
  if (slot.detail) parts.push(slot.detail);
  if (running) parts.push("拉取中…");
  return parts.join(" · ");
}

function levelClass(level: FetchLogEntry["level"]): string {
  if (level === "success") return "runtime-log-success";
  if (level === "error") return "runtime-log-error";
  return "runtime-log-info";
}

function LogDetailPanel({ detail }: { detail: Record<string, unknown> }) {
  const rows = formatLogDetailRows(detail);
  const pairedMessage = detail.pairedMessage as string | undefined;
  const rawText = formatRawJson(extractRawResponse(detail));
  const apiRequestText = formatApiRequest(detail);

  return (
    <div className="runtime-log-detail-panel">
      {pairedMessage && (
        <p className="runtime-log-detail-note muted">关联记录：{pairedMessage}</p>
      )}
      {apiRequestText ? (
        <details className="runtime-log-detail-request">
          <summary>API 请求</summary>
          <pre className="runtime-log-api-request">{apiRequestText}</pre>
        </details>
      ) : null}
      <details className="runtime-log-detail-summary">
        <summary>拉取详情</summary>
        <dl className="runtime-log-detail-dl">
          {rows.map((row) => (
            <div key={row.label} className="runtime-log-detail-row">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </details>
      {rawText ? (
        <details className="runtime-log-detail-raw">
          <summary>完整 API 响应</summary>
          <pre>{rawText}</pre>
        </details>
      ) : null}
    </div>
  );
}

export function SyncRuntimeLogModal({ onClose }: Props) {
  const [snapshot, setSnapshot] = useState<FetchLogSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await fetchRuntimeLog();
    if (!data) {
      setError("无法读取运行日志（请确认应用在 Electron 中运行）");
      return;
    }
    setError(null);
    setSnapshot(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const logs = snapshot?.logs ?? [];
  const selectedEntry = selectedId ? logs.find((e) => e.id === selectedId) : null;
  const selectedIndex = selectedEntry ? logs.indexOf(selectedEntry) : -1;
  const selectedDetail =
    selectedEntry && selectedIndex >= 0
      ? resolveEntryDetail(selectedEntry, logs, selectedIndex, snapshot?.running)
      : null;

  const handleEntryClick = (entry: FetchLogEntry, index: number) => {
    if (!entryHasDetail(entry, logs, index, snapshot?.running)) return;
    setSelectedId((prev) => (prev === entry.id ? null : entry.id));
  };

  return createPortal(
    <div
      className="card-rvs-overlay runtime-log-overlay"
      role="presentation"
      onClick={onClose}
      onWheel={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div
        className="card-rvs-dialog runtime-log-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="runtime-log-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="card-rvs-head">
          <h3 id="runtime-log-title">运行日志</h3>
          <div className="card-rvs-actions">
            <button type="button" className="btn ghost btn-sm" onClick={() => void load()}>
              刷新
            </button>
            <button type="button" className="card-tool-btn" onClick={onClose} aria-label="关闭">
              ×
            </button>
          </div>
        </header>

        <div className="runtime-log-body">
          {loading && !snapshot && <p className="muted">加载中…</p>}
          {error && <div className="alert alert-danger">{error}</div>}

          {snapshot && (
            <>
              <details className="runtime-log-schedule">
                <summary>下次采集</summary>
                <p>{scheduleLine("车辆", snapshot.schedule.vehicle, snapshot.running.vehicle)}</p>
                <p>{scheduleLine("换电", snapshot.schedule.change, snapshot.running.change)}</p>
                <p>{scheduleLine("签到", snapshot.schedule.checkin, snapshot.running.checkin)}</p>
              </details>

              <section className="runtime-log-list-wrap">
                <h4>
                  最近记录
                  <span className="runtime-log-count muted">
                    {snapshot.logCount ?? logs.length} / {snapshot.logLimit ?? 500} 条
                  </span>
                </h4>
                <p className="runtime-log-hint muted">在下方列表滚动查看；点击记录展开详情</p>
                <div className="runtime-log-list-scroll">
                  {logs.length === 0 ? (
                    <p className="muted">暂无日志，等待首次定时拉取…</p>
                  ) : (
                    <ul className="runtime-log-list">
                      {logs.map((entry, i) => {
                        const clickable = entryHasDetail(entry, logs, i, snapshot.running);
                        const expanded = selectedId === entry.id;
                        const detail =
                          expanded && selectedDetail && selectedId ? (
                            <LogDetailPanel key={selectedId} detail={selectedDetail} />
                          ) : null;

                        return (
                          <li
                            key={entry.id}
                            className={`runtime-log-item ${levelClass(entry.level)}${clickable ? " runtime-log-item-clickable" : ""}${expanded ? " runtime-log-item-expanded" : ""}`}
                          >
                            <button
                              type="button"
                              className="runtime-log-item-btn"
                              disabled={!clickable}
                              onClick={() => handleEntryClick(entry, i)}
                              aria-expanded={expanded}
                            >
                              <span className="runtime-log-time">{fmtTime(entry.at)}</span>
                              <span className="runtime-log-slot">
                                [{SLOT_LABELS[entry.slot as FetchLogSlot] ?? entry.slot}]
                              </span>
                              <span className="runtime-log-msg">{entry.message}</span>
                              {clickable && (
                                <span className="runtime-log-chevron" aria-hidden="true">
                                  {expanded ? "▾" : "▸"}
                                </span>
                              )}
                            </button>
                            {detail}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
