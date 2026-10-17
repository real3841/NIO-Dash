import { useState, type ReactNode } from "react";
import { chargeStateLabel, fmtTime, vehicleStateLabel, type VehicleResponse } from "../lib/vehicle";
import { formatChargingPowerKw, onOff, windowPosLabel } from "../lib/vehicle-display";
import { formatDurationSec, workStateLabel, type PowerFile } from "../lib/power";
import { localDayKey } from "../lib/date-utils";

type Status = VehicleResponse["data"]["status"];

interface Props {
  status: Status;
  power?: PowerFile | null;
}

interface Spot {
  id: string;
  title: string;
  /** 提示框锚点，SVG 坐标 */
  x: number;
  y: number;
  rows: Array<[string, ReactNode]>;
  tone?: "ok" | "warn" | "idle";
  place?: "above" | "below" | "corner";
}

const SRC_CX = 390;
const SRC_CY = 150;
/** 原图车头朝右，绕车身中心转 180° 后车头朝左、家充桩在右，车居中 */
const VB_X = 30;
const VB_Y = 30;
const VB_W = 720;
const VB_H = 240;

function upright(x: number, y: number): { x: number; y: number } {
  return { x: 2 * SRC_CX - x, y: 2 * SRC_CY - y };
}

function numOf(block: Record<string, unknown> | undefined, key: string): number | null {
  const v = block?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isOpen(value: number | undefined): boolean {
  return value != null && value !== 1;
}

function tyreTone(press: number | null, temp: number | null): Spot["tone"] {
  if (press == null) return "idle";
  if (press < 2.2 || press > 3.4 || (temp != null && temp > 75)) return "warn";
  return "ok";
}

export function VehicleHero({ status: s, power }: Props) {
  const [active, setActive] = useState<string | null>(null);

  const soc = s.soc_status.soc;
  const socExtra = s.soc_status as unknown as Record<string, number>;
  const locked = s.door_status.vehicle_lock_status === 1;
  const charging = s.soc_status.charge_state === 1;
  const doors = s.door_status;
  const win = s.window_status ?? {};
  const tyre = s.tyre_status as Record<string, unknown> | undefined;
  const light = s.light_status ?? {};
  const spot = power?.spot;
  const plugged = Boolean(spot?.work_state && spot.work_state !== "unplugin");
  const lastService = power?.services?.[0];
  const thisMonth = power?.months?.[localDayKey().slice(0, 7)];

  const tyreSpot = (id: string, title: string, key: string, x: number, y: number): Spot => {
    const press = numOf(tyre, `${key}_wheel_press_bar`);
    const temp = numOf(tyre, `${key}_wheel_temp`);
    return {
      id,
      title,
      x,
      y,
      tone: tyreTone(press, temp),
      rows: [
        ["胎压", press != null ? `${press.toFixed(1)} bar` : "—"],
        ["胎温", temp != null ? `${temp}°C` : "—"],
      ],
    };
  };

  const doorSpot = (id: string, title: string, doorKey: string, winKey: string, x: number, y: number): Spot => {
    const open = isOpen(doors[doorKey]);
    return {
      id,
      title,
      x,
      y,
      tone: open ? "warn" : "ok",
      rows: [
        ["车门", open ? "开启" : "关闭"],
        ["车窗", windowPosLabel(win[winKey] ?? 0)],
      ],
    };
  };

  const hoodOpen = isOpen(doors.engine_hood_ajar_status);
  const tailOpen = isOpen(doors.tailgate_ajar_status);
  const portOpen = isOpen(doors.second_charge_port_ajar_status);
  const headOn = (light.head_light_on ?? 0) >= 1;
  const drlOn = (light.day_ti_runng_li_sts ?? 0) >= 1;
  const parkOn = (light.parking_light_le_on ?? 0) >= 1 || (light.parking_light_ri_on ?? 0) >= 1;

  const spots: Spot[] = [
    tyreSpot("tyre_fl", "左前轮", "front_left", 510, 56),
    tyreSpot("tyre_fr", "右前轮", "front_right", 510, 244),
    tyreSpot("tyre_rl", "左后轮", "rear_left", 235, 56),
    tyreSpot("tyre_rr", "右后轮", "rear_right", 235, 244),
    doorSpot("door_fl", "左前门", "door_ajar_front_left_status", "win_front_left_posn", 404, 70),
    doorSpot("door_fr", "右前门", "door_ajar_front_right_status", "win_front_right_posn", 404, 230),
    doorSpot("door_rl", "左后门", "door_ajar_rear_left_status", "win_rear_left_posn", 314, 70),
    doorSpot("door_rr", "右后门", "door_ajar_rear_right_status", "win_rear_right_posn", 314, 230),
    {
      id: "hood",
      title: "前备箱",
      x: 540,
      y: 150,
      tone: hoodOpen ? "warn" : "ok",
      rows: [["状态", hoodOpen ? "开启" : "关闭"]],
    },
    {
      id: "tail",
      title: "尾门",
      x: 205,
      y: 150,
      tone: tailOpen ? "warn" : "ok",
      rows: [["状态", tailOpen ? "开启" : "关闭"]],
    },
    {
      id: "port",
      title: "充电口",
      x: 248,
      y: 84,
      tone: charging ? "ok" : portOpen ? "warn" : "idle",
      rows: [
        ["充电口", portOpen ? "开启" : "关闭"],
        ["充电状态", chargeStateLabel(s.soc_status.charge_state)],
        ["功率", formatChargingPowerKw(socExtra.charging_power)],
        ["限充", `${socExtra.lock_soc ?? "—"}%`],
      ],
    },
    {
      id: "cabin",
      title: "座舱",
      x: 12,
      y: 12,
      place: "corner",
      tone: locked ? "ok" : "warn",
      rows: [
        ["车锁", locked ? "已上锁" : "未上锁"],
        ["车辆", vehicleStateLabel(s.exterior_status.vehicle_state)],
        ["车内设定", `${s.hvac_status.temperature}°C`],
        ["车外", `${s.hvac_status.outside_temperature}°C`],
        ["空调", s.hvac_status.air_conditioner_on ? "开启" : "关闭"],
        ["天窗", windowPosLabel(win.sun_roof_posn ?? 0)],
      ],
    },
    {
      id: "lights",
      title: "灯光",
      x: 598,
      y: 150,
      tone: headOn || drlOn || parkOn ? "ok" : "idle",
      rows: [
        ["大灯", onOff(light.head_light_on ?? 0)],
        ["日行灯", onOff(light.day_ti_runng_li_sts ?? 0)],
        ["示宽灯", parkOn ? "开启" : "关闭"],
      ],
    },
    {
      id: "charger",
      title: spot?.name ?? "家充桩",
      x: 75,
      y: 230,
      tone: !spot ? "idle" : spot.is_online ? "ok" : "warn",
      rows: spot
        ? [
            ["状态", power?.realtime?.effective_state_desc ?? (spot.is_online ? "在线" : "离线")],
            ["枪", workStateLabel(spot.work_state)],
            [
              "预约",
              spot.reservation_state
                ? `${spot.reservation_starttime?.slice(0, 5) ?? "—"} – ${spot.reservation_endtime?.slice(0, 5) ?? "—"}`
                : "未开启",
            ],
            [
              "上次充电",
              lastService?.start_time
                ? `${fmtTime(lastService.start_time)} · ${lastService.consume_power ?? "—"} kWh · ${formatDurationSec((lastService.charge_duration ?? 0) / 1000)}`
                : "—",
            ],
            [
              "本月",
              thisMonth
                ? `${formatDurationSec(thisMonth.total_charging_duration)} / ${thisMonth.total_charging_times} 次 / ${thisMonth.total_real_charge_kwh.toFixed(1)} kWh`
                : "—",
            ],
          ]
        : [["数据", "在「更新 Token」选 HAR 导入"]],
    },
  ];

  const byId = new Map(spots.map((spot) => [spot.id, spot]));
  const current = active ? byId.get(active) : undefined;

  const bind = (id: string) => {
    const spot = byId.get(id)!;
    return {
      role: "button",
      tabIndex: 0,
      "aria-label": spot.title,
      className: `hero-spot tone-${spot.tone ?? "idle"}${active === id ? " active" : ""}`,
      onMouseEnter: () => setActive(id),
      onMouseLeave: () => setActive((prev) => (prev === id ? null : prev)),
      onFocus: () => setActive(id),
      onBlur: () => setActive((prev) => (prev === id ? null : prev)),
      onClick: () => setActive(id),
    } as const;
  };

  const tyreRect = (id: string, x: number, y: number) => (
    <g {...bind(id)}>
      <rect className="hero-tyre" x={x} y={y} width={58} height={20} rx={7} />
    </g>
  );

  return (
    <section className="vehicle-hero">
      <div className="vehicle-hero-stats">
        <div className="vehicle-hero-soc">
          <span className="vehicle-hero-soc-num">{soc}</span>
          <span className="vehicle-hero-soc-unit">%</span>
        </div>
        <div className="vehicle-hero-range">
          <span>
            <strong>{s.soc_status.remaining_range}</strong> km 标准
          </span>
          <span>
            <strong>{s.soc_status.remaining_actual_range}</strong> km 实际
          </span>
        </div>
        <div className="vehicle-hero-bar" aria-hidden="true">
          <div className="vehicle-hero-bar-fill" style={{ width: `${Math.max(0, Math.min(100, soc))}%` }} />
        </div>
        <div className="vehicle-hero-chips">
          <span className={`hero-chip ${locked ? "ok" : "warn"}`}>{locked ? "已上锁" : "未上锁"}</span>
          <span className="hero-chip">{vehicleStateLabel(s.exterior_status.vehicle_state)}</span>
          <span className={`hero-chip ${charging ? "ok" : ""}`}>{chargeStateLabel(s.soc_status.charge_state)}</span>
        </div>
        <div className="vehicle-hero-temps">
          <div>
            <span className="vehicle-hero-temp-num">{s.hvac_status.temperature}°</span>
            <span className="muted">车内设定</span>
          </div>
          <div>
            <span className="vehicle-hero-temp-num">{s.hvac_status.outside_temperature}°</span>
            <span className="muted">车外</span>
          </div>
        </div>
        <p className="muted vehicle-hero-hint">鼠标停在车上看轮胎、车门、充电口和家充桩</p>
      </div>

      <div className="vehicle-hero-stage">
        <svg viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`} className="vehicle-hero-svg" aria-label="车况示意图">
          <defs>
            <linearGradient id="hero-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="hero-body-top" />
              <stop offset="1" className="hero-body-bottom" />
            </linearGradient>
            <linearGradient id="hero-glass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" className="hero-glass-a" />
              <stop offset="1" className="hero-glass-b" />
            </linearGradient>
            <filter id="hero-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          <g transform={`rotate(180 ${SRC_CX} ${SRC_CY})`}>
          <ellipse className="hero-shadow" cx={390} cy={156} rx={240} ry={100} />

          <g {...bind("charger")}>
            <rect className="hero-charger" x={50} y={74} width={50} height={152} rx={14} />
            <rect
              className="hero-charger-screen"
              x={60}
              y={188}
              width={30}
              height={22}
              rx={5}
            />
            <circle className={`hero-charger-led ${spot?.is_online ? "on" : ""}`} cx={75} cy={172} r={4} />
            <rect className="hero-charger-base" x={42} y={68} width={66} height={10} rx={5} />
          </g>
          {(charging || plugged) && (
            <path
              className={`hero-cable${charging ? " live" : ""}`}
              d="M 100 176 C 150 250, 200 30, 244 80"
              fill="none"
            />
          )}

          {tyreRect("tyre_rl", 206, 56)}
          {tyreRect("tyre_fl", 481, 56)}
          {tyreRect("tyre_rr", 206, 224)}
          {tyreRect("tyre_fr", 481, 224)}

          <path
            className="hero-body"
            d="M 215 72 H 540 C 585 72 610 100 612 150 C 610 200 585 228 540 228 H 215 C 185 228 168 205 168 150 C 168 95 185 72 215 72 Z"
          />
          <rect className="hero-mirror" x={436} y={62} width={16} height={10} rx={4} />
          <rect className="hero-mirror" x={436} y={228} width={16} height={10} rx={4} />

          <g {...bind("tail")}>
            <path className="hero-panel" d="M 236 84 H 215 C 192 84 180 108 180 150 C 180 192 192 216 215 216 H 236 Q 226 150 236 84 Z" />
          </g>
          <g {...bind("hood")}>
            <path className="hero-panel" d="M 474 84 H 540 C 578 84 598 108 600 150 C 598 192 578 216 540 216 H 474 Q 484 150 474 84 Z" />
          </g>

          <g {...bind("door_rl")}>
            <rect className="hero-door" x={272} y={74} width={84} height={16} rx={6} />
          </g>
          <g {...bind("door_fl")}>
            <rect className="hero-door" x={360} y={74} width={88} height={16} rx={6} />
          </g>
          <g {...bind("door_rr")}>
            <rect className="hero-door" x={272} y={210} width={84} height={16} rx={6} />
          </g>
          <g {...bind("door_fr")}>
            <rect className="hero-door" x={360} y={210} width={88} height={16} rx={6} />
          </g>

          <path className="hero-glass" d="M 270 98 Q 242 102 240 150 Q 242 198 270 202 Z" />
          <path className="hero-glass" d="M 432 96 Q 470 100 472 150 Q 470 200 432 204 Z" />

          <g {...bind("cabin")}>
            <rect className="hero-roof" x={272} y={96} width={158} height={108} rx={22} />
            <rect className="hero-soc-track" x={296} y={170} width={110} height={8} rx={4} />
            <rect
              className="hero-soc-fill"
              x={296}
              y={170}
              width={(110 * Math.max(0, Math.min(100, soc))) / 100}
              height={8}
              rx={4}
            />
            <text className="hero-roof-text" x={351} y={150} textAnchor="middle" transform="rotate(180 351 146)">
              {locked ? "已上锁" : "未上锁"}
            </text>
          </g>

          <g {...bind("lights")}>
            <path className={`hero-light${headOn || drlOn ? " on" : ""}`} d="M 590 96 Q 604 108 606 124" />
            <path className={`hero-light${headOn || drlOn ? " on" : ""}`} d="M 590 204 Q 604 192 606 176" />
            <rect x={580} y={92} width={34} height={116} fill="transparent" />
          </g>

          <g {...bind("port")}>
            <circle className={`hero-port${charging ? " live" : portOpen ? " open" : ""}`} cx={248} cy={84} r={7} />
          </g>
          </g>
        </svg>

        {current && (
          <div
            className={`hero-tip ${
              current.place === "corner"
                ? "corner"
                : `${upright(current.x, current.y).y > VB_Y + VB_H / 2 ? "above" : "below"}${
                    upright(current.x, current.y).x > VB_X + VB_W * 0.7 ? " end" : ""
                  }`
            }`}
            style={(() => {
              if (current.place === "corner") return undefined;
              const point = upright(current.x, current.y);
              return {
                left: `${((point.x - VB_X) / VB_W) * 100}%`,
                top: `${((point.y - VB_Y) / VB_H) * 100}%`,
              };
            })()}
            role="status"
          >
            <p className="hero-tip-title">{current.title}</p>
            {current.rows.map(([label, value]) => (
              <div key={label} className="hero-tip-row">
                <span>{label}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
