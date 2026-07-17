import { StrictMode, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiSettings, type SyncTarget } from "./components/ApiSettings";
import { DashboardCards } from "./components/DashboardCards";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SwapHistory } from "./components/SwapHistory";
import { TrendCharts } from "./components/TrendCharts";
import { fetchEnvConfig } from "./lib/env-config";
import type { ChangeResponse } from "./lib/change";
import type { CheckinData } from "./lib/checkin";
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
  mergeHistory,
  snapshotFromResponse,
  type VehicleResponse,
  type VehicleSnapshot,
} from "./lib/vehicle";
import { hydrateCardLayout } from "./lib/card-layout";

const DailyPathMap = lazy(() =>
  import("./components/DailyPathMap").then((m) => ({ default: m.DailyPathMap })),
);

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=zh`,
      { headers: { "User-Agent": "NioVehicleDashboard/1.0" } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.display_name?.split(",").slice(0, 2).join("，") ?? null;
  } catch {
    return null;
  }
}

export default function App() {
  const [data, setData] = useState<VehicleResponse | null>(null);
  const [history, setHistory] = useState(() => loadHistory());
  const [pathHistory, setPathHistory] = useState<VehicleSnapshot[]>([]);
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

  useEffect(() => {
    void hydrateCardLayout();
  }, []);

  useEffect(() => {
    void fetchEnvConfig()
      .then((cfg) => {
        const vehicleMin = Math.min(
          Number(cfg.vehicle.NIO_VEHICLE_POLL_DRIVING_SEC) || 900,
          Number(cfg.vehicle.NIO_VEHICLE_POLL_DAY_SEC) || 1800,
          Number(cfg.vehicle.NIO_VEHICLE_POLL_NIGHT_SEC) || 3600,
        );
        const change =
          Number(cfg.change.NIO_CHANGE_POLL_INTERVAL) ||
          Number(cfg.general.NIO_POLL_INTERVAL) ||
          3600;
        setVehiclePollSec(Math.max(15, vehicleMin));
        setChangePollSec(Math.max(15, change));
      })
      .catch(() => {});
  }, []);

  const refreshVehicle = useCallback(async (triggerFetch: boolean) => {
    let triggerError: string | null = null;
    if (triggerFetch) {
      try {
        await triggerServerFetchVehicle();
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

    const snap = snapshotFromResponse(payload);
    const baseHistory = serverHistory ?? loadHistory();
    const pathPoints =
      baseHistory.length > 0
        ? baseHistory.some((p) => p.ts === snap.ts)
          ? baseHistory
          : [...baseHistory, snap].sort((a, b) => a.ts - b.ts)
        : [snap];
    setPathHistory(pathPoints);
    const nextHistory = mergeHistory(baseHistory, snap);
    setHistory(nextHistory);
    if (!serverHistory) {
      saveHistory(nextHistory);
    }

    const pos = extractVehicleStatus(payload)?.position_status;
    if (pos) {
      void reverseGeocode(pos.latitude, pos.longitude).then(setAddress);
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

    if (triggerError) {
      setErrorChange(`${triggerError}，已回退读取当前 data/change.json`);
    } else {
      setErrorChange(null);
    }
  }, []);

  const refresh = useCallback(
    async (target: SyncTarget, triggerFetch = false) => {
      setLoadingTarget(target);
      if (target === "vehicle" || target === "all") setErrorVehicle(null);
      if (target === "change" || target === "all") setErrorChange(null);

      try {
        if (target === "all" && triggerFetch) {
          try {
            await triggerServerFetch();
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

  const initialFetchDone = useRef(false);

  useEffect(() => {
    void (async () => {
      await refresh("vehicle", false);
      await refresh("change", false);
      initialFetchDone.current = true;
      void refresh("vehicle", true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (!initialFetchDone.current || document.visibilityState !== "visible") return;
      void refresh("vehicle", true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh("vehicle");
    }, vehiclePollSec * 1000);
    return () => window.clearInterval(timer);
  }, [vehiclePollSec, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh("change");
    }, changePollSec * 1000);
    return () => window.clearInterval(timer);
  }, [changePollSec, refresh]);

  const trendHistory = useMemo(() => {
    if (!data) return history;
    return mergeHistory(history, snapshotFromResponse(data));
  }, [data, history]);

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
            onPollConfigLoaded={(vehicleMin, change) => {
              setVehiclePollSec(vehicleMin);
              setChangePollSec(change);
            }}
          />
        )}
      </div>
    );
  }

  const s = vehicleStatus;

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
          onPollConfigLoaded={(vehicleMin, change) => {
            setVehiclePollSec(vehicleMin);
            setChangePollSec(change);
          }}
        />
      )}

      <DashboardCards data={data} address={address} checkin={checkinData} />

      <Suspense fallback={<section className="panel muted">地图加载中…</section>}>
        <DailyPathMap
          history={pathHistory}
          current={{
            lat: s.position_status.latitude,
            lng: s.position_status.longitude,
            ts: s.position_status.sample_time,
          }}
        />
      </Suspense>

      {changeData && <SwapHistory data={changeData} />}

      <details className="trend-drawer">
        <summary>历史趋势</summary>
        <TrendCharts history={trendHistory} />
      </details>
    </div>
  );
}
