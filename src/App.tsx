import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ApiSettings, type SyncTarget } from "./components/ApiSettings";
import { DashboardCards } from "./components/DashboardCards";
import { SwapHistory } from "./components/SwapHistory";
import { TrendCharts } from "./components/TrendCharts";
import { fetchEnvConfig } from "./lib/env-config";
import type { ChangeResponse } from "./lib/change";
import type { CheckinData } from "./lib/checkin";
import {
  loadDrawerOpen,
  saveDrawerOpen,
  TREND_DRAWER_KEY,
} from "./lib/drawer-state";
import { reverseGeocodeCached } from "./lib/geocode-cache";
import { hydrateCardLayout } from "./lib/card-layout";
import {
  getVehiclePollIntervalSec,
  parsePollSec,
  type VehiclePollEnv,
} from "./lib/poll-schedule";
import {
  loadFetchMeta,
  loadChangeFetchMeta,
  loadCheckinFetchMeta,
  fetchChangeData,
  fetchCheckinData,
  fetchServerHistory,
  triggerServerFetch,
  triggerServerFetchChange,
  triggerServerFetchVehicle,
  fetchVehicleData,
  loadHistory,
  saveHistory,
  type FetchMeta,
} from "./lib/storage";
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

function updateVehiclePollInterval(
  env: VehiclePollEnv,
  vehicleState: number | null,
  setter: (sec: number) => void,
): void {
  setter(getVehiclePollIntervalSec(env, vehicleState));
}

