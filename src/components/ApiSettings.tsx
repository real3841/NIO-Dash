import { useEffect, useState } from "react";
import type { FetchMeta } from "../lib/storage";
import type { CheckinData } from "../lib/checkin";
import {
  CHECKIN_API_FIELDS,
  CHANGE_API_FIELDS,
  CHANGE_POLL_FIELDS,
  fetchEnvConfig,
  saveChangeEnv,
  saveVehicleEnv,
  VEHICLE_API_FIELDS,
  VEHICLE_POLL_FIELDS,
  type ChangeEnv,
  type EnvConfigResponse,
  type VehicleEnv,
} from "../lib/env-config";
import { fmtTime } from "../lib/vehicle";
import { parsePollSec } from "../lib/poll-schedule";
import type { VehiclePollEnv } from "../lib/poll-schedule";
import { EnvConfigForm } from "./EnvConfigForm";
import { TrayDisplaySettings } from "./TrayDisplaySettings";
import { CardLayoutSettings } from "./CardLayoutSettings";
import { SyncRuntimeLogModal } from "./SyncRuntimeLogModal";

export type SyncTarget = "vehicle" | "change" | "all";

interface ApiSettingsProps {
  onRefresh: (target: SyncTarget, triggerFetch: boolean) => void;
  loadingTarget: SyncTarget | null;
  lastSyncVehicle: number | null;
  lastSyncChange: number | null;
  vehicleMeta: FetchMeta | null;
  changeMeta: FetchMeta | null;
  checkinMeta?: FetchMeta | null;
  checkinData?: CheckinData | null;
  errorVehicle: string | null;
  errorChange: string | null;
  vehiclePollSec?: number;
  changePollSec?: number;
  onPollConfigLoaded: (vehicleEnv: VehiclePollEnv, changeSec: number) => void;
}

function metaLine(meta: FetchMeta | null | undefined): string {
  if (!meta) return "暂无拉取记录";
  if (meta.ok) return `拉取成功 · ${fmtTime(meta.at)}`;
  return `拉取失败 · ${meta.error ?? "未知错误"}`;
}

