import http from "node:http";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { handleConfigRequest } from "./env-config-api.js";
import { runCheckinIfDue, startDailyCheckinScheduler } from "./fetch-checkin.js";
import {
  isFetchRunning,
  runBothOnce,
  startDualFetchScheduler,
  triggerFetch,
  withLock,
} from "./fetch-server.js";
import { getChangePollIntervalSec, getVehiclePollIntervalSec } from "./poll-interval.js";
import { getDataDir } from "./paths.js";

const ROOT = path.resolve(process.cwd());
loadEnv({ path: path.join(ROOT, "deploy", ".env") });
loadEnv({ path: path.join(ROOT, ".env") });

const watch = process.argv.includes("--watch");
const serve = process.argv.includes("--serve");
const servePort = Number(process.env.NIO_FETCH_PORT ?? 8787);
const dataDir = getDataDir();

let scheduler: ReturnType<typeof startDualFetchScheduler> | null = null;
let checkinScheduler: ReturnType<typeof startDailyCheckinScheduler> | null = null;

function startTriggerServer(): void {
  const server = http.createServer((req, res) => {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";
    const pathname = url.split("?")[0];

    void (async () => {
      if (pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, running: isFetchRunning(), at: Date.now() }));
        return;
      }

      if (await handleConfigRequest(req, res, pathname, method)) {
        if (method === "PUT" && pathname.startsWith("/config/")) {
          loadEnv({ path: path.join(ROOT, "deploy", ".env"), override: true });
          loadEnv({ path: path.join(ROOT, ".env"), override: true });
          if (pathname === "/config/vehicle") scheduler?.rescheduleVehicle();
          else if (pathname === "/config/change") scheduler?.rescheduleChange();
        }
        return;
      }

      let slot: "all" | "vehicle" | "change" | null = null;
      if (pathname === "/trigger" && method === "POST") slot = "all";
      if (pathname === "/trigger/vehicle" && method === "POST") slot = "vehicle";
      if (pathname === "/trigger/change" && method === "POST") slot = "change";

      if (!slot) {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "not_found" }));
        return;
      }

      try {
        await triggerFetch(slot);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, target: slot, at: Date.now() }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, target: slot, error: message }));
      }
    })();
  });

  server.listen(servePort, () => {
    console.log(`API 服务: GET/PUT /config · POST /trigger* · 0.0.0.0:${servePort}`);
  });
}

if (watch) {
  scheduler = startDualFetchScheduler({
    getVehicleIntervalSec: () =>
      getVehiclePollIntervalSec(process.env as Record<string, string>, dataDir),
    getChangeIntervalSec: () =>
      getChangePollIntervalSec(process.env as Record<string, string>),
  });
  checkinScheduler = startDailyCheckinScheduler();
} else if (!serve) {
  await withLock("all", runBothOnce);
  await runCheckinIfDue();
}

if (serve) {
  startTriggerServer();
}
