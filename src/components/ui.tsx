import type { ReactNode } from "react";
import { IconEyeOff, IconGrip, IconJson } from "./icons";

export function DashCard({
  icon,
  title,
  badge,
  headerExtra,
  children,
  className = "",
  dragHandleProps,
  dragListeners,
  onHide,
  onShowRvs,
}: {
  icon?: ReactNode;
  title: string;
  badge?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  className?: string;
  dragHandleProps?: Record<string, unknown> & { ref?: (element: HTMLButtonElement | null) => void };
  dragListeners?: Record<string, unknown>;
  onHide?: () => void;
  onShowRvs?: () => void;
}) {
  const dragHandleRef = dragHandleProps?.ref;
  const dragHandleRest = dragHandleProps
    ? Object.fromEntries(Object.entries(dragHandleProps).filter(([key]) => key !== "ref"))
    : undefined;

  return (
    <section className={`dash-card ${className}`.trim()}>
      <header className="dash-card-head">
        <div className="dash-card-title">
          {icon && <span className="dash-card-icon">{icon}</span>}
          <h2>{title}</h2>
        </div>
        <div className="dash-card-head-right">
          {onShowRvs && (
            <button
              type="button"
              className="card-tool-btn"
              onClick={onShowRvs}
              title="查看 RVS 原始数据"
              aria-label="查看 RVS 原始数据"
            >
              <IconJson />
            </button>
          )}
          {onHide && (
            <button
              type="button"
              className="card-tool-btn"
              onClick={onHide}
              title="隐藏此卡片"
              aria-label="隐藏此卡片"
            >
              <IconEyeOff />
            </button>
          )}
          {dragListeners && Object.keys(dragListeners).length > 0 && (
            <button
              type="button"
              className="card-tool-btn card-drag-btn"
              title="拖拽排序"
              aria-label="拖拽排序"
              ref={dragHandleRef}
              {...dragHandleRest}
              {...dragListeners}
            >
              <IconGrip />
            </button>
          )}
          {headerExtra}
          {badge}
        </div>
      </header>
      <div className="dash-card-body">{children}</div>
    </section>
  );
}

export function RowItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="row-item">
      <span className="row-item-label">{label}</span>
      <span className="row-item-value">{value}</span>
    </div>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "dark" | "success" | "warning" | "danger";
}) {
  return <span className={`status-pill status-pill-${tone}`}>{children}</span>;
}

export function Toggle({ on, label }: { on: boolean; label?: string }) {
  return (
    <span className="toggle-wrap" aria-label={label}>
      <span className={`toggle ${on ? "toggle-on" : ""}`}>
        <span className="toggle-knob" />
      </span>
    </span>
  );
}

export function AddressPill({ children, href }: { children: ReactNode; href?: string }) {
  if (href) {
    return (
      <a className="address-pill" href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return <div className="address-pill">{children}</div>;
}

export function StatusDots({ states }: { states: Array<"ok" | "warn" | "bad" | "idle"> }) {
  return (
    <div className="status-dots">
      {states.map((s, i) => (
        <span key={i} className={`status-dot status-dot-${s}`} />
      ))}
    </div>
  );
}
