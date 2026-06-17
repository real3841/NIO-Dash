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
  IconLock,
  IconModes,
  IconSeat,
  IconTemp,
  IconWifi,
} from "./icons";
import {
  batteryPackLabel,
  chargeStateLabel,
  fmtTime,
  fullChargeRangeKm,
  heatLevelLabel,
  mapsUrl,
  modeActive,
  vehicleStateLabel,
  type VehicleResponse,
} from "../lib/vehicle";

interface Props {
  data: VehicleResponse;
  address: string | null;
}

function doorOpen(status: number): boolean {
  return status !== 1;
}

export function DashboardCards({ data, address }: Props) {
  const s = data.data.status;
  const soc = s.soc_status.soc;
  const locked = s.door_status.vehicle_lock_status === 1;

  const doorItems = [
    { key: "fl", label: "左前", status: s.door_status.door_ajar_front_left_status },
    { key: "fr", label: "右前", status: s.door_status.door_ajar_front_right_status },
    { key: "rl", label: "左后", status: s.door_status.door_ajar_rear_left_status },
    { key: "rr", label: "右后", status: s.door_status.door_ajar_rear_right_status },
    { key: "cp", label: "充电口", status: s.door_status.second_charge_port_ajar_status },
  ];

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
  ];

  const heatItems = [
    { label: "方向盘", value: heatLevelLabel(s.heating_status.steer_wheel_heat_sts) },
    { label: "前排左右", value: heatLevelLabel(Math.max(s.heating_status.seat_heat_frnt_le_sts, s.heating_status.seat_heat_frnt_ri_sts)) },
    { label: "后排左右", value: heatLevelLabel(Math.max(s.heating_status.seat_heat_re_le_sts, s.heating_status.seat_heat_re_ri_sts)) },
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
  ];

  const vehicleReady = s.exterior_status.vehicle_state === 2;
  const version = s.fota_status.current_version.split("*")[1] ?? s.fota_status.current_version;
  const fullRange = fullChargeRangeKm(s.soc_status.remaining_range, soc);
  const fullRangeLabel = fullRange != null ? batteryPackLabel(fullRange) : "";

  return (
    <div className="dash-grid">
      <DashCard
        icon={<IconBattery />}
        title="电池"
        badge={<StatusPill tone="neutral">{chargeStateLabel(s.soc_status.charge_state)}</StatusPill>}
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
      </DashCard>

      <DashCard
        icon={<IconDoor />}
        title="门窗状态"
        badge={
          <StatusPill tone={locked ? "dark" : "warning"}>
            <span className="pill-with-icon">
              <IconLock /> {locked ? "已上锁" : "未上锁"}
            </span>
          </StatusPill>
        }
      >
        {doorItems.map((item) => (
          <div key={item.key} className="row-item row-item-toggle">
            <span className="row-item-label">{item.label}</span>
            <Toggle on={doorOpen(item.status)} label={item.label} />
          </div>
        ))}
      </DashCard>

      <DashCard
        title="车门"
        headerExtra={<span className="door-summary">{openCount} 开启 · {closedCount} 关闭</span>}
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
      </DashCard>

      <DashCard
        icon={<IconCube />}
        title="软件版本"
        badge={
          <StatusPill tone="dark">{s.fota_status.fota_status === 0 ? "已是最新" : "有更新"}</StatusPill>
        }
      >
        <RowItem label="当前版本" value={`v${version.replace(/^v/i, "")}`} />
        <RowItem label="零件号" value={s.fota_status.current_part_no} />
        <div className="card-section-divider">
          <IconGps />
          <span>GPS 位置</span>
        </div>
        <RowItem label="经度" value={s.position_status.longitude.toFixed(4)} />
        <RowItem label="纬度" value={s.position_status.latitude.toFixed(4)} />
        <AddressPill href={mapsUrl(s.position_status.latitude, s.position_status.longitude)}>
          {address ?? `${s.position_status.latitude.toFixed(2)}°N, ${s.position_status.longitude.toFixed(2)}°E`}
        </AddressPill>
      </DashCard>

      <DashCard icon={<IconModes />} title="特殊模式">
        {modes.map((mode) => (
          <div key={mode.label} className="row-item row-item-toggle">
            <span className="row-item-label">{mode.label}</span>
            <Toggle on={mode.on} label={mode.label} />
          </div>
        ))}
      </DashCard>

      <DashCard icon={<IconCar />} title="车辆信息">
        <RowItem label="总里程" value={`${s.exterior_status.mileage.toLocaleString()} km`} />
        <RowItem label="车辆 ID" value={`${s.vehicle_id.slice(0, 4)}…${s.vehicle_id.slice(-5)}`} />
        <RowItem
          label="车辆状态"
          value={<span className={vehicleReady ? "text-success" : ""}>{vehicleStateLabel(s.exterior_status.vehicle_state)}</span>}
        />
        <StatusDots
          states={[
            s.connection_status.connected ? "ok" : "bad",
            s.soc_status.soc > 20 ? "ok" : "warn",
            locked ? "ok" : "warn",
            data.data.checked_in.checked ? "ok" : "idle",
          ]}
        />
      </DashCard>

      <DashCard icon={<IconSeat />} title="座椅加热">
        {heatItems.map((item) => (
          <RowItem key={item.label} label={item.label} value={item.value} />
        ))}
      </DashCard>

      <DashCard icon={<IconWifi />} title="连接状态">
        <RowItem
          label="CDC 连接"
          value={<StatusPill tone="neutral">{s.connection_status.cdc_connected ? "是" : "否"}</StatusPill>}
        />
        <RowItem
          label="ADC 连接"
          value={<StatusPill tone="neutral">{s.connection_status.adc_connected ? "是" : "否"}</StatusPill>}
        />
        <RowItem label="连续用车" value={`${data.data.checked_in.days} 天`} />
        <RowItem label="数据更新" value={fmtTime(s.soc_status.sample_time)} />
      </DashCard>

      <DashCard icon={<IconTemp />} title="温度">
        <RowItem label="车内" value={`${s.hvac_status.temperature.toFixed(1)}°C`} />
        <RowItem label="车外" value={`${s.hvac_status.outside_temperature.toFixed(1)}°C`} />
        <RowItem label="空调状态" value={s.hvac_status.air_conditioner_on ? "开启" : "关闭"} />
      </DashCard>
    </div>
  );
}
