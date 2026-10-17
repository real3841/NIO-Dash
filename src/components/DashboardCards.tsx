import { memo, useEffect, useState, type ReactNode } from "react";
import {
  AddressPill,
  DashCard,
  RowItem,
  StatusDots,
  StatusPill,
  Toggle,
} from "./ui";
import {
  IconBattery,
  IconCar,
  IconCube,
  IconDoor,
  IconGps,
  IconKey,
  IconLight,
  IconLock,
  IconModes,
  IconPlug,
  IconSeat,
  IconTemp,
  IconTyre,
  IconWifi,
  IconWindow,
  IconWrench,
} from "./icons";
import {
  batteryPackLabel,
  chargeStateLabel,
  fotaDownloadPercent,
  fmtTime,
  extractVehicleStatus,
  isFotaUpdating,
  formatVehicleId,
  fullChargeRangeKm,
  isValidGps,
  heatLevelLabel,
  mapsUrl,
  modeActive,
  vehicleStateLabel,
  type VehicleResponse,
} from "../lib/vehicle";
import {
  autoRows,
  chargerTypeLabel,
  formatChargingPowerKw,
  maintainStatusLabel,
  onOff,
  rowsFromBlock,
  statusBlock,
  str,
  tripShareLabel,
  tyreRows,
  vehlModeLabel,
  windowPosLabel,
} from "../lib/vehicle-display";
import { VEHICLE_CARDS, cardLabel, toggleCardVisibility } from "../lib/card-layout";
import type { CheckinData } from "../lib/checkin";
import { getCardRvsPayload } from "../lib/card-rvs-data";
import { stockStatusTone, type StockWatchState } from "../lib/stock-watch";
import { placeLabel, tripTimeMs, type DailyFile, type JourneyFile } from "../lib/trip";
import { formatDurationSec, NIO_SITE_CERT, NIO_SITE_CERT_NOT_AFTER, workStateLabel, type PowerFile } from "../lib/power";
import { localDayKey } from "../lib/date-utils";
import { useCardLayout } from "../hooks/useCardLayout";
import { SortableCardGrid, type CardControls } from "./SortableCardGrid";
import { CardRvsModal } from "./CardRvsModal";
import type { UiLook } from "../lib/ui-look";

interface Props {
  data: VehicleResponse;
  address: string | null;
  checkin?: CheckinData | null;
  journey?: JourneyFile | null;
  daily?: DailyFile | null;
  stockWatch?: StockWatchState | null;
  stockWatchLoading?: boolean;
  onRefreshStockWatch?: (targetId?: string) => void;
  power?: PowerFile | null;
  look?: UiLook;
  pollPills?: string[];
}

type Tone = "" | "blue" | "warm" | "hot";
type BoardTab = "all" | "car" | "charge" | "swap" | "system";

const BIG_CARDS: Record<string, { tab: BoardTab; tone: Tone }> = {
  battery: { tab: "car", tone: "blue" },
  daily_mileage: { tab: "car", tone: "" },
  recent_journey: { tab: "car", tone: "" },
  home_charger: { tab: "charge", tone: "warm" },
};

const SMALL_SECTIONS: Array<{ tab: Exclude<BoardTab, "all">; title: string; ids: string[] }> = [
  {
    tab: "car",
    title: "车况",
    ids: [
      "doors_visual",
      "window",
      "tyre",
      "light",
      "temperature",
      "modes",
      "seat_heat",
      "exterior_detail",
      "key",
      "vehicle_info",
      "frdg",
      "box",
      "special",
      "nearby_car",
      "trip_share",
    ],
  },
  { tab: "charge", title: "充电", ids: ["charging", "charge_order", "lv_batt"] },
  { tab: "swap", title: "换电与券", ids: ["power_swap_order", "offcar_power_swap", "stock_swap", "stock_drive"] },
  { tab: "system", title: "系统", ids: ["software_gps", "connection", "maintain", "remote_operate", "device"] },
];

const BOARD_TABS: Array<{ id: BoardTab; label: string }> = [
  { id: "all", label: "全部" },
  { id: "car", label: "车况" },
  { id: "charge", label: "充电" },
  { id: "swap", label: "换电与券" },
  { id: "system", label: "系统" },
];

const NO_CONTROLS: CardControls = { dragHandleProps: {}, dragListeners: {}, isDragging: false };

function cardIcon(id: string): ReactNode {
  switch (id) {
    case "battery":
    case "lv_batt":
      return <IconBattery />;
    case "doors_visual":
      return <IconDoor />;
    case "window":
      return <IconWindow />;
    case "tyre":
      return <IconTyre />;
    case "light":
      return <IconLight />;
    case "temperature":
    case "frdg":
      return <IconTemp />;
    case "modes":
      return <IconModes />;
    case "seat_heat":
      return <IconSeat />;
    case "key":
    case "nearby_car":
      return <IconKey />;
    case "connection":
    case "device":
    case "remote_operate":
      return <IconWifi />;
    case "maintain":
    case "special":
      return <IconWrench />;
    case "software_gps":
    case "box":
    case "stock_swap":
    case "stock_drive":
      return <IconCube />;
    case "recent_journey":
      return <IconGps />;
    case "charging":
    case "charge_order":
    case "home_charger":
    case "power_swap_order":
    case "offcar_power_swap":
      return <IconPlug />;
    default:
      return <IconCar />;
  }
}


function doorOpen(status: number): boolean {
  return status !== 1;
}

function EmptyHint() {
  return <p className="muted card-empty-hint">暂无数据</p>;
}

