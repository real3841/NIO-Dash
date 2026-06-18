import type http from "node:http";
import { config as loadEnv } from "dotenv";
import {
  CHANGE_ENV_KEYS,
  getEnvFilePath,
  loadEnvSections,
  saveEnvSection,
  TRAY_ENV_KEYS,
  VEHICLE_ENV_KEYS,
} from "./env-file.js";

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function reloadEnvFile(): void {
  loadEnv({ path: getEnvFilePath(), override: true });
}

function pickSectionUpdates(
  keys: readonly string[],
  body: Record<string, string>,
): Record<string, string> {
  const updates: Record<string, string> = {};
  for (const key of keys) {
    if (key in body) {
      updates[key] = body[key] ?? "";
    }
  }
  return updates;
}

export async function handleConfigRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
): Promise<boolean> {
  if (pathname === "/config" && method === "GET") {
    try {
      json(res, 200, { ok: true, path: getEnvFilePath(), ...loadEnvSections() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { ok: false, error: message });
    }
    return true;
  }

  if ((pathname === "/config/vehicle" || pathname === "/config/change" || pathname === "/config/tray") && method === "PUT") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as Record<string, string>;
      const keys =
        pathname === "/config/vehicle"
          ? VEHICLE_ENV_KEYS
          : pathname === "/config/change"
            ? CHANGE_ENV_KEYS
            : TRAY_ENV_KEYS;
      const updates = pickSectionUpdates(keys, body);
      if (Object.keys(updates).length === 0) {
        json(res, 400, { ok: false, error: "没有可更新的字段" });
        return true;
      }
      saveEnvSection(updates);
      reloadEnvFile();
      json(res, 200, { ok: true, updated: Object.keys(updates) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { ok: false, error: message });
    }
    return true;
  }

  return false;
}
