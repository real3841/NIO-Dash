export type AuthSlotId = "widget" | "status" | "journey" | "daily" | "change" | "checkin";

export interface AuthSlotDef {
  id: AuthSlotId;
  label: string;
  method: "GET" | "POST";
  /** 给用户对照抓包的地址，不含签名和车辆号 */
  address: string;
  /** 签名和这条地址绑在一起，失效后要贴回完整 URL */
  needsUrl: boolean;
  envKey: string;
}

export const AUTH_SLOTS: AuthSlotDef[] = [
  {
    id: "widget",
    label: "车况 widget",
    method: "GET",
    address: "https://app.nio.com/app/api/icar/v2/widget/info",
    needsUrl: true,
    envKey: "NIO_VEHICLE_API_URL",
  },
  {
    id: "status",
    label: "车况整包",
    method: "GET",
    address: "https://icar.nio.com/api/2/rvs/vehicle/{vehicle_id}/status",
    needsUrl: true,
    envKey: "NIO_VEHICLE_STATUS_URL",
  },
  {
    id: "journey",
    label: "最近行程",
    method: "GET",
    address: "https://icar.nio.com/api/1/vehicle/journey_merge/status",
    needsUrl: true,
    envKey: "NIO_JOURNEY_API_URL",
  },
  {
    id: "daily",
    label: "当日里程",
    method: "GET",
    address: "https://icar.nio.com/api/1/vehicle/journeys/daily_data",
    needsUrl: true,
    envKey: "NIO_DAILY_API_URL",
  },
  {
    id: "change",
    label: "换电订单",
    method: "POST",
    address: "https://gateway-front-external.nio.com/moat/1100367/api/v1/otd/car/ext/general/serviceOrder/getTabOrder",
    needsUrl: false,
    envKey: "NIO_CHANGE_API_URL",
  },
  {
    id: "checkin",
    label: "签到",
    method: "GET",
    address: "https://gateway-front-external.nio.com/moat/10086/c/award_cn/checkin",
    needsUrl: false,
    envKey: "NIO_CHECKIN_API_URL",
  },
];

export function authSlotById(id: string | undefined): AuthSlotDef | undefined {
  return AUTH_SLOTS.find((slot) => slot.id === id);
}

export function authSlotMatchesUrl(slot: AuthSlotDef, rawUrl: string): boolean {
  let pathname = "";
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    return false;
  }
  switch (slot.id) {
    case "widget":
      return pathname.endsWith("/icar/v2/widget/info");
    case "status":
      return /\/rvs\/vehicle\/[^/]+\/status$/.test(pathname);
    case "journey":
      return pathname.endsWith("/vehicle/journey_merge/status");
    case "daily":
      return pathname.endsWith("/vehicle/journeys/daily_data");
    case "change":
      return pathname.endsWith("/serviceOrder/getTabOrder");
    case "checkin":
      return pathname.endsWith("/award_cn/checkin") || pathname.endsWith("/award/square");
    default:
      return false;
  }
}
