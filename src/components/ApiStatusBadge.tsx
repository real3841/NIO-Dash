import type { ApiConfigStatus } from "../lib/api-status";
import { apiStatusDetail } from "../lib/api-status";
import type { FetchMeta } from "../lib/storage";

interface ApiStatusBadgeProps {
  status: ApiConfigStatus;
  meta?: FetchMeta | null;
}

export function ApiStatusBadge({ status, meta }: ApiStatusBadgeProps) {
  const glyph = status === "ok" ? "✓" : status === "error" ? "✕" : status === "pending" ? "…" : "—";
  const title = apiStatusDetail(status, meta);

  return (
    <span
      className={`api-status-badge api-status-${status}`}
      title={title}
      aria-label={title}
      role="img"
    >
      {glyph}
    </span>
  );
}
