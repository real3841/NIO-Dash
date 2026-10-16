import { useState } from "react";
import { captureKind, captureSummary, parseCapture, type ParsedCapture } from "../lib/capture-request";

interface Props {
  expected: "vehicle" | "change" | "stock";
  disabled?: boolean;
  onApply: (parsed: ParsedCapture) => void;
}

function wrongPlace(kind: "vehicle" | "change" | "stock"): string {
  if (kind === "vehicle") return "这是车辆请求，请贴到车辆 API";
  if (kind === "change") return "这是换电请求，请贴到换电 API";
  return "这是库存请求，请贴到库存登录";
}

function hintFor(expected: Props["expected"]): string {
  if (expected === "vehicle") {
    return "把地址和下面的请求头整段贴进来。地址和请求头之间可以有空行。程序会按 GET 带上 Token 和 User-Agent。";
  }
  if (expected === "change") {
    return "把地址和下面的请求头整段贴进来。程序会按 POST 发送，正文为 {}，并带上 Token、User-Agent 和 mobileinfo。";
  }
  return "把 goodsDetail 的地址和请求头整段贴进来。Chrome 里名称和内容各占一行也可以。会填入 Cookie 和 token。";
}

export function CapturePaste({ expected, disabled, onApply }: Props) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    setError(null);
    setMessage(null);
    try {
      const parsed = parseCapture(text);
      const kind = captureKind(parsed.url);
      if (kind !== "unknown" && kind !== expected) {
        setError(wrongPlace(kind));
        return;
      }
      if (expected === "stock") {
        if (!parsed.cookie && !parsed.headerToken) {
          setError("没有找到 Cookie 或 token，请连同请求头一起粘贴");
          return;
        }
      } else if (!parsed.token) {
        setError("没有找到 Authorization，请连同请求头一起粘贴");
        return;
      }
      onApply(parsed);
      setText("");
      setMessage(`${captureSummary(parsed)}。已填入下方，点保存后才会生效`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法解析这段抓包");
    }
  };

  return (
    <div className="capture-paste">
      <label className="env-field-span2">
        粘贴抓包原文
        <span className="env-field-hint">{hintFor(expected)}</span>
        <textarea
          rows={6}
          value={text}
          disabled={disabled}
          placeholder={"https://...\nHost: ...\nAuthorization: Bearer ...\nUser-Agent: ..."}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <button type="button" className="btn secondary" disabled={disabled || !text.trim()} onClick={apply}>
        解析并填入
      </button>
      {message && <p className="save-hint">{message}</p>}
      {error && <p className="nas-error">{error}</p>}
    </div>
  );
}
