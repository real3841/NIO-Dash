import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import pkg from "../package.json";
import { ApiSettings, type SyncTarget } from "./components/ApiSettings";
import { DashboardCards } from "./components/DashboardCards";
import { VehicleHero, type HeroAction } from "./components/VehicleHero";
import type { SyncPanelId } from "./components/SyncControlBar";
import { SwapHistory } from "./components/SwapHistory";
import { TrendCharts } from "./components/TrendCharts";
import { fetchEnvConfig } from "./lib/env-config";
import type { ChangeResponse } from "./lib/change";
import type { CheckinData } from "./lib/checkin";
import type { DailyFile, DailyHistory, JourneyFile, JourneyHistoryItem } from "./lib/trip";
import type { PowerFile } from "./lib/power";
import { saveDrawerOpen, TREND_DRAWER_KEY } from "./lib/drawer-state";
import { reverseGeocodeCached } from "./lib/geocode-cache";
import { mapCoordsFromGcj02 } from "./lib/gcj02";
import { hydrateCardLayout } from "./lib/card-layout";
import { applyUiLook, readUiLook, type UiLook } from "./lib/ui-look";
import {
  DEFAULT_CHANGE_POLL_SEC,
  formatPollSummary,
  getVehiclePollInfo,
  normalizeVehiclePollEnv,
  parsePollSec,
  type VehiclePollEnv,
  type VehiclePollIntervals,
} from "./lib/poll-schedule";
import {
  loadFetchMeta,
  loadChangeFetchMeta,
  loadCheckinFetchMeta,
  fetchChangeData,
  fetchCheckinData,
  fetchDailyData,
  fetchDailyHistory,
  fetchJourneyData,
  fetchJourneyHistory,
  fetchPowerData,
  fetchServerHistory,
  triggerServerFetch,
  triggerServerFetchChange,
  triggerServerFetchCheckin,
  triggerServerFetchVehicle,
  fetchVehicleData,
  loadHistory,
  peekVehicleSignals,
  saveHistory,
  type FetchMeta,
} from "./lib/storage";
import {
  ackStockWatchAlert,
  fetchStockWatch,
  notifyStockInStock,
  saveStockWatchAuth,
  saveStockWatchPollSec,
  triggerStockWatchCheck,
  type StockWatchState,
} from "./lib/stock-watch";
import {
  extractVehicleStatus,
  fmtTime,
  isUsableVehicleResponse,
  isValidGps,
  resolveVehicleHistory,
  snapshotFromResponse,
  type VehicleResponse,
  type VehicleSnapshot,
} from "./lib/vehicle";

const DailyPathMap = lazy(() =>
  import("./components/DailyPathMap").then((m) => ({ default: m.DailyPathMap })),
);

const VISIBILITY_API_MIN_MS = 5 * 60 * 1000;
const FETCH_META_STALE_MS = 90 * 1000;
const POLL_BOUNDARY_CHECK_MS = 60 * 1000;

function updateVehiclePollInterval(
  env: VehiclePollEnv,
  vehicleState: number | null,
  setter: (sec: number) => void,
  reasonSetter?: (label: string) => void,
  configuredSetter?: (intervals: VehiclePollIntervals) => void,
  fotaStatus?: number | null,
): void {
  const normalized = normalizeVehiclePollEnv(env);
  const info = getVehiclePollInfo(
    normalized,
    vehicleState,
    new Date(),
    fotaStatus == null ? null : { fota_status: fotaStatus },
  );
  setter(info.intervalSec);
  reasonSetter?.(info.reasonLabel);
  configuredSetter?.(info.intervals);
}

