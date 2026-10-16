import { useState } from "react";
import { CapturePaste } from "./CapturePaste";
import {
  formatStockWatchPollSec,
  STOCK_WATCH_POLL_OPTIONS,
  type StockWatchState,
} from "../lib/stock-watch";

interface Props {
  stockWatch?: StockWatchState | null;
  onPollSecChange?: (pollSec: number) => void | Promise<void>;
  onSaveAuth?: (auth: { cookie?: string; token?: string }) => boolean | Promise<boolean>;
}

export function StockWatchLoginPanel({ stockWatch, onPollSecChange, onSaveAuth }: Props) {
  const [cookieDraft, setCookieDraft] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="sync-hub-panel-body stock-login-panel">
      <div className="stock-watch-poll-row">
        <span className="stock-watch-poll-label">自动检查</span>
        <select
          className="stock-watch-poll-select"
          value={stockWatch?.pollSec ?? 300}
          onChange={(e) => void onPollSecChange?.(Number(e.target.value))}
        >
          {STOCK_WATCH_POLL_OPTIONS.map((opt) => (
            <option key={opt.sec} value={opt.sec}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="muted">
          当前 {stockWatch ? formatStockWatchPollSec(stockWatch.pollSec) : "—"}
        </span>
      </div>
      <p className="muted stock-watch-hint">
        Cookie {stockWatch?.cookieConfigured ? "已配置" : "未配置"} · Token{" "}
        {stockWatch?.tokenConfigured ? "已配置" : "未配置"}。换电和驾享共用。留空表示不修改。
      </p>
      <CapturePaste
        expected="stock"
        onApply={(parsed) => {
          if (parsed.cookie) setCookieDraft(parsed.cookie);
          if (parsed.headerToken) setTokenDraft(parsed.headerToken);
        }}
      />
      <label className="stock-watch-auth-field">
        Cookie
        <textarea
          rows={3}
          value={cookieDraft}
          placeholder="粘贴 goodsDetail 请求头里的整段 Cookie"
          onChange={(e) => setCookieDraft(e.target.value)}
        />
      </label>
      <label className="stock-watch-auth-field">
        Token
        <input
          type="password"
          value={tokenDraft}
          placeholder="粘贴 SZCRtoken 的值"
          autoComplete="off"
          onChange={(e) => setTokenDraft(e.target.value)}
        />
      </label>
      <div className="stock-watch-actions">
        <button
          type="button"
          className="btn secondary"
          disabled={!cookieDraft.trim() && !tokenDraft.trim()}
          onClick={() => {
            void (async () => {
              const saved = await onSaveAuth?.({
                ...(cookieDraft.trim() ? { cookie: cookieDraft.trim() } : {}),
                ...(tokenDraft.trim() ? { token: tokenDraft.trim() } : {}),
              });
              if (saved) {
                setCookieDraft("");
                setTokenDraft("");
                setMessage("已保存。Cookie 和 Token 不会显示在页面上");
              } else {
                setMessage("保存失败");
              }
            })();
          }}
        >
          保存登录信息
        </button>
      </div>
      {message && <p className="muted stock-watch-hint">{message}</p>}
    </div>
  );
}
