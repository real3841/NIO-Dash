import { memo, useState, type ReactNode } from "react";
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
  fmtTime,
  extractVehicleStatus,
  formatVehicleId,
  fullChargeRangeKm,
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
import { useCardLayout } from "../hooks/useCardLayout";
import { SortableCardGrid, type CardControls } from "./SortableCardGrid";
import { CardRvsModal } from "./CardRvsModal";

interface Props {
  data: VehicleResponse;
  address: string | null;
  checkin?: CheckinData | null;
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

export const DashboardCards = memo(function DashboardCards({ data, address, checkin }: Props) {
  const [layout, updateLayout] = useCardLayout("vehicle", VEHICLE_CARDS);
  const [rvsModal, setRvsModal] = useState<{ title: string; payload: Record<string, unknown> } | null>(null);
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

  const renderCard = (id: string, controls: CardControls) => {
    const chrome = {
      dragHandleProps: controls.dragHandleProps,
      dragListeners: controls.dragListeners,
      onHide: () => hideCard(id),
      onShowRvs: () => showRvs(id),
    };

    switch (id) {
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
                { label: "充电类型", value: chargerTypeLabel(socExtra.charger_type ?? 0) },
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
        }, (_, v) => (typeof v === "number" ? windowPosLabel(v) : null));
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
              <StatusPill tone="dark">{s.fota_status.fota_status === 0 ? "已是最新" : "有更新"}</StatusPill>
            }
            {...chrome}
          >
            <RowItem label="当前版本" value={`v${version.replace(/^v/i, "")}`} />
            <RowItem label="零件号" value={s.fota_status.current_part_no} />
            <RowItem label="上一版本" value={s.fota_status.last_version?.split("*")[1] ?? s.fota_status.last_version ?? "—"} />
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

      default:
        return null;
    }
  };

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
    </>
  );
});