function BlockRows({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  if (rows.length === 0) return <EmptyHint />;
  return (
    <>
      {rows.map((row) => (
        <RowItem key={row.label} label={row.label} value={row.value} />
      ))}
    </>
  );
}

export const DashboardCards = memo(function DashboardCards({
  data,
  address,
  checkin,
  journey,
  daily,
  stockWatch,
  stockWatchLoading = false,
  onRefreshStockWatch,
  power,
  look = "new",
  pollPills = [],
}: Props) {
  const monthKeyNow = localDayKey().slice(0, 7);
  const [layout, updateLayout] = useCardLayout("vehicle", VEHICLE_CARDS);
  const [rvsModal, setRvsModal] = useState<{ title: string; payload: Record<string, unknown> } | null>(null);
  const [certOpen, setCertOpen] = useState(false);
  const [boardTab, setBoardTab] = useState<BoardTab>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);
  const s = extractVehicleStatus(data);
  if (!s) {
    return (
      <section className="panel muted">
        <p>车辆数据不完整，请刷新或检查 API 配置。</p>
      </section>
    );
  }
  const soc = s.soc_status.soc;
  const locked = s.door_status.vehicle_lock_status === 1;
  const socExtra = s.soc_status as Record<string, number | boolean>;
  const hvacExtra = s.hvac_status as Record<string, number | boolean>;
  const heatExtra = s.heating_status as Record<string, number>;
  const extExtra = s.exterior_status as Record<string, number>;
  const defenderWarnCount = s.offcar_mode_status.defender_mode_warn_count ?? 0;

  const visualDoors = [
    { label: "左前", open: doorOpen(s.door_status.door_ajar_front_left_status) },
    { label: "右前", open: doorOpen(s.door_status.door_ajar_front_right_status) },
    { label: "左后", open: doorOpen(s.door_status.door_ajar_rear_left_status) },
    { label: "右后", open: doorOpen(s.door_status.door_ajar_rear_right_status) },
    { label: "前备箱", open: doorOpen(s.door_status.engine_hood_ajar_status) },
    { label: "尾门", open: doorOpen(s.door_status.tailgate_ajar_status) },
    { label: "充电口", open: doorOpen(s.door_status.second_charge_port_ajar_status) },
  ];

  const openCount = visualDoors.filter((d) => d.open).length;
  const closedCount = visualDoors.length - openCount;

  const modes = [
    { label: "宠物模式", on: modeActive(s.offcar_mode_status.pet_mode) },
    { label: "离车不下电", on: modeActive(s.offcar_mode_status.power_hold_mode) },
    { label: "露营模式", on: modeActive(s.offcar_mode_status.camping_mode) },
    { label: "守卫模式", on: s.offcar_mode_status.defender_mode >= 2 },
    { label: "远程查看", on: modeActive(s.offcar_mode_status.remote_video) },
    { label: "儿童遗留检测", on: modeActive(s.offcar_mode_status.cpd_mode) },
  ];

  const heatItems = [
    { label: "方向盘", value: heatLevelLabel(s.heating_status.steer_wheel_heat_sts) },
    { label: "前排左右", value: heatLevelLabel(Math.max(s.heating_status.seat_heat_frnt_le_sts, s.heating_status.seat_heat_frnt_ri_sts)) },
    { label: "后排左右", value: heatLevelLabel(Math.max(s.heating_status.seat_heat_re_le_sts, s.heating_status.seat_heat_re_ri_sts)) },
    {
      label: "三排左右",
      value: heatLevelLabel(Math.max(heatExtra.seat_heat_thrd_le_sts ?? 0, heatExtra.seat_heat_thrd_ri_sts ?? 0)),
    },
    {
      label: "通风（全部）",
      value: heatLevelLabel(
        Math.max(
          s.heating_status.seat_vent_frnt_le_sts,
          s.heating_status.seat_vent_frnt_ri_sts,
          s.heating_status.seat_vent_re_le_sts,
          s.heating_status.seat_vent_re_ri_sts,
        ),
      ),
    },
    { label: "电池预热", value: onOff(heatExtra.hv_batt_pre_sts) },
    { label: "电池保温", value: onOff(heatExtra.btry_warm_up_sts) },
  ];

  const vehicleReady = s.exterior_status.vehicle_state === 2;
  const versionRaw = s.fota_status?.current_version ?? "";
  const version = versionRaw.split("*")[1] ?? versionRaw;
  const fotaUpdating = isFotaUpdating(s.fota_status);
  const fotaPercent = fotaDownloadPercent(s.fota_status);
  const fullRange = fullChargeRangeKm(s.soc_status.remaining_range, soc);
  const fullRangeLabel = fullRange != null ? batteryPackLabel(fullRange) : "";

  const hideCard = (id: string) => updateLayout(toggleCardVisibility(layout, id));
  const showRvs = (id: string) => {
    const payload = getCardRvsPayload(data, id, checkin);
    setRvsModal({
      title: cardLabel(VEHICLE_CARDS, id),
      payload,
    });
  };

  const renderStockCard = (
    targetId: "swap" | "drive",
    title: string,
    chrome: {
      dragHandleProps: CardControls["dragHandleProps"];
      dragListeners: CardControls["dragListeners"];
      onHide: () => void;
    },
  ) => {
    const item = stockWatch?.items.find((entry) => entry.id === targetId);
    const tone = stockStatusTone(item?.status ?? "unknown");
    return (
      <DashCard
        icon={<IconCube />}
        title={title}
        badge={
          <StatusPill tone={item ? tone : "neutral"}>
            {stockWatchLoading ? "检查中…" : item?.label ?? "尚未检查"}
          </StatusPill>
        }
        {...chrome}
      >
        {item?.goodsName && <RowItem label="商品" value={item.goodsName} />}
        <RowItem label="状态" value={stockWatchLoading ? "检查中…" : item?.label ?? "尚未检查"} />
        {item?.detectedText && <RowItem label="检测文本" value={item.detectedText} />}
        {item?.evidence && <RowItem label="判断依据" value={item.evidence} />}
        <RowItem label="上次检查" value={item?.at ? fmtTime(item.at) : "—"} />
        {item?.error && <p className="nas-error stock-watch-error">{item.error}</p>}
        <div className="stock-watch-actions">
          <button
            type="button"
            className="btn secondary"
            disabled={stockWatchLoading}
            onClick={() => onRefreshStockWatch?.(targetId)}
          >
            {stockWatchLoading ? "检查中…" : "立即检查"}
          </button>
          {item?.url && (
            <a className="btn ghost" href={item.url} target="_blank" rel="noreferrer">
              打开商品页
            </a>
          )}
        </div>
      </DashCard>
    );
  };

  const renderCard = (id: string, controls: CardControls) => {
    const chrome = {
      dragHandleProps: controls.dragHandleProps,
      dragListeners: controls.dragListeners,
      onHide: () => hideCard(id),
      ...(id === "stock_swap" ||
      id === "stock_drive" ||
      id === "daily_mileage" ||
      id === "recent_journey" ||
      id === "home_charger"
        ? {}
        : { onShowRvs: () => showRvs(id) }),
    };

    switch (id) {
      case "home_charger": {
        const spot = power?.spot;
        const realtime = power?.realtime;
        const lastService = power?.services?.[0];
        const thisMonth = power?.months?.[monthKeyNow];
        return (
          <DashCard
            icon={<IconPlug />}
            title={spot?.name ?? "家充桩"}
            badge={
              spot ? (
                <StatusPill tone={spot.is_online ? "success" : "warning"}>
                  {realtime?.effective_state_desc ?? (spot.is_online ? "在线" : "离线")}
                </StatusPill>
              ) : undefined
            }
            {...chrome}
          >
            {!spot && (
              <p className="muted card-empty-hint">在「数据同步 → 更新 Token」选择带加电页面的 HAR 文件</p>
            )}
            {spot && (
              <BlockRows
                rows={[
                  { label: "型号", value: [spot.model, spot.resource_type === "DCPowerCharger" ? "直流" : null].filter(Boolean).join(" · ") || "—" },
                  { label: "枪状态", value: workStateLabel(spot.work_state) },
                  { label: "联网", value: spot.is_online ? (spot.mobile_network_state ? "在线 · 4G" : "在线") : "离线" },
                  {
                    label: "预约充电",
                    value: spot.reservation_state
                      ? `${spot.reservation_starttime?.slice(0, 5) ?? "—"} – ${spot.reservation_endtime?.slice(0, 5) ?? "—"}`
                      : "未开启",
                  },
                  {
                    label: "上次充电",
                    value: lastService?.start_time
                      ? `${fmtTime(lastService.start_time)} · ${lastService.consume_power ?? "—"} kWh · ${formatDurationSec((lastService.charge_duration ?? 0) / 1000)}`
                      : "—",
                  },
                  {
                    label: "本月",
                    value: thisMonth
                      ? `${thisMonth.total_charging_times} 次 · ${thisMonth.total_real_charge_kwh.toFixed(1)} kWh`
                      : "—",
                  },
                  { label: "固件", value: spot.software_version ?? "—" },
                  {
                    label: "站点证书",
                    value: (
                      <button type="button" className="row-link" onClick={() => setCertOpen(true)}>
                        至 {NIO_SITE_CERT_NOT_AFTER}
                      </button>
                    ),
                  },
                ]}
              />
            )}
            {power?.capturedAt && (
              <p className="muted card-foot-note">数据来自抓包 · {fmtTime(power.capturedAt)}</p>
            )}
          </DashCard>
        );
      }

      case "battery":
        return (
          <DashCard
            icon={<IconBattery />}
            title="电池"
            badge={<StatusPill tone="neutral">{chargeStateLabel(s.soc_status.charge_state)}</StatusPill>}
            {...chrome}
          >
            <div className="battery-row">
              <div className="battery-track">
                <div className="battery-fill" style={{ width: `${soc}%` }} />
              </div>
              <span className="battery-pct">{soc}%</span>
            </div>
            <RowItem label="标准续航" value={`${s.soc_status.remaining_range} km`} />
            <RowItem label="实际续航" value={`${s.soc_status.remaining_actual_range} km`} />
            <RowItem label="总里程" value={`${s.exterior_status.mileage.toLocaleString()} km`} />
            <RowItem
              label="满电续航"
              value={
                fullRange != null ? (
                  <>
                    {fullRange} km{fullRangeLabel && <span className="battery-pack-hint"> {fullRangeLabel}</span>}
                  </>
                ) : (
                  "—"
                )
              }
            />
            <RowItem label="最大充电 SOC" value={`${socExtra.max_soc ?? "—"}%`} />
          </DashCard>
        );

      case "charging":
        return (
          <DashCard icon={<IconPlug />} title="充电详情" {...chrome}>
            <BlockRows
              rows={[
                { label: "充电状态", value: chargeStateLabel(s.soc_status.charge_state) },
                {
                  label: "充电类型",
                  value:
                    s.soc_status.charge_state === 0
                      ? `未在充电 · 上次${chargerTypeLabel(Number(socExtra.charger_type ?? 0))}`
                      : chargerTypeLabel(Number(socExtra.charger_type ?? 0)),
                },
                { label: "充电功率", value: formatChargingPowerKw(socExtra.charging_power as number | undefined) },
                { label: "充电电流", value: `${socExtra.charging_current ?? 0} A` },
                { label: "充电电压", value: `${socExtra.charging_voltage ?? 0} V` },
                { label: "限充 SOC", value: `${socExtra.lock_soc ?? "—"}%` },
                { label: "V2L 放电", value: onOff(socExtra.v2l_status ?? 0) },
                { label: "换电模式", value: onOff(socExtra.pwr_swap_mod_sts ?? 0) },
                { label: "智能充电", value: onOff(socExtra.smt_chrg ?? 0) },
              ]}
            />
          </DashCard>
        );

      case "doors_visual":
        return (
          <DashCard
            icon={<IconDoor />}
            title="车门"
            badge={
              <StatusPill tone={locked ? "dark" : "warning"}>
                <span className="pill-with-icon">
                  <IconLock /> {locked ? "已上锁" : "未上锁"}
                </span>
              </StatusPill>
            }
            headerExtra={<span className="door-summary">{openCount} 开启 · {closedCount} 关闭</span>}
            {...chrome}
          >
            <div className="door-grid">
              {visualDoors.map((d) => (
                <div
                  key={d.label}
                  className={`door-cell ${d.open ? "door-cell-open" : "door-cell-closed"}`}
                  title={d.open ? "开启" : "关闭"}
                >
                  {d.label}
                </div>
              ))}
            </div>
            <div className="door-legend">
              <span className="door-legend-item door-legend-closed">关闭</span>
              <span className="door-legend-item door-legend-open">开启</span>
            </div>
            <RowItem label="钥匙感应距离" value={str(s.door_status as Record<string, unknown>, "peps_entry_distance")} />
          </DashCard>
        );

      case "doors_toggle":
        return null;

      case "window": {
        const win = statusBlock(s, "window_status") ?? (s.window_status as Record<string, unknown>);
        const winRows = rowsFromBlock(win, {
          win_front_left_posn: "左前窗",
          win_front_right_posn: "右前窗",
          win_rear_left_posn: "左后窗",
          win_rear_right_posn: "右后窗",
          sun_roof_posn: "天窗",
          mirr_frnt_le_sts: "左后视镜",
          mirr_frnt_ri_sts: "右后视镜",
        }, (key, v) => {
          if (typeof v !== "number") return null;
          return key.startsWith("mirr_") ? `状态码 ${v}` : windowPosLabel(v);
        });
        return (
          <DashCard icon={<IconWindow />} title="车窗" {...chrome}>
            <BlockRows rows={winRows} />
          </DashCard>
        );
      }

      case "tyre": {
        const tyre = statusBlock(s, "tyre_status");
        const rows = tyreRows(tyre);
        return (
          <DashCard icon={<IconTyre />} title="轮胎" {...chrome}>
            {rows.length === 0 ? (
              <EmptyHint />
            ) : (
              <div className="tyre-grid">
                {rows.map((row) => (
                  <div key={row.label} className="tyre-cell">
                    <span className="tyre-cell-label">{row.label}</span>
                    <span className="tyre-cell-press">{row.press}</span>
                    <span className="tyre-cell-temp">{row.temp}</span>
                  </div>
                ))}
              </div>
            )}
          </DashCard>
        );
      }

      case "software_gps":
        return (
          <DashCard
            icon={<IconCube />}
            title="软件版本"
            badge={
              <StatusPill tone={fotaUpdating ? "warning" : "dark"}>
                {fotaUpdating ? (fotaPercent != null ? `下载 ${fotaPercent}%` : "更新中") : "已是最新"}
              </StatusPill>
            }
            {...chrome}
          >
            <RowItem label="当前版本" value={`v${version.replace(/^v/i, "")}`} />
            <RowItem label="零件号" value={s.fota_status.current_part_no} />
            <RowItem label="上一版本" value={s.fota_status.last_version?.split("*")[1] ?? s.fota_status.last_version ?? "—"} />
            {fotaUpdating && (
              <div className="fota-progress">
                <div className="fota-progress-head">
                  <span>更新进度</span>
                  <span>{fotaPercent != null ? `${fotaPercent}%` : "等待进度"}</span>
                </div>
                <div className="fota-progress-track" role="progressbar" aria-valuenow={fotaPercent ?? 0} aria-valuemin={0} aria-valuemax={100}>
                  <div className="fota-progress-bar" style={{ width: `${fotaPercent ?? 0}%` }} />
                </div>
              </div>
            )}
            <div className="card-section-divider">
              <IconGps />
              <span>GPS 位置</span>
            </div>
            {isValidGps(s.position_status.latitude, s.position_status.longitude) ? (
              <>
                <RowItem label="经度" value={s.position_status.longitude.toFixed(4)} />
                <RowItem label="纬度" value={s.position_status.latitude.toFixed(4)} />
                <AddressPill href={mapsUrl(s.position_status.latitude, s.position_status.longitude)}>
                  {address ?? `${s.position_status.latitude.toFixed(2)}°N, ${s.position_status.longitude.toFixed(2)}°E`}
                </AddressPill>
              </>
            ) : (
              <RowItem label="位置" value="这次返回没有 GPS" />
            )}
          </DashCard>
        );

      case "modes":
        return (
          <DashCard icon={<IconModes />} title="特殊模式" {...chrome}>
            {modes.map((mode) => (
              <div
                key={mode.label}
                className={`row-item row-item-toggle${mode.label === "守卫模式" && defenderWarnCount > 0 ? " row-item-alert" : ""}`}
              >
                <span className="row-item-label">{mode.label}</span>
                <Toggle on={mode.on} label={mode.label} />
              </div>
            ))}
            {defenderWarnCount > 0 && (
              <RowItem
                label="守卫告警"
                value={<span className="text-danger">{defenderWarnCount} 次</span>}
              />
            )}
          </DashCard>
        );

      case "vehicle_info":
        return (
          <DashCard icon={<IconCar />} title="车辆信息" {...chrome}>
            <RowItem label="总里程" value={`${s.exterior_status.mileage.toLocaleString()} km`} />
            <RowItem label="车辆 ID" value={formatVehicleId(s.vehicle_id)} />
            <RowItem
              label="车辆状态"
              value={<span className={vehicleReady ? "text-success" : ""}>{vehicleStateLabel(s.exterior_status.vehicle_state)}</span>}
            />
            <StatusDots
              states={[
                s.connection_status.connected ? "ok" : "bad",
                s.soc_status.soc > 20 ? "ok" : "warn",
                locked ? "ok" : "warn",
              ]}
            />
          </DashCard>
        );

      case "exterior_detail":
        return (
          <DashCard icon={<IconCar />} title="行驶 / 泊车" {...chrome}>
            <BlockRows
              rows={rowsFromBlock(extExtra as Record<string, unknown>, {
                vehl_mode: "驾驶模式",
                remote_park_mode: "遥控泊车",
                prkg_actv_feature: "泊车功能",
                psap_hmi_status: "换电泊车 HMI",
                comf_ena: "舒适启用",
              }, (key, v) => {
                if (key === "vehl_mode" && typeof v === "number") return vehlModeLabel(v);
                if (typeof v === "number") return onOff(v);
                return null;
              })}
            />
          </DashCard>
        );

      case "seat_heat":
        return (
          <DashCard icon={<IconSeat />} title="座椅加热" {...chrome}>
            {heatItems.map((item) => (
              <RowItem key={item.label} label={item.label} value={item.value} />
            ))}
          </DashCard>
        );

      case "connection":
        return (
          <DashCard icon={<IconWifi />} title="连接状态" {...chrome}>
            {checkin ? (
              <>
                <RowItem
                  label="今日签到"
                  value={
                    <StatusPill tone={checkin.checked_in ? "success" : "neutral"}>
                      {checkin.checked_in ? "已签到" : "未签到"}
                    </StatusPill>
                  }
                />
                <RowItem label="连续签到" value={`${checkin.continuous_days} 天`} />
              </>
            ) : (
              <RowItem label="今日签到" value={<span className="muted">暂无数据，请刷新车辆</span>} />
            )}
            <RowItem
              label="车辆在线"
              value={<StatusPill tone="neutral">{s.connection_status.connected ? "是" : "否"}</StatusPill>}
            />
            <RowItem
              label="CDC 连接"
              value={<StatusPill tone="neutral">{s.connection_status.cdc_connected ? "是" : "否"}</StatusPill>}
            />
            <RowItem
              label="ADC 连接"
              value={<StatusPill tone="neutral">{s.connection_status.adc_connected ? "是" : "否"}</StatusPill>}
            />
            <RowItem label="连接更新" value={fmtTime(s.connection_status.update_time)} />
            <RowItem label="车况采样" value={fmtTime(s.soc_status.sample_time)} />
          </DashCard>
        );

      case "temperature":
        return (
          <DashCard icon={<IconTemp />} title="温度 / 空调" {...chrome}>
            <RowItem label="车内" value={`${s.hvac_status.temperature.toFixed(1)}°C`} />
            <RowItem label="车外" value={`${s.hvac_status.outside_temperature.toFixed(1)}°C`} />
            <RowItem label="空调" value={s.hvac_status.air_conditioner_on ? "开启" : "关闭"} />
            <BlockRows
              rows={rowsFromBlock(hvacExtra as Record<string, unknown>, {
                cbn_ovr_ht_sts: "座舱过热监测",
                cbn_ovr_ht_act_sts: "过热动作",
                ccu_max_defrst_sts: "最大除霜",
                ccu_acmax_lamp_req: "AC 最大",
                ccu_heatg_max_lamp_req: "暖风最大",
                rem_sens_climate_set_sts: "远程气候",
                cbn_hi_t_dry_sts: "高温干燥",
              }, (_, v) => (typeof v === "number" ? onOff(v) : null))}
            />
          </DashCard>
        );

      case "maintain": {
        const list = s.maintain_status.current_maintenance_list ?? [];
        return (
          <DashCard
            icon={<IconWrench />}
            title="维保"
            badge={<StatusPill tone={s.maintain_status.maintain_status >= 1 ? "warning" : "success"}>{maintainStatusLabel(s.maintain_status.maintain_status)}</StatusPill>}
            {...chrome}
          >
            <RowItem label="维保状态码" value={String(s.maintain_status.maintain_status)} />
            {list.length === 0 ? (
              <EmptyHint />
            ) : (
              list.map((item) => (
                <RowItem key={item.code} label={item.name} value={item.code} />
              ))
            )}
          </DashCard>
        );
      }

      case "light":
        return (
          <DashCard icon={<IconLight />} title="灯光" {...chrome}>
            <BlockRows
              rows={rowsFromBlock(statusBlock(s, "light_status"), {
                head_light_on: "大灯",
                parking_light_le_on: "左示宽灯",
                parking_light_ri_on: "右示宽灯",
                day_ti_runng_li_sts: "日行灯",
              }, (_, v) => onOff(v as number))}
            />
          </DashCard>
        );

      case "key":
        return (
          <DashCard icon={<IconKey />} title="钥匙" {...chrome}>
            <BlockRows
              rows={rowsFromBlock(statusBlock(s, "key_status"), {
                approach_door_unlock_on_off: "近车自动解锁",
                int_hndl_touch_ena_set: "门把手感应",
              }, (_, v) => onOff(v as number))}
            />
          </DashCard>
        );

      case "special":
        return (
          <DashCard icon={<IconWrench />} title="特殊状态" {...chrome}>
            <BlockRows
              rows={rowsFromBlock(statusBlock(s, "special_status"), {
                repaired: "维修标记",
                repair_sample_time: "维修采样时间",
              }, (key, v) => (key.endsWith("_time") && typeof v === "number" ? fmtTime(v) : onOff(v as number)))}
            />
          </DashCard>
        );

      case "trip_share":
        return (
          <DashCard icon={<IconCar />} title="行程分享" {...chrome}>
            <BlockRows
              rows={rowsFromBlock(statusBlock(s, "trip_share_status"), {
                status: "分享状态",
              }, (_, v) => (typeof v === "number" ? tripShareLabel(v) : String(v)))}
            />
          </DashCard>
        );

      case "nearby_car":
        return (
          <DashCard icon={<IconKey />} title="近车控制" {...chrome}>
            <BlockRows
              rows={rowsFromBlock(statusBlock(s, "nearby_car_ctrl"), {
                has_auth: "已授权",
                has_login: "已登录",
                auth_precon: "授权前置",
              }, (_, v) => onOff(v as boolean))}
            />
          </DashCard>
        );

      case "power_swap_order":
        return (
          <DashCard icon={<IconPlug />} title="换电订单" {...chrome}>
            <BlockRows
              rows={rowsFromBlock(statusBlock(s, "power_swap_order"), {
                show: "展示订单",
              }, (_, v) => onOff(v as boolean))}
            />
          </DashCard>
        );

      case "lv_batt":
        return (
          <DashCard icon={<IconBattery />} title="低压电瓶" {...chrome}>
            <BlockRows rows={autoRows(statusBlock(s, "lv_batt_status"))} />
          </DashCard>
        );

      case "device":
        return (
          <DashCard icon={<IconWifi />} title="设备状态" {...chrome}>
            <BlockRows rows={autoRows(statusBlock(s, "device_status"))} />
          </DashCard>
        );

      case "charge_order":
        return (
          <DashCard icon={<IconPlug />} title="充电订单" {...chrome}>
            <BlockRows rows={autoRows(statusBlock(s, "charge_status_order"))} />
          </DashCard>
        );

      case "remote_operate":
        return (
          <DashCard icon={<IconWifi />} title="远程操作" {...chrome}>
            <BlockRows rows={autoRows(statusBlock(s, "remote_operate_status"))} />
          </DashCard>
        );

      case "offcar_power_swap":
        return (
          <DashCard icon={<IconPlug />} title="离车换电" {...chrome}>
            <BlockRows rows={autoRows(statusBlock(s, "offcar_power_swap_status"))} />
          </DashCard>
        );

      case "box":
        return (
          <DashCard icon={<IconCube />} title="储物箱" {...chrome}>
            <BlockRows rows={autoRows(statusBlock(s, "box_status"))} />
          </DashCard>
        );

      case "frdg":
        return (
          <DashCard icon={<IconTemp />} title="冰箱" {...chrome}>
            <BlockRows rows={autoRows(statusBlock(s, "frdg_status"))} />
          </DashCard>
        );

      case "daily_mileage":
        return (
          <DashCard icon={<IconCar />} title="当日里程" {...chrome}>
            {daily?.error && <p className="nas-error">{daily.error}</p>}
            <BlockRows
              rows={[
                {
                  label: "今天",
                  value: daily?.daily_mileage != null ? `${Math.round(daily.daily_mileage * 10) / 10} km` : "—",
                },
                { label: "累计", value: daily?.mileage != null ? `${daily.mileage.toLocaleString()} km` : "—" },
                { label: "激活", value: daily?.activate_days != null ? `${daily.activate_days} 天` : "—" },
              ]}
            />
          </DashCard>
        );

      case "recent_journey": {
        const trip = journey?.journey;
        const start = tripTimeMs(trip?.start_time);
        const end = tripTimeMs(trip?.end_time);
        return (
          <DashCard
            icon={<IconGps />}
            title="最近行程"
            badge={
              journey?.month ? <StatusPill tone="neutral">{journey.month} 月报</StatusPill> : undefined
            }
            {...chrome}
          >
            {journey?.error && <p className="nas-error">{journey.error}</p>}
            {!trip && !journey?.error && <EmptyHint />}
            {trip && (
              <BlockRows
                rows={[
                  {
                    label: "时间",
                    value: start && end ? `${fmtTime(start)} – ${fmtTime(end)}` : "—",
                  },
                  {
                    label: "用时",
                    value: trip.journey_duration_by_minutes != null ? `${trip.journey_duration_by_minutes} 分钟` : "—",
                  },
                  {
                    label: "里程",
                    value: trip.trip_odometer != null ? `${trip.trip_odometer} km` : "—",
                  },
                  {
                    label: "速度",
                    value:
                      trip.avg_speed != null
                        ? `均 ${trip.avg_speed.toFixed(1)} · 最高 ${trip.max_speed ?? "—"} km/h`
                        : "—",
                  },
                  {
                    label: "急加速 / 减速 / 转弯",
                    value: `${trip.rapid_acceleration ?? 0} / ${trip.rapid_deceleration ?? 0} / ${trip.rapid_swerve ?? 0}`,
                  },
                  { label: "起点", value: placeLabel(trip.start_location) },
                  { label: "终点", value: placeLabel(trip.end_location) },
                ]}
              />
            )}
          </DashCard>
        );
      }

      case "stock_swap":
        return renderStockCard("swap", "换电订单", chrome);
      case "stock_drive":
        return renderStockCard("drive", "驾享订单", chrome);

      default:
        return null;
    }
  };

  const smallSummary = (id: string): { text: string; tone: Tone } => {
    switch (id) {
      case "doors_visual":
        if (openCount > 0) return { text: `${openCount} 处开启 · ${locked ? "已上锁" : "未上锁"}`, tone: "hot" };
        return { text: `全部关闭 · ${locked ? "已上锁" : "未上锁"}`, tone: locked ? "" : "hot" };
      case "window": {
        const w = (s.window_status ?? {}) as Record<string, number>;
        const open = ["win_front_left_posn", "win_front_right_posn", "win_rear_left_posn", "win_rear_right_posn"].filter(
          (key) => (w[key] ?? 0) > 0,
        ).length;
        const roof = (w.sun_roof_posn ?? 0) > 0;
        if (open || roof) return { text: [open ? `${open} 扇窗开着` : null, roof ? "天窗开着" : null].filter(Boolean).join(" · "), tone: "warm" };
        return { text: "全部关闭", tone: "" };
      }
      case "tyre": {
        const t = statusBlock(s, "tyre_status");
        const presses = ["front_left", "front_right", "rear_left", "rear_right"].map((k) => {
          const v = t?.[`${k}_wheel_press_bar`];
          return typeof v === "number" ? v : null;
        });
        if (presses.every((p) => p == null)) return { text: "暂无数据", tone: "" };
        const bad = presses.some((p) => p != null && (p < 2.2 || p > 3.4));
        return { text: `${presses.map((p) => (p == null ? "—" : p.toFixed(1))).join(" / ")} bar`, tone: bad ? "hot" : "" };
      }
      case "light": {
        const l = statusBlock(s, "light_status");
        const on = [
          (l?.head_light_on as number) >= 1 ? "大灯" : null,
          (l?.day_ti_runng_li_sts as number) >= 1 ? "日行灯" : null,
          (l?.parking_light_le_on as number) >= 1 || (l?.parking_light_ri_on as number) >= 1 ? "示宽灯" : null,
        ].filter(Boolean);
        return on.length ? { text: `${on.join("、")}开着`, tone: "warm" } : { text: "全部关闭", tone: "" };
      }
      case "temperature":
        return {
          text: `车内 ${s.hvac_status.temperature}° · 车外 ${s.hvac_status.outside_temperature}°${s.hvac_status.air_conditioner_on ? " · 空调开" : ""}`,
          tone: s.hvac_status.air_conditioner_on ? "warm" : "",
        };
      case "modes": {
        const on = modes.filter((m) => m.on).map((m) => m.label);
        if (defenderWarnCount > 0) return { text: `守卫告警 ${defenderWarnCount} 次`, tone: "hot" };
        return on.length ? { text: on.join(" · "), tone: "warm" } : { text: "全部关闭", tone: "" };
      }
      case "seat_heat": {
        const on = heatItems.filter((item) => item.value !== "关闭" && item.value !== "—").map((item) => `${item.label} ${item.value}`);
        return on.length ? { text: on.slice(0, 2).join(" · "), tone: "warm" } : { text: "全部关闭", tone: "" };
      }
      case "exterior_detail":
        return { text: typeof extExtra.vehl_mode === "number" ? vehlModeLabel(extExtra.vehl_mode) : "—", tone: "" };
      case "key": {
        const k = statusBlock(s, "key_status");
        return { text: `近车解锁 ${onOff(k?.approach_door_unlock_on_off as number)}`, tone: "" };
      }
      case "vehicle_info":
        return {
          text: `${s.exterior_status.mileage.toLocaleString()} km · ${vehicleStateLabel(s.exterior_status.vehicle_state)}`,
          tone: "",
        };
      case "charging":
        return {
          text: `${chargeStateLabel(s.soc_status.charge_state)} · 限充 ${socExtra.lock_soc ?? "—"}%`,
          tone: s.soc_status.charge_state === 1 ? "blue" : "",
        };
      case "software_gps":
        return fotaUpdating
          ? { text: fotaPercent != null ? `更新中 ${fotaPercent}%` : "更新中", tone: "blue" }
          : { text: `v${version.replace(/^v/i, "")} · 已是最新`, tone: "" };
      case "connection":
        return {
          text: `${s.connection_status.connected ? "在线" : "离线"}${checkin ? ` · 连签 ${checkin.continuous_days} 天` : ""}`,
          tone: s.connection_status.connected ? "" : "hot",
        };
      case "maintain":
        return {
          text: maintainStatusLabel(s.maintain_status.maintain_status),
          tone: s.maintain_status.maintain_status >= 1 ? "hot" : "",
        };
      case "stock_swap":
      case "stock_drive": {
        const item = stockWatch?.items.find((entry) => entry.id === (id === "stock_swap" ? "swap" : "drive"));
        const tone = stockStatusTone(item?.status ?? "unknown");
        return {
          text: stockWatchLoading ? "检查中…" : item?.label ?? "尚未检查",
          tone: tone === "success" ? "warm" : tone === "warning" ? "hot" : "",
        };
      }
      case "trip_share": {
        const v = statusBlock(s, "trip_share_status")?.status;
        return { text: typeof v === "number" ? tripShareLabel(v) : "暂无数据", tone: v === 2 ? "blue" : "" };
      }
      case "nearby_car": {
        const b = statusBlock(s, "nearby_car_ctrl");
        if (!b) return { text: "暂无数据", tone: "" };
        return { text: `授权 ${b.has_auth ? "是" : "否"} · 登录 ${b.has_login ? "是" : "否"}`, tone: "" };
      }
      case "special": {
        const b = statusBlock(s, "special_status");
        if (!b) return { text: "暂无数据", tone: "" };
        return { text: b.repaired ? "有维修标记" : "无维修标记", tone: b.repaired ? "warm" : "" };
      }
      case "power_swap_order": {
        const b = statusBlock(s, "power_swap_order");
        return { text: b ? (b.show ? "有订单展示" : "无进行中订单") : "暂无数据", tone: b?.show ? "blue" : "" };
      }
      case "frdg":
      case "box":
      case "lv_batt":
      case "device":
      case "charge_order":
      case "remote_operate":
      case "offcar_power_swap": {
        const key =
          {
            frdg: "frdg_status",
            box: "box_status",
            lv_batt: "lv_batt_status",
            device: "device_status",
            charge_order: "charge_status_order",
            remote_operate: "remote_operate_status",
            offcar_power_swap: "offcar_power_swap_status",
          }[id] ?? id;
        const rows = autoRows(statusBlock(s, key));
        return { text: rows.length ? `${rows.length} 项数据 · 点开查看` : "暂无数据", tone: "" };
      }
      default:
        return { text: "", tone: "" };
    }
  };

  if (look === "adjust") {
    const visible = new Set(layout.order.filter((id) => !layout.hidden.includes(id)));
    const bigIds = layout.order.filter((id) => visible.has(id) && BIG_CARDS[id]);
    const sections = SMALL_SECTIONS.map((section) => ({
      ...section,
      items: layout.order
        .filter((id) => visible.has(id) && section.ids.includes(id))
        .map((id) => ({ id, ...smallSummary(id) })),
    }));
    const hotCount = (tab: BoardTab) =>
      sections.filter((sec) => tab === "all" || sec.tab === tab).reduce((n, sec) => n + sec.items.filter((i) => i.tone === "hot").length, 0);
    const total = bigIds.length + sections.reduce((n, sec) => n + sec.items.length, 0);
    const shownBig = bigIds.filter((id) => boardTab === "all" || BIG_CARDS[id].tab === boardTab);
    const shownSections = sections.filter((sec) => sec.items.length > 0 && (boardTab === "all" || sec.tab === boardTab));

    return (
      <div className="adjust-board">
        <div className="adjust-toolbar">
          {BOARD_TABS.map((tab) => {
            const hot = tab.id === "all" ? 0 : hotCount(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                className={`adjust-tab${boardTab === tab.id ? " active" : ""}`}
                onClick={() => setBoardTab(tab.id)}
              >
                {tab.label}
                {hot > 0 && <i>{hot}</i>}
              </button>
            );
          })}
          <span className="adjust-spacer" />
          <span className="adjust-meta">
            共 <b>{total}</b> 项{hotCount("all") > 0 && <> · <b className="adjust-hot-text">{hotCount("all")}</b> 项需注意</>}
          </span>
          {pollPills.map((pill) => (
            <span key={pill} className="adjust-mini">
              {pill}
            </span>
          ))}
        </div>

        {shownBig.length > 0 && (
          <>
            <p className="adjust-section">重点</p>
            <div className="adjust-bigs">
              {shownBig.map((id) => (
                <div key={id} className={`adjust-big ${BIG_CARDS[id].tone}`} data-card={id}>
                  {renderCard(id, NO_CONTROLS)}
                </div>
              ))}
            </div>
          </>
        )}

        {shownSections.map((sec) => (
          <div key={sec.tab}>
            <p className="adjust-section">{sec.title}</p>
            <div className="adjust-smalls">
              {sec.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`adjust-small ${item.tone}`}
                  onClick={() => setExpanded(item.id)}
                  title="点开看详情"
                >
                  <span className="adjust-ic">{cardIcon(item.id)}</span>
                  <span className="adjust-txt">
                    <span className="adjust-t">{cardLabel(VEHICLE_CARDS, item.id)}</span>
                    <span className="adjust-s">{item.text || "点开看详情"}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}

        {expanded && (
          <div className="adjust-overlay" role="dialog" aria-modal="true" onClick={() => setExpanded(null)}>
            <div className="adjust-detail" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="adjust-close" onClick={() => setExpanded(null)} aria-label="关闭">
                ×
              </button>
              {renderCard(expanded, NO_CONTROLS)}
            </div>
          </div>
        )}
        {rvsModal && <CardRvsModal title={rvsModal.title} payload={rvsModal.payload} onClose={() => setRvsModal(null)} />}
        {certOpen && (
          <CardRvsModal title="站点证书" kind="证书信息" payload={NIO_SITE_CERT} onClose={() => setCertOpen(false)} />
        )}
      </div>
    );
  }

  return (
    <>
      <SortableCardGrid layout={layout} onLayoutChange={updateLayout}>
        {renderCard}
      </SortableCardGrid>
      {rvsModal && (
        <CardRvsModal
          title={rvsModal.title}
          payload={rvsModal.payload}
          onClose={() => setRvsModal(null)}
        />
      )}
      {certOpen && (
        <CardRvsModal
          title="站点证书"
          kind="证书信息"
          payload={NIO_SITE_CERT}
          onClose={() => setCertOpen(false)}
        />
      )}
    </>
  );
});
