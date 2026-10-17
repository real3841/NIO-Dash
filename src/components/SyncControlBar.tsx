import { useState } from "react";
import type { ApiConfigStatus } from "../lib/api-status";
import type { FetchMeta } from "../lib/storage";
import { ApiStatusBadge } from "./ApiStatusBadge";
import { CardLayoutSettings } from "./CardLayoutSettings";
import { MapApiSettingsPanel } from "./MapApiSettingsPanel";
import { QuickAuthPanel } from "./QuickAuthPanel";
import { StorageFilesPanel, useStorageFiles } from "./StorageFilesPanel";
import { StockWatchLoginPanel } from "./StockWatchLoginPanel";
import { SyncRuntimeLogPanel } from "./SyncRuntimeLogPanel";
import type { StockWatchState } from "../lib/stock-watch";
import { TrayDisplaySettings, trayDisplayMeta } from "./TrayDisplaySettings";
import { applyUiLook, readUiLook, type UiLook } from "../lib/ui-look";

export type SyncPanelId =
  | "files"
  | "tray"
  | "cards"
  | "look"
  | "vehicle"
  | "change"
  | "checkin"
  | "stock"
  | "log"
  | "map"
  | "quick"
  | null;

export type SyncTarget = "vehicle" | "change" | "all";

interface SyncControlBarProps {
  activePanel: SyncPanelId;
  onPanelChange: (id: SyncPanelId) => void;
  vehicleStatus: ApiConfigStatus;
  changeStatus: ApiConfigStatus;
  checkinStatus: ApiConfigStatus;
  vehicleMeta: FetchMeta | null;
  changeMeta: FetchMeta | null;
  checkinMeta?: FetchMeta | null;
  stockWatch?: StockWatchState | null;
  onStockWatchPollSecChange?: (pollSec: number) => void | Promise<void>;
  onSaveStockWatchAuth?: (auth: { cookie?: string; token?: string }) => boolean | Promise<boolean>;
  trayInitialDisplay: string;
  onTraySaved?: () => void;
  onMapSaved?: () => void;
  onQuickAuthDone?: () => void | Promise<void>;
}

