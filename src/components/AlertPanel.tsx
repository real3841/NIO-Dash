import type { VehicleAlert } from "../lib/vehicle";

interface AlertPanelProps {
  alerts: VehicleAlert[];
}

export function AlertPanel({ alerts }: AlertPanelProps) {
  const critical = alerts.filter((a) => a.tone === "danger" || a.tone === "warning");
  const info = alerts.filter((a) => a.tone === "info" || a.tone === "success");

  return (
    <section className="panel alerts-panel">
      <div className="panel-head">
        <h2>智能告警</h2>
        <span className="badge">{critical.length > 0 ? `${critical.length} 项需关注` : "正常"}</span>
      </div>
      <div className="alert-grid">
        {[...critical, ...info].map((alert) => (
          <article key={alert.id} className={`alert alert-${alert.tone}`}>
            <strong>{alert.title}</strong>
            <p>{alert.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
