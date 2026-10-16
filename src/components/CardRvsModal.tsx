import { useEffect } from "react";

interface Props {
  title: string;
  payload: Record<string, unknown>;
  onClose: () => void;
  kind?: string;
}

export function CardRvsModal({ title, payload, onClose, kind = "RVS 原始数据" }: Props) {
  const json = JSON.stringify(payload, null, 2);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="card-rvs-overlay" role="presentation" onClick={onClose}>
      <div
        className="card-rvs-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-rvs-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="card-rvs-head">
          <h3 id="card-rvs-title">{title} · {kind}</h3>
          <div className="card-rvs-actions">
            <button
              type="button"
              className="btn ghost btn-sm"
              onClick={() => void navigator.clipboard.writeText(json)}
            >
              复制 JSON
            </button>
            <button type="button" className="card-tool-btn" onClick={onClose} aria-label="关闭">
              ×
            </button>
          </div>
        </header>
        <pre className="card-rvs-pre">{json}</pre>
      </div>
    </div>
  );
}