export function ApiSettings({
  onRefresh,
  loadingTarget,
  lastSyncVehicle,
  lastSyncChange,
  vehicleMeta,
  changeMeta,
  checkinMeta,
  checkinData,
  errorVehicle,
  errorChange,
  vehiclePollSec,
  changePollSec,
  onPollConfigLoaded,
}: ApiSettingsProps) {
  const [envConfig, setEnvConfig] = useState<EnvConfigResponse | null>(null);
  const [vehicleDraft, setVehicleDraft] = useState<VehicleEnv | null>(null);
  const [changeDraft, setChangeDraft] = useState<ChangeEnv | null>(null);
  const [configOpen, setConfigOpen] = useState<"vehicle" | "change" | "checkin" | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [savingChange, setSavingChange] = useState(false);
  const [saveMsgVehicle, setSaveMsgVehicle] = useState<string | null>(null);
  const [saveMsgChange, setSaveMsgChange] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const loadConfig = async () => {
    setLoadingConfig(true);
    setConfigError(null);
    try {
      const cfg = await fetchEnvConfig();
      setEnvConfig(cfg);
      const vehicle = {
        ...cfg.vehicle,
        NIO_VEHICLE_POLL_DRIVING_SEC:
          cfg.vehicle.NIO_VEHICLE_POLL_DRIVING_SEC || "900",
        NIO_VEHICLE_POLL_DAY_SEC: cfg.vehicle.NIO_VEHICLE_POLL_DAY_SEC || "1800",
        NIO_VEHICLE_POLL_NIGHT_SEC: cfg.vehicle.NIO_VEHICLE_POLL_NIGHT_SEC || "3600",
      };
      const change = {
        ...cfg.change,
        NIO_CHANGE_POLL_INTERVAL:
          cfg.change.NIO_CHANGE_POLL_INTERVAL ||
          cfg.general.NIO_POLL_INTERVAL ||
          "3600",
      };
      setVehicleDraft(vehicle);
      setChangeDraft(change);
      onPollConfigLoaded(vehicle, parsePollSec(change.NIO_CHANGE_POLL_INTERVAL, 3600));
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "无法加载配置");
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    void loadConfig();
    if (new URLSearchParams(window.location.search).get("setup") === "1") {
      setConfigOpen("vehicle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = (target: SyncTarget) => loadingTarget === target || loadingTarget === "all";

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleDraft) return;
    setSavingVehicle(true);
    setSaveMsgVehicle(null);
    try {
      await saveVehicleEnv(vehicleDraft);
      setSaveMsgVehicle("配置已保存，车辆拉取计划已更新");
      await loadConfig();
    } catch (err) {
      setSaveMsgVehicle(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingVehicle(false);
    }
  };

  const handleSaveChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeDraft) return;
    setSavingChange(true);
    setSaveMsgChange(null);
    try {
      await saveChangeEnv(changeDraft);
      setSaveMsgChange("配置已保存，换电拉取计划已更新");
      await loadConfig();
    } catch (err) {
      setSaveMsgChange(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingChange(false);
    }
  };

  return (
    <section className="panel api-panel">
      <div className="panel-head">
        <h2>数据同步</h2>
        <div className="row sync-actions">
          <button type="button" className="btn ghost" onClick={() => setLogOpen(true)}>
            运行日志
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => onRefresh("vehicle", true)}
            disabled={busy("vehicle")}
          >
            {busy("vehicle") ? "车辆同步中…" : "刷新车辆"}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => onRefresh("change", true)}
            disabled={busy("change")}
          >
            {busy("change") ? "换电同步中…" : "刷新换电"}
          </button>
        </div>
      </div>
      {logOpen && <SyncRuntimeLogModal onClose={() => setLogOpen(false)} />}

      {configError && (
        <div className="alert alert-danger">
          {configError}
          <br />
          <span className="muted">本地开发请先运行: npm run serve:api</span>
        </div>
      )}

      {envConfig?.path && (
        <p className="muted api-hint">配置文件: {envConfig.path}</p>
      )}

      <TrayDisplaySettings
        key={envConfig?.general.NIO_TRAY_DISPLAY ?? "default"}
        initialDisplay={envConfig?.general.NIO_TRAY_DISPLAY || "soc,range"}
      />

      <CardLayoutSettings />

      <div className="sync-split sync-split-3">
        <div className="sync-block">
          <div className="sync-block-head">
            <h3>车辆 API 配置</h3>
            <button
              type="button"
              className="btn ghost btn-sm"
              onClick={() => setConfigOpen((v) => (v === "vehicle" ? null : "vehicle"))}
            >
              {configOpen === "vehicle" ? "收起" : "编辑"}
            </button>
          </div>
          <p className="muted sync-block-meta">{metaLine(vehicleMeta)}</p>
          <p className="muted sync-block-meta">
            页面读取{lastSyncVehicle ? ` · ${fmtTime(lastSyncVehicle)}` : " · —"}
          </p>
          {errorVehicle && <div className="alert alert-danger">{errorVehicle}</div>}
          {configOpen === "vehicle" && vehicleDraft && (
            <form className="api-form env-config-form" onSubmit={handleSaveVehicle}>
              <EnvConfigForm
                fields={VEHICLE_API_FIELDS}
                values={vehicleDraft as unknown as Record<string, string>}
                onChange={(key, value) =>
                  setVehicleDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
                }
                disabled={loadingConfig || savingVehicle}
              />
              <p className="muted api-hint">
                从 Postman 复制完整 GET URL（含 sign、timestamp），再单独填入 Authorization Token。
                sign 过期后需重新复制 URL。
              </p>
              <details className="vehicle-poll-details">
                <summary className="muted">拉取间隔（可选）</summary>
                <EnvConfigForm
                  fields={VEHICLE_POLL_FIELDS}
                  values={vehicleDraft as unknown as Record<string, string>}
                  onChange={(key, value) =>
                    setVehicleDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
                  }
                  disabled={loadingConfig || savingVehicle}
                />
              </details>
              <p className="muted api-hint">
                根据车辆状态与时段自动选择拉取间隔：行驶中优先，否则按白天 09:00–17:00 / 夜间区分
              </p>
              <div className="row">
                <button type="submit" className="btn secondary" disabled={savingVehicle}>
                  {savingVehicle ? "保存中…" : "保存车辆配置"}
                </button>
                <button type="button" className="btn ghost" onClick={() => void loadConfig()}>
                  重新加载
                </button>
              </div>
              {saveMsgVehicle && <p className="save-hint">{saveMsgVehicle}</p>}
            </form>
          )}
        </div>

        <div className="sync-block">
          <div className="sync-block-head">
            <h3>换电 API 配置</h3>
            <button
              type="button"
              className="btn ghost btn-sm"
              onClick={() => setConfigOpen((v) => (v === "change" ? null : "change"))}
            >
              {configOpen === "change" ? "收起" : "编辑"}
            </button>
          </div>
          <p className="muted sync-block-meta">{metaLine(changeMeta)}</p>
          <p className="muted sync-block-meta">
            页面读取{lastSyncChange ? ` · ${fmtTime(lastSyncChange)}` : " · —"}
          </p>
          {errorChange && <div className="alert alert-danger">{errorChange}</div>}
          {configOpen === "change" && changeDraft && (
            <form className="api-form env-config-form" onSubmit={handleSaveChange}>
              <EnvConfigForm
                fields={CHANGE_API_FIELDS}
                values={changeDraft as unknown as Record<string, string>}
                onChange={(key, value) =>
                  setChangeDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
                }
                disabled={loadingConfig || savingChange}
              />
              <p className="muted api-hint">
                从 Postman 复制完整 URL（Query Params），再单独填入 Authorization Token。接口使用 POST 请求。
              </p>
              <details className="vehicle-poll-details">
                <summary className="muted">拉取间隔（可选）</summary>
                <EnvConfigForm
                  fields={CHANGE_POLL_FIELDS}
                  values={changeDraft as unknown as Record<string, string>}
                  onChange={(key, value) =>
                    setChangeDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
                  }
                  disabled={loadingConfig || savingChange}
                />
              </details>
              <div className="row">
                <button type="submit" className="btn secondary" disabled={savingChange}>
                  {savingChange ? "保存中…" : "保存换电配置"}
                </button>
                <button type="button" className="btn ghost" onClick={() => void loadConfig()}>
                  重新加载
                </button>
              </div>
              {saveMsgChange && <p className="save-hint">{saveMsgChange}</p>}
            </form>
          )}
        </div>

        <div className="sync-block">
          <div className="sync-block-head">
            <h3>签到 API 配置</h3>
            <button
              type="button"
              className="btn ghost btn-sm"
              onClick={() => setConfigOpen((v) => (v === "checkin" ? null : "checkin"))}
            >
              {configOpen === "checkin" ? "收起" : "编辑"}
            </button>
          </div>
          <p className="muted sync-block-meta">{metaLine(checkinMeta)}</p>
          <p className="muted sync-block-meta">
            {checkinData
              ? `今日${checkinData.checked_in ? "已" : "未"}签到 · 连续 ${checkinData.continuous_days} 天`
              : "暂无签到数据"}
          </p>
          <p className="muted sync-block-meta">
            页面读取{lastSyncVehicle ? ` · ${fmtTime(lastSyncVehicle)}` : " · —"}
          </p>
          {configOpen === "checkin" && vehicleDraft && (
            <form className="api-form env-config-form" onSubmit={handleSaveVehicle}>
              <EnvConfigForm
                fields={CHECKIN_API_FIELDS}
                values={vehicleDraft as unknown as Record<string, string>}
                onChange={(key, value) =>
                  setVehicleDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
                }
                disabled={loadingConfig || savingVehicle}
              />
                <p className="muted api-hint">
                  GET 签到接口，每天 9:00 自动拉取一次；9 点后首次打开也会补拉，当天不再重复。Token 可留空，默认沿用车辆 Authorization。
                </p>
              <div className="row">
                <button type="submit" className="btn secondary" disabled={savingVehicle}>
                  {savingVehicle ? "保存中…" : "保存签到配置"}
                </button>
                <button type="button" className="btn ghost" onClick={() => void loadConfig()}>
                  重新加载
                </button>
              </div>
              {saveMsgVehicle && <p className="save-hint">{saveMsgVehicle}</p>}
            </form>
          )}
        </div>
      </div>

      <div className="sync-meta">
        <span>
          页面重读 JSON：车辆约每 {vehiclePollSec ?? "—"}s（随行驶/白天/夜间变化） · 换电每{" "}
          {changePollSec ?? (changeDraft ? parsePollSec(changeDraft.NIO_CHANGE_POLL_INTERVAL, 3600) : "—")}s
        </span>
        <button
          type="button"
          className="btn ghost btn-sm"
          onClick={() => onRefresh("all", true)}
          disabled={loadingTarget !== null}
        >
          {loadingTarget === "all" ? "全部同步中…" : "全部刷新（车辆+换电）"}
        </button>
      </div>
    </section>
  );
}
