export interface PowerSpot {
  name?: string;
  model?: string;
  resource_type?: string;
  /** unplugin / plugin / charging … */
  work_state?: string;
  is_online?: boolean;
  mobile_network_state?: boolean;
  reservation_state?: boolean;
  reservation_starttime?: string;
  reservation_endtime?: string;
  charging_mode?: number;
  battery_care?: number;
  quiet_mode?: number;
  share_state?: string;
  software_version?: string;
  hardware_version?: string;
  at?: number;
}

export interface PowerRealtime {
  effective_state?: string;
  effective_state_desc?: string;
  at?: number;
}

export interface PowerService {
  order_id: string;
  consume_power?: number;
  start_time?: number;
  end_time?: number;
  /** 毫秒 */
  charge_duration?: number;
  status?: string;
}

export interface PowerDailyReport {
  date: string;
  charging_times: number;
  /** 秒 */
  charging_duration: number;
  real_charge_kwh: number;
}

export interface PowerMonth {
  total_charging_times: number;
  /** 秒 */
  total_charging_duration: number;
  total_real_charge_kwh: number;
  last_update_time?: number;
  reports: PowerDailyReport[];
  at?: number;
}

export interface PowerFile {
  at: number;
  /** HAR 里最后一条加电请求的时间 */
  capturedAt?: number;
  spot?: PowerSpot;
  realtime?: PowerRealtime;
  services?: PowerService[];
  /** YYYY-MM → 月统计 */
  months?: Record<string, PowerMonth>;
}

export function isPowerFile(raw: unknown): raw is PowerFile {
  return Boolean(raw) && typeof raw === "object" && typeof (raw as PowerFile).at === "number";
}

export function workStateLabel(state: string | undefined): string {
  switch (state) {
    case "unplugin":
      return "未插枪";
    case "plugin":
    case "plugged":
      return "已插枪";
    case "charging":
      return "充电中";
    case "fault":
      return "故障";
    default:
      return state ?? "—";
  }
}

export function formatDurationSec(sec: number | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} 分钟`;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`;
}

export function sortedMonthKeys(power: PowerFile | null | undefined): string[] {
  return Object.keys(power?.months ?? {}).sort((a, b) => b.localeCompare(a));
}

/**
 * *.nio.com 站点证书。2026-10-16 用 openssl 核验：
 * RSA 2048、sha256WithRSAEncryption、GlobalSign 签发，不是自签。
 * 这是访问家充接口的网站证书，不是充电桩本身的到期日。
 */
export const NIO_SITE_CERT_NOT_AFTER = "2027-02-07";

export const NIO_SITE_CERT: Record<string, unknown> = {
  host: "*.nio.com",
  issuer: "GlobalSign RSA OV SSL CA 2018",
  subject: {
    commonName: "*.nio.com",
    organization: "上海蔚来汽车有限公司",
    locality: "上海市",
    state: "上海市",
    country: "CN",
  },
  notBefore: "2026-01-06T09:07:34Z",
  notAfter: "2027-02-07T09:07:33Z",
  publicKey: "RSA 2048",
  signatureAlgorithm: "sha256WithRSAEncryption",
  selfSigned: false,
  verifiedOn: "2026-10-16",
};