export default function App() {
  const [data, setData] = useState<VehicleResponse | null>(null);
  const [history, setHistory] = useState<VehicleSnapshot[]>(() => loadHistory());
  const [loadingTarget, setLoadingTarget] = useState<SyncTarget | null>(null);
  const [errorVehicle, setErrorVehicle] = useState<string | null>(null);
  const [errorChange, setErrorChange] = useState<string | null>(null);
  const [lastSyncVehicle, setLastSyncVehicle] = useState<number | null>(null);
  const [lastSyncChange, setLastSyncChange] = useState<number | null>(null);
  const [vehicleMeta, setVehicleMeta] = useState<FetchMeta | null>(null);
  const [changeMeta, setChangeMeta] = useState<FetchMeta | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [changeData, setChangeData] = useState<ChangeResponse | null>(null);
  const [checkinData, setCheckinData] = useState<CheckinData | null>(null);
  const [checkinMeta, setCheckinMeta] = useState<FetchMeta | null>(null);
  const [showSettings, setShowSettings] = useState(
    () => new URLSearchParams(window.location.search).get("setup") === "1",
  );
  const [vehiclePollSec, setVehiclePollSec] = useState(900);
  const [changePollSec, setChangePollSec] = useState(3600);
  const [trendOpen, setTrendOpen] = useState(() => loadDrawerOpen(TREND_DRAWER_KEY, false));

  const pollEnvRef = useRef<VehiclePollEnv | null>(null);
  const lastCoordsRef = useRef<string | null>(null);
  const lastApiTriggerRef = useRef(0);
  const initialFetchDone = useRef(false);

  useEffect(() => {
    void hydrateCardLayout();
  }, []);

  useEffect(() => {
    void fetchEnvConfig()
      .then((cfg) => {
        pollEnvRef.current = cfg.vehicle;
        setChangePollSec(
          parsePollSec(
            cfg.change.NIO_CHANGE_POLL_INTERVAL || cfg.general.NIO_POLL_INTERVAL,
            3600,
          ),
        );
        updateVehiclePollInterval(cfg.vehicle, null, setVehiclePollSec);
      })
      .catch(() => {});
  }, []);

  const refreshCheckin = useCallback(async () => {
    const [checkin, checkinMetaResult] = await Promise.all([
      fetchCheckinData(),
      loadCheckinFetchMeta(),
    ]);
    setCheckinData(checkin);
    setCheckinMeta(checkinMetaResult);
  }, []);

  const refreshVehicle = useCallback(async (triggerFetch: boolean) => {
    let triggerError: string | null = null;
    if (triggerFetch) {
      try {
        await triggerServerFetchVehicle();
        lastApiTriggerRef.current = Date.now();
      } catch (err) {
        triggerError = err instanceof Error ? err.message : "触发车辆拉取失败";
      }
    }

    const [payload, serverHistory, meta, checkin, checkinMetaResult] = await Promise.all([
      fetchVehicleData(),
      fetchServerHistory(),
      loadFetchMeta(),
      fetchCheckinData(),
      loadCheckinFetchMeta(),
    ]);

    if (!isUsableVehicleResponse(payload)) {
      setErrorVehicle("vehicle.json 缺少有效车况，请检查 Token 或在「数据同步」中刷新");
      return;
    }

    setData(payload);
    setVehicleMeta(meta);
    setCheckinData(checkin);
    setCheckinMeta(checkinMetaResult);
    setLastSyncVehicle(Date.now());

    const status = extractVehicleStatus(payload);
    const vehicleState = status?.exterior_status.vehicle_state ?? null;
    if (pollEnvRef.current) {
      updateVehiclePollInterval(pollEnvRef.current, vehicleState, setVehiclePollSec);
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
      const coordKey = `${Math.round(pos.latitude * 1000)}:${Math.round(pos.longitude * 1000)}`;
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

  const refreshChange = useCallback(async (triggerFetch: boolean) => {
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
    await refreshCheckin();

    if (triggerError) {
      setErrorChange(`${triggerError}，已回退读取当前 data/change.json`);
    } else {
      setErrorChange(null);
    }
  }, [refreshCheckin]);

  const refresh = useCallback(
    async (target: SyncTarget, triggerFetch = false) => {
      setLoadingTarget(target);
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

        const tasks: Promise<void>[] = [];
        if (target === "vehicle" || target === "all") {
          tasks.push(refreshVehicle(target === "vehicle" && triggerFetch));
        }
        if (target === "change" || target === "all") {
          tasks.push(refreshChange(target === "change" && triggerFetch));
        }
        await Promise.all(tasks);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "同步失败";
        if (target === "vehicle" || target === "all") setErrorVehicle(msg);
        if (target === "change" || target === "all") setErrorChange(msg);
      } finally {
        setLoadingTarget(null);
      }
    },
    [refreshChange, refreshVehicle],
  );

  useEffect(() => {
    void (async () => {
      await Promise.all([refresh("vehicle", false), refresh("change", false)]);
      initialFetchDone.current = true;
      void refresh("vehicle", true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (!initialFetchDone.current || document.visibilityState !== "visible") return;
      void refresh("vehicle", false);
      void refreshCheckin();
      const elapsed = Date.now() - lastApiTriggerRef.current;
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

  const loading = loadingTarget !== null;
  const vehicleStatus = data ? extractVehicleStatus(data) : null;

  if (!vehicleStatus) {
    return (
      <div className="app loading">
        <p>{loading ? "加载车辆数据…" : errorVehicle ?? "初始化中…"}</p>
        {errorVehicle && (
          <button type="button" className="btn primary" onClick={() => void refresh("all")}>
            重试
          </button>
        )}
        {showSettings && (
          <ApiSettings
            onRefresh={(target, triggerFetch) => {
              void refresh(target, triggerFetch);
            }}
            loadingTarget={loadingTarget}
            lastSyncVehicle={lastSyncVehicle}
            lastSyncChange={lastSyncChange}
            vehicleMeta={vehicleMeta}
            changeMeta={changeMeta}
            errorVehicle={errorVehicle}
            errorChange={errorChange}
            vehiclePollSec={vehiclePollSec}
            changePollSec={changePollSec}
            onPollConfigLoaded={(vehicleEnv, changeSec) => {
              pollEnvRef.current = vehicleEnv;
              setChangePollSec(changeSec);
              const state = data ? extractVehicleStatus(data)?.exterior_status.vehicle_state ?? null : null;
              updateVehiclePollInterval(vehicleEnv, state, setVehiclePollSec);
            }}
          />
        )}
      </div>
    );
  }

  const s = vehicleStatus;
  const posTs = s.position_status.sample_time || s.soc_status.sample_time;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>蔚来车辆看板</h1>
          <p className="muted">
            车况采样 {fmtTime(s.soc_status.sample_time)}
            {vehicleMeta?.ok && vehicleMeta.at ? ` · 车辆拉取 ${fmtTime(vehicleMeta.at)}` : ""}
            {changeMeta?.ok && changeMeta.at ? ` · 换电拉取 ${fmtTime(changeMeta.at)}` : ""}
          </p>
          <p className="nas-hint">
            在「数据同步」填写 Token；车辆按行驶/白天/夜间自动拉取，换电独立定时；菜单栏同步显示电量
          </p>
          {vehicleMeta && !vehicleMeta.ok && (
            <p className="nas-error">车辆拉取失败：{vehicleMeta.error}</p>
          )}
          {changeMeta && !changeMeta.ok && (
            <p className="nas-error">换电拉取失败：{changeMeta.error}</p>
          )}
        </div>
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
      </header>

      {showSettings && (
        <ApiSettings
          onRefresh={(target, triggerFetch) => {
            void refresh(target, triggerFetch);
          }}
          loadingTarget={loadingTarget}
          lastSyncVehicle={lastSyncVehicle}
          lastSyncChange={lastSyncChange}
          vehicleMeta={vehicleMeta}
          changeMeta={changeMeta}
          checkinMeta={checkinMeta}
          checkinData={checkinData}
          errorVehicle={errorVehicle}
          errorChange={errorChange}
          vehiclePollSec={vehiclePollSec}
          changePollSec={changePollSec}
          onPollConfigLoaded={(vehicleEnv, changeSec) => {
            pollEnvRef.current = vehicleEnv;
            setChangePollSec(changeSec);
            updateVehiclePollInterval(vehicleEnv, s.exterior_status.vehicle_state, setVehiclePollSec);
          }}
        />
      )}

      <DashboardCards data={data!} address={address} checkin={checkinData} />

      <Suspense fallback={<section className="panel muted">地图加载中…</section>}>
        <DailyPathMap
          history={history}
          current={{
            lat: s.position_status.latitude,
            lng: s.position_status.longitude,
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
        {trendOpen && <TrendCharts history={history} />}
      </details>
    </div>
  );
}
