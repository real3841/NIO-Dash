import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { handleConfigRequest } from "./env-config-api.js";
import { getCardLayoutFile, handleCardLayoutRequest } from "./card-layout-api.js";
import { runCheckinIfDue, runCheckinForce, startDailyCheckinScheduler } from "./fetch-checkin.js";
import {
  isFetchRunning,
  setOnChangeFetchComplete,
  setOnVehicleFetchComplete,
  startDualFetchScheduler,
  triggerFetch,
  type FetchSlot,
} from "./fetch-server.js";
import { getChangePollIntervalSec, getVehiclePollInfo, getVehiclePollIntervalSec } from "./poll-interval.js";
import { appendFetchLog, getFetchLogSnapshot } from "./fetch-log.js";
import { authSlotSnapshot } from "./auth-slots.js";
import { applyQuickAuth, applySlotAuth } from "./quick-auth.js";
import { amapReverseGeocode, isAmapGeocodeConfigured } from "./amap-geocode.js";
import { getStorageFilesSnapshot } from "./storage-files.js";
import { handleStockWatchRequest, setStockWatchSchedulerHooks } from "./stock-watch-api.js";
import { startStockWatchScheduler } from "./stock-watch.js";
import { handleVehiclePhotoRequest } from "./vehicle-photos.js";
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function noCache(res: http.ServerResponse): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
}

