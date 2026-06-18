import { useMemo, useState } from "react";
import {
  parseTrayDisplay,
  previewTrayTitle,
  serializeTrayDisplay,
  TRAY_DISPLAY_OPTIONS,
  type TrayDisplayField,
} from "../lib/tray-display";
import { saveTrayEnv } from "../lib/env-config";

interface TrayDisplaySettingsProps {
  initialDisplay: string;
  onSaved?: () => void;
}

export function TrayDisplaySettings({ initialDisplay, onSaved }: TrayDisplaySettingsProps) {
  const [fields, setFields] = useState<TrayDisplayField[]>(() => parseTrayDisplay(initialDisplay));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const preview = useMemo(() => previewTrayTitle(fields), [fields]);

  const toggle = (id: TrayDisplayField) => {
    setFields((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((f) => f !== id);
        return next.length > 0 ? next : prev;
      }
      return [...prev, id];
    });
    setMessage(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await saveTrayEnv(serializeTrayDisplay(fields));
      setMessage("菜单栏显示已保存，右上角将立即更新");
      onSaved?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="card-manager-details tray-display-details">
      <summary className="card-manager-summary">
        <span>菜单栏显示</span>
        <span className="drawer-summary-meta">预览 {preview} · 点击展开</span>
      </summary>
      <section className="panel tray-display-panel">
        <p className="tray-display-preview">
          预览：<strong>{preview}</strong>
        </p>

        <div className="tray-display-options">
          {TRAY_DISPLAY_OPTIONS.map((opt) => (
            <label key={opt.id} className="tray-display-option">
              <input
                type="checkbox"
                checked={fields.includes(opt.id)}
                onChange={() => toggle(opt.id)}
              />
              <span className="tray-display-option-label">{opt.label}</span>
              <span className="tray-display-option-example">{opt.example}</span>
            </label>
          ))}
        </div>

        <p className="muted tray-display-hint">可多选，按顺序用「 · 」连接；至少保留一项</p>

        <div className="row">
          <button type="button" className="btn secondary" disabled={saving} onClick={() => void handleSave()}>
            {saving ? "保存中…" : "保存菜单栏设置"}
          </button>
        </div>
        {message && <p className="save-hint">{message}</p>}
      </section>
    </details>
  );
}
