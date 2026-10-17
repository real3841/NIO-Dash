import { useEffect, useState } from "react";
import type { FetchMeta } from "../lib/storage";
import type { CheckinData } from "../lib/checkin";
import {
  CHECKIN_API_FIELDS,
  CHANGE_API_FIELDS,
  fetchEnvConfig,
  saveChangeEnv,
  saveVehicleEnv,
  VEHICLE_API_FIELDS,
  VEHICLE_POLL_FIELDS,
  type ChangeEnv,
  type EnvConfigResponse,
  type VehicleEnv,
} from "../lib/env-config";
import { errorKindHint } from "../lib/nio-api-errors";
import { captureFieldSummary, isWidgetVehicleUrl, missingCriticalFields } from "../lib/rvs-capture";
import { fmtTime } from "../lib/vehicle";
import {
  CHANGE_POLL_OPTIONS,
  DEFAULT_CHANGE_POLL_SEC,
  isVehiclePollKey,
  normalizeVehiclePollEnv,
  parsePollSec,
  type VehiclePollEnv,
} from "../lib/poll-schedule";
import {
  isChangeApiConfigured,
  isCheckinApiConfigured,
  isVehicleApiConfigured,
  resolveApiStatus,
  resolveCheckinApiStatus,
} from "../lib/api-status";
import { CapturePaste } from "./CapturePaste";
import { EnvConfigForm } from "./EnvConfigForm";
import type { StockWatchState } from "../lib/stock-watch";
import { SyncControlBar, type SyncPanelId, type SyncTarget } from "./SyncControlBar";

export type { SyncTarget };

interface ApiSettingsProps {
  lastSyncVehicle: number | null;
  lastSyncChange: number | null;
  lastSyncCheckin?: number | null;
  vehicleMeta: FetchMeta | null;
  changeMeta: FetchMeta | null;
  checkinMeta?: FetchMeta | null;
  checkinData?: CheckinData | null;
  errorVehicle: string | null;
  errorChange: string | null;
  onPollConfigLoaded: (vehicleEnv: VehiclePollEnv, changeSec: number) => void;
  onTriggerCheckin?: () => Promise<void>;
  stockWatch?: StockWatchState | null;
  onStockWatchPollSecChange?: (pollSec: number) => void | Promise<void>;
  onSaveStockWatchAuth?: (auth: { cookie?: string; token?: string }) => boolean | Promise<boolean>;
  onQuickAuthDone?: () => void | Promise<void>;
  initialPanel?: SyncPanelId;
}

function metaLine(meta: FetchMeta | null | undefined): string {
  if (!meta) return "暂无拉取记录";
  if (meta.ok) return `拉取成功 · ${fmtTime(meta.at)}`;
  const hint = errorKindHint(meta.errorKind);
  const base = `拉取失败 · ${meta.error ?? "未知错误"}`;
  return hint ? `${base} · ${hint}` : base;
}

