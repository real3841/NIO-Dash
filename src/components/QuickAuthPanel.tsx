import { useRef, useState } from "react";

interface QuickAuthResponse {
  ok: boolean;
  error?: string;
  result?: {
    tokenUpdated: boolean;
    updated: string[];
    power: string | null;
    warnings: string[];
  };
  runs?: Record<string, string>;
}

interface Props {
  onDone?: () => void | Promise<void>;
}

const RUN_LABELS: Record<string, string> = { vehicle: "车况", change: "换电订单" };

export function QuickAuthPanel({ onDone }: Props) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (payload: string) => {
    setBusy(true);
    setError(null);
    setLines([]);
    try {
      const res = await fetch("/api/quick-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: payload }),
      });
      const body = (await res.json()) as QuickAuthResponse;
      if (!res.ok || !body.ok || !body.result) {
        setError(body.error ?? `更新失败 (${res.status})`);
        return;
      }
      const r = body.result;
      const next: string[] = [];
      next.push(r.tokenUpdated ? "Token 已更新（车况、换电、补充接口共用）" : "Token 未变");
      if (r.updated.length > 0) next.push(`地址已更新：${r.updated.join("、")}`);
      if (r.power) next.push(`加电：${r.power}`);
      for (const [slot, status] of Object.entries(body.runs ?? {})) {
        next.push(`${RUN_LABELS[slot] ?? slot}：${status === "ok" ? "已刷新" : `刷新失败 · ${status}`}`);
      }
      next.push(...r.warnings);
      setLines(next);
      setText("");
      setFileName(null);
      await onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法连接本地服务");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sync-hub-panel-body quick-auth-panel">
      <p className="muted">
        Token 过期后粘贴新的 Bearer Token，或任意一条蔚来请求的抓包原文，车况和换电订单会立即重拉。
        选 ProxyPin 导出的 HAR 还会顺带更新带签名的地址和家充桩数据。
      </p>
      <textarea
        rows={3}
        value={text}
        disabled={busy}
        placeholder="Bearer xxxx… 或整段请求（URL + 请求头）"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row quick-auth-actions">
        <button
          type="button"
          className="btn primary"
          disabled={busy || !text.trim()}
          onClick={() => void submit(text)}
        >
          {busy ? "更新中…" : "更新并刷新"}
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
          选择 HAR 文件
        </button>
        {fileName && <span className="muted">{fileName}</span>}
        <input
          ref={fileRef}
          type="file"
          accept=".har,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setFileName(file.name);
            void file.text().then(submit);
          }}
        />
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {lines.length > 0 && (
        <ul className="quick-auth-result">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
