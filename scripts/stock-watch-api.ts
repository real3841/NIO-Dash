import type http from "node:http";
import fs from "node:fs";
import {
  ackStockAlert,
  checkStockWatch,
  getStockWatchFile,
  loadStockWatchState,
  saveStockWatchAuth,
  saveStockWatchPollSec,
} from "./stock-watch.js";

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function noCache(res: http.ServerResponse): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

let rescheduleStockWatch: ((immediate?: boolean) => void) | null = null;

export function setStockWatchSchedulerHooks(hooks: {
  reschedule: (immediate?: boolean) => void;
}): void {
  rescheduleStockWatch = hooks.reschedule;
}

export async function handleStockWatchRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
): Promise<boolean> {
  if (pathname === "/api/stock-watch" && method === "GET") {
    noCache(res);
    json(res, 200, loadStockWatchState());
    return true;
  }

  if (pathname === "/api/stock-watch/check" && method === "POST") {
    noCache(res);
    try {
      const url = new URL(req.url ?? "", "http://localhost");
      const targetId = url.searchParams.get("id") ?? undefined;
      const state = await checkStockWatch(targetId ?? undefined, {
        log: true,
        runningFlag: true,
      });
      json(res, 200, state);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/api/stock-watch/auth" && method === "PUT") {
    noCache(res);
    try {
      const body = await readJsonBody(req);
      saveStockWatchAuth({
        cookie: typeof body.cookie === "string" ? body.cookie : undefined,
        token: typeof body.token === "string" ? body.token : undefined,
      });
      json(res, 200, { ok: true, state: loadStockWatchState() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 400, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/api/stock-watch/poll-sec" && method === "PUT") {
    noCache(res);
    try {
      const body = await readJsonBody(req);
      const pollSec = saveStockWatchPollSec(Number(body.pollSec));
      rescheduleStockWatch?.(false);
      json(res, 200, { ok: true, pollSec, state: loadStockWatchState() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 400, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/api/stock-watch/ack-alert" && method === "POST") {
    noCache(res);
    let targetId: string | undefined;
    try {
      const body = await readJsonBody(req);
      targetId = typeof body.id === "string" ? body.id : undefined;
    } catch {
      // ignore empty/invalid body — ack all
    }
    json(res, 200, ackStockAlert(targetId));
    return true;
  }

  if (pathname === "/data/stock-watch.json" && method === "GET") {
    noCache(res);
    const file = getStockWatchFile();
    if (!fs.existsSync(file)) {
      json(res, 404, { ok: false, error: "not_found" });
      return true;
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    fs.createReadStream(file).pipe(res);
    return true;
  }

  return false;
}
