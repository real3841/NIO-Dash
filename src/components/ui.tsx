import type { ReactNode } from "react";

export function DashCard({
  icon,
  title,
  badge,
  headerExtra,
  children,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  badge?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`dash-card ${className}`.trim()}>
      <header className="dash-card-head">
        <div className="dash-card-title">
          {icon && <span className="dash-card-icon">{icon}</span>}
          <h2>{title}</h2>
        </div>
        <div className="dash-card-head-right">
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