export function SyncControlBar({
  activePanel,
  onPanelChange,
  vehicleStatus,
  changeStatus,
  checkinStatus,
  vehicleMeta,
  changeMeta,
  checkinMeta,
  stockWatch,
  onStockWatchPollSecChange,
  onSaveStockWatchAuth,
  trayInitialDisplay,
  onTraySaved,
  onMapSaved,
  onQuickAuthDone,
}: SyncControlBarProps) {
  const files = useStorageFiles();

  const toggle = (id: Exclude<SyncPanelId, null>) => {
    onPanelChange(activePanel === id ? null : id);
  };

  const filesMeta = files.loading
    ? "读取中…"
    : files.snapshot
      ? `${files.existsCount}/${files.totalCount} 个文件`
      : "本地配置与数据";

  return (
    <div className={`sync-hub${activePanel ? " sync-hub-open" : ""}`}>
      <div className="sync-hub-bar">
        <h2 className="sync-hub-title">数据同步</h2>
        <span className="sync-hub-divider" aria-hidden="true" />

        <div className="sync-hub-group" aria-label="工具">
          <button
            type="button"
            className={`sync-hub-chip sync-hub-action${activePanel === "log" ? " active" : ""}`}
            onClick={() => toggle("log")}
          >
            运行日志
          </button>
          <button
            type="button"
            className={`sync-hub-chip sync-hub-action${activePanel === "map" ? " active" : ""}`}
            onClick={() => toggle("map")}
          >
            地图 API
          </button>
        </div>

        <span className="sync-hub-divider" aria-hidden="true" />

        <div className="sync-hub-group" role="tablist" aria-label="本地设置">
          <button
            type="button"
            role="tab"
            aria-selected={activePanel === "files"}
            title={filesMeta}
            className={`sync-hub-chip${activePanel === "files" ? " active" : ""}`}
            onClick={() => toggle("files")}
          >
            本地文件
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activePanel === "tray"}
            title={trayDisplayMeta(trayInitialDisplay)}
            className={`sync-hub-chip${activePanel === "tray" ? " active" : ""}`}
            onClick={() => toggle("tray")}
          >
            菜单栏显示
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activePanel === "cards"}
            className={`sync-hub-chip${activePanel === "cards" ? " active" : ""}`}
            onClick={() => toggle("cards")}
          >
            卡片管理
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activePanel === "look"}
            className={`sync-hub-chip${activePanel === "look" ? " active" : ""}`}
            onClick={() => toggle("look")}
          >
            界面
          </button>
        </div>

        <span className="sync-hub-divider" aria-hidden="true" />

        <div className="sync-hub-group" role="tablist" aria-label="API 配置">
          <button
            type="button"
            role="tab"
            aria-selected={activePanel === "quick"}
            className={`sync-hub-chip sync-hub-action${activePanel === "quick" ? " active" : ""}`}
            onClick={() => toggle("quick")}
          >
            更新 Token
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activePanel === "vehicle"}
            className={`sync-hub-chip sync-hub-chip-status${activePanel === "vehicle" ? " active" : ""}`}
            onClick={() => toggle("vehicle")}
          >
            <span>车辆 API</span>
            <ApiStatusBadge status={vehicleStatus} meta={vehicleMeta} />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activePanel === "change"}
            className={`sync-hub-chip sync-hub-chip-status${activePanel === "change" ? " active" : ""}`}
            onClick={() => toggle("change")}
          >
            <span>换电 API</span>
            <ApiStatusBadge status={changeStatus} meta={changeMeta} />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activePanel === "checkin"}
            className={`sync-hub-chip sync-hub-chip-status${activePanel === "checkin" ? " active" : ""}`}
            onClick={() => toggle("checkin")}
          >
            <span>签到 API</span>
            <ApiStatusBadge status={checkinStatus} meta={checkinMeta} />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activePanel === "stock"}
            className={`sync-hub-chip${activePanel === "stock" ? " active" : ""}`}
            onClick={() => toggle("stock")}
          >
            库存登录
          </button>
        </div>
      </div>

      {activePanel === "stock" && (
        <StockWatchLoginPanel
          stockWatch={stockWatch}
          onPollSecChange={onStockWatchPollSecChange}
          onSaveAuth={onSaveStockWatchAuth}
        />
      )}
      {activePanel === "quick" && <QuickAuthPanel onDone={onQuickAuthDone} />}
      {activePanel === "log" && <SyncRuntimeLogPanel />}
      {activePanel === "map" && <MapApiSettingsPanel onSaved={onMapSaved} />}
      {activePanel === "files" && (
        <StorageFilesPanel
          embedded
          snapshot={files.snapshot}
          error={files.error}
          loading={files.loading}
          onReload={files.reload}
        />
      )}
      {activePanel === "tray" && (
        <TrayDisplaySettings
          key={trayInitialDisplay}
          embedded
          initialDisplay={trayInitialDisplay}
          onSaved={onTraySaved}
        />
      )}
      {activePanel === "cards" && <CardLayoutSettings embedded />}
      {activePanel === "look" && <LookSettings />}
    </div>
  );
}

function LookSettings() {
  const [look, setLook] = useState<UiLook>(() => readUiLook());
  const choose = (next: UiLook) => {
    setLook(next);
    applyUiLook(next);
  };
  return (
    <div className="sync-hub-panel-body">
      <p className="muted">老界面是原来的浅色卡片。新界面跟随系统深浅色，并在顶部显示车况示意图。</p>
      <div className="look-options" role="radiogroup" aria-label="界面">
        {(
          [
            ["classic", "老界面"],
            ["new", "新界面"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={look === id}
            className={`look-option${look === id ? " active" : ""}`}
            onClick={() => choose(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