export default function App() {
  const [data, setData] = useState<VehicleResponse | null>(null);
  const [history, setHistory] = useState<VehicleSnapshot[]>(() => loadHistory());
  const [loadingTarget, setLoadingTarget] = useState<SyncTarget | null>(null);
  const [errorVehicle, setErrorVehicle] = useState<string | null>(null);
  const [warningVehicle, setWarningVehicle] = useState<string | null>(null);
  const [errorChange, setErrorChange] = useState<string | null>(null);
  const [lastSyncVehicle, setLastSyncVehicle] = useState<number | null>(null);
  const [lastSyncChange, setLastSyncChange] = useState<number | null>(null);
  const [lastSyncCheckin, setLastSyncCheckin] = useState<number | null>(null);
  const [vehicleMeta, setVehicleMeta] = useState<FetchMeta | null>(null);
  const [changeMeta, setChangeMeta] = useState<FetchMeta | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [changeData, setChangeData] = useState<ChangeResponse | null>(null);
  const [checkinData, setCheckinData] = useState<CheckinData | null>(null);
  const [journeyData, setJourneyData] = useState<JourneyFile | null>(null);
  const [dailyData, setDailyData] = useState<DailyFile | null>(null);
  const [journeyHistory, setJourneyHistory] = useState<JourneyHistoryItem[]>([]);
  const [dailyHistory, setDailyHistory] = useState<DailyHistory>({});
  const [powerData, setPowerData] = useState<PowerFile | null>(null);
  const [checkinMeta, setCheckinMeta] = useState<FetchMeta | null>(null);
  const [uiLook, setUiLook] = useState<UiLook>(() => readUiLook());
  const [showSettings, setShowSettings] = useState(
    () => new URLSearchParams(window.location.search).get("setup") === "1",
  );
  const [settingsPanel, setSettingsPanel] = useState<SyncPanelId>(null);
  const [vehiclePollSec, setVehiclePollSec] = useState(900);
  const [vehiclePollReasonLabel, setVehiclePollReasonLabel] = useState("白天");
  const [vehiclePollConfigured, setVehiclePollConfigured] = useState<VehiclePollIntervals>({
    driving: 900,
    day: 1800,
    night: 3600,
  });
  const [changePollSec, setChangePollSec] = useState(DEFAULT_CHANGE_POLL_SEC);
  const [trendOpen, setTrendOpen] = useState(false);
  const [stockWatch, setStockWatch] = useState<StockWatchState | null>(null);
  const [stockWatchLoading, setStockWatchLoading] = useState(false);

  const pollEnvRef = useRef<VehiclePollEnv | null>(null);
  const vehicleStateRef = useRef<number | null>(null);
  const fotaStatusRef = useRef<number | null>(null);
  const lastCoordsRef = useRef<string | null>(null);
  const lastApiTriggerRef = useRef(0);
  const initialFetchDone = useRef(false);
  const refreshDepthRef = useRef(0);

  useEffect(() => {
    void hydrateCardLayout();
  }, []);

  useEffect(() => {
    void fetchEnvConfig()
      .then((cfg) => {
        pollEnvRef.current = normalizeVehiclePollEnv(cfg.vehicle);
        setChangePollSec(
          parsePollSec(
            cfg.change.NIO_CHANGE_POLL_INTERVAL || cfg.general.NIO_POLL_INTERVAL,
            DEFAULT_CHANGE_POLL_SEC,
          ),
        );
        updateVehiclePollInterval(
          cfg.vehicle,
          null,
          setVehiclePollSec,
          setVehiclePollReasonLabel,
          setVehiclePollConfigured,
        );
      })
      .catch(() => {});
  }, []);

  const syncVehiclePollInterval = useCallback(async () => {
    if (!pollEnvRef.current) return;

    const peeked = await peekVehicleSignals();
    if (peeked) {
      if (peeked.vehicleState !== null) vehicleStateRef.current = peeked.vehicleState;
      fotaStatusRef.current = peeked.fotaStatus;
    }

    const state = vehicleStateRef.current;
    const fotaStatus = fotaStatusRef.current;
    const normalized = normalizeVehiclePollEnv(pollEnvRef.current);
    setVehiclePollSec((prev) => {
      const info = getVehiclePollInfo(
        normalized,
        state,
        new Date(),
        fotaStatus == null ? null : { fota_status: fotaStatus },
      );
      setVehiclePollReasonLabel(info.reasonLabel);
      setVehiclePollConfigured(info.intervals);
      return info.intervalSec === prev ? prev : info.intervalSec;
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void syncVehiclePollInterval(), POLL_BOUNDARY_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [syncVehiclePollInterval]);

  const refreshCheckin = useCallback(async () => {
    const [checkin, checkinMetaResult] = await Promise.all([
      fetchCheckinData(),
      loadCheckinFetchMeta(),
    ]);
    setCheckinData(checkin);
    setCheckinMeta(checkinMetaResult);
    setLastSyncCheckin(Date.now());
  }, []);

  const refreshVehicle = useCallback(async (triggerFetch: boolean, skipCheckin = false) => {
    let triggerError: string | null = null;
    if (triggerFetch) {
      try {
        await triggerServerFetchVehicle();
        lastApiTriggerRef.current = Date.now();
      } catch (err) {
        triggerError = err instanceof Error ? err.message : "触发车辆拉取失败";
      }
    }

    const [
      vehicleResult,
      serverHistory,
      meta,
      checkin,
      checkinMetaResult,
      journey,
      daily,
      journeys,
      dailyDays,
      powerFile,
    ] = await Promise.all([
      fetchVehicleData(),
      fetchServerHistory(),
      loadFetchMeta(),
      skipCheckin ? Promise.resolve(null) : fetchCheckinData(),
      skipCheckin ? Promise.resolve(null) : loadCheckinFetchMeta(),
      fetchJourneyData(),
      fetchDailyData(),
      fetchJourneyHistory(),
      fetchDailyHistory(),
      fetchPowerData(),
    ]);
    setJourneyHistory(journeys);
    setDailyHistory(dailyDays);
    setPowerData(powerFile);

    const payload = vehicleResult.data;
    if (vehicleResult.source === "fallback") {
      setWarningVehicle("无法读取 /data/vehicle.json，当前显示内置演示数据（非真实车况）");
    } else {
      setWarningVehicle(null);
    }

    if (!isUsableVehicleResponse(payload)) {
      setErrorVehicle("vehicle.json 缺少有效车况，请检查 Token 或在「数据同步」中刷新");
      return;
    }

    setData(payload);
    setVehicleMeta(meta);
    setJourneyData(journey);
    setDailyData(daily);
    if (!skipCheckin) {
      setCheckinData(checkin);
      setCheckinMeta(checkinMetaResult);
      setLastSyncCheckin(Date.now());
    }
    setLastSyncVehicle(Date.now());

    const status = extractVehicleStatus(payload);
    const vehicleState = status?.exterior_status.vehicle_state ?? null;
    const fotaStatus = status?.fota_status?.fota_status ?? null;
    vehicleStateRef.current = vehicleState;
    fotaStatusRef.current = fotaStatus;
    if (pollEnvRef.current) {
      updateVehiclePollInterval(
        pollEnvRef.current,
        vehicleState,
        setVehiclePollSec,
        setVehiclePollReasonLabel,
        setVehiclePollConfigured,
        fotaStatus,
      );
    }

    const snap = snapshotFromResponse(payload);
    const { history: nextHistory, persistLocal } = resolveVehicleHistory(
      serverHistory,
      loadHistory(),
      snap,
    );
    setHistory(nextHistory);
    if (persistLocal) {
      saveHistory(nextHistory);
    }

    const pos = status?.position_status;
    if (pos && isValidGps(pos.latitude, pos.longitude)) {
      const wgs = mapCoordsFromGcj02(pos.latitude, pos.longitude);
      const coordKey = `${Math.round(wgs.lat * 1000)}:${Math.round(wgs.lng * 1000)}`;
      if (coordKey !== lastCoordsRef.current) {
        lastCoordsRef.current = coordKey;
        void reverseGeocodeCached(pos.latitude, pos.longitude).then(setAddress);
      }
    }

    if (triggerError) {
      setErrorVehicle(`${triggerError}，已回退读取当前 data/vehicle.json`);
    } else {
      setErrorVehicle(null);
    }
  }, []);

  const refreshChange = useCallback(async (triggerFetch: boolean, skipCheckin = false) => {
    let triggerError: string | null = null;
    if (triggerFetch) {
      try {
        await triggerServerFetchChange();
      } catch (err) {
        triggerError = err instanceof Error ? err.message : "触发换电拉取失败";
      }
    }

    const [changePayload, meta] = await Promise.all([fetchChangeData(), loadChangeFetchMeta()]);
    if (changePayload) {
      setChangeData(changePayload);
    }
    setChangeMeta(meta);
    setLastSyncChange(Date.now());
    if (!skipCheckin) {
      await refreshCheckin();
    }

    if (triggerError) {
      setErrorChange(`${triggerError}，已回退读取当前 data/change.json`);
    } else {
      setErrorChange(null);
    }
  }, [refreshCheckin]);

  const refresh = useCallback(
    async (target: SyncTarget, triggerFetch = false) => {
      refreshDepthRef.current += 1;
      if (refreshDepthRef.current === 1) {
        setLoadingTarget(target);
      }
      if (target === "vehicle" || target === "all") setErrorVehicle(null);
      if (target === "change" || target === "all") setErrorChange(null);

      try {
        if (target === "all" && triggerFetch) {
          try {
            await triggerServerFetch();
            lastApiTriggerRef.current = Date.now();
          } catch (err) {
            const msg = err instanceof Error ? err.message : "触发拉取失败";
            setErrorVehicle(`${msg}，已回退读取本地 JSON`);
            setErrorChange(`${msg}，已回退读取本地 JSON`);
          }
        }

        if (target === "all") {
          await Promise.all([refreshVehicle(false, true), refreshChange(false, true)]);
          await refreshCheckin();
        } else {
          const tasks: Promise<void>[] = [];
          if (target === "vehicle") {
            tasks.push(refreshVehicle(triggerFetch, false));
          }
          if (target === "change") {
            tasks.push(refreshChange(triggerFetch, false));
          }
          await Promise.all(tasks);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "同步失败";
        if (target === "vehicle" || target === "all") setErrorVehicle(msg);
        if (target === "change" || target === "all") setErrorChange(msg);
      } finally {
        refreshDepthRef.current -= 1;
        if (refreshDepthRef.current === 0) {
          setLoadingTarget(null);
        }
      }
    },
    [refreshChange, refreshCheckin, refreshVehicle],
  );

  useEffect(() => {
    void (async () => {
      await Promise.all([refresh("vehicle", false), refresh("change", false)]);
      initialFetchDone.current = true;
      const meta = await loadFetchMeta();
      const stale = !meta?.ok || !meta.at || Date.now() - meta.at > FETCH_META_STALE_MS;
      if (stale) {
        void refresh("vehicle", true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (!initialFetchDone.current || document.visibilityState !== "visible") return;
      void refresh("vehicle", false);
      void refreshCheckin();
      const lastTrigger = lastApiTriggerRef.current;
      if (lastTrigger <= 0) return;
      const elapsed = Date.now() - lastTrigger;
      if (elapsed >= VISIBILITY_API_MIN_MS) {
        void refresh("vehicle", true);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh, refreshCheckin]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh("vehicle", false);
    }, vehiclePollSec * 1000);
    return () => window.clearInterval(timer);
  }, [vehiclePollSec, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh("change", false);
    }, changePollSec * 1000);
    return () => window.clearInterval(timer);
  }, [changePollSec, refresh]);

  const refreshStockWatch = useCallback(async (triggerCheck = false, targetId?: string) => {
    if (triggerCheck) setStockWatchLoading(true);
    try {
      const state = triggerCheck ? await triggerStockWatchCheck(targetId) : await fetchStockWatch();
      if (!state) return;
      setStockWatch(state);
      const alerted = state.items.filter((item) => item.alert);
      for (const item of alerted) {
        await notifyStockInStock(item);
        await ackStockWatchAlert(item.id);
      }
      if (alerted.length > 0) {
        setStockWatch({
          ...state,
          items: state.items.map((item) =>
            alerted.some((alert) => alert.id === item.id) ? { ...item, alert: false } : item,
          ),
        });
      }
    } finally {
      if (triggerCheck) setStockWatchLoading(false);
    }
  }, []);

  useEffect(() => {
    applyUiLook(uiLook);
  }, [uiLook]);

  useEffect(() => {
    const onLook = (event: Event) => setUiLook((event as CustomEvent<UiLook>).detail);
    window.addEventListener("nio-ui-look", onLook);
    return () => window.removeEventListener("nio-ui-look", onLook);
  }, []);

  useEffect(() => {
    void refreshStockWatch(false);
    const syncTimer = window.setInterval(() => {
      void refreshStockWatch(false);
    }, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshStockWatch(false);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(syncTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshStockWatch]);

  const handleStockWatchPollSecChange = useCallback(async (pollSec: number) => {
    const state = await saveStockWatchPollSec(pollSec);
    if (state) setStockWatch(state);
  }, []);

  const handleStockWatchAuthSave = useCallback(async (auth: { cookie?: string; token?: string }) => {
    const state = await saveStockWatchAuth(auth);
    if (state) setStockWatch(state);
    return Boolean(state);
  }, []);

  const loading = loadingTarget !== null;
  const vehicleStatus = data ? extractVehicleStatus(data) : null;

  if (!vehicleStatus) {
    return (
      <div className="app loading">
        <span className="topbar-version app-version-corner">v{pkg.version}</span>
        <p>{loading ? "加载车辆数据…" : errorVehicle ?? "初始化中…"}</p>
        {errorVehicle && (
          <button type="button" className="btn primary" onClick={() => void refresh("all")}>
            重试
          </button>
        )}
        {showSettings && (
          <ApiSettings
            lastSyncVehicle={lastSyncVehicle}
            lastSyncChange={lastSyncChange}
            lastSyncCheckin={lastSyncCheckin}
            vehicleMeta={vehicleMeta}
            changeMeta={changeMeta}
            errorVehicle={errorVehicle}
            errorChange={errorChange}
            stockWatch={stockWatch}
            onStockWatchPollSecChange={handleStockWatchPollSecChange}
            onSaveStockWatchAuth={handleStockWatchAuthSave}
            onQuickAuthDone={() => refresh("all", false)}
            onPollConfigLoaded={(vehicleEnv, changeSec) => {
              pollEnvRef.current = normalizeVehiclePollEnv(vehicleEnv);
              setChangePollSec(changeSec);
              const status = data ? extractVehicleStatus(data) : null;
              const state = status?.exterior_status.vehicle_state ?? null;
              const fotaStatus = status?.fota_status?.fota_status ?? fotaStatusRef.current;
              vehicleStateRef.current = state;
              fotaStatusRef.current = fotaStatus;
              updateVehiclePollInterval(
                vehicleEnv,
                state,
                setVehiclePollSec,
                setVehiclePollReasonLabel,
                setVehiclePollConfigured,
                fotaStatus,
              );
            }}
          />
        )}
      </div>
    );
  }

  const s = vehicleStatus;
  const posTs = s.position_status.sample_time || s.soc_status.sample_time;
  const currentWgs = mapCoordsFromGcj02(s.position_status.latitude, s.position_status.longitude);

  const openSettings = (panel: SyncPanelId) => {
    setSettingsPanel(panel);
    setShowSettings(true);
  };
  const onHeroAction = (action: HeroAction) => {
    if (action === "vehicle") void refresh("vehicle", true);
    else if (action === "change") void refresh("change", true);
    else if (action === "token") openSettings("quick");
    else if (action === "log") openSettings("log");
    else if (showSettings && settingsPanel === null) setShowSettings(false);
    else openSettings(null);
  };
  const fetchProblems = [
    warningVehicle,
    vehicleMeta && !vehicleMeta.ok ? `车辆拉取失败：${vehicleMeta.error ?? "未知错误"}` : null,
    changeMeta && !changeMeta.ok ? `换电拉取失败：${changeMeta.error ?? "未知错误"}` : null,
  ].filter((x): x is string => Boolean(x));
  const authProblem = [vehicleMeta, changeMeta].some(
    (meta) => meta && !meta.ok && /sign|auth|token|登录|签名/i.test(`${meta.errorKind ?? ""} ${meta.error ?? ""}`),
  );
  const pollMin = (sec: number) => (sec % 3600 === 0 ? `${sec / 3600} 小时` : `${Math.round(sec / 60)} 分`);
  const pollPills = [`车况 ${vehiclePollReasonLabel} ${pollMin(vehiclePollSec)}`, `换电 每 ${pollMin(changePollSec)}`];

  return (
    <div className="app">
      {uiLook === "adjust" ? (
        <header className="adjust-head">
          <div className="adjust-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 16V11l2-5h10l2 5v5" />
              <path d="M3 16h18v3H3z" />
              <circle cx="7.5" cy="13" r="1" />
              <circle cx="16.5" cy="13" r="1" />
            </svg>
          </div>
          <div className="adjust-title">
            <h1>
              蔚来车辆看板 <span className="adjust-ver">v{pkg.version}</span>
            </h1>
            <p>
              <span className="adjust-dot" />
              <b>{s.soc_status.soc}%</b> · {s.soc_status.remaining_actual_range} km ·{" "}
              {s.exterior_status.vehicle_state === 1 ? "行驶中" : s.soc_status.charge_state === 1 ? "充电中" : "已驻车"}
              {vehicleMeta?.at ? ` · 车况 ${fmtTime(vehicleMeta.at)}` : ""}
              {changeMeta?.at ? ` · 换电 ${fmtTime(changeMeta.at)}` : ""}
            </p>
          </div>
          {fetchProblems.length > 0 && (
            <button
              type="button"
              className="adjust-alert"
              title={fetchProblems.join("\n")}
              onClick={() => openSettings(authProblem ? "quick" : "log")}
            >
              <i />
              {authProblem ? "接口签名或登录失效 · 点此更新 Token" : `${fetchProblems[0]} · 查看日志`}
            </button>
          )}
          <button
            type="button"
            className="adjust-icon-btn"
            title="数据同步"
            aria-label="数据同步"
            onClick={() => onHeroAction("settings")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="10" cy="17" r="2" />
            </svg>
          </button>
          <button
            type="button"
            className="adjust-icon-btn primary"
            title="刷新车辆和换电"
            aria-label="刷新车辆和换电"
            disabled={loading}
            onClick={() => void refresh("all", true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={loading ? "spin" : undefined}>
              <path d="M20 12a8 8 0 1 1-2.34-5.66" />
              <path d="M20 4v5h-5" />
            </svg>
          </button>
        </header>
      ) : (
      <header className="topbar">
        <div>
          <h1>蔚来车辆看板</h1>
          <p className="muted topbar-sync-meta">
            车况采样 {fmtTime(s.soc_status.sample_time)}
            {vehicleMeta?.ok && vehicleMeta.at ? ` · 车辆拉取 ${fmtTime(vehicleMeta.at)}` : ""}
            {changeMeta?.ok && changeMeta.at ? ` · 换电拉取 ${fmtTime(changeMeta.at)}` : ""}
            {" · "}
            {formatPollSummary(
              vehiclePollConfigured,
              vehiclePollReasonLabel,
              vehiclePollSec,
              changePollSec,
            )}
          </p>
          <p className="nas-hint">
            在「数据同步」填写 Token；行驶中不论时段按行驶间隔拉取，驻车/充电等按白天/夜间；菜单栏同步显示电量
          </p>
          {warningVehicle && <p className="nas-error">{warningVehicle}</p>}
          {vehicleMeta && !vehicleMeta.ok && (
            <p className="nas-error">车辆拉取失败：{vehicleMeta.error}</p>
          )}
          {changeMeta && !changeMeta.ok && (
            <p className="nas-error">换电拉取失败：{changeMeta.error}</p>
          )}
        </div>
        <div className="topbar-side">
          <span className="topbar-version">v{pkg.version}</span>
          <div className="topbar-actions">
          <button type="button" className="btn ghost" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? "隐藏设置" : "数据同步"}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void refresh("vehicle", true)}
            disabled={loading}
          >
            {loadingTarget === "vehicle" ? "…" : "刷新车辆"}
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => void refresh("change", true)}
            disabled={loading}
          >
            {loadingTarget === "change" ? "…" : "刷新换电"}
          </button>
          </div>
        </div>
      </header>
      )}

      {showSettings && (
        <ApiSettings
          key={settingsPanel ?? "none"}
          initialPanel={settingsPanel}
          lastSyncVehicle={lastSyncVehicle}
          lastSyncChange={lastSyncChange}
          lastSyncCheckin={lastSyncCheckin}
          vehicleMeta={vehicleMeta}
          changeMeta={changeMeta}
          checkinMeta={checkinMeta}
          checkinData={checkinData}
          errorVehicle={errorVehicle}
          errorChange={errorChange}
          onPollConfigLoaded={(vehicleEnv, changeSec) => {
            pollEnvRef.current = normalizeVehiclePollEnv(vehicleEnv);
            setChangePollSec(changeSec);
            vehicleStateRef.current = s.exterior_status.vehicle_state;
            fotaStatusRef.current = s.fota_status?.fota_status ?? null;
            updateVehiclePollInterval(
              vehicleEnv,
              s.exterior_status.vehicle_state,
              setVehiclePollSec,
              setVehiclePollReasonLabel,
              setVehiclePollConfigured,
              s.fota_status?.fota_status ?? null,
            );
          }}
          onTriggerCheckin={async () => {
            await triggerServerFetchCheckin();
            await refreshCheckin();
          }}
          stockWatch={stockWatch}
          onStockWatchPollSecChange={handleStockWatchPollSecChange}
          onSaveStockWatchAuth={handleStockWatchAuthSave}
          onQuickAuthDone={() => refresh("all", false)}
        />
      )}

      {uiLook !== "classic" && (
        <VehicleHero
          status={s}
          power={powerData}
          variant={uiLook === "adjust" ? "adjust" : "new"}
          busy={loadingTarget}
          onAction={onHeroAction}
        />
      )}

      <DashboardCards
        data={data!}
        address={address}
        checkin={checkinData}
        journey={journeyData}
        daily={dailyData}
        stockWatch={stockWatch}
        stockWatchLoading={stockWatchLoading}
        onRefreshStockWatch={(targetId) => void refreshStockWatch(true, targetId)}
        power={powerData}
        look={uiLook}
        pollPills={pollPills}
      />

      <Suspense fallback={<section className="panel muted">地图加载中…</section>}>
        <DailyPathMap
          history={history}
          journeys={journeyHistory}
          current={{
            lat: currentWgs.lat,
            lng: currentWgs.lng,
            ts: posTs,
          }}
        />
      </Suspense>

      {changeData && <SwapHistory data={changeData} />}

      <details
        className="trend-drawer"
        open={trendOpen}
        onToggle={(e) => {
          const open = (e.currentTarget as HTMLDetailsElement).open;
          setTrendOpen(open);
          saveDrawerOpen(TREND_DRAWER_KEY, open);
        }}
      >
        <summary>历史趋势</summary>
        {trendOpen && <TrendCharts history={history} dailyHistory={dailyHistory} power={powerData} />}
      </details>
    </div>
  );
}
