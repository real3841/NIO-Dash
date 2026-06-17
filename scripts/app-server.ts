import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { handleConfigRequest } from "./env-config-api.js";
import {
  isFetchRunning,
  setOnChangeFetchComplete,
  setOnVehicleFetchComplete,
  startDualFetchScheduler,
  triggerFetch,
  type FetchSlot,
} from "./fetch-server.js";
import { getChangePollIntervalSec, getVehiclePollIntervalSec } from "./poll-interval.js";

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
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
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
  const scheduler = opts.enableScheduler
    ? startDualFetchScheduler({
        getVehicleIntervalSec,
        getChangeIntervalSec,
        deferInitialTick: opts.deferInitialTick ?? false,
      })
    : null;

  if (opts.enableScheduler) {
    setOnVehicleFetchComplete(notify);
    setOnChangeFetchComplete(notify);
  }

  const host = opts.host ?? "127.0.0.1";

  const server = http.createServer((req, res) => {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";
    const pathname = url.split("?")[0];

    void (async () => {
      if (pathname === "/health") {
        json(res, 200, { ok: true, running: isFetchRunning(), at: Date.now() });
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
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, host, () => resolve());
  });

  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : Number(opts.port ?? 8787);

  return {
    port,
    close: () =>
      new Promise((resolve, reject) => {
        setOnVehicleFetchComplete(null);
        setOnChangeFetchComplete(null);
        scheduler?.stop();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
    reschedule: () => scheduler?.reschedule(),
  };
}