export function ApiSettings({
  lastSyncVehicle,
  lastSyncChange,
  lastSyncCheckin,
  vehicleMeta,
  changeMeta,
  checkinMeta,
  checkinData,
  errorVehicle,
  errorChange,
  onPollConfigLoaded,
  onTriggerCheckin,
  stockWatch,
  onStockWatchPollSecChange,
  onSaveStockWatchAuth,
  onQuickAuthDone,
  initialPanel = null,
}: ApiSettingsProps) {
  const [envConfig, setEnvConfig] = useState<EnvConfigResponse | null>(null);
  const [checkinTesting, setCheckinTesting] = useState(false);
  const [checkinTestMsg, setCheckinTestMsg] = useState<string | null>(null);
  const [vehicleDraft, setVehicleDraft] = useState<VehicleEnv | null>(null);
  const [changeDraft, setChangeDraft] = useState<ChangeEnv | null>(null);
  const [activePanel, setActivePanel] = useState<SyncPanelId>(initialPanel);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [savingChange, setSavingChange] = useState(false);
  const [saveMsgVehicle, setSaveMsgVehicle] = useState<string | null>(null);
  const [saveMsgChange, setSaveMsgChange] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const syncPollConfig = (vehicle: VehicleEnv, changeInterval: string) => {
    onPollConfigLoaded(
      normalizeVehiclePollEnv(vehicle),
      parsePollSec(changeInterval, DEFAULT_CHANGE_POLL_SEC),
    );
  };

  const loadConfig = async () => {
    setLoadingConfig(true);
    setConfigError(null);
    try {
      const cfg = await fetchEnvConfig();
      setEnvConfig(cfg);
      const vehicle: VehicleEnv = {
        ...cfg.vehicle,
        ...normalizeVehiclePollEnv(cfg.vehicle),
      };
      const change = {
        ...cfg.change,
        NIO_CHANGE_POLL_INTERVAL:
          cfg.change.NIO_CHANGE_POLL_INTERVAL ||
          String(DEFAULT_CHANGE_POLL_SEC),
      };
      setVehicleDraft(vehicle);
      setChangeDraft(change);
      syncPollConfig(vehicle, change.NIO_CHANGE_POLL_INTERVAL);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "无法加载配置");
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    void loadConfig();
    if (new URLSearchParams(window.location.search).get("setup") === "1") {
      setActivePanel("vehicle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleDraft) return;
    setSavingVehicle(true);
    setSaveMsgVehicle(null);
    try {
      syncPollConfig(
        vehicleDraft,
        changeDraft?.NIO_CHANGE_POLL_INTERVAL ?? String(DEFAULT_CHANGE_POLL_SEC),
      );
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

  const vehicleStatus = resolveApiStatus(
    vehicleMeta,
    isVehicleApiConfigured(vehicleDraft),
  );
  const changeStatus = resolveApiStatus(
    changeMeta,
    isChangeApiConfigured(changeDraft),
  );
  const checkinStatus = resolveCheckinApiStatus(
    checkinMeta,
    isCheckinApiConfigured(vehicleDraft),
    checkinData,
  );

  const vehicleUrl = vehicleDraft?.NIO_VEHICLE_API_URL?.trim() ?? "";
  const vehicleUsesWidget = vehicleUrl ? isWidgetVehicleUrl(vehicleUrl) : false;
  const missingCaptureFields = vehicleUrl ? missingCriticalFields(vehicleUrl) : [];
  const captureFields = vehicleUrl ? captureFieldSummary(vehicleUrl) : "";

  const handleVehiclePollChange = (key: string, value: string) => {
    setVehicleDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      if (isVehiclePollKey(key)) {
        syncPollConfig(next, changeDraft?.NIO_CHANGE_POLL_INTERVAL ?? String(DEFAULT_CHANGE_POLL_SEC));
      }
      return next;
    });
  };

  return (
    <section className="panel api-panel sync-hub-panel">
      <SyncControlBar
        activePanel={activePanel}
        onPanelChange={setActivePanel}
        vehicleStatus={vehicleStatus}
        changeStatus={changeStatus}
        checkinStatus={checkinStatus}
        vehicleMeta={vehicleMeta}
        changeMeta={changeMeta}
        checkinMeta={checkinMeta}
        stockWatch={stockWatch}
        onStockWatchPollSecChange={onStockWatchPollSecChange}
        onSaveStockWatchAuth={onSaveStockWatchAuth}
        trayInitialDisplay={envConfig?.general.NIO_TRAY_DISPLAY || "soc,range"}
        onMapSaved={() => {
          window.dispatchEvent(new CustomEvent("nio-map-config-updated"));
        }}
        onQuickAuthDone={async () => {
          await loadConfig();
          await onQuickAuthDone?.();
        }}
      />

      {configError && (
        <div className="alert alert-danger">
          {configError}
          <br />
          <span className="muted">本地开发请先运行: npm run serve:api</span>
        </div>
      )}

      {activePanel === "vehicle" && (
        <div className="sync-hub-panel-body">
          <p className="muted sync-block-meta">{metaLine(vehicleMeta)}</p>
          <p className="muted sync-block-meta">
            页面读取{lastSyncVehicle ? ` · ${fmtTime(lastSyncVehicle)}` : " · —"}
          </p>
          {errorVehicle && <div className="alert alert-danger">{errorVehicle}</div>}
          {vehicleDraft && (
            <form className="api-form env-config-form" onSubmit={handleSaveVehicle}>
              <CapturePaste
                expected="vehicle"
                disabled={loadingConfig || savingVehicle}
                onApply={(parsed) =>
                  setVehicleDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          NIO_VEHICLE_API_URL: parsed.url,
                          NIO_VEHICLE_ACCESS_TOKEN: parsed.token,
                          NIO_VEHICLE_USER_AGENT: parsed.userAgent,
                          NIO_VEHICLE_API_METHOD: parsed.method,
                        }
                      : prev,
                  )
                }
              />
              <EnvConfigForm
                fields={VEHICLE_API_FIELDS}
                values={vehicleDraft as unknown as Record<string, string>}
                onChange={(key, value) =>
                  setVehicleDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
                }
                disabled={loadingConfig || savingVehicle}
              />
              <p className="muted api-hint">
                {vehicleUsesWidget
                  ? "也可以只改下面的 URL 和 Token。Widget 请求按 GET 发送。sign 过期后重新粘贴整段抓包。"
                  : "也可以只改下面的 URL 和 Token。sign 过期后重新粘贴整段抓包。"}
              </p>
              {vehicleUrl && (
                <p className="muted api-hint">
                  {vehicleUsesWidget ? "已解析" : "已解析 field"}：{captureFields}
                </p>
              )}
              {missingCaptureFields.length > 0 && (
                <div className="alert alert-danger">
                  抓包 URL 缺少关键 field：{missingCaptureFields.join("、")}。请重新复制完整 status 请求，否则对应卡片可能无数据。
                </div>
              )}
              <details className="vehicle-poll-details">
                <summary className="muted">拉取间隔（可选）</summary>
                <EnvConfigForm
                  fields={VEHICLE_POLL_FIELDS}
                  values={vehicleDraft as unknown as Record<string, string>}
                  onChange={handleVehiclePollChange}
                  disabled={loadingConfig || savingVehicle}
                />
              </details>
              <p className="muted api-hint">
                行驶中（vehicle_state=1）不论几点均用「行驶中」间隔；驻车/充电/换电等非行驶状态才按白天 09:00–17:00 / 夜间区分
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
      )}

      {activePanel === "change" && (
        <div className="sync-hub-panel-body">
          <p className="muted sync-block-meta">{metaLine(changeMeta)}</p>
          <p className="muted sync-block-meta">
            页面读取{lastSyncChange ? ` · ${fmtTime(lastSyncChange)}` : " · —"}
          </p>
          {errorChange && <div className="alert alert-danger">{errorChange}</div>}
          {changeDraft && (
            <form className="api-form env-config-form" onSubmit={handleSaveChange}>
              <CapturePaste
                expected="change"
                disabled={loadingConfig || savingChange}
                onApply={(parsed) =>
                  setChangeDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          NIO_CHANGE_API_URL: parsed.url,
                          NIO_CHANGE_ACCESS_TOKEN: parsed.token,
                          NIO_CHANGE_USER_AGENT: parsed.userAgent,
                          NIO_CHANGE_MOBILEINFO: parsed.mobileinfo,
                          NIO_CHANGE_API_METHOD: parsed.method,
                          NIO_CHANGE_API_BODY: parsed.body || "{}",
                          NIO_CHANGE_API_MODE: parsed.url.includes("/serviceOrder/getTabOrder")
                            ? "cursor"
                            : "raw",
                        }
                      : prev,
                  )
                }
              />
              <EnvConfigForm
                fields={CHANGE_API_FIELDS}
                values={changeDraft as unknown as Record<string, string>}
                onChange={(key, value) =>
                  setChangeDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
                }
                disabled={loadingConfig || savingChange}
              />
              <p className="muted api-hint">
                {changeDraft.NIO_CHANGE_API_MODE === "raw" || changeDraft.NIO_CHANGE_API_MODE === "params"
                  ? "当前按填写的 URL 原样 POST，只拉一页。粘贴 App「换电订单」列表的 serviceOrder/getTabOrder 抓包可改为翻到底。"
                  : "按 App「换电订单」列表接口每页 10 条一直翻到最后一页，正文为 {}。只需要 Token 有效。"}
              </p>
              <label className="change-poll-select">
                <span>自动刷新</span>
                <select
                  value={changeDraft.NIO_CHANGE_POLL_INTERVAL || String(DEFAULT_CHANGE_POLL_SEC)}
                  disabled={loadingConfig || savingChange}
                  onChange={(e) => {
                    const next = { ...changeDraft, NIO_CHANGE_POLL_INTERVAL: e.target.value };
                    setChangeDraft(next);
                    if (vehicleDraft) syncPollConfig(vehicleDraft, e.target.value);
                    void saveChangeEnv(next)
                      .then(() => setSaveMsgChange("自动刷新间隔已保存"))
                      .catch((err) =>
                        setSaveMsgChange(err instanceof Error ? err.message : "保存失败"),
                      );
                  }}
                >
                  {!CHANGE_POLL_OPTIONS.some((o) => String(o.sec) === changeDraft.NIO_CHANGE_POLL_INTERVAL) &&
                    changeDraft.NIO_CHANGE_POLL_INTERVAL && (
                      <option value={changeDraft.NIO_CHANGE_POLL_INTERVAL}>
                        自定义 {changeDraft.NIO_CHANGE_POLL_INTERVAL} 秒
                      </option>
                    )}
                  {CHANGE_POLL_OPTIONS.map((o) => (
                    <option key={o.sec} value={String(o.sec)}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="muted">也可以点右上角「刷新换电」手动拉</span>
              </label>
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
      )}

      {activePanel === "checkin" && (
        <div className="sync-hub-panel-body">
          <p className="muted sync-block-meta">{metaLine(checkinMeta)}</p>
          {checkinMeta?.ok === false && checkinData && (
            <p className="muted sync-block-meta">
              独立签到 API 最近失败，但已从车辆 Widget / checkin.json 读取到签到数据。
            </p>
          )}
          <p className="muted sync-block-meta">
            {checkinData
              ? `今日${checkinData.checked_in ? "已" : "未"}签到 · 连续 ${checkinData.continuous_days} 天`
              : "暂无签到数据"}
          </p>
          <p className="muted sync-block-meta">
            页面读取
            {lastSyncCheckin
              ? ` · ${fmtTime(lastSyncCheckin)}`
              : checkinMeta?.at
                ? ` · ${fmtTime(checkinMeta.at)}`
                : " · —"}
          </p>
          {vehicleDraft && (
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
                <button
                  type="button"
                  className="btn primary"
                  disabled={checkinTesting || !onTriggerCheckin}
                  onClick={() => {
                    if (!onTriggerCheckin) return;
                    setCheckinTestMsg(null);
                    setCheckinTesting(true);
                    void onTriggerCheckin()
                      .then(() => setCheckinTestMsg("签到拉取成功，请查看运行日志"))
                      .catch((err) =>
                        setCheckinTestMsg(err instanceof Error ? err.message : "签到拉取失败"),
                      )
                      .finally(() => setCheckinTesting(false));
                  }}
                >
                  {checkinTesting ? "拉取中…" : "立即测试拉取"}
                </button>
                <button type="button" className="btn ghost" onClick={() => void loadConfig()}>
                  重新加载
                </button>
              </div>
              {checkinTestMsg && <p className="save-hint">{checkinTestMsg}</p>}
              {saveMsgVehicle && <p className="save-hint">{saveMsgVehicle}</p>}
            </form>
          )}
        </div>
      )}
    </section>
  );
}