function serveFile(res: http.ServerResponse, filePath: string): boolean {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

export interface AppServerOptions {
  port?: number;
  host?: string;
  staticDir: string;
  dataDir: string;
  envFile: string;
  enableScheduler?: boolean;
  deferInitialTick?: boolean;
  onDataUpdated?: () => void;
}

export interface AppServerHandle {
  port: number;
  close: () => Promise<void>;
  reschedule: () => void;
  rescheduleVehicle: (immediate?: boolean) => void;
  armChangeSchedule: () => void;
}

export async function startAppServer(opts: AppServerOptions): Promise<AppServerHandle> {
  process.env.NIO_DATA_DIR = opts.dataDir;
  process.env.NIO_ENV_FILE = opts.envFile;
  fs.mkdirSync(opts.dataDir, { recursive: true });
  loadEnv({ path: opts.envFile, override: true });

  const getVehicleIntervalSec = () =>
    getVehiclePollIntervalSec(process.env as Record<string, string>, opts.dataDir);
  const getChangeIntervalSec = () =>
    getChangePollIntervalSec(process.env as Record<string, string>);

  const notify = () => opts.onDataUpdated?.();
  const getVehicleScheduleDetail = () => {
    const info = getVehiclePollInfo(process.env as Record<string, string>, opts.dataDir);
    return `策略 ${info.reasonLabel} · 间隔 ${info.intervalSec}s`;
  };

  const scheduler = opts.enableScheduler
    ? startDualFetchScheduler({
        getVehicleIntervalSec,
        getChangeIntervalSec,
        getVehicleScheduleDetail,
        deferInitialTick: opts.deferInitialTick ?? false,
      })
    : null;

  const checkinScheduler = opts.enableScheduler
    ? startDailyCheckinScheduler(notify)
    : null;

  const stockWatchScheduler = opts.enableScheduler
    ? startStockWatchScheduler({ onComplete: notify })
    : null;
  if (stockWatchScheduler) {
    setStockWatchSchedulerHooks({ reschedule: stockWatchScheduler.reschedule });
  }

  if (opts.enableScheduler) {
    setOnVehicleFetchComplete(() => {
      notify();
      void runCheckinIfDue();
    });
    setOnChangeFetchComplete(notify);
  }

  const host = opts.host ?? "127.0.0.1";
  const cardLayoutFile = getCardLayoutFile(opts.dataDir);

  const server = http.createServer((req, res) => {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";
    const pathname = url.split("?")[0];

    void (async () => {
      try {
      if (pathname === "/health") {
        json(res, 200, { ok: true, running: isFetchRunning(), at: Date.now() });
        return;
      }

      if (pathname === "/api/fetch-log" || pathname === "/fetch-log") {
        noCache(res);
        json(res, 200, getFetchLogSnapshot(isFetchRunning()));
        return;
      }

      if (pathname === "/api/storage-files") {
        noCache(res);
        json(res, 200, getStorageFilesSnapshot(opts.dataDir, opts.envFile));
        return;
      }

      if (await handleStockWatchRequest(req, res, pathname, method)) {
        return;
      }

      if (await handleVehiclePhotoRequest(req, res, pathname, method, opts.dataDir)) {
        return;
      }

      if (pathname === "/api/auth-slots" && method === "GET") {
        noCache(res);
        json(res, 200, { ok: true, slots: authSlotSnapshot() });
        return;
      }

      if (pathname === "/api/quick-auth" && method === "POST") {
        noCache(res);
        let text = "";
        let slot = "";
        let url = "";
        let token = "";
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as {
            text?: unknown;
            slot?: unknown;
            url?: unknown;
            token?: unknown;
          };
          text = typeof body.text === "string" ? body.text : "";
          slot = typeof body.slot === "string" ? body.slot : "";
          url = typeof body.url === "string" ? body.url : "";
          token = typeof body.token === "string" ? body.token : "";
        } catch {
          json(res, 400, { ok: false, error: "请求格式不对" });
          return;
        }
        if (!text.trim() && !slot) {
          json(res, 400, { ok: false, error: "请先选中失效的接口，再填写地址和 Bearer Token" });
          return;
        }
        const result = text.trim() ? applyQuickAuth(text) : applySlotAuth({ slot, url, token });
        if (!result.ok) {
          json(res, 400, { ok: false, error: result.warnings.join("；") || "没有可用的内容", result });
          return;
        }
        appendFetchLog(
          "vehicle",
          "info",
          `快速更新 · ${[
            result.tokenUpdated ? "Token" : null,
            ...result.updated,
            result.power ? `加电 ${result.power}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}`,
        );
        const runs: Record<string, string> = {};
        for (const target of ["vehicle", "change"] as const) {
          try {
            await triggerFetch(target);
            runs[target] = "ok";
          } catch (err) {
            runs[target] = err instanceof Error ? err.message : String(err);
          }
        }
        scheduler?.rescheduleChange(false);
        notify();
        json(res, 200, { ok: true, result, runs });
        return;
      }

      if (pathname === "/api/geocode/reverse" && method === "GET") {
        noCache(res);
        const query = new URL(url, "http://local").searchParams;
        const lat = Number(query.get("lat"));
        const lng = Number(query.get("lng"));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          json(res, 400, { ok: false, error: "invalid_lat_lng" });
          return;
        }

        const key = process.env.NIO_AMAP_WEB_SERVICE_KEY?.trim();
        if (!isAmapGeocodeConfigured(process.env as Record<string, string>)) {
          json(res, 404, { ok: false, error: "amap_not_configured" });
          return;
        }

        try {
          const address = await amapReverseGeocode(lng, lat, key!);
          if (!address) {
            json(res, 502, { ok: false, error: "amap_geocode_failed" });
            return;
          }
          json(res, 200, { ok: true, provider: "amap", address });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          json(res, 500, { ok: false, error: message });
        }
        return;
      }

      if (pathname.startsWith("/data/")) {
        const name = pathname.slice("/data/".length).replace(/\.\./g, "");
        const filePath = path.join(opts.dataDir, name);
        noCache(res);
        if (!serveFile(res, filePath)) {
          json(res, 404, { ok: false, error: "not_found" });
        }
        return;
      }

      if (pathname === "/api/card-layout") {
        noCache(res);
        const handled = await handleCardLayoutRequest(req, res, method, cardLayoutFile);
        if (handled) return;
      }

      const apiPath =
        pathname === "/api/config" || pathname.startsWith("/api/config/")
          ? pathname.replace(/^\/api/, "")
          : pathname;

      if (apiPath === "/config" || apiPath.startsWith("/config/")) {
        const handled = await handleConfigRequest(req, res, apiPath, method);
        if (handled && method === "PUT" && apiPath.startsWith("/config/")) {
          loadEnv({ path: opts.envFile, override: true });
          if (apiPath === "/config/vehicle") {
            scheduler?.rescheduleVehicle();
          } else if (apiPath === "/config/change") {
            scheduler?.rescheduleChange();
          }
          notify();
        }
        return;
      }

      let slot: FetchSlot | null = null;
      if ((pathname === "/trigger" || pathname === "/api/fetch-now") && method === "POST") {
        slot = "all";
      }
      if ((pathname === "/trigger/vehicle" || pathname === "/api/fetch-vehicle") && method === "POST") {
        slot = "vehicle";
      }
      if ((pathname === "/trigger/change" || pathname === "/api/fetch-change") && method === "POST") {
        slot = "change";
      }
      if ((pathname === "/trigger/checkin" || pathname === "/api/fetch-checkin") && method === "POST") {
        try {
          await runCheckinForce();
          notify();
          json(res, 200, { ok: true, target: "checkin", at: Date.now() });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          json(res, 500, { ok: false, target: "checkin", error: message });
        }
        return;
      }

      if (slot) {
        try {
          await triggerFetch(slot);
          notify();
          json(res, 200, { ok: true, target: slot, at: Date.now() });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          json(res, 500, { ok: false, target: slot, error: message });
        }
        return;
      }

      if (method !== "GET" && method !== "HEAD") {
        json(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }

      let filePath = path.join(opts.staticDir, pathname === "/" ? "index.html" : pathname);
      if (!path.resolve(filePath).startsWith(path.resolve(opts.staticDir))) {
        json(res, 403, { ok: false, error: "forbidden" });
        return;
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(opts.staticDir, "index.html");
      }

      if (!serveFile(res, filePath)) {
        json(res, 404, { ok: false, error: "not_found" });
      }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[app-server]", pathname, method, message);
        if (!res.headersSent) {
          json(res, 500, { ok: false, error: "internal_error" });
        }
      }
    })();
  });

  const preferredPort = opts.port ?? 0;
  let port = preferredPort;

  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && preferredPort !== 0) {
        server.removeListener("error", onError);
        server.listen(0, host, () => resolve());
        return;
      }
      reject(err);
    };
    server.once("error", onError);
    server.listen(preferredPort, host, () => {
      server.removeListener("error", onError);
      resolve();
    });
  });

  const addr = server.address();
  port = typeof addr === "object" && addr ? addr.port : port;
  if (port !== preferredPort) {
    console.warn(`[app-server] 端口 ${preferredPort} 被占用，改用 ${port}`);
  }

  console.log(`[app-server] started on ${host}:${port}`);

  return {
    port,
    close: () =>
      new Promise((resolve, reject) => {
        setOnVehicleFetchComplete(null);
        setOnChangeFetchComplete(null);
        scheduler?.stop();
        checkinScheduler?.stop();
        stockWatchScheduler?.stop();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
    reschedule: () => scheduler?.reschedule(),
    rescheduleVehicle: (immediate = true) => scheduler?.rescheduleVehicle(immediate),
    armChangeSchedule: () => scheduler?.armChangeSchedule(),
  };
}
