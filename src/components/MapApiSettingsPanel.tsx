import { useCallback, useEffect, useState } from "react";
import {
  fetchEnvConfig,
  MAP_API_FIELDS,
  saveMapEnv,
  type MapEnv,
} from "../lib/env-config";
import { mapTileFromEnv } from "../lib/map-tiles";
import { EnvConfigForm } from "./EnvConfigForm";

interface MapApiSettingsPanelProps {
  onSaved?: () => void;
}

export function MapApiSettingsPanel({ onSaved }: MapApiSettingsPanelProps) {
  const [draft, setDraft] = useState<MapEnv | null>(null);
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = await fetchEnvConfig();
      setDraft(cfg.map);
      setConfigPath(cfg.path ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法加载地图配置");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tilePreview = draft ? mapTileFromEnv(draft) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setSaveMsg(null);
    setError(null);
    try {
      await saveMapEnv(draft);
      setSaveMsg("地图 API 已保存");
      onSaved?.();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sync-hub-panel-body map-api-embedded">
      <div className="runtime-log-embedded-head">
        <h3 className="runtime-log-embedded-title">地图 API</h3>
        <button type="button" className="btn ghost btn-sm" onClick={() => void load()}>
          重新加载
        </button>
      </div>

      <div className="runtime-log-body map-api-body">
        {loading && !draft && <p className="muted">加载中…</p>}
        {error && <div className="alert alert-danger">{error}</div>}

        {draft && (
          <form className="api-form env-config-form" onSubmit={(e) => void handleSubmit(e)}>
            {configPath && <p className="muted api-hint">写入配置文件：{configPath}</p>}
            <p className="muted api-hint">
              在高德开放平台（lbs.amap.com）创建应用并申请 Key。「Web 服务」用于地址解析；「Web 端 JS
              API」用于切换每日行驶路径底图为高德。
            </p>
            <EnvConfigForm
              fields={MAP_API_FIELDS}
              values={draft as unknown as Record<string, string>}
              onChange={(key, value) =>
                setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
              }
              disabled={loading || saving}
            />
            {tilePreview && (
              <p className="muted api-hint">
                当前底图：
                {tilePreview.provider === "amap" ? "高德地图" : "OpenStreetMap（未填 Web 端 Key）"}
                {draft.NIO_AMAP_WEB_SERVICE_KEY.trim()
                  ? " · 地址解析：高德"
                  : " · 地址解析：OpenStreetMap"}
              </p>
            )}
            <div className="row">
              <button type="submit" className="btn secondary" disabled={saving}>
                {saving ? "保存中…" : "保存地图 API"}
              </button>
            </div>
            {saveMsg && <p className="save-hint">{saveMsg}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
